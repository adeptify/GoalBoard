import type { GoalContractView } from "../v1/types.js";
import { RuntimeSessionAdapterRouter } from "./adapters.js";
import { SessionContentService } from "./content.js";
import { SessionDirectoryService } from "./directory.js";
import { GoalBoardSessionRegistry } from "./registry.js";
import {
  GoalBoardSessionError,
  type GoalBoardSessionHandoffRecord,
  type GoalBoardSessionRecord,
  type SessionTimelineEvent,
} from "./types.js";

const MAX_CONTEXT_EVENTS = 8;
const MAX_CONTEXT_EVENT_CHARS = 700;

export interface PrepareSessionHandoffInput {
  source_session_id: string;
  project_id: string;
  project_name: string;
  target_runtime_id: string;
  target_workspace_id?: string | null;
  target_workspace_path?: string | null;
  actor_id: string;
  goal_contract: GoalContractView;
}

export interface SendSessionHandoffInput {
  package_id: string;
  target_runtime_id: string;
  target_workspace_id?: string | null;
  target_workspace_path?: string | null;
  content: string;
  actor_id: string;
  user_confirmed: boolean;
}

export interface SessionHandoffResult {
  handoff: GoalBoardSessionHandoffRecord;
  destination_session: GoalBoardSessionRecord | null;
}

export class SessionHandoffService {
  constructor(
    private readonly registry: GoalBoardSessionRegistry,
    private readonly router: RuntimeSessionAdapterRouter,
    private readonly directory: SessionDirectoryService,
    private readonly content: SessionContentService,
  ) {}

  async prepare(input: PrepareSessionHandoffInput): Promise<{ handoff: GoalBoardSessionHandoffRecord; reused: boolean }> {
    const source = this.validateSource(input.source_session_id, input.project_id, input.goal_contract);
    const existing = this.registry.latestPendingHandoff(source.session_id);
    if (
      existing
      && existing.source_project_id === input.project_id
      && existing.source_goal_id === input.goal_contract.goal.goal_id
      && existing.content_available
    ) {
      return { handoff: existing, reused: true };
    }
    const timeline = await this.content.read(source.session_id);
    const packageContent = buildSessionHandoffPackage({
      source_session: source,
      project_name: input.project_name,
      goal_contract: input.goal_contract,
      timeline: timeline.events,
    });
    return {
      handoff: this.registry.createHandoffDraft({
        source_session_id: source.session_id,
        source_project_id: input.project_id,
        source_goal_id: input.goal_contract.goal.goal_id,
        target_runtime_id: input.target_runtime_id,
        target_project_id: input.project_id,
        target_workspace_id: input.target_workspace_id,
        target_workspace_path: input.target_workspace_path,
        content: packageContent,
        actor_id: input.actor_id,
      }),
      reused: false,
    };
  }

  update(input: SendSessionHandoffInput): GoalBoardSessionHandoffRecord {
    const current = this.registry.getHandoff(input.package_id);
    this.validatePersistedSource(current);
    const targetWorkspacePath = input.target_workspace_path === undefined
      ? current.target_workspace_path
      : input.target_workspace_path;
    const targetWorkspaceId = input.target_workspace_id !== undefined
      ? input.target_workspace_id
      : targetWorkspacePath === current.target_workspace_path
        ? current.target_workspace_id
        : null;
    return this.registry.updateHandoffDraft({
      package_id: current.package_id,
      target_runtime_id: input.target_runtime_id,
      target_project_id: current.source_project_id,
      target_workspace_id: targetWorkspaceId,
      target_workspace_path: targetWorkspacePath,
      content: input.content,
      actor_id: input.actor_id,
    });
  }

  async send(input: SendSessionHandoffInput): Promise<SessionHandoffResult> {
    if (!input.user_confirmed) {
      throw new GoalBoardSessionError("session.confirmation_required", "创建目标 Session 并发送 Handoff 前必须明确确认");
    }
    const persisted = this.registry.getHandoff(input.package_id);
    if (persisted.state === "sent") {
      return {
        handoff: persisted,
        destination_session: persisted.destination_session_id
          ? this.registry.get(persisted.destination_session_id)
          : null,
      };
    }
    if (persisted.state === "failed" && !persisted.retryable) {
      throw new GoalBoardSessionError(
        "session.handoff_invalid_state",
        "这次失败不能安全重试；请取消后重新创建 Handoff",
      );
    }
    this.validatePersistedSource(persisted);
    const draft = this.update(input);
    if (!draft.content_available || !draft.content) {
      throw new GoalBoardSessionError("session.invalid_input", "Handoff 加密正文当前不可读取，不能发送");
    }
    const sending = this.registry.markHandoffSending(draft.package_id);
    if (sending.state === "sent") {
      return {
        handoff: sending,
        destination_session: sending.destination_session_id
          ? this.registry.get(sending.destination_session_id)
          : null,
      };
    }
    const capability = this.router.capabilities(sending.target_runtime_id).handoff;
    if (capability !== "native") return this.sendFallback(sending, input.actor_id);
    return this.sendNative(sending, input.actor_id);
  }

  cancel(packageId: string): GoalBoardSessionHandoffRecord {
    return this.registry.cancelHandoff(packageId);
  }

  private async sendNative(
    handoff: GoalBoardSessionHandoffRecord,
    actorId: string,
  ): Promise<SessionHandoffResult> {
    let destination = handoff.destination_session_id
      ? this.registry.get(handoff.destination_session_id)
      : this.findRecordedDestination(handoff);
    if (!destination) {
      const created = await this.router.invoke(handoff.target_runtime_id, "create", {
        ...(handoff.target_workspace_path ? { cwd: handoff.target_workspace_path } : {}),
      });
      if (created.status !== "ok") {
        const retryable = created.status === "failed" && created.recovery?.retryable === true;
        const failed = this.registry.markHandoffFailed({
          package_id: handoff.package_id,
          error_code: created.code,
          error_message: retryable
            ? "目标 Runtime 明确没有创建 Session。来源 Session 与草稿已保留，可以重试。"
            : "目标 Session 的创建结果不确定。为避免重复创建，GoalBoard 不会自动重试；请先检查目标 Runtime。",
          retryable,
        });
        return { handoff: failed, destination_session: null };
      }
      const nativeSessionId = nativeSessionIdFromValue(created.value);
      if (!nativeSessionId) {
        const failed = this.registry.markHandoffFailed({
          package_id: handoff.package_id,
          error_code: "runtime.native_session_id_missing",
          error_message: "目标 Runtime 已响应创建请求，但没有返回可识别的 Session ID。创建结果不确定；为避免重复创建，GoalBoard 不会自动重试，请先检查目标 Runtime。",
          retryable: false,
        });
        return { handoff: failed, destination_session: null };
      }
      try {
        destination = this.ensureNativeDestination(handoff, nativeSessionId, actorId);
        handoff = this.registry.attachHandoffDestination({
          package_id: handoff.package_id,
          destination_session_id: destination.session_id,
          delivery_mode: "native",
        });
      } catch (error) {
        const failed = this.registry.markHandoffFailed({
          package_id: handoff.package_id,
          error_code: error instanceof GoalBoardSessionError ? error.code : "session.identity_conflict",
          error_message: error instanceof Error ? error.message : String(error),
          retryable: false,
        });
        return { handoff: failed, destination_session: null };
      }
    } else if (!handoff.destination_session_id) {
      handoff = this.registry.attachHandoffDestination({
        package_id: handoff.package_id,
        destination_session_id: destination.session_id,
        delivery_mode: "native",
      });
    }
    const nativeSessionId = destination.native_runtime_session_id;
    if (!nativeSessionId) {
      const failed = this.registry.markHandoffFailed({
        package_id: handoff.package_id,
        error_code: "runtime.native_session_id_missing",
        error_message: "目标 Session 缺少 Runtime 原生 ID，不能发送 Handoff。",
        retryable: false,
        destination_session_id: destination.session_id,
        delivery_mode: "native",
      });
      return { handoff: failed, destination_session: destination };
    }
    const result = await this.router.invoke(handoff.target_runtime_id, "handoff", {
      prompt: handoff.content,
      existingThreadId: nativeSessionId,
    });
    if (result.status !== "ok") {
      const retryable = result.status === "failed" && result.recovery?.retryable === true;
      const failed = this.registry.markHandoffFailed({
        package_id: handoff.package_id,
        error_code: result.code,
        error_message: retryable
          ? "目标 Session 已创建，且 Runtime 明确没有接受 Handoff 内容；重试只会补发内容。"
          : "目标 Session 已创建，但 Handoff 是否送达无法确认。为避免重复消息，GoalBoard 不会自动重试；请先检查目标 Session 内容。",
        retryable,
        destination_session_id: destination.session_id,
        delivery_mode: "native",
      });
      this.recordDestinationStatus(destination, failed, "Handoff 内容尚未送达，等待重试");
      return { handoff: failed, destination_session: destination };
    }
    const deliveredNativeSessionId = nativeSessionIdFromValue(result.value);
    if (deliveredNativeSessionId && deliveredNativeSessionId !== nativeSessionId) {
      const failed = this.registry.markHandoffFailed({
        package_id: handoff.package_id,
        error_code: "session.identity_conflict",
        error_message: "目标 Runtime 返回了另一条 Session 身份；GoalBoard 没有覆盖已确认的目标关系。",
        retryable: false,
        destination_session_id: destination.session_id,
        delivery_mode: "native",
      });
      return { handoff: failed, destination_session: destination };
    }
    const sent = this.registry.markHandoffSent({
      package_id: handoff.package_id,
      destination_session_id: destination.session_id,
      delivery_mode: "native",
    });
    this.recordLineageEvents(destination, sent);
    return { handoff: sent, destination_session: destination };
  }

  private async sendFallback(
    handoff: GoalBoardSessionHandoffRecord,
    actorId: string,
  ): Promise<SessionHandoffResult> {
    let destination = handoff.destination_session_id
      ? this.registry.get(handoff.destination_session_id)
      : null;
    try {
      destination ??= await this.directory.create({
        runtime_id: handoff.target_runtime_id,
        actor_id: actorId,
        user_confirmed: true,
        project_id: handoff.target_project_id,
        current_goal_id: handoff.source_goal_id,
        workspace_id: handoff.target_workspace_id,
        workspace_path: handoff.target_workspace_path,
        title: this.destinationTitle(handoff),
      });
      this.registry.attachHandoffDestination({
        package_id: handoff.package_id,
        destination_session_id: destination.session_id,
        delivery_mode: "goalboard_fallback",
      });
      this.registry.appendEvent({
        session_id: destination.session_id,
        source: "goalboard",
        kind: "user_message",
        source_id: `handoff:${handoff.package_id}:package`,
        content: handoff.content ?? "",
        metadata: {
          handoff_package_id: handoff.package_id,
          source_session_id: handoff.source_session_id,
          delivery_mode: "goalboard_fallback",
        },
      });
      const sent = this.registry.markHandoffSent({
        package_id: handoff.package_id,
        destination_session_id: destination.session_id,
        delivery_mode: "goalboard_fallback",
      });
      this.recordLineageEvents(destination, sent);
      return { handoff: sent, destination_session: destination };
    } catch {
      const failed = this.registry.markHandoffFailed({
        package_id: handoff.package_id,
        error_code: "handoff.fallback_failed",
        error_message: destination
          ? "目标托管 Session 已创建，但 package 写入失败；重试会继续使用这条 Session。"
          : "GoalBoard 无法创建目标托管 Session；来源 Session 与草稿已保留。",
        retryable: true,
        destination_session_id: destination?.session_id,
        delivery_mode: destination ? "goalboard_fallback" : null,
      });
      return { handoff: failed, destination_session: destination };
    }
  }

  private ensureNativeDestination(
    handoff: GoalBoardSessionHandoffRecord,
    nativeSessionId: string,
    actorId: string,
  ): GoalBoardSessionRecord {
    if (handoff.destination_session_id) {
      const current = this.registry.get(handoff.destination_session_id);
      if (current.native_runtime_session_id === nativeSessionId) return current;
      throw new GoalBoardSessionError("session.identity_conflict", "Handoff 已连接另一个目标 Runtime Session");
    }
    const existing = this.registry.findByNativeRuntimeSession(handoff.target_runtime_id, nativeSessionId);
    if (existing) {
      if (
        existing.session_id !== handoff.source_session_id
        && existing.metadata.handoff_package_id === handoff.package_id
      ) return existing;
      throw new GoalBoardSessionError(
        "session.identity_conflict",
        "目标 Runtime 返回的不是一条新的 Session；GoalBoard 没有覆盖现有 Session 关系",
      );
    }
    return this.registry.createSession({
      runtime_id: handoff.target_runtime_id,
      native_runtime_session_id: nativeSessionId,
      actor_id: actorId,
      user_confirmed: true,
      project_id: handoff.target_project_id,
      current_goal_id: handoff.source_goal_id,
      workspace_id: handoff.target_workspace_id,
      workspace_path: handoff.target_workspace_path,
      title: this.destinationTitle(handoff),
      provenance: "explicitly_linked",
      metadata: {
        handoff_package_id: handoff.package_id,
        handoff_source_session_id: handoff.source_session_id,
      },
    });
  }

  private findRecordedDestination(handoff: GoalBoardSessionHandoffRecord): GoalBoardSessionRecord | null {
    return this.registry.list({ runtime_id: handoff.target_runtime_id })
      .find((session) => (
        session.session_id !== handoff.source_session_id
        && session.metadata.handoff_package_id === handoff.package_id
      )) ?? null;
  }

  private destinationTitle(handoff: GoalBoardSessionHandoffRecord): string {
    const source = this.registry.get(handoff.source_session_id);
    return `Handoff · ${source.title || handoff.source_goal_id}`.slice(0, 160);
  }

  private validateSource(
    sessionId: string,
    projectId: string,
    contract: GoalContractView,
  ): GoalBoardSessionRecord {
    const source = this.registry.get(sessionId);
    if (source.project_id !== projectId) {
      throw new GoalBoardSessionError("session.not_found", "找不到当前 Project 的这条来源 Session");
    }
    if (!source.current_goal_id) {
      throw new GoalBoardSessionError("session.invalid_input", "请先为来源 Session 选择当前 Goal");
    }
    if (source.current_goal_id !== contract.goal.goal_id || contract.goal.board_id !== contract.board.board_id) {
      throw new GoalBoardSessionError("session.invalid_input", "来源 Session 的当前 Goal 已变化，请重新打开 Handoff");
    }
    return source;
  }

  private validatePersistedSource(handoff: GoalBoardSessionHandoffRecord): GoalBoardSessionRecord {
    const source = this.registry.get(handoff.source_session_id);
    if (source.project_id !== handoff.source_project_id || source.current_goal_id !== handoff.source_goal_id) {
      throw new GoalBoardSessionError("session.invalid_input", "来源 Session 的当前 Project 或 Goal 已变化，请重新生成 Handoff");
    }
    if (handoff.target_project_id !== handoff.source_project_id) {
      throw new GoalBoardSessionError("session.invalid_input", "当前版本只允许在来源 Project 内创建 Handoff");
    }
    return source;
  }

  private recordLineageEvents(destination: GoalBoardSessionRecord, handoff: GoalBoardSessionHandoffRecord): void {
    try {
      this.registry.appendEvent({
        session_id: handoff.source_session_id,
        source: "goalboard",
        kind: "status",
        source_id: `handoff:${handoff.package_id}:sent`,
        content: `Handoff 已创建目标 ${destination.runtime_id} Session：${destination.session_id}`,
        metadata: {
          handoff_package_id: handoff.package_id,
          destination_session_id: destination.session_id,
          delivery_mode: handoff.delivery_mode,
        },
      });
    } catch {
      // The handoff record is the source of truth. Supplementary timeline events
      // must never turn a completed delivery into a false API failure.
    }
    this.recordDestinationStatus(destination, handoff, `由来源 Session ${handoff.source_session_id} 创建`);
  }

  private recordDestinationStatus(
    destination: GoalBoardSessionRecord,
    handoff: GoalBoardSessionHandoffRecord,
    content: string,
  ): void {
    try {
      this.registry.appendEvent({
        session_id: destination.session_id,
        source: "goalboard",
        kind: "status",
        source_id: `handoff:${handoff.package_id}:lineage`,
        content,
        metadata: {
          handoff_package_id: handoff.package_id,
          source_session_id: handoff.source_session_id,
          delivery_mode: handoff.delivery_mode,
        },
      });
    } catch {
      // Delivery state and lineage remain persisted in the handoff record even
      // when the optional human-readable timeline annotation cannot be written.
    }
  }
}

export function buildSessionHandoffPackage(input: {
  source_session: GoalBoardSessionRecord;
  project_name: string;
  goal_contract: GoalContractView;
  timeline: readonly SessionTimelineEvent[];
}): string {
  const { goal, work_state: workState } = input.goal_contract;
  const currentRuns = input.goal_contract.runs
    .filter((run) => run.state === "started" || run.state === "blocked")
    .map((run) => `${run.run_id} · ${run.state} · ${run.role} · ${run.actor_id} · ${run.started_at}`);
  const effectiveEvidence = input.goal_contract.evidence
    .filter((item) => item.lifecycle_state === "effective")
    .map((item) => `${item.result} · ${item.kind}: ${item.locator}`);
  const outputRefs = input.goal_contract.runs
    .flatMap((run) => run.output_refs)
    .filter((item, index, items) => item && items.indexOf(item) === index);
  const openRisks = input.goal_contract.risks
    .filter((risk) => risk.state === "open" || risk.state === "triggered")
    .map((risk) => `${risk.description}；处理：${risk.treatment_plan}`);
  const timeline = minimalSessionContext(input.timeline);
  const lines = [
    `# Handoff：${goal.title}`,
    "",
    "> 这是一个新的 Runtime Session。请依据下列 GoalBoard 事实继续工作，不要假装继承来源 Runtime 的内存或未记录推理。",
    "",
    "## 来源",
    "",
    `- Project：${input.project_name}（${input.source_session.project_id ?? "未关联"}）`,
    `- 来源 Session：${input.source_session.session_id}`,
    `- 来源 Runtime：${input.source_session.runtime_id}`,
    `- 来源原生 Session：${input.source_session.native_runtime_session_id ?? "无"}`,
    `- 工作目录：${input.source_session.workspace_path ?? "未关联"}`,
    "",
    "## 当前 Goal",
    "",
    `- Goal ID：${goal.goal_id}`,
    `- 目标结果：${goal.outcome}`,
    `- 为什么：${goal.why}`,
    `- 业务逻辑：${goal.business_logic}`,
    `- 当前工作状态：${workState.work_state}`,
    `- 下一动作：${workState.next_action ?? "无"}`,
    "",
    listSection("范围内", goal.in_scope),
    listSection("范围外", goal.out_of_scope),
    listSection("约束", goal.constraints),
    listSection("所需输入", goal.required_inputs),
    listSection("承诺输出", goal.promised_outputs),
    listSection("当前 Run", currentRuns),
    "## 验收标准",
    "",
    ...goal.acceptance_criteria.flatMap((criterion) => [
      `- [ ] ${criterion.statement}`,
      `  - 通过条件：${criterion.pass_condition}`,
      `  - 判定方式：${criterion.decision_method}`,
    ]),
    "",
    listSection("有效 Evidence", effectiveEvidence),
    listSection("产物与输出引用", outputRefs),
    listSection("开放 Risk", openRisks),
    listSection("待检查角色", workState.pending_review_roles),
    "## 最近 Session 上下文",
    "",
    ...(timeline.length > 0
      ? timeline.flatMap((event) => [
          `### ${event.label} · ${event.occurred_at}`,
          "",
          event.content,
          "",
        ])
      : ["没有可安全带入的逐轮上下文；请以 Goal Contract 和引用为准。", ""]),
    "## 继续执行",
    "",
    "先核对当前仓库与 GoalBoard 状态，再从“下一动作”继续。重要决定、产物、Evidence 和阻塞仍写回同一个 Goal；不要创建第二套 Goal 状态。",
  ];
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function minimalSessionContext(events: readonly SessionTimelineEvent[]): SessionTimelineEvent[] {
  const selected = events.filter((event) =>
    event.kind === "user_message"
    || event.kind === "runtime_message"
    || event.kind === "artifact"
    || event.kind === "status");
  return selected.slice(-MAX_CONTEXT_EVENTS).map((event) => ({
    ...event,
    content: clipText(event.content, MAX_CONTEXT_EVENT_CHARS),
  }));
}

function listSection(title: string, values: readonly string[]): string {
  return [`## ${title}`, "", ...(values.length > 0 ? values.map((value) => `- ${value}`) : ["- 无"]), ""].join("\n");
}

function clipText(value: string, limit: number): string {
  const text = value.trim();
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
}

function nativeSessionIdFromValue(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const thread = record.thread && typeof record.thread === "object" && !Array.isArray(record.thread)
    ? record.thread as Record<string, unknown>
    : null;
  return optionalText(thread?.id)
    ?? optionalText(record.threadId)
    ?? optionalText(record.thread_id)
    ?? optionalText(record.id);
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

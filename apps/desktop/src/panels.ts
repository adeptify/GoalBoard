import { randomUUID } from "node:crypto";
import path from "node:path";

export interface DesktopPanelRecord {
  panel_id: string;
  project_id: string;
  goal_id: string;
  runtime_kind: string;
  launch_command: string;
  launch_args: string[];
  cwd: string | null;
  work_context_id: string;
  host_session_id: string | null;
  tab_index: number;
  title: string;
  status: "open" | "exited";
  created_at: string;
  updated_at: string;
}

export interface OpenDesktopPanelInput {
  project_id: string;
  goal_id: string;
  runtime_kind: string;
  launch_command: string;
  launch_args?: string[];
  cwd?: string | null;
  title?: string;
  actor_id: string;
  host_session_id?: string | null;
  user_confirmed: boolean;
}

export interface AliasDesktopPanelSessionInput {
  panel_id: string;
  runtime_id: string;
  host_session_id: string;
  actor_id: string;
}

export type DesktopPanelErrorCode =
  | "catalog.invalid_name"
  | "catalog.project_not_found"
  | "catalog.panel_not_found"
  | "catalog.panel_confirmation_required"
  | "context.stable_identity_required"
  | "context.user_confirmation_required";

export interface DesktopPanelRepository {
  transaction<T>(operation: () => T): T;
  nextTabIndex(projectId: string, goalId: string): number;
  insert(record: DesktopPanelRecord): void;
  addAlias(panelId: string, runtimeId: string, workContextId: string, createdAt: string): void;
  list(projectId: string, goalId?: string): DesktopPanelRecord[];
  get(panelId: string): DesktopPanelRecord | null;
  updateStatus(panelId: string, status: DesktopPanelRecord["status"], updatedAt: string): void;
  updateHostSession(panelId: string, hostSessionId: string, updatedAt: string): void;
  delete(panelId: string): void;
  findByWorkContext(runtimeId: string, workContextId: string): DesktopPanelRecord | null;
  deleteForProject(projectId: string): void;
}

export interface DesktopPanelContextPort {
  assertProject(projectId: string): void;
  bind(input: {
    runtime_id: string;
    stable_work_context_id: string;
    project_id: string;
    actor_id: string;
    cwd?: string;
  }): void;
  appendProjectEvent(
    projectId: string,
    type: "project.desktop_panel_opened" | "project.desktop_panel_closed",
    actorId: string,
    payload: Record<string, unknown>,
  ): void;
}

export interface DesktopPanelServiceOptions {
  repository: DesktopPanelRepository;
  context: DesktopPanelContextPort;
  errorFactory: (code: DesktopPanelErrorCode, message: string) => Error;
  now?: () => string;
  createId?: () => string;
}

/**
 * Owns Desktop Panel lifecycle rules. Persistence and Project context binding
 * remain replaceable ports so the Desktop app never imports a database driver.
 */
export class DesktopPanelService {
  private readonly repository: DesktopPanelRepository;
  private readonly context: DesktopPanelContextPort;
  private readonly errorFactory: DesktopPanelServiceOptions["errorFactory"];
  private readonly now: () => string;
  private readonly createId: () => string;

  constructor(options: DesktopPanelServiceOptions) {
    this.repository = options.repository;
    this.context = options.context;
    this.errorFactory = options.errorFactory;
    this.now = options.now ?? (() => new Date().toISOString());
    this.createId = options.createId ?? (() => `panel-${randomUUID()}`);
  }

  open(input: OpenDesktopPanelInput): DesktopPanelRecord {
    const projectId = this.required(input.project_id, "catalog.project_not_found", "项目 ID 不能为空");
    const goalId = this.required(input.goal_id, "catalog.panel_not_found", "打开终端时必须指定 Goal");
    const runtimeKind = this.required(input.runtime_kind, "context.stable_identity_required", "Runtime 标识不能为空");
    const command = this.required(input.launch_command, "catalog.invalid_name", "打开终端时必须提供启动命令");
    const actorId = this.required(input.actor_id, "context.user_confirmation_required", "绑定操作必须记录执行者");
    if (input.user_confirmed !== true) {
      throw this.errorFactory("catalog.panel_confirmation_required", "只有在 Goal 详情里点开终端后才能建立这个面板");
    }
    const cwd = this.normalizeOptionalAbsolutePath(input.cwd);
    const hostSessionId = input.host_session_id?.trim() || null;
    const args = Array.isArray(input.launch_args) ? input.launch_args.map(String) : [];

    return this.repository.transaction(() => {
      this.context.assertProject(projectId);
      const now = this.now();
      const panelId = this.createId();
      const record: DesktopPanelRecord = {
        panel_id: panelId,
        project_id: projectId,
        goal_id: goalId,
        runtime_kind: runtimeKind,
        launch_command: command,
        launch_args: args,
        cwd,
        work_context_id: panelId,
        host_session_id: hostSessionId,
        tab_index: this.repository.nextTabIndex(projectId, goalId),
        title: input.title?.trim() || command,
        status: "open",
        created_at: now,
        updated_at: now,
      };
      this.repository.insert(record);
      this.repository.addAlias(panelId, runtimeKind, panelId, now);
      this.context.bind({
        runtime_id: runtimeKind,
        stable_work_context_id: panelId,
        project_id: projectId,
        actor_id: actorId,
        ...(cwd ? { cwd } : {}),
      });
      if (hostSessionId && hostSessionId !== panelId) {
        this.repository.addAlias(panelId, runtimeKind, hostSessionId, now);
        this.context.bind({
          runtime_id: runtimeKind,
          stable_work_context_id: hostSessionId,
          project_id: projectId,
          actor_id: actorId,
        });
      }
      this.context.appendProjectEvent(projectId, "project.desktop_panel_opened", actorId, {
        panel_id: panelId,
        goal_id: goalId,
        runtime_kind: runtimeKind,
      });
      return record;
    });
  }

  list(projectId: string, goalId?: string): DesktopPanelRecord[] {
    const id = this.required(projectId, "catalog.project_not_found", "项目 ID 不能为空");
    return this.repository.list(id, goalId?.trim());
  }

  get(panelId: string): DesktopPanelRecord {
    const panel = this.repository.get(panelId.trim());
    if (!panel) throw this.errorFactory("catalog.panel_not_found", "找不到这个终端面板");
    return panel;
  }

  markExited(panelId: string): DesktopPanelRecord {
    return this.markStatus(panelId, "exited");
  }

  markOpen(panelId: string): DesktopPanelRecord {
    return this.markStatus(panelId, "open");
  }

  close(panelId: string, actorId: string): void {
    const actor = this.required(actorId, "context.user_confirmation_required", "绑定操作必须记录执行者");
    this.repository.transaction(() => {
      const current = this.get(panelId);
      this.repository.delete(current.panel_id);
      this.context.appendProjectEvent(current.project_id, "project.desktop_panel_closed", actor, {
        panel_id: current.panel_id,
        goal_id: current.goal_id,
        runtime_kind: current.runtime_kind,
      });
    });
  }

  aliasSession(input: AliasDesktopPanelSessionInput): DesktopPanelRecord {
    const panelId = input.panel_id.trim();
    const runtimeId = this.required(input.runtime_id, "context.stable_identity_required", "Runtime 标识不能为空");
    const hostSessionId = this.required(input.host_session_id, "context.stable_identity_required", "宿主 Session 标识不能为空");
    const actorId = this.required(input.actor_id, "context.user_confirmation_required", "绑定操作必须记录执行者");
    return this.repository.transaction(() => {
      const current = this.get(panelId);
      const now = this.now();
      this.repository.addAlias(current.panel_id, runtimeId, hostSessionId, now);
      if (current.host_session_id !== hostSessionId) {
        this.repository.updateHostSession(current.panel_id, hostSessionId, now);
      }
      this.context.bind({
        runtime_id: runtimeId,
        stable_work_context_id: hostSessionId,
        project_id: current.project_id,
        actor_id: actorId,
      });
      return {
        ...current,
        host_session_id: hostSessionId,
        updated_at: current.host_session_id === hostSessionId ? current.updated_at : now,
      };
    });
  }

  findByWorkContext(runtimeId: string, workContextId: string): DesktopPanelRecord | null {
    const runtime = this.required(runtimeId, "context.stable_identity_required", "Runtime 标识不能为空");
    return this.repository.findByWorkContext(runtime, workContextId.trim());
  }

  deleteForProject(projectId: string): void {
    this.repository.deleteForProject(projectId);
  }

  private markStatus(panelId: string, status: DesktopPanelRecord["status"]): DesktopPanelRecord {
    return this.repository.transaction(() => {
      const current = this.get(panelId);
      if (current.status === status) return current;
      const now = this.now();
      this.repository.updateStatus(current.panel_id, status, now);
      return { ...current, status, updated_at: now };
    });
  }

  private required(value: string, code: DesktopPanelErrorCode, message: string): string {
    const normalized = value.trim();
    if (!normalized) throw this.errorFactory(code, message);
    return normalized;
  }

  private normalizeOptionalAbsolutePath(value: string | null | undefined): string | null {
    const raw = value?.trim();
    if (!raw) return null;
    if (!path.isAbsolute(raw)) {
      throw this.errorFactory("catalog.invalid_name", "终端工作目录必须是绝对路径");
    }
    return path.resolve(raw);
  }
}

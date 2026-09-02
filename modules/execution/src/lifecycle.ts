import { randomUUID } from "node:crypto";

import type {
  AuthorizedExecutionClaimInput,
  EndExecutionClaimInput,
  ExecutionClaimEndResult,
  ExecutionClaimRecord,
  ExecutionCommandApi,
  ExecutionRunRecord,
  ExecutionRunReportResult,
  RenewExecutionClaimInput,
  ReportExecutionRunInput,
  StartExecutionRunInput,
} from "@adeptify/goalboard-contracts/modules/execution";

import { ExecutionError, type ExecutionErrorFactory } from "./errors.js";
import {
  ExecutionRepository,
  type ExecutionEventInput,
} from "./repository.js";

export interface ExecutionLifecycleOptions {
  now?: () => string;
  id?: () => string;
  errorFactory?: ExecutionErrorFactory;
  appendEvent(input: ExecutionEventInput): number;
  assertRunStartAllowed?(boardId: string, goalId: string): void;
}

export class ExecutionLifecycle implements ExecutionCommandApi {
  private readonly now: () => string;
  private readonly id: () => string;
  private readonly errorFactory: ExecutionErrorFactory;

  constructor(
    readonly repository: ExecutionRepository,
    private readonly options: ExecutionLifecycleOptions,
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.id = options.id ?? randomUUID;
    this.errorFactory = options.errorFactory ?? ((code, message, details) =>
      new ExecutionError(code, message, details));
  }

  createAuthorizedClaim(input: AuthorizedExecutionClaimInput): ExecutionClaimRecord {
    validatePositiveLease(input.lease_seconds, input.resolved_policy.max_lease_seconds, "领取", this.errorFactory);
    const now = this.now();
    this.expirePastClaimsAt(input.board_id, input.actor_id, now);
    return this.repository.immediate(() => {
      const claim: ExecutionClaimRecord = {
        claim_id: `claim-${this.id()}`,
        board_id: input.board_id,
        goal_id: input.goal_id,
        actor_id: input.actor_id,
        role: input.role,
        contract_revision: input.contract_revision,
        action_kind: input.action_kind,
        action_target_id: input.action_target_id,
        state: "active",
        capabilities: unique(input.capabilities).sort(),
        goal_mode_attestation: input.goal_mode_attestation,
        resolved_policy: input.resolved_policy,
        claimed_at: now,
        expires_at: addSeconds(now, input.lease_seconds),
        renewed_at: null,
        released_at: null,
        release_reason: null,
      };
      this.repository.insertClaim(claim);
      this.options.appendEvent({
        eventId: this.id(),
        boardId: input.board_id,
        actorId: input.actor_id,
        type: "claim.created",
        objectType: "claim",
        objectId: claim.claim_id,
        reason: input.reason,
        payload: {
          goal_id: input.goal_id,
          role: input.role,
          contract_revision: input.contract_revision,
          action_id: input.action_id ?? null,
          action_kind: input.action_kind,
          action_target_id: input.action_target_id,
          expires_at: claim.expires_at,
        },
        at: now,
      });
      return claim;
    });
  }

  renewClaim(input: RenewExecutionClaimInput): ExecutionClaimRecord {
    return this.repository.immediate(() => {
      const claim = this.requireClaim(input.board_id, input.claim_id);
      this.assertClaimOwner(
        claim,
        input.actor_id,
        "只有领取者可以续租 Claim；若这是 compaction 后继续同一项工作，请复用领取时的 actor_id 原样重试",
        true,
      );
      if (claim.state !== "active") {
        throw this.errorFactory("claim.not_active", "只有 active Claim 可以续租");
      }
      const now = this.now();
      if (claim.expires_at <= now) {
        throw this.errorFactory(
          "claim.lease_expired",
          "Claim 租约已过期，不能续租；请重新领取 Goal",
          {
            claim_id: claim.claim_id,
            goal_id: claim.goal_id,
            next_action: "select_goal",
            requires_user_confirmation: false,
          },
        );
      }
      const requestedLease = input.lease_seconds ?? claim.resolved_policy.max_lease_seconds;
      validatePositiveLease(requestedLease, claim.resolved_policy.max_lease_seconds, "续租", this.errorFactory);
      const requestedExpiry = addSeconds(now, requestedLease);
      const expiresAt = requestedExpiry > claim.expires_at ? requestedExpiry : claim.expires_at;
      this.repository.updateClaimLease(claim.claim_id, expiresAt, now);
      this.options.appendEvent({
        eventId: this.id(),
        boardId: input.board_id,
        actorId: input.actor_id,
        type: "claim.renewed",
        objectType: "claim",
        objectId: claim.claim_id,
        reason: "领取者确认工作仍在继续并续租 Claim",
        payload: {
          goal_id: claim.goal_id,
          previous_expires_at: claim.expires_at,
          expires_at: expiresAt,
          lease_seconds: requestedLease,
        },
        at: now,
      });
      return this.requireClaim(input.board_id, input.claim_id);
    });
  }

  releaseClaim(input: EndExecutionClaimInput): ExecutionClaimEndResult {
    const claim = this.requireClaim(input.board_id, input.claim_id);
    this.assertClaimOwner(claim, input.actor_id, "只有领取者可以释放 Claim");
    const now = this.now();
    if (claim.state === "active" && claim.expires_at <= now) {
      this.expirePastClaimsAt(input.board_id, input.actor_id, now);
      throw this.errorFactory(
        "claim.lease_expired",
        "Claim 租约已过期，旧 Runtime 不需要再释放；请重新领取 Goal",
        {
          goal_id: claim.goal_id,
          claim_id: claim.claim_id,
          next_action: "select_goal",
          requires_user_confirmation: false,
          retry_same_idempotency_key: false,
        },
      );
    }
    if (claim.state === "expired") {
      throw this.errorFactory("claim.lease_expired", "Claim 租约已过期，旧 Runtime 不需要再释放；请重新领取 Goal");
    }
    return this.endClaim(input, "released", true);
  }

  revokeClaim(input: EndExecutionClaimInput): ExecutionClaimEndResult {
    return this.endClaim(input, "revoked", false);
  }

  startRun(input: StartExecutionRunInput): ExecutionRunRecord {
    return this.repository.immediate(() => {
      const claim = this.requireClaim(input.board_id, input.claim_id);
      this.assertClaimOwner(claim, input.actor_id, "只有领取者可以开始 Run");
      const now = this.now();
      if (claim.state !== "active" || claim.expires_at <= now) {
        throw this.errorFactory("run.claim_inactive", "Claim 已释放、撤销或过期，不能开始 Run");
      }
      if (!VALID_RUN_ROLES.has(claim.role)) {
        throw this.errorFactory("run.role_invalid", "这个 Claim 角色不能启动工作 Run");
      }
      this.options.assertRunStartAllowed?.(input.board_id, claim.goal_id);
      if (this.repository.activeRunIdsForClaim(claim.claim_id).length > 0) {
        throw this.errorFactory("run.already_active", "这个 Claim 已有未结束的 Run");
      }
      const run: ExecutionRunRecord = {
        run_id: `run-${this.id()}`,
        board_id: input.board_id,
        goal_id: claim.goal_id,
        claim_id: claim.claim_id,
        actor_id: input.actor_id,
        role: claim.role,
        state: "started",
        block_reason: null,
        output_refs: [],
        discovery_refs: [],
        started_at: now,
        ended_at: null,
      };
      this.repository.insertRun(run);
      this.options.appendEvent({
        eventId: this.id(),
        boardId: input.board_id,
        actorId: input.actor_id,
        type: "run.started",
        objectType: "run",
        objectId: run.run_id,
        reason: "开始执行已领取的 Goal",
        payload: { goal_id: claim.goal_id, claim_id: claim.claim_id },
        at: now,
      });
      return run;
    });
  }

  reportRun(input: ReportExecutionRunInput): ExecutionRunReportResult {
    const before = this.repository.getRunWithClaim(input.board_id, input.run_id);
    if (!before) throw this.errorFactory("run.not_found", `Run 不存在: ${input.run_id}`);
    this.assertRunOwner(before.run, input.actor_id);
    const now = this.now();
    if (before.claim.state === "active" && before.claim.expires_at <= now) {
      this.expirePastClaimsAt(input.board_id, input.actor_id, now);
      throw this.errorFactory(
        "run.claim_expired",
        "Run 对应的 Claim 租约已过期，旧 Runtime 不能再报告终态；请重新领取 Goal",
        {
          goal_id: before.run.goal_id,
          claim_id: before.claim.claim_id,
          run_id: before.run.run_id,
          next_action: "select_goal",
          requires_user_confirmation: false,
          retry_same_idempotency_key: false,
        },
      );
    }
    if (before.claim.state === "expired") {
      throw this.errorFactory("run.claim_expired", "Run 对应的 Claim 租约已过期，旧 Runtime 不能再报告终态");
    }
    return this.repository.immediate(() => this.reportRunInTransaction(input, now));
  }

  expirePastClaims(boardId: string, actorId: string): string[] {
    return this.expirePastClaimsAt(boardId, actorId, this.now());
  }

  completeRunForRevalidation(boardId: string, runId: string, actorId: string): ExecutionRunRecord {
    return this.repository.immediate(() => {
      const run = this.repository.getRun(boardId, runId);
      if (!run) throw this.errorFactory("run.not_found", `Run 不存在: ${runId}`);
      if (run.state === "completed") return run;
      if (run.state !== "started" && run.state !== "blocked") {
        throw this.errorFactory("run.transition_invalid", `Run 不能从 ${run.state} 变为 completed`);
      }
      const now = this.now();
      this.repository.updateRun(runId, "completed", null, run.output_refs, run.discovery_refs, now);
      this.options.appendEvent({
        eventId: this.id(), boardId, actorId, type: "run.completed", objectType: "run",
        objectId: runId,
        reason: "重新验证结果已写入，Revalidator Run 自动结束",
        payload: { goal_id: run.goal_id },
        at: now,
      });
      return this.repository.getRun(boardId, runId)!;
    });
  }

  private endClaim(
    input: EndExecutionClaimInput,
    state: "released" | "revoked",
    requireOwner: boolean,
  ): ExecutionClaimEndResult {
    return this.repository.immediate(() => {
      const claim = this.requireClaim(input.board_id, input.claim_id);
      if (requireOwner) this.assertClaimOwner(claim, input.actor_id, "只有领取者可以释放 Claim");
      if (claim.state !== "active") {
        throw this.errorFactory("claim.not_active", `只有 active Claim 可以${state === "released" ? "释放" : "撤销"}`);
      }
      const now = this.now();
      const activeRunReason = input.active_run_reason ?? input.reason;
      const abandonedRunIds = this.repository.abandonActiveRuns(claim.claim_id, now, activeRunReason);
      for (const runId of abandonedRunIds) {
        this.options.appendEvent({
          eventId: this.id(), boardId: input.board_id, actorId: input.actor_id,
          type: "run.abandoned", objectType: "run", objectId: runId,
          reason: activeRunReason,
          payload: { claim_id: claim.claim_id, recovery: true, goal_id: claim.goal_id },
          at: now,
        });
      }
      this.repository.updateClaimState(claim.claim_id, state, now, input.reason);
      const cursor = this.options.appendEvent({
        eventId: this.id(), boardId: input.board_id, actorId: input.actor_id,
        type: `claim.${state}`, objectType: "claim", objectId: claim.claim_id,
        reason: input.reason,
        payload: {}, at: now,
      });
      return {
        claim: this.requireClaim(input.board_id, input.claim_id),
        abandoned_run_ids: abandonedRunIds,
        observed_event_cursor: cursor,
      };
    });
  }

  private reportRunInTransaction(
    input: ReportExecutionRunInput,
    now: string,
  ): ExecutionRunReportResult {
    const pair = this.repository.getRunWithClaim(input.board_id, input.run_id);
    if (!pair) throw this.errorFactory("run.not_found", `Run 不存在: ${input.run_id}`);
    this.assertRunOwner(pair.run, input.actor_id);
    if (pair.run.state === "completed" && input.state === "completed") {
      return {
        run: pair.run,
        released_claim: null,
        observed_event_cursor: this.repository.eventCursor(input.board_id),
      };
    }
    if (pair.claim.state !== "active") {
      throw this.errorFactory("contract.revision_stale", "这个 Run 对应的 Claim 已不再有效，写入没有生效");
    }
    const allowed =
      (pair.run.state === "started" && ["blocked", "completed", "failed", "abandoned"].includes(input.state)) ||
      (pair.run.state === "blocked" && ["started", "completed", "failed", "abandoned"].includes(input.state));
    if (!allowed) {
      throw this.errorFactory("run.transition_invalid", `Run 不能从 ${pair.run.state} 变为 ${input.state}`);
    }
    if (input.state === "blocked" && !input.block_reason?.trim()) {
      throw this.errorFactory("run.block_reason_required", "阻塞 Run 必须说明原因");
    }
    const outputRefs = unique(input.output_refs ?? pair.run.output_refs);
    const discoveryRefs = unique(input.discovery_refs ?? pair.run.discovery_refs);
    const terminal = TERMINAL_RUN_STATES.has(input.state);
    this.repository.updateRun(
      pair.run.run_id,
      input.state,
      input.block_reason ?? null,
      outputRefs,
      discoveryRefs,
      terminal ? now : null,
    );
    let cursor = this.options.appendEvent({
      eventId: this.id(), boardId: input.board_id, actorId: input.actor_id,
      type: `run.${input.state}`, objectType: "run", objectId: pair.run.run_id,
      reason: input.block_reason ?? `Run 状态变为 ${input.state}`,
      payload: { output_refs: input.output_refs ?? [], discovery_refs: input.discovery_refs ?? [] }, at: now,
    });
    let releasedClaim: ExecutionClaimRecord | null = null;
    if (input.state === "failed" || input.state === "abandoned") {
      const recoveryReason = input.state === "abandoned"
        ? "Runtime 已中断或放弃当前 Run，自动释放 Claim"
        : "Run 执行失败，自动释放 Claim 以便其他 Runtime 继续推进";
      this.repository.updateClaimState(pair.claim.claim_id, "released", now, recoveryReason);
      cursor = this.options.appendEvent({
        eventId: this.id(), boardId: input.board_id, actorId: input.actor_id,
        type: "claim.released", objectType: "claim", objectId: pair.claim.claim_id,
        reason: recoveryReason, payload: { run_id: pair.run.run_id, recovery: true }, at: now,
      });
      releasedClaim = this.requireClaim(input.board_id, pair.claim.claim_id);
    }
    return {
      run: this.repository.getRun(input.board_id, pair.run.run_id)!,
      released_claim: releasedClaim,
      observed_event_cursor: cursor,
    };
  }

  private expirePastClaimsAt(boardId: string, actorId: string, now: string): string[] {
    return this.repository.immediate(() => {
      const expired = this.repository.expiredActiveClaims(boardId, now);
      for (const claim of expired) {
        const reason = "领取租约已到期，当前 Run 自动中断";
        const abandonedRunIds = this.repository.abandonActiveRuns(claim.claim_id, claim.expires_at, reason);
        for (const runId of abandonedRunIds) {
          this.options.appendEvent({
            eventId: this.id(), boardId, actorId, type: "run.abandoned",
            objectType: "run", objectId: runId, reason,
            payload: { claim_id: claim.claim_id, recovery: true, goal_id: claim.goal_id }, at: claim.expires_at,
          });
        }
        this.repository.updateClaimState(claim.claim_id, "expired", claim.expires_at, "领取租约已到期");
        this.options.appendEvent({
          eventId: this.id(), boardId, actorId, type: "lease.expired",
          objectType: "claim", objectId: claim.claim_id, reason: "领取期限已到",
          payload: { goal_id: claim.goal_id, expired_at: claim.expires_at }, at: now,
        });
      }
      return expired.map((claim) => claim.claim_id);
    });
  }

  private requireClaim(boardId: string, claimId: string): ExecutionClaimRecord {
    const claim = this.repository.getClaim(boardId, claimId);
    if (!claim) throw this.errorFactory("claim.not_found", `Claim 不存在: ${claimId}`);
    return claim;
  }

  private assertClaimOwner(
    claim: ExecutionClaimRecord,
    actorId: string,
    message: string,
    renewalRecovery = false,
  ): void {
    if (claim.actor_id === actorId) return;
    throw this.errorFactory(
      "claim.not_owner",
      message,
      {
        claim_id: claim.claim_id,
        goal_id: claim.goal_id,
        owner_actor_id: claim.actor_id,
        request_actor_id: actorId,
        next_action: renewalRecovery ? "retry_claim_renew_as_owner" : undefined,
        retry_tool: renewalRecovery ? "goalboard_v1_claim_renew" : undefined,
        requires_user_confirmation: false,
        same_runtime_continuation_only: renewalRecovery ? true : undefined,
      },
    );
  }

  private assertRunOwner(run: ExecutionRunRecord, actorId: string): void {
    if (run.actor_id !== actorId) {
      throw this.errorFactory("run.not_owner", "只有执行者可以报告这个 Run");
    }
  }
}

const VALID_RUN_ROLES = new Set([
  "clarifier", "executor", "self_verifier", "cross_reviewer", "adversarial_reviewer", "revalidator",
]);
const TERMINAL_RUN_STATES = new Set(["completed", "failed", "abandoned"]);

function validatePositiveLease(
  leaseSeconds: number,
  maximum: number,
  action: "领取" | "续租",
  errorFactory: ExecutionErrorFactory,
): void {
  if (!Number.isInteger(leaseSeconds) || leaseSeconds <= 0) {
    throw errorFactory("lease.duration_invalid", `${action}时长必须是正整数秒`, {
      requested_lease_seconds: leaseSeconds,
    });
  }
  if (leaseSeconds > maximum) {
    throw errorFactory(
      "lease.duration_exceeds_policy",
      `${action}时长不能超过${action === "续租" ? "领取时确认的" : ""} ${maximum} 秒`,
      {
      requested_lease_seconds: leaseSeconds,
      max_lease_seconds: maximum,
      },
    );
  }
}

function addSeconds(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

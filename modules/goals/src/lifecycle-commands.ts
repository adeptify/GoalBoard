import type {
  GoalArchiveResult,
  GoalCompletionResult,
  GoalRecord,
  GoalRevalidationDecision,
  GoalRevalidationInput,
  GoalTrashResult,
  GoalValidityState,
  GoalsActorWrite,
  GoalsLifecycleApi,
} from "@adeptify/goalboard-contracts/modules/goals";

import type { GoalsCommandContext } from "./command-support.js";
import { GoalArchiveCommands } from "./lifecycle-archive.js";
import { GoalCompletionCommands } from "./lifecycle-completion.js";
import type {
  GoalsLifecycleHooks,
} from "./lifecycle-ports.js";
import { GoalRevalidationCommands } from "./lifecycle-revalidation.js";
import {
  GoalRevisionCommands,
  type AcceptDraftGoalInput,
  type ApplyAcceptedContractRevisionInput,
  type AppliedGoalContractRevision,
  type GoalRevisionHooks,
} from "./lifecycle-revisions.js";

export class GoalLifecycleCommands<TTransition>
implements GoalsLifecycleApi<TTransition> {
  private readonly archive: GoalArchiveCommands;
  private readonly completion: GoalCompletionCommands;
  private readonly revalidation: GoalRevalidationCommands<TTransition>;
  private readonly revisions: GoalRevisionCommands;

  constructor(
    context: GoalsCommandContext,
    hooks: GoalsLifecycleHooks<TTransition>,
    revisionHooks: Pick<GoalRevisionHooks, "validateGoalInput" | "transitionRevisionDependents">,
  ) {
    this.completion = new GoalCompletionCommands(context, hooks);
    this.archive = new GoalArchiveCommands(context, {
      clearActiveGoalIfMatches: hooks.clearActiveGoalIfMatches,
      blockingWork: hooks.blockingWork,
      reopenCompoundAncestorsForUntrustedChild: (...args) =>
        this.completion.reopenCompoundAncestorsForUntrustedChild(...args),
      reconcileCompoundAncestors: (...args) =>
        this.completion.reconcileCompoundAncestors(...args),
    });
    this.revalidation = new GoalRevalidationCommands(context, hooks);
    this.revisions = new GoalRevisionCommands(context, {
      ...revisionHooks,
      reopenCompoundAncestorsForUntrustedChild: (...args) =>
        this.completion.reopenCompoundAncestorsForUntrustedChild(...args),
    });
  }

  acceptDraft(input: AcceptDraftGoalInput): GoalRecord {
    return this.revisions.acceptDraft(input);
  }

  applyAcceptedContractRevision(
    input: ApplyAcceptedContractRevisionInput,
  ): AppliedGoalContractRevision {
    return this.revisions.applyAcceptedContractRevision(input);
  }

  setArchived(
    boardId: string,
    input: { goal_id: string; archived: boolean; reason: string },
    write: GoalsActorWrite,
  ): GoalArchiveResult {
    return this.archive.setArchived(boardId, input, write);
  }

  setTrashed(
    boardId: string,
    input: { goal_id: string; trashed: boolean; reason: string },
    write: GoalsActorWrite,
  ): GoalTrashResult & { replayed: boolean; observed_event_cursor: number } {
    return this.archive.setTrashed(boardId, input, write);
  }

  listTrashed(boardId: string): GoalRecord[] {
    return this.archive.listTrashed(boardId);
  }

  revalidate(input: GoalRevalidationInput): GoalRevalidationDecision<TTransition> {
    return this.revalidation.revalidate(input);
  }

  setValidityState(
    boardId: string,
    goalId: string,
    validityState: GoalValidityState,
    at: string,
  ): GoalRecord {
    return this.revalidation.setValidityState(boardId, goalId, validityState, at);
  }

  evaluateCompletion(input: {
    board_id: string;
    goal_id: string;
    actor_id: string;
    idempotency_key: string;
  }): GoalCompletionResult {
    return this.completion.evaluateCompletion(input);
  }

  reopenForLifecycleFacts(
    boardId: string,
    goalId: string,
    actorId: string,
    at: string,
    reason: string,
  ): number {
    return this.completion.reopenForLifecycleFacts(boardId, goalId, actorId, at, reason);
  }

  satisfyForLifecycleFacts(
    boardId: string,
    goalId: string,
    actorId: string,
    at: string,
  ): number {
    return this.completion.satisfyForLifecycleFacts(boardId, goalId, actorId, at);
  }

  closeAcceptedCompound(
    input: Parameters<GoalCompletionCommands["closeAcceptedCompound"]>[0],
  ): GoalRecord {
    return this.completion.closeAcceptedCompound(input);
  }

  reopenSatisfiedCompoundParent(
    boardId: string,
    parentGoalId: string,
    actorId: string,
    at: string,
  ): boolean {
    return this.completion.reopenSatisfiedCompoundParent(boardId, parentGoalId, actorId, at);
  }

  markSatisfiedGoalForEvidenceRevalidation(
    boardId: string,
    goalId: string,
    actorId: string,
    evidenceId: string,
    correctionId: string,
    at: string,
  ): number {
    return this.completion.markSatisfiedGoalForEvidenceRevalidation(
      boardId,
      goalId,
      actorId,
      evidenceId,
      correctionId,
      at,
    );
  }

  reopenCompoundAncestorsForUntrustedChild(
    boardId: string,
    childGoalId: string,
    actorId: string,
    at: string,
    triggerReason: string,
    directParentGoalId?: string,
  ): number {
    return this.completion.reopenCompoundAncestorsForUntrustedChild(
      boardId,
      childGoalId,
      actorId,
      at,
      triggerReason,
      directParentGoalId,
    );
  }

  reconcileCompoundGoalAndAncestors(
    boardId: string,
    goalId: string,
    actorId: string,
    at: string,
  ): number {
    return this.completion.reconcileCompoundGoalAndAncestors(boardId, goalId, actorId, at);
  }

  reconcileAllClosedCompoundGoals(boardId: string, actorId: string, at: string): number {
    return this.completion.reconcileAllClosedCompoundGoals(boardId, actorId, at);
  }

  reconcileCompoundAncestors(
    boardId: string,
    childGoalId: string,
    actorId: string,
    at: string,
  ): number {
    return this.completion.reconcileCompoundAncestors(boardId, childGoalId, actorId, at);
  }
}

export type {
  GoalRevalidationRunView,
  GoalsLifecycleHooks,
} from "./lifecycle-ports.js";

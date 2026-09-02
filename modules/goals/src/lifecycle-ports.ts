import type {
  GoalLifecycleReason,
} from "@adeptify/goalboard-contracts/modules/goals";

export interface GoalRevalidationRunView {
  run_id: string;
  board_id: string;
  goal_id: string;
  actor_id: string;
  role: string;
  state: string;
  claim_state: string;
  claim_expires_at: string;
  claim_role: string;
  claim_actor_id: string;
  claim_contract_revision: number;
}

export interface GoalArchiveHooks {
  clearActiveGoalIfMatches?(boardId: string, goalId: string, at: string): boolean;
  blockingWork?(boardId: string, goalId: string, now: string): {
    claim_ids: string[];
    run_ids: string[];
  };
  reopenCompoundAncestorsForUntrustedChild(
    boardId: string,
    childGoalId: string,
    actorId: string,
    at: string,
    reason: string,
  ): number;
  reconcileCompoundAncestors(
    boardId: string,
    childGoalId: string,
    actorId: string,
    at: string,
  ): number;
}

export interface GoalCompletionHooks {
  clearActiveGoalIfMatches?(boardId: string, goalId: string, at: string): boolean;
  compoundCoverageBlocksClosure?(boardId: string, goalId: string): boolean;
  completionGateReasons?(boardId: string, goalId: string): GoalLifecycleReason[];
}

export interface GoalsLifecycleHooks<TTransition>
  extends Pick<GoalArchiveHooks, "clearActiveGoalIfMatches" | "blockingWork">,
    Pick<
      GoalCompletionHooks,
      "compoundCoverageBlocksClosure" | "completionGateReasons"
    > {
  currentActionProjection?(boardId: string, goalId: string): {
    action_token: string;
  };
  isContractRevisionCompatible?(boardId: string, goalId: string, revision: number): boolean;
  readRevalidationRun?(boardId: string, runId: string): GoalRevalidationRunView | null;
  completeRevalidationRun?(
    boardId: string,
    goalId: string,
    runId: string,
    actorId: string,
    at: string,
  ): void;
  reconcileLifecycle(
    boardId: string,
    goalId: string,
    actorId: string,
    previousActionToken: string,
    summary: string,
    at: string,
  ): TTransition;
}


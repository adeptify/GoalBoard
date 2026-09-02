import type { EvidenceVerificationApplicationApi } from "@adeptify/goalboard-contracts/modules/evidence-verification";
import type { ExecutionApplicationApi } from "@adeptify/goalboard-contracts/modules/execution";
import type { GovernanceApplicationApi } from "@adeptify/goalboard-contracts/modules/governance-collaboration";
import type { GoalPolicy } from "@adeptify/goalboard-contracts/modules/goals";
import { ExecutionModule } from "@adeptify/goalboard-module-execution";
import { GoalsModule } from "@adeptify/goalboard-module-goals";

import type {
  ActionTransitionReceipt,
  BoardSnapshot,
  ClaimRole,
  DecisionReason,
  GoalAction,
  GoalRecord,
  GoalWorkStateView,
  ImpactBindingRecord,
  ReviewRecord,
  RunRecord,
} from "./types.js";
import { SqliteGoalBoardStore } from "./store.js";

export interface ExecutionValidationEvaluationInput {
  boardId: string;
  goalId: string;
  actorId: string;
  role: ClaimRole;
  capabilities: string[];
  goalModeAttestation: boolean;
  strengthenPolicy?: Partial<GoalPolicy>;
  now: string;
  snapshot?: BoardSnapshot;
}

export interface ExecutionValidationEvaluation {
  goal: GoalRecord | null;
  reasons: DecisionReason[];
  policy: GoalPolicy;
  surfaces: ImpactBindingRecord[];
}

export interface ExecutionValidationApplicationPorts {
  readonly store: SqliteGoalBoardStore;
  readonly executionModule: ExecutionModule;
  readonly execution: ExecutionApplicationApi;
  readonly evidenceVerification: EvidenceVerificationApplicationApi;
  readonly governance: GovernanceApplicationApi;
  readonly goalsModule: GoalsModule<ActionTransitionReceipt>;
  readonly clock: () => Date;
  evaluate(input: ExecutionValidationEvaluationInput): ExecutionValidationEvaluation;
  claimRoleForAction(candidate: GoalAction, snapshot: BoardSnapshot): ClaimRole;
  ensureReviewObligations(boardId: string, goalId: string, policy: GoalPolicy, at: string): void;
  deriveGoalWorkState(
    boardId: string,
    goal: GoalRecord,
    snapshot: BoardSnapshot,
    now: string,
  ): GoalWorkStateView;
  executorHandoffReasons(workState: GoalWorkStateView): DecisionReason[];
  reconcileLifecycle(
    boardId: string,
    goalId: string,
    actorId: string,
    previousActionToken: string,
    summary: string,
    at: string,
  ): ActionTransitionReceipt;
  hasPostExecutionNeedsChanges(boardId: string, goalId: string): boolean;
  readRun(runId: string): RunRecord;
  readReview(boardId: string, reviewId: string): ReviewRecord;
  requireBoard(boardId: string): void;
  requireGoalOnBoard(boardId: string, goalId: string): GoalRecord;
  replay<T>(boardId: string, actorId: string, operation: string, key: string, hash: string): T | null;
  remember(
    boardId: string,
    actorId: string,
    operation: string,
    key: string,
    hash: string,
    outcome: unknown,
    at: string,
  ): void;
}

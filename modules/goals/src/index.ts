import type {
  AddGoalRelationInput,
  AddProjectGuidanceInput,
  CreateGoalInput,
  GoalPolicy,
  PlanningMethodPack,
  GoalsCommandApi,
  GoalsLifecycleApi,
  GoalsQueryApi,
  GoalsActorWrite,
  RiskFactsInput,
  SetRiskStateInput,
  UpdateProjectGuidanceInput,
  UpdateRiskInput,
} from "@adeptify/goalboard-contracts/modules/goals";

import {
  GoalsCommandContext,
  type GoalsCommandContextOptions,
} from "./command-support.js";
import {
  GoalCommands,
  type GoalRelationGraphIssue,
} from "./goal-commands.js";
import { GuidanceCommands } from "./guidance-commands.js";
import {
  GoalLifecycleCommands,
  type GoalsLifecycleHooks,
} from "./lifecycle-commands.js";
import type { GoalRevisionHooks } from "./lifecycle-revisions.js";
import {
  migrateActiveGoalLifecycle,
  migrateGoalArchiveSchema,
  migrateGoalContractCoverageSchema,
  migrateGoalLifecycleState,
  migratePlanningMethodPacksSchema,
  migrateGoalTrashSchema,
  type GoalLifecycleMigrationDatabase,
} from "./migrations.js";
import {
  RiskCommands,
  type GoalsRiskLifecycleHooks,
} from "./risk-commands.js";
import { GoalsPlanningEngine } from "./planning/engine.js";
import { GoalsQueryService } from "./query.js";
import { GoalsRepository, type GoalsSqliteDatabase } from "./repository.js";

export const packageDescriptor = {
  packageName: "@adeptify/goalboard-module-goals",
  packagePath: "modules/goals",
  kind: "module",
  maturity: "partial",
  contract: "@adeptify/goalboard-contracts/modules/goals",
  migrationGoals: [
    "goal-reorg-f2",
    "goal-f826dfb8-bf63-4e98-b6b7-57f6b4b7c3b8",
    "goal-reorg-gw1",
    "goal-reorg-gw2",
    "goal-reorg-gw3",
    "goal-reorg-gw4",
  ],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [
    "goals.command.v1",
    "goals.repository.v1",
    "goals.lifecycle.v1",
    "goals.planning.v1",
    "goals.query.v1",
  ],
} as const;

export type GoalBoardPackageDescriptor = typeof packageDescriptor;

export interface GoalsModuleHooks<TTransition>
  extends GoalsLifecycleHooks<TTransition>, GoalsRiskLifecycleHooks<TTransition>, Pick<GoalRevisionHooks, "transitionRevisionDependents"> {
  validateRelationGraph?(boardId: string, input: AddGoalRelationInput): GoalRelationGraphIssue | null;
}

export interface GoalsModuleOptions extends GoalsCommandContextOptions {
  personalPlanningMethodPacks?: readonly PlanningMethodPack[];
}

export class GoalsModule<TTransition> {
  readonly repository: GoalsRepository;
  readonly commands: GoalsCommandApi<TTransition> & {
    validateGoalInput: GoalCommands["validateGoalInput"];
    normalizeRiskFacts: RiskCommands<TTransition>["normalizeRiskFacts"];
  };
  readonly lifecycle: GoalsLifecycleApi<TTransition> & Pick<
    GoalLifecycleCommands<TTransition>,
    | "reopenSatisfiedCompoundParent"
    | "markSatisfiedGoalForEvidenceRevalidation"
    | "reopenCompoundAncestorsForUntrustedChild"
    | "reconcileCompoundGoalAndAncestors"
    | "reconcileAllClosedCompoundGoals"
    | "reconcileCompoundAncestors"
    | "acceptDraft"
    | "applyAcceptedContractRevision"
    | "reopenForLifecycleFacts"
    | "satisfyForLifecycleFacts"
    | "setValidityState"
    | "closeAcceptedCompound"
  >;
  readonly planning: GoalsPlanningEngine;
  readonly query: GoalsQueryApi & {
    getRisk: (boardId: string, riskId: string) => ReturnType<GoalsRepository["getRisk"]>;
  };

  constructor(
    db: GoalsSqliteDatabase,
    hooks: GoalsModuleHooks<TTransition>,
    options: GoalsModuleOptions = {},
  ) {
    this.repository = new GoalsRepository(db);
    const context = new GoalsCommandContext(this.repository, options);
    const query = new GoalsQueryService(this.repository, options);
    this.planning = new GoalsPlanningEngine(
      context,
      options.personalPlanningMethodPacks,
    );
    let lifecycle!: GoalLifecycleCommands<TTransition>;
    const goals = new GoalCommands(context, {
      validateRelationGraph: hooks.validateRelationGraph,
      reopenSatisfiedCompoundParent: (...args) => lifecycle.reopenSatisfiedCompoundParent(...args),
      reconcileCompoundAncestors: (...args) => lifecycle.reconcileCompoundAncestors(...args),
      reopenCompoundAncestorsForUntrustedChild: (...args) =>
        lifecycle.reopenCompoundAncestorsForUntrustedChild(...args),
    });
    lifecycle = new GoalLifecycleCommands(context, hooks, {
      validateGoalInput: (input) => goals.validateGoalInput(input),
      transitionRevisionDependents: (input) => hooks.transitionRevisionDependents(input),
    });
    const risks = new RiskCommands(context, {
      currentActionToken: (...args) => hooks.currentActionToken(...args),
      authorizeRiskUpdate: (...args) => hooks.authorizeRiskUpdate(...args),
      authorizeRiskState: (...args) => hooks.authorizeRiskState(...args),
      reconcileLifecycle: (...args) => hooks.reconcileLifecycle(...args),
      reopenCompoundAncestorsForUntrustedChild: (...args) =>
        lifecycle.reopenCompoundAncestorsForUntrustedChild(...args),
    });
    const guidance = new GuidanceCommands(context);
    this.commands = {
      createGoal: (boardId: string, input: CreateGoalInput, write: GoalsActorWrite) =>
        goals.createGoal(boardId, input, write),
      updateDraftGoal: (
        boardId: string,
        goalId: string,
        input: CreateGoalInput,
        write: GoalsActorWrite,
      ) => goals.updateDraftGoal(boardId, goalId, input, write),
      addRelation: (boardId: string, input: AddGoalRelationInput, write: GoalsActorWrite) =>
        goals.addRelation(boardId, input, write),
      deactivateRelation: (
        boardId: string,
        input: { relation_id: string; reason: string },
        write: GoalsActorWrite,
      ) => goals.deactivateRelation(boardId, input, write),
      setPolicy: (
        boardId: string,
        input: { goal_id?: string | null; policy: Partial<GoalPolicy>; reason: string },
        write: GoalsActorWrite,
      ) => goals.setPolicy(boardId, input, write),
      validateGoalInput: (input: CreateGoalInput) => goals.validateGoalInput(input),
      addRisk: (boardId: string, input: RiskFactsInput, write: GoalsActorWrite) =>
        risks.addRisk(boardId, input, write),
      updateRisk: (boardId: string, input: UpdateRiskInput, write: GoalsActorWrite) =>
        risks.updateRisk(boardId, input, write),
      setRiskState: (boardId: string, input: SetRiskStateInput, write: GoalsActorWrite) =>
        risks.setRiskState(boardId, input, write),
      normalizeRiskFacts: (boardId: string, input: Omit<RiskFactsInput, "risk_id">) =>
        risks.normalizeRiskFacts(boardId, input),
      addProjectGuidance: (input: AddProjectGuidanceInput) => guidance.add(input),
      updateProjectGuidance: (input: UpdateProjectGuidanceInput) => guidance.update(input),
    };
    this.lifecycle = lifecycle;
    this.query = {
      getBoard: (boardId: string) => query.getBoard(boardId),
      getGoal: (boardId: string, goalId: string) => query.getGoal(boardId, goalId),
      listGoals: (boardId: string, queryOptions) => query.listGoals(boardId, queryOptions),
      listRelations: (boardId: string, goalId?: string) => query.listRelations(boardId, goalId),
      listTrashedGoals: (boardId: string) => query.listTrashedGoals(boardId),
      snapshot: (boardId: string) => query.snapshot(boardId),
      resolvePolicy: (boardId: string, goalId: string, strengthen?: Partial<GoalPolicy>) =>
        query.resolvePolicy(boardId, goalId, strengthen),
      readGoal: (boardId: string, goalId: string) => query.readGoal(boardId, goalId),
      getRisk: (boardId: string, riskId: string) => this.repository.getRisk(boardId, riskId),
      readProjectGuidance: (boardId: string) => query.readProjectGuidance(boardId),
    };
  }
}

export { GoalsCommandError, type GoalsErrorFactory } from "./errors.js";
export {
  GoalLifecycleCommands,
  type GoalRevalidationRunView,
  type GoalsLifecycleHooks,
} from "./lifecycle-commands.js";
export {
  GoalRevisionCommands,
  type AcceptDraftGoalInput,
  type AppliedGoalContractRevision,
  type ApplyAcceptedContractRevisionInput,
  type GoalRevisionDependentTransition,
  type GoalRevisionHooks,
} from "./lifecycle-revisions.js";
export {
  migrateActiveGoalLifecycle,
  migrateGoalArchiveSchema,
  migrateGoalContractCoverageSchema,
  migrateGoalLifecycleState,
  migratePlanningMethodPacksSchema,
  migrateGoalTrashSchema,
  type GoalLifecycleMigrationDatabase,
};
export {
  type GoalsRiskLifecycleHooks,
} from "./risk-commands.js";
export {
  GoalsPlanningEngine,
} from "./planning/engine.js";
export { GoalsQueryService, resolveGoalPolicy } from "./query.js";
export {
  analyzeGoalChangeImpact,
  planningMetrics,
  projectPlanningRelations,
  validatePlanningGraph,
  validatePlanningProposalGraph,
  type GoalChangeImpact,
  type PlanningGraphIssue,
  type PlanningMetric,
  type PlanningRelationChange,
} from "./planning/goal-graph.js";
export {
  loadPlanningMethodSources,
  parsePlanningMethodMarkdown,
  type ParsedPlanningMethodSource,
} from "./planning/method-catalog.js";
export {
  BUILTIN_PLANNING_METHOD_PACKS,
  PLANNING_METHOD_CATALOG_DIRECTORY,
  TASK_CONTEXT_METHOD_IDS,
  compilePlanningMethodInstructions,
  composePlanningMethodPacks,
  hydratePlanningMethodPack,
  loadBuiltinPlanningMethodPacks,
  mergedCoverageRules,
  methodPacksForReview,
  normalizePlanningMethodPack,
  resolvePlanningMethodPacks,
  validatePlanningMethodPack,
  type PlanningCoverageRule,
  type PlanningDependencyRule,
  type PlanningMethodComposition,
  type PlanningMethodKind,
  type PlanningMethodPack,
  type PlanningMethodPackInput,
  type PlanningMethodPath,
  type PlanningMethodScope,
  type ResolvedPlanningMethodPack,
} from "./planning/method-packs.js";
export {
  PRODUCT_PATH_AREAS,
  PRODUCT_PATH_AREA_LABELS,
  TASK_CONTEXT_AREAS,
  TASK_CONTEXT_LABELS,
  UNIVERSAL_RESULT_CHAIN_AREAS,
  goalProposalLeafReadinessIssues,
  readDecompositionReview,
  readLeafReadiness,
  type GoalDecompositionValidationContext,
  type GoalDecompositionValidationIssue,
  type ProductPathArea,
} from "./planning/decomposition-validation.js";
export {
  goalTreeProposalDecompositionIssues,
  recordedContractCoverageBlocksClosure,
} from "./planning/decomposition-coverage.js";
export type {
  GoalsPlanningApi,
  GoalsQueryApi,
  SaveProjectPlanningMethodInput,
  SetRiskStateInput,
  UpdateRiskInput,
} from "@adeptify/goalboard-contracts/modules/goals";
export { GoalsRepository, type GoalsSqliteDatabase } from "./repository.js";

import { randomUUID } from "node:crypto";

import type {
  GoalChangeImpact,
  GoalRecord,
  GoalRelationRecord,
  GoalsPlanningApi,
  PlanningGraphIssue,
  PlanningMethodComposition,
  PlanningMethodPack,
  PlanningMetric,
  PlanningProposalItem,
  PlanningRelationChange,
  SaveProjectPlanningMethodInput,
} from "@adeptify/goalboard-contracts/modules/goals";

import { GoalsCommandContext } from "../command-support.js";
import {
  analyzeGoalChangeImpact,
  planningMetrics,
  projectPlanningRelations,
  validatePlanningGraph,
  validatePlanningProposalGraph,
} from "./goal-graph.js";
import {
  composePlanningMethodPacks,
  normalizePlanningMethodPack,
  resolvePlanningMethodPacks,
} from "./method-packs.js";

type GraphGoal = Pick<
  GoalRecord,
  "goal_id" | "decomposition_state" | "fulfillment_state" | "trashed_at"
>;
type GraphRelation = Pick<
  GoalRelationRecord,
  "relation_id" | "from_goal_id" | "to_goal_id" | "type" | "state"
>;

export class GoalsPlanningEngine implements GoalsPlanningApi {
  constructor(
    private readonly context: GoalsCommandContext,
    private readonly personalMethods: readonly PlanningMethodPack[] = [],
  ) {}

  effectiveMethods(boardId: string): PlanningMethodPack[] {
    this.context.requireBoard(boardId);
    return resolvePlanningMethodPacks(
      this.personalMethods,
      this.context.repository.listPlanningMethodPacks(boardId),
    );
  }

  projectComposition(boardId: string): PlanningMethodComposition {
    return composePlanningMethodPacks(
      this.effectiveMethods(boardId).filter((method) =>
        method.scope === "project" && method.enabled),
    );
  }

  saveProjectMethod(input: SaveProjectPlanningMethodInput): {
    method: PlanningMethodPack;
    observed_event_cursor: number;
  } {
    this.context.requireBoard(input.board_id);
    if (input.user_confirmed !== true) {
      throw this.context.error(
        "planning.user_confirmation_required",
        "项目方法会改变后续 Goal 的拆分和依赖判断，必须由用户确认",
      );
    }
    const current = this.context.repository.listPlanningMethodPacks(input.board_id)
      .find((pack) => pack.method_id === input.method.method_id) ?? null;
    const at = this.context.now().toISOString();
    const method = normalizePlanningMethodPack(input.method, "project", current, at);
    return this.context.repository.immediate(() => {
      this.context.repository.putPlanningMethodPack(input.board_id, method);
      const cursor = this.context.repository.appendEvent({
        eventId: randomUUID(),
        boardId: input.board_id,
        actorId: input.actor_id,
        type: "planning.method_saved",
        objectType: "planning_method",
        objectId: method.method_id,
        reason: `更新项目规划方法：${method.name}`,
        payload: {
          method_id: method.method_id,
          version: method.version,
          enabled: method.enabled,
        },
        at,
      });
      return { method, observed_event_cursor: cursor };
    });
  }

  analyzeChange(boardId: string, changedGoalIds: readonly string[]): GoalChangeImpact {
    this.context.requireBoard(boardId);
    for (const goalId of changedGoalIds) this.context.requireGoal(boardId, goalId);
    return analyzeGoalChangeImpact(
      this.context.repository.listGoals(boardId),
      this.context.repository.listRelations(boardId),
      changedGoalIds,
    );
  }

  validateBoardGraph(boardId: string): {
    issues: PlanningGraphIssue[];
    observed_event_cursor: number;
  } {
    this.context.requireBoard(boardId);
    return {
      issues: validatePlanningGraph(
        this.context.repository.listGoals(boardId),
        this.context.repository.listRelations(boardId),
      ),
      observed_event_cursor: this.context.repository.eventCursor(boardId),
    };
  }

  projectRelations(
    relations: readonly GraphRelation[],
    changes: readonly PlanningRelationChange[] = [],
  ): GraphRelation[] {
    return projectPlanningRelations(relations, changes);
  }

  validateGraph(
    goals: readonly Pick<GoalRecord, "goal_id" | "trashed_at">[],
    relations: readonly GraphRelation[],
  ): PlanningGraphIssue[] {
    return validatePlanningGraph(goals, relations);
  }

  validateProposalGraph(
    goals: readonly Pick<GoalRecord, "goal_id" | "trashed_at">[],
    relations: readonly GraphRelation[],
    items: readonly PlanningProposalItem[],
  ): PlanningGraphIssue[] {
    return validatePlanningProposalGraph(goals, relations, items);
  }

  metrics(goals: readonly GraphGoal[], relations: readonly GraphRelation[]): Map<string, PlanningMetric> {
    return planningMetrics(goals, relations);
  }
}

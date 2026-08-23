import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  BUILTIN_PLANNING_METHOD_PACKS,
  composePlanningMethodPacks,
  normalizePlanningMethodPack,
  resolvePlanningMethodPacks,
  type PlanningMethodPackInput,
} from "../src/planning/method-packs.js";
import {
  analyzeGoalChangeImpact,
  planningMetrics,
  projectPlanningRelations,
  validatePlanningGraph,
} from "../src/planning/goal-graph.js";
import { GoalBoardProjectCatalog, readPersonalPlanningMethodPacks } from "../src/projects/catalog.js";
import { GoalBoardCoordinator } from "../src/v1/coordinator.js";
import { goalTreeProposalDecompositionIssues } from "../src/v1/goal-decomposition-validation.js";
import { SqliteGoalBoardStore } from "../src/v1/store.js";
import type { GoalRecord, GoalRelationRecord } from "../src/v1/types.js";

function customMethod(methodId: string): PlanningMethodPackInput {
  return {
    method_id: methodId,
    kind: "custom",
    name: "客户研究方法",
    summary: "从研究问题、样本和证据走到可复核结论。",
    applies_to: ["客户访谈"],
    domain_tags: ["research"],
    steps: ["明确研究问题", "形成样本与访谈证据", "综合结论并标注限制"],
    required_coverage: [{ area: "research_question", label: "研究问题", question: "要支持哪个决定？" }],
    dependency_rules: [{ rule_id: "evidence-before-conclusion", statement: "结论依赖可追溯证据。", direction_hint: "conclusion depends_on evidence" }],
    evidence_requirements: ["访谈记录"],
    completion_checks: ["结论可追溯"],
    failure_modes: ["先有结论再找证据"],
    source_refs: ["user-confirmed method"],
    confidence: 0.8,
    enabled: true,
  };
}

function goal(goalId: string, state: GoalRecord["fulfillment_state"] = "unmet") {
  return {
    goal_id: goalId,
    trashed_at: null,
    fulfillment_state: state,
    decomposition_state: "closed_leaf" as const,
  };
}

function relation(
  relationId: string,
  from: string,
  to: string,
  type: GoalRelationRecord["type"],
): Pick<GoalRelationRecord, "relation_id" | "from_goal_id" | "to_goal_id" | "type" | "state"> {
  return { relation_id: relationId, from_goal_id: from, to_goal_id: to, type, state: "active" };
}

test("planning methods resolve project over personal over cold-start built-ins", () => {
  const requiredColdStartIds = [
    "meta-domain-pack-builder",
    "domain-software-development",
    "domain-data-analysis",
    "domain-market-analysis",
    "domain-product-ux",
    "domain-ai-data-product",
    "domain-game-design",
    "domain-research-content",
    "domain-operations-organization",
  ];
  for (const methodId of requiredColdStartIds) {
    const pack = BUILTIN_PLANNING_METHOD_PACKS.find((item) => item.method_id === methodId);
    assert.ok(pack, `${methodId} should be available as a cold-start method`);
    assert.ok(pack.steps.length > 0);
    assert.ok(pack.required_coverage.length > 0);
    assert.ok(pack.dependency_rules.length > 0);
    assert.ok(pack.completion_checks.length > 0);
  }
  const builtIn = BUILTIN_PLANNING_METHOD_PACKS.find((pack) => pack.method_id === "domain-software-development")!;
  const personal = normalizePlanningMethodPack({ ...builtIn, name: "个人软件开发方法" }, "personal", null, "2026-08-22T01:00:00.000Z");
  const project = normalizePlanningMethodPack({ ...personal, name: "项目软件开发方法" }, "project", null, "2026-08-22T02:00:00.000Z");
  const resolved = resolvePlanningMethodPacks([personal], [project]);
  const selected = resolved.find((pack) => pack.method_id === builtIn.method_id)!;
  assert.equal(selected.scope, "project");
  assert.equal(selected.name, "项目软件开发方法");
  assert.deepEqual(selected.overridden_scopes, ["personal", "built_in"]);
  assert.ok(resolved.some((pack) => pack.method_id === "meta-domain-pack-builder"));
});

test("project planning composition keeps method paths separate and merges their checks", () => {
  const workType = BUILTIN_PLANNING_METHOD_PACKS.find((pack) => pack.method_id === "work-build-change")!;
  const software = BUILTIN_PLANNING_METHOD_PACKS.find((pack) => pack.method_id === "domain-software-development")!;
  const composition = composePlanningMethodPacks([software, workType]);

  assert.deepEqual(composition.method_pack_ids, ["work-build-change", "domain-software-development"]);
  assert.deepEqual(composition.method_paths.map((path) => path.method_id), composition.method_pack_ids);
  assert.equal(composition.method_paths[0]?.steps.length, workType.steps.length);
  assert.equal(composition.method_paths[1]?.steps.length, software.steps.length);
  assert.equal(
    composition.dependency_rules.filter((rule) => rule.direction_hint === "consumer depends_on provider").length,
    1,
  );
  assert.ok(composition.required_coverage.some((rule) => rule.area === "final_outcome"));
  assert.ok(composition.required_coverage.some((rule) => rule.area === "core_function"));
});

test("complex decomposition must include every method in the project composition", () => {
  const methodIds = ["work-build-change", "domain-software-development"];
  const composition = composePlanningMethodPacks(
    BUILTIN_PLANNING_METHOD_PACKS.filter((pack) => methodIds.includes(pack.method_id)),
  );
  const issues = goalTreeProposalDecompositionIssues(
    [{
      item_id: "parent-contract",
      kind: "contract",
      operation: "update",
      payload: {
        goal_id: "parent",
        title: "交付完整软件产品",
        definition_state: "accepted",
        decomposition_state: "closed_compound",
        decomposition_review: {
          status: "complete",
          task_context: "other",
          method_pack_ids: ["work-build-change"],
          coverage: composition.required_coverage.map((rule) => ({
            area: rule.area,
            disposition: "owned",
            goal_ids: ["child"],
            reason: "由子 Goal 负责。",
          })),
          open_goal_ids: [],
          next_step: "推进子 Goal。",
        },
      },
    }],
    {
      goals: [
        { goal_id: "parent", decomposition_state: "frontier_open" },
        { goal_id: "child", decomposition_state: "closed_leaf" },
      ],
      relations: [{
        relation_id: "child-parent",
        from_goal_id: "child",
        to_goal_id: "parent",
        type: "part_of",
        state: "active",
      }],
    },
    BUILTIN_PLANNING_METHOD_PACKS,
    methodIds,
  );

  const compositionIssue = issues.find((issue) => issue.code === "goal_tree_proposal.project_planning_composition_incomplete");
  assert.ok(compositionIssue);
  assert.match(compositionIssue.message, /软件开发/);
});

test("project and personal methods persist without a second Goal truth model", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "goalboard-planning-"));
  const store = new SqliteGoalBoardStore(path.join(root, "board.db"));
  const coordinator = new GoalBoardCoordinator(store, () => new Date("2026-08-22T03:00:00.000Z"));
  coordinator.initializeBoard({ board_id: "board-1", title: "规划测试", actor_id: "user", idempotency_key: "init" });
  assert.throws(
    () => coordinator.saveProjectPlanningMethod({
      board_id: "board-1",
      method: customMethod("domain-unconfirmed-research"),
      actor_id: "runtime",
      user_confirmed: false,
    }),
    /必须由用户确认/,
  );
  const saved = coordinator.saveProjectPlanningMethod({
    board_id: "board-1",
    method: customMethod("domain-customer-research"),
    actor_id: "user",
    user_confirmed: true,
  });
  assert.equal(saved.method.scope, "project");
  assert.equal(store.snapshot("board-1").planning_method_packs.length, 1);
  store.close();

  const catalog = await GoalBoardProjectCatalog.open({ homeDirectory: root });
  const personal = normalizePlanningMethodPack(customMethod("domain-personal-research"), "personal", null, "2026-08-22T04:00:00.000Z");
  catalog.putPersonalPlanningMethodPack(personal);
  catalog.close();
  assert.equal(readPersonalPlanningMethodPacks(root)[0]?.method_id, personal.method_id);
});

test("whole-graph validation catches dependency and combined execution cycles", () => {
  const goals = [goal("foundation"), goal("feature"), goal("release")];
  const dependencyCycle = [
    relation("d1", "feature", "foundation", "depends_on"),
    relation("d2", "foundation", "feature", "depends_on"),
  ];
  assert.ok(validatePlanningGraph(goals, dependencyCycle).some((issue) => issue.code === "planning.dependency_cycle"));

  const combinedCycle = [
    relation("p1", "feature", "release", "part_of"),
    relation("d3", "feature", "release", "depends_on"),
  ];
  assert.ok(validatePlanningGraph(goals, combinedCycle).some((issue) => issue.code === "planning.execution_cycle"));

  const projected = projectPlanningRelations([], [
    { action: "add", relation_id: "x1", from_goal_id: "feature", to_goal_id: "foundation", type: "depends_on" },
    { action: "add", relation_id: "x2", from_goal_id: "foundation", to_goal_id: "feature", type: "depends_on" },
  ]);
  assert.equal(projected.length, 2);
});

test("planning order and requirement impact stay local and explain downstream value", () => {
  const goals = [goal("foundation"), goal("feature"), goal("release"), goal("unrelated")];
  const relations = [
    relation("d1", "feature", "foundation", "depends_on"),
    relation("d2", "release", "feature", "depends_on"),
  ];
  const metrics = planningMetrics(goals, relations);
  assert.equal(metrics.get("foundation")?.unlock_count, 2);
  assert.equal(metrics.get("foundation")?.longest_downstream_chain, 2);
  assert.equal(metrics.get("release")?.topological_level, 2);

  const impact = analyzeGoalChangeImpact(goals, relations, ["foundation"]);
  assert.deepEqual(impact.affected_dependents, ["feature", "release"]);
  assert.ok(impact.reusable_open_goal_ids.includes("feature"));
  assert.ok(!impact.review_order.includes("unrelated"));
});

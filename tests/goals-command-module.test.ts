import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  GoalsCommandError,
  GoalsModule,
  migrateGoalLifecycleState,
  type GoalLifecycleMigrationDatabase,
  type GoalRevisionDependentTransition,
} from "@adeptify/goalboard-module-goals";

import { GoalBoardCoordinator } from "../src/v1/coordinator.js";
import { SqliteGoalBoardStore } from "../src/v1/store.js";

test("Goals public Command API owns Goal, relation, Policy, Risk, and Guidance writes", () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-goals-module-"));
  const store = new SqliteGoalBoardStore(join(directory, "goalboard.sqlite"));
  try {
    new GoalBoardCoordinator(store).initializeBoard({
      board_id: "board-module",
      title: "Goals Module",
      actor_id: "user-1",
      idempotency_key: "initialize",
    });
    const transitions: string[] = [];
    const goals = new GoalsModule(store.db, {
      currentActionToken: (_boardId, goalId) => `token:${goalId}`,
      authorizeRiskUpdate: () => undefined,
      authorizeRiskState: () => undefined,
      transitionRevisionDependents: () => undefined,
      reconcileLifecycle: (_boardId, goalId) => {
        transitions.push(goalId);
        return { goal_id: goalId };
      },
    });

    const parent = goals.commands.createGoal("board-module", {
      goal_id: "goal-parent",
      title: "父 Goal",
      outcome: "父结果",
      why: "验证关系",
      business_logic: "由子 Goal 提供结果。",
      definition_state: "accepted",
      decomposition_state: "closed_compound",
      acceptance_criteria: [{
        criterion_id: "parent-result",
        statement: "结果存在",
        decision_method: "inspection",
        pass_condition: "可以检查",
      }],
    }, { actor_id: "user-1", idempotency_key: "create-parent" });
    assert.equal(parent.goal.goal_id, "goal-parent");

    goals.commands.createGoal("board-module", {
      goal_id: "goal-draft",
      title: "草稿",
      outcome: "",
      why: "",
      business_logic: "",
      acceptance_criteria: [],
    }, { actor_id: "user-1", idempotency_key: "create-draft" });
    const draft = goals.commands.updateDraftGoal("board-module", "goal-draft", {
      title: "完整草稿",
      outcome: "有结果",
      why: "有原因",
      business_logic: "先执行再检查。",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [{
        criterion_id: "draft-result",
        statement: "结果存在",
        decision_method: "automated_check",
        pass_condition: "测试通过",
      }],
    }, {
      actor_id: "user-1",
      idempotency_key: "update-draft",
      reason: "补全草稿",
    });
    assert.equal(draft.goal.title, "完整草稿");

    const relation = goals.commands.addRelation("board-module", {
      from_goal_id: "goal-draft",
      to_goal_id: "goal-parent",
      type: "part_of",
      reason: "子 Goal 组成父结果",
    }, { actor_id: "user-1", idempotency_key: "add-relation" });
    assert.match(relation.relation_id, /^relation-/u);

    const policy = goals.commands.setPolicy("board-module", {
      policy: { goal_mode: "preferred", required_capabilities: ["testing", "testing"] },
      reason: "项目默认规则",
    }, { actor_id: "user-1", idempotency_key: "set-policy" });
    assert.match(policy.policy_binding_id, /^policy-/u);

    const guidance = goals.commands.addProjectGuidance({
      board_id: "board-module",
      actor_id: "user-1",
      kind: "quality_bar",
      content: "迁移必须保持功能无损。",
      reason: "跨 Goal 复用",
      confirmation_summary: "用户确认无损迁移",
      user_confirmed: true,
      idempotency_key: "add-guidance",
    });
    assert.equal(guidance.entry.revision, 1);
    assert.match(goals.query.readProjectGuidance("board-module").runtime_prompt_prefix, /功能无损/u);

    const risk = goals.commands.addRisk("board-module", {
      risk_id: "risk-module",
      goal_ids: ["goal-draft"],
      description: "迁移可能丢失规则",
      probability: "low",
      impact: "high",
      trigger: "回归失败",
      treatment: "mitigate",
      treatment_plan: "运行回归测试",
      blocking_mode: "invalidate_on_trigger",
      revisit_condition: "每次切换调用入口",
      owner: "runtime",
    }, { actor_id: "user-1", idempotency_key: "add-risk" });
    assert.equal(risk.risk.state, "open");
    const triggered = goals.commands.setRiskState("board-module", {
      risk_id: "risk-module",
      state: "triggered",
      reason: "模拟回归失败",
    }, { actor_id: "user-1", idempotency_key: "trigger-risk" });
    assert.equal(triggered.risk.state, "triggered");
    assert.equal(goals.query.getGoal("board-module", "goal-draft")?.validity_state, "invalidated");
    assert.deepEqual(transitions, ["goal-draft", "goal-draft"]);

    const replay = goals.commands.createGoal("board-module", {
      goal_id: "goal-parent",
      title: "父 Goal",
      outcome: "父结果",
      why: "验证关系",
      business_logic: "由子 Goal 提供结果。",
      definition_state: "accepted",
      decomposition_state: "closed_compound",
      acceptance_criteria: [{
        criterion_id: "parent-result",
        statement: "结果存在",
        decision_method: "inspection",
        pass_condition: "可以检查",
      }],
    }, { actor_id: "user-1", idempotency_key: "create-parent" });
    assert.equal(replay.replayed, true);

    assert.throws(
      () => goals.commands.addRelation("board-module", {
        from_goal_id: "goal-draft",
        to_goal_id: "goal-parent",
        type: "part_of",
        reason: "重复关系",
      }, { actor_id: "user-1", idempotency_key: "duplicate-relation" }),
      (error: unknown) =>
        error instanceof GoalsCommandError && error.code === "relation.already_exists",
    );
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Goals public Lifecycle API owns acceptance, revisions, completion, archive, and trash", () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-goals-lifecycle-"));
  const store = new SqliteGoalBoardStore(join(directory, "goalboard.sqlite"));
  try {
    new GoalBoardCoordinator(store).initializeBoard({
      board_id: "board-lifecycle",
      title: "Goals Lifecycle",
      actor_id: "user-1",
      idempotency_key: "initialize",
    });
    const revisionTransitions: GoalRevisionDependentTransition[] = [];
    const goals = new GoalsModule<{ observed_event_cursor: number }>(store.db, {
      currentActionToken: () => "token:lifecycle",
      authorizeRiskUpdate: () => undefined,
      authorizeRiskState: () => undefined,
      transitionRevisionDependents: (input) => revisionTransitions.push(input),
      reconcileLifecycle: (boardId) => ({
        observed_event_cursor: store.snapshot(boardId).cursor,
      }),
    });
    goals.commands.createGoal("board-lifecycle", {
      goal_id: "goal-lifecycle",
      title: "Lifecycle Draft",
      outcome: "",
      why: "",
      business_logic: "",
      acceptance_criteria: [],
    }, { actor_id: "user-1", idempotency_key: "create-draft" });

    const accepted = goals.lifecycle.acceptDraft({
      board_id: "board-lifecycle",
      goal_id: "goal-lifecycle",
      proposed_goal: {
        goal_id: "goal-lifecycle",
        title: "Lifecycle Goal",
        outcome: "生命周期迁移无损",
        why: "验证公开模块边界",
        business_logic: "接受后完成，再验证归档和恢复。",
        definition_state: "accepted",
        decomposition_state: "closed_leaf",
        acceptance_criteria: [{
          criterion_id: "lifecycle-result",
          statement: "生命周期结果可检查",
          decision_method: "inspection",
          pass_condition: "状态与历史一致",
        }],
      },
      actor_id: "user-1",
      accepted_at: "2026-09-02T00:00:00.000Z",
    });
    assert.equal(accepted.definition_state, "accepted");

    const revised = goals.lifecycle.applyAcceptedContractRevision({
      board_id: "board-lifecycle",
      goal_id: "goal-lifecycle",
      proposed_goal: {
        goal_id: accepted.goal_id,
        title: "Lifecycle Goal（说明更新）",
        outcome: accepted.outcome,
        why: "用公开 API 验证版本递增",
        business_logic: accepted.business_logic,
        in_scope: accepted.in_scope,
        out_of_scope: accepted.out_of_scope,
        constraints: accepted.constraints,
        required_inputs: accepted.required_inputs,
        promised_outputs: accepted.promised_outputs,
        definition_state: accepted.definition_state,
        decomposition_state: accepted.decomposition_state,
        priority: accepted.priority,
        acceptance_criteria: accepted.acceptance_criteria.map((criterion) => ({
          criterion_id: criterion.criterion_id,
          statement: criterion.statement,
          decision_method: criterion.decision_method,
          pass_condition: criterion.pass_condition,
          target: criterion.target,
          required_evidence: criterion.required_evidence,
        })),
      },
      source_proposal_id: "proposal-lifecycle",
      source_item_id: "item-lifecycle",
      actor_id: "user-1",
      reason: "只更新说明",
      applied_at: "2026-09-02T00:01:00.000Z",
    });
    assert.equal(revised.goal.goal_id, "goal-lifecycle");
    assert.equal(revised.contract_revision, 2);
    assert.equal(revised.effect, "metadata");
    assert.equal(revisionTransitions.length, 1);

    const completed = goals.lifecycle.evaluateCompletion({
      board_id: "board-lifecycle",
      goal_id: "goal-lifecycle",
      actor_id: "runtime-1",
      idempotency_key: "complete",
    });
    assert.equal(completed.satisfied, true);
    assert.equal(goals.lifecycle.setArchived("board-lifecycle", {
      goal_id: "goal-lifecycle",
      archived: true,
      reason: "验证归档",
    }, { actor_id: "user-1", idempotency_key: "archive" }).goal.archived_at != null, true);
    assert.equal(goals.lifecycle.setArchived("board-lifecycle", {
      goal_id: "goal-lifecycle",
      archived: false,
      reason: "验证恢复",
    }, { actor_id: "user-1", idempotency_key: "unarchive" }).goal.archived_at, null);
    assert.equal(goals.lifecycle.setTrashed("board-lifecycle", {
      goal_id: "goal-lifecycle",
      trashed: true,
      reason: "验证回收站",
    }, { actor_id: "user-1", idempotency_key: "trash" }).status, "trashed");
    assert.equal(goals.lifecycle.setTrashed("board-lifecycle", {
      goal_id: "goal-lifecycle",
      trashed: false,
      reason: "验证原 Goal 恢复",
    }, { actor_id: "user-1", idempotency_key: "restore" }).status, "restored");
    assert.equal(goals.query.getGoal("board-lifecycle", "goal-lifecycle")?.current_contract_revision, 2);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Goal lifecycle migration rolls back every write when one recovery event fails", () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-goals-migration-"));
  const store = new SqliteGoalBoardStore(join(directory, "goalboard.sqlite"));
  try {
    const coordinator = new GoalBoardCoordinator(store);
    coordinator.initializeBoard({
      board_id: "board-migration",
      title: "Goals Migration",
      actor_id: "user-1",
      idempotency_key: "initialize",
    });
    coordinator.goals.commands.createGoal("board-migration", {
      goal_id: "goal-migration",
      title: "Migration Goal",
      outcome: "验证事务回滚",
      why: "旧数据迁移不能半成功",
      business_logic: "模拟失效 Claim 和遗留 Run。",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [{
        criterion_id: "migration-result",
        statement: "失败时没有部分写入",
        decision_method: "automated_check",
        pass_condition: "Run 和 migration marker 保持原样",
      }],
    }, { actor_id: "user-1", idempotency_key: "create" });
    const selected = coordinator.executionValidation.commands.selectGoalAndStart({
      board_id: "board-migration",
      goal_id: "goal-migration",
      actor_id: "runtime-1",
      role: "executor",
      idempotency_key: "select",
    });
    store.db.prepare(`
      UPDATE claims SET state = 'released', released_at = ?, release_reason = ?
      WHERE claim_id = ?
    `).run("2026-09-02T00:02:00.000Z", "模拟旧数据", selected.claim!.claim_id);
    store.db.exec(`
      DELETE FROM schema_migrations WHERE migration_id = 12;
      CREATE TRIGGER fail_goal_lifecycle_migration
      BEFORE INSERT ON events
      WHEN NEW.actor_id = 'goalboard:migration-12'
      BEGIN
        SELECT RAISE(ABORT, 'forced lifecycle migration failure');
      END;
    `);

    assert.throws(
      () => migrateGoalLifecycleState(
        store.db as unknown as GoalLifecycleMigrationDatabase,
        () => new Date("2026-09-02T00:03:00.000Z"),
      ),
      /forced lifecycle migration failure/u,
    );
    const run = store.db.prepare("SELECT state, ended_at FROM runs WHERE run_id = ?")
      .get(selected.run!.run_id) as { state: string; ended_at: string | null };
    const marker = store.db.prepare(
      "SELECT migration_id FROM schema_migrations WHERE migration_id = 12",
    ).get();
    assert.deepEqual(run, { state: "started", ended_at: null });
    assert.equal(marker, undefined);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

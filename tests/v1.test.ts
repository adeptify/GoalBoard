import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  GoalBoardCoordinator,
  GoalBoardV1Error,
  SqliteGoalBoardStore,
  importV3Board,
  type LegacyV3ImportInput,
} from "../src/index.js";
import { runV1Cli } from "../src/v1/cli.js";
import { main as runPublicCli } from "../src/cli/main.js";
import { GoalBoardServer } from "../src/mcp/server.js";

const execFileAsync = promisify(execFile);

function fixture(start = "2026-08-15T00:00:00.000Z") {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-v1-"));
  let now = new Date(start);
  const store = new SqliteGoalBoardStore(join(directory, "goalboard.db"));
  const coordinator = new GoalBoardCoordinator(store, () => now);
  coordinator.initializeBoard({
    board_id: "board-1",
    title: "产品目标",
    actor_id: "user-1",
    idempotency_key: "board-create",
  });
  return {
    store,
    coordinator,
    setNow(value: string) {
      now = new Date(value);
    },
  };
}

function createLeaf(
  coordinator: GoalBoardCoordinator,
  goalId: string,
  priority = 0,
) {
  return coordinator.createGoal(
    "board-1",
    {
      goal_id: goalId,
      title: `完成 ${goalId}`,
      outcome: `${goalId} 有可检查的完成结果`,
      why: "让下一步可以安全继续",
      business_logic: "先完成这一小段工作并证明结果，再允许依赖它的工作开始。",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      priority,
      acceptance_criteria: [
        {
          criterion_id: `${goalId}-criterion`,
          statement: "目标结果存在",
          decision_method: "automated_check",
          pass_condition: "检查命令退出码为 0",
          required_evidence: ["test"],
        },
      ],
    },
    { actor_id: "user-1", idempotency_key: `create-${goalId}` },
  );
}

function dependencyProposal(
  fromGoalId: string,
  toGoalId: string,
  reason: string,
  action: "add" | "deactivate" = "add",
) {
  return {
    from_goal_id: fromGoalId,
    to_goal_id: toGoalId,
    type: "depends_on" as const,
    action,
    reason,
    basis: "contract_output" as const,
    evidence_refs: [`contract://${fromGoalId}`, `contract://${toGoalId}`],
    impact_if_rejected: "依赖关系保持原状，相关 Goal 可能无法按正确顺序推进",
    confidence: 0.9,
    direction_reason: `${fromGoalId} 消费 ${toGoalId} 的承诺结果，反方向没有对应输入`,
  };
}

function goalTreeProposalItem(input: {
  kind: "goal" | "contract" | "relation" | "dependency" | "risk" | "policy" | "candidate" | "rewire";
  operation: "create" | "update" | "deactivate";
  payload: Record<string, unknown>;
  object_type: "goal" | "relation" | "risk" | "policy" | "candidate" | "rewire";
  object_id: string;
  reason?: string;
  confidence?: number;
  source_refs?: string[];
  item_id?: string;
  supersedes_item_id?: string;
}) {
  return {
    item_id: input.item_id,
    kind: input.kind,
    operation: input.operation,
    payload: input.payload,
    source_refs: input.source_refs ?? ["conversation://tree-proposal"],
    reason: input.reason ?? "根据当前澄清形成待用户确认的 Goal Tree 变更",
    confidence: input.confidence ?? 0.9,
    affected_objects: [{ object_type: input.object_type, object_id: input.object_id }],
    supersedes_item_id: input.supersedes_item_id,
  };
}

function treeGoalPayload(input: {
  goal_id: string;
  title: string;
  definition_state: "draft" | "accepted";
  decomposition_state: "abstract" | "frontier_open" | "closed_leaf" | "closed_compound";
}) {
  return {
    goal_id: input.goal_id,
    title: input.title,
    outcome: `${input.title} 有可检查的结果`,
    why: "让用户能把目标拆开并持续推进。",
    business_logic: "先确认一项最小闭环的价值和边界，再根据子 Goal 的状态推进整体结果。",
    definition_state: input.definition_state,
    decomposition_state: input.decomposition_state,
    acceptance_criteria: input.definition_state === "accepted"
      ? [
          {
            criterion_id: `${input.goal_id}-criterion`,
            statement: `${input.title} 的结果可以检查`,
            decision_method: "inspection",
            pass_condition: "用户或 Runtime 可以清楚说明结果已经达成",
            required_evidence: ["conversation://tree-decision"],
          },
        ]
      : [],
  };
}

function createAcceptedCompoundParent(
  coordinator: GoalBoardCoordinator,
  goalId: string,
  decompositionState: "abstract" | "frontier_open" | "closed_leaf" | "closed_compound" = "abstract",
) {
  const title = `收口 ${goalId}`;
  return coordinator.createGoal(
    "board-1",
    {
      goal_id: goalId,
      title,
      outcome: `${goalId} 的子 Goal 全部完成后父级完成`,
      why: "父 Goal 需要明确表达拆分是否已经结束。",
      business_logic: "用户确认完整子树后，父 Goal 等待所有 active 子 Goal 的完成。",
      in_scope: ["子 Goal 汇总", "状态派生"],
      out_of_scope: ["修改已接受的业务范围"],
      constraints: ["只通过用户确认的 Goal Tree 收口"],
      required_inputs: ["已确认的 active 子 Goal"],
      promised_outputs: ["父 Goal 的单一工作状态"],
      definition_state: "accepted",
      decomposition_state: decompositionState,
      priority: 64,
      acceptance_criteria: [
        {
          criterion_id: `${goalId}-children`,
          statement: "所有 active 子 Goal 都已完成",
          decision_method: "inspection",
          pass_condition: "父 Goal 自动显示已完成",
          required_evidence: ["Goal Tree Decision"],
        },
      ],
    },
    { actor_id: "user-1", idempotency_key: `create-${goalId}` },
  );
}

function acceptedCompoundClosurePayload(
  goal: NonNullable<ReturnType<SqliteGoalBoardStore["getGoal"]>>,
  overrides: Record<string, unknown> = {},
) {
  return {
    goal_id: goal.goal_id,
    title: goal.title,
    outcome: goal.outcome,
    why: goal.why,
    business_logic: goal.business_logic,
    in_scope: goal.in_scope,
    out_of_scope: goal.out_of_scope,
    constraints: goal.constraints,
    required_inputs: goal.required_inputs,
    promised_outputs: goal.promised_outputs,
    definition_state: "accepted",
    decomposition_state: "closed_compound",
    priority: goal.priority,
    acceptance_criteria: goal.acceptance_criteria.map(({ goal_id: _goalId, ...criterion }) => criterion),
    ...overrides,
  };
}

function contractFieldSources(runId: string) {
  return [
    "title",
    "outcome",
    "why",
    "business_logic",
    "in_scope",
    "out_of_scope",
    "promised_outputs",
    "priority",
    "acceptance_criteria",
    "review_policy",
  ].map((field) => ({
    field,
    source_kind: field === "outcome" || field === "why" ? "user_answer" : "repository_fact",
    source_refs: [`run://${runId}`, "specs/draft-contract-clarification/spec.md"],
    confidence: field === "business_logic" ? 0.8 : 0.95,
    rationale: `${field} 来自本轮澄清与可查项目事实，仍需用户确认业务含义`,
    status: "proposed" as const,
    requires_user_confirmation: true as const,
  }));
}

test("public CLI and library exports expose only GoalBoard V1 plus explicit V3 import", async () => {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => errors.push(args.map(String).join(" "));
  try {
    assert.equal(await runPublicCli(["--help"]), 0);
    assert.match(logs.join("\n"), /goalboard v1 <operation>/);
    assert.match(logs.join("\n"), /import-v3/);
    assert.doesNotMatch(logs.join("\n"), /profiles|strategy|coverage|handoff|replay/);
    assert.equal(await runPublicCli(["profiles"]), 1);
    assert.match(errors.join("\n"), /只提供 goalboard v1/);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

  const publicApi = await import("../src/index.js");
  assert.deepEqual(Object.keys(publicApi).sort(), [
    "GoalBoardCoordinator",
    "GoalBoardV1Error",
    "SqliteGoalBoardStore",
    "importV3Board",
  ]);
});

test("fresh SQLite authority creates a usable board and reopens idempotently", () => {
  const { store } = fixture();
  const path = store.path;
  const tableCount = store.db
    .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'")
    .get() as { count: number };
  assert.ok(tableCount.count >= 15);
  assert.equal(store.db.pragma("foreign_keys", { simple: true }), 1);
  assert.equal(store.db.pragma("journal_mode", { simple: true }), "wal");
  store.db.exec(`
    DROP TABLE contract_proposals;
    DELETE FROM schema_migrations WHERE migration_id = 3;
    DROP TABLE clarification_turns;
    DROP TABLE clarification_sessions;
    DELETE FROM schema_migrations WHERE migration_id = 8;
    DROP TABLE goal_tree_proposal_decisions;
    DELETE FROM schema_migrations WHERE migration_id = 10;
    DROP TABLE goal_tree_proposal_items;
    DROP TABLE goal_tree_proposals;
    DELETE FROM schema_migrations WHERE migration_id = 9;
    DROP TABLE goal_trash_relation_records;
    DROP TABLE goal_trash_records;
    DELETE FROM schema_migrations WHERE migration_id = 11;
  `);
  store.close();

  const reopened = new SqliteGoalBoardStore(path);
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'contract_proposals'")
      .get(),
  );
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 3")
      .get(),
  );
  const goalColumns = reopened.db.pragma("table_info(goals)") as Array<{ name: string }>;
  assert.ok(goalColumns.some((column) => column.name === "archived_at"));
  assert.ok(goalColumns.some((column) => column.name === "archived_by"));
  assert.ok(goalColumns.some((column) => column.name === "trashed_at"));
  assert.ok(goalColumns.some((column) => column.name === "trashed_by"));
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 4")
      .get(),
  );
  const impactColumns = reopened.db.pragma("table_info(impact_bindings)") as Array<{ name: string }>;
  for (const column of ["updated_at", "deactivated_at", "deactivation_reason"]) {
    assert.ok(impactColumns.some((item) => item.name === column), `missing impact_bindings.${column}`);
  }
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 5")
      .get(),
  );
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 8")
      .get(),
  );
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'clarification_sessions'")
      .get(),
  );
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 9")
      .get(),
  );
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 11")
      .get(),
  );
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 12")
      .get(),
  );
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'goal_trash_records'")
      .get(),
  );
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'goal_trash_relation_records'")
      .get(),
  );
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'goal_tree_proposal_items'")
      .get(),
  );
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 10")
      .get(),
  );
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'goal_tree_proposal_decisions'")
      .get(),
  );
  assert.equal(reopened.snapshot("board-1").board.title, "产品目标");
  reopened.close();
});

test("migration 12 reconciles historical Runs and clarification sessions exactly once", () => {
  const { store, coordinator } = fixture();
  const dialogue = coordinator.startDraftDialogue({
    board_id: "board-1",
    actor_id: "runtime-migration",
    rough_idea: "模拟旧版本留下的澄清生命周期记录。",
    goal_id: "migration-lifecycle-draft",
    idempotency_key: "migration-lifecycle-dialogue",
  });
  const acceptedAt = "2026-08-15T00:10:00.000Z";
  const releasedAt = "2026-08-15T00:11:00.000Z";
  store.db
    .prepare("UPDATE claims SET state = 'expired', released_at = ?, release_reason = ? WHERE claim_id = ?")
    .run(releasedAt, "模拟历史租约过期", dialogue.claim!.claim_id);
  store.db
    .prepare("UPDATE clarification_sessions SET state = 'proposal_ready' WHERE session_id = ?")
    .run(dialogue.dialogue.session_id);
  store.db
    .prepare(`
      UPDATE goals
      SET definition_state = 'accepted', decomposition_state = 'closed_leaf',
          accepted_by = 'user-1', accepted_at = ?, updated_at = ?
      WHERE board_id = 'board-1' AND goal_id = 'migration-lifecycle-draft'
    `)
    .run(acceptedAt, acceptedAt);
  store.db.prepare("DELETE FROM schema_migrations WHERE migration_id = 12").run();
  const databasePath = store.path;
  store.close();

  const migrated = new SqliteGoalBoardStore(databasePath);
  const migratedSnapshot = migrated.snapshot("board-1");
  const repairedRun = migratedSnapshot.runs.find((run) => run.run_id === dialogue.run!.run_id);
  assert.equal(repairedRun?.state, "abandoned");
  assert.equal(repairedRun?.ended_at, releasedAt);
  assert.match(repairedRun?.block_reason ?? "", /Claim 已是 expired/);
  const repairedSession = migratedSnapshot.clarification_sessions.find(
    (session) => session.session_id === dialogue.dialogue.session_id,
  );
  assert.equal(repairedSession?.state, "closed");
  assert.equal(repairedSession?.closed_at, acceptedAt);
  const repairEvents = migrated.db
    .prepare("SELECT type, object_id FROM events WHERE actor_id = ? ORDER BY seq")
    .all("goalboard:migration-12") as Array<{ type: string; object_id: string }>;
  assert.deepEqual(
    repairEvents.map((event) => event.type).sort(),
    ["clarification.closed", "run.abandoned"],
  );
  assert.ok(migrated.db.prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 12").get());
  migrated.close();

  const reopened = new SqliteGoalBoardStore(databasePath);
  const repairEventCount = reopened.db
    .prepare("SELECT COUNT(*) AS count FROM events WHERE actor_id = ?")
    .get("goalboard:migration-12") as { count: number };
  assert.equal(repairEventCount.count, 2);
  reopened.close();
});

test("only satisfied Goals can be archived and restoration preserves completion facts", () => {
  const { store, coordinator, setNow } = fixture();
  createLeaf(coordinator, "archive-target");
  assert.throws(
    () =>
      coordinator.setGoalArchived(
        "board-1",
        { goal_id: "archive-target", archived: true, reason: "整理已完成目标" },
        { actor_id: "user-1", idempotency_key: "archive-unmet" },
      ),
    (error: unknown) => error instanceof GoalBoardV1Error && error.code === "goal.not_satisfied",
  );

  store.db
    .prepare("UPDATE goals SET fulfillment_state = 'satisfied' WHERE goal_id = ?")
    .run("archive-target");
  coordinator.setActiveGoal(
    "board-1",
    { goal_id: "archive-target", reason: "验证归档当前 Goal" },
    { actor_id: "user-1", idempotency_key: "archive-active" },
  );
  setNow("2026-08-15T01:00:00.000Z");
  const archived = coordinator.setGoalArchived(
    "board-1",
    { goal_id: "archive-target", archived: true, reason: "用户手动归档" },
    { actor_id: "user-1", idempotency_key: "archive-target" },
  );
  assert.equal(archived.goal.archived_at, "2026-08-15T01:00:00.000Z");
  assert.equal(archived.goal.archived_by, "user-1");
  assert.equal(archived.goal.fulfillment_state, "satisfied");
  assert.equal(archived.goal.acceptance_criteria.length, 1);
  assert.equal(archived.active_goal_cleared, true);
  assert.equal(store.snapshot("board-1").board.active_goal_id, null);
  assert.equal(
    coordinator.queryReady({ board_id: "board-1", actor_id: "runtime-1" }).ready.some(
      (item) => item.goal.goal_id === "archive-target",
    ),
    false,
  );

  setNow("2026-08-15T02:00:00.000Z");
  const restored = coordinator.setGoalArchived(
    "board-1",
    { goal_id: "archive-target", archived: false, reason: "用户恢复归档" },
    { actor_id: "user-1", idempotency_key: "restore-target" },
  );
  assert.equal(restored.goal.archived_at, null);
  assert.equal(restored.goal.archived_by, null);
  assert.equal(restored.goal.fulfillment_state, "satisfied");
  const archiveEvents = store.db
    .prepare("SELECT type FROM events WHERE object_id = ? AND type IN ('goal.archived', 'goal.restored') ORDER BY seq")
    .all("archive-target") as Array<{ type: string }>;
  assert.deepEqual(archiveEvents.map((event) => event.type), ["goal.archived", "goal.restored"]);
  store.close();
});

test("Goal trash preserves history, deactivates only active relations, and restores the same Goal", () => {
  const { store, coordinator } = fixture();
  createLeaf(coordinator, "trash-target");
  createLeaf(coordinator, "trash-peer");
  createLeaf(coordinator, "trash-inactive-peer");
  const activeRelation = coordinator.addRelation(
    "board-1",
    {
      from_goal_id: "trash-target",
      to_goal_id: "trash-peer",
      type: "extends",
      reason: "目标完成后会扩展关联能力",
    },
    { actor_id: "user-1", idempotency_key: "trash-active-relation" },
  ).relation_id;
  const inactiveRelation = coordinator.addRelation(
    "board-1",
    {
      from_goal_id: "trash-target",
      to_goal_id: "trash-inactive-peer",
      type: "mitigates",
      reason: "历史上曾用于缓解关联风险",
    },
    { actor_id: "user-1", idempotency_key: "trash-inactive-relation" },
  ).relation_id;
  coordinator.deactivateRelation(
    "board-1",
    { relation_id: inactiveRelation, reason: "该缓解关系此前已经不再适用" },
    { actor_id: "user-1", idempotency_key: "trash-inactive-relation-deactivate" },
  );

  const claim = coordinator.claimGoal({
    board_id: "board-1",
    goal_id: "trash-target",
    actor_id: "runtime-trash",
    idempotency_key: "trash-history-claim",
  }).claim;
  assert.ok(claim);
  const run = coordinator.startRun({
    board_id: "board-1",
    claim_id: claim!.claim_id,
    actor_id: "runtime-trash",
    idempotency_key: "trash-history-run",
  }).run;
  const candidate = coordinator.submitCandidate({
    board_id: "board-1",
    actor_id: "runtime-trash",
    discovered_in_run_id: run.run_id,
    proposed_goal: {
      title: "回收站历史候选",
      outcome: "候选记录在删除后仍可追溯",
      why: "回收站不能抹去执行期间发现的新工作",
      business_logic: "候选保持待用户决定，删除原 Goal 不会物理删除它。",
      acceptance_criteria: [
        {
          statement: "候选记录可被读取",
          decision_method: "inspection",
          pass_condition: "snapshot 仍包含 candidate",
        },
      ],
    },
    blocking_mode: "none",
    idempotency_key: "trash-history-candidate",
  }).candidate;
  const evidence = coordinator.submitEvidence({
    board_id: "board-1",
    goal_id: "trash-target",
    actor_id: "runtime-trash",
    run_id: run.run_id,
    criterion_ids: ["trash-target-criterion"],
    kind: "test",
    locator: "test://trash-history",
    result: "passed",
    idempotency_key: "trash-history-evidence",
  }).evidence;
  coordinator.addRisk(
    "board-1",
    {
      risk_id: "trash-history-risk",
      goal_ids: ["trash-target"],
      description: "恢复时可能错误激活已经停用的 Relation",
      probability: "medium",
      impact: "Goal Tree 会重现过时关系",
      trigger: "恢复没有区分删除前状态",
      treatment: "mitigate",
      blocking_mode: "none",
      revisit_condition: "关系 roundtrip 测试通过",
      owner: "user-1",
    },
    { actor_id: "user-1", idempotency_key: "trash-history-risk" },
  );
  coordinator.reportRun({
    board_id: "board-1",
    run_id: run.run_id,
    actor_id: "runtime-trash",
    state: "completed",
    output_refs: ["test://trash-history"],
    idempotency_key: "trash-history-run-completed",
  });
  coordinator.releaseClaim({
    board_id: "board-1",
    claim_id: claim!.claim_id,
    actor_id: "runtime-trash",
    reason: "保留历史后结束执行",
    idempotency_key: "trash-history-release",
  });
  coordinator.setActiveGoal(
    "board-1",
    { goal_id: "trash-target", reason: "验证回收站清除当前 Goal" },
    { actor_id: "user-1", idempotency_key: "trash-history-active-goal" },
  );

  const trashed = coordinator.setGoalTrashed(
    "board-1",
    { goal_id: "trash-target", trashed: true, reason: "用户暂时移入回收站" },
    { actor_id: "user-1", idempotency_key: "trash-target" },
  );
  assert.equal(trashed.status, "trashed");
  assert.equal(trashed.active_goal_cleared, true);
  assert.deepEqual(trashed.deactivated_relation_ids, [activeRelation]);
  assert.equal(trashed.goal.trashed_by, "user-1");
  assert.equal(store.snapshot("board-1").board.active_goal_id, null);
  assert.deepEqual(coordinator.listTrashedGoals("board-1").map((goal) => goal.goal_id), ["trash-target"]);

  const afterTrash = store.snapshot("board-1");
  assert.ok(afterTrash.goals.some((goal) => goal.goal_id === "trash-target" && goal.trashed_at));
  assert.ok(afterTrash.claims.some((item) => item.claim_id === claim!.claim_id));
  assert.ok(afterTrash.runs.some((item) => item.run_id === run.run_id));
  assert.ok(afterTrash.evidence.some((item) => item.evidence_id === evidence.evidence_id));
  assert.ok(afterTrash.candidates.some((item) => item.candidate_id === candidate.candidate_id));
  assert.ok(afterTrash.risks.some((item) => item.risk_id === "trash-history-risk"));
  assert.equal(afterTrash.relations.find((item) => item.relation_id === activeRelation)?.state, "inactive");
  assert.equal(afterTrash.relations.find((item) => item.relation_id === inactiveRelation)?.state, "inactive");
  assert.ok(
    afterTrash.goals.find((goal) => goal.goal_id === "trash-target")?.acceptance_criteria.length,
  );
  assert.equal(
    coordinator.queryAvailable({ board_id: "board-1", actor_id: "runtime-other" }).available.some(
      (item) => item.goal.goal_id === "trash-target",
    ),
    false,
  );
  assert.equal(
    coordinator.queryReady({ board_id: "board-1", actor_id: "runtime-other" }).ready.some(
      (item) => item.goal.goal_id === "trash-target",
    ),
    false,
  );
  const deniedClaim = coordinator.claimGoal({
    board_id: "board-1",
    goal_id: "trash-target",
    actor_id: "runtime-other",
    idempotency_key: "trash-claim-denied",
  });
  assert.equal(deniedClaim.allowed, false);
  assert.ok(deniedClaim.reasons.some((item) => item.code === "goal.trashed"));
  assert.throws(
    () =>
      coordinator.addRelation(
        "board-1",
        {
          from_goal_id: "trash-peer",
          to_goal_id: "trash-target",
          type: "extends",
          reason: "回收站 Goal 不得获得新的 active Relation",
        },
        { actor_id: "user-1", idempotency_key: "trash-new-relation-denied" },
      ),
    (error) => error instanceof GoalBoardV1Error && error.code === "goal.trashed",
  );
  const selfReview = afterTrash.review_obligations.find(
    (item) => item.goal_id === "trash-target" && item.role === "self_verifier",
  );
  assert.ok(selfReview);
  assert.throws(
    () =>
      coordinator.submitReview({
        board_id: "board-1",
        goal_id: "trash-target",
        obligation_id: selfReview!.obligation_id,
        actor_id: "runtime-trash",
        verdict: "pass",
        reasoning: "回收站状态不得继续复核",
        idempotency_key: "trash-review-denied",
      }),
    (error) => error instanceof GoalBoardV1Error && error.code === "goal.trashed",
  );

  const repeatedTrash = coordinator.setGoalTrashed(
    "board-1",
    { goal_id: "trash-target", trashed: true, reason: "重复删除不产生副作用" },
    { actor_id: "user-1", idempotency_key: "trash-target-repeat" },
  );
  assert.equal(repeatedTrash.status, "already_trashed");
  const restored = coordinator.setGoalTrashed(
    "board-1",
    { goal_id: "trash-target", trashed: false, reason: "用户恢复原 Goal" },
    { actor_id: "user-1", idempotency_key: "restore-target" },
  );
  assert.equal(restored.status, "restored");
  assert.deepEqual(restored.restored_relation_ids, [activeRelation]);
  assert.deepEqual(restored.pending_relation_ids, []);
  assert.equal(restored.goal.trashed_at, null);
  const afterRestore = store.snapshot("board-1");
  assert.equal(afterRestore.relations.find((item) => item.relation_id === activeRelation)?.state, "active");
  assert.equal(afterRestore.relations.find((item) => item.relation_id === inactiveRelation)?.state, "inactive");
  assert.equal(coordinator.listTrashedGoals("board-1").length, 0);
  assert.deepEqual(
    store.db
      .prepare("SELECT type FROM events WHERE object_id = ? AND type IN ('goal.trashed', 'goal.restored_from_trash') ORDER BY seq")
      .all("trash-target")
      .map((row: { type: string }) => row.type),
    ["goal.trashed", "goal.restored_from_trash"],
  );
  assert.equal(
    coordinator.setGoalTrashed(
      "board-1",
      { goal_id: "trash-target", trashed: false, reason: "重复恢复不产生副作用" },
      { actor_id: "user-1", idempotency_key: "restore-target-repeat" },
    ).status,
    "already_active",
  );
  store.close();
});

test("Goal trash protects active work and rolls the whole deletion transaction back on relation failure", () => {
  const { store, coordinator } = fixture();
  createLeaf(coordinator, "trash-active-work");
  createLeaf(coordinator, "trash-active-peer");
  const relationId = coordinator.addRelation(
    "board-1",
    {
      from_goal_id: "trash-active-work",
      to_goal_id: "trash-active-peer",
      type: "extends",
      reason: "用于验证删除保护和事务回滚",
    },
    { actor_id: "user-1", idempotency_key: "trash-active-work-relation" },
  ).relation_id;
  const claimed = coordinator.claimGoal({
    board_id: "board-1",
    goal_id: "trash-active-work",
    actor_id: "runtime-active",
    idempotency_key: "trash-active-work-claim",
  }).claim;
  assert.ok(claimed);
  const run = coordinator.startRun({
    board_id: "board-1",
    claim_id: claimed!.claim_id,
    actor_id: "runtime-active",
    idempotency_key: "trash-active-work-run",
  }).run;
  const blocked = coordinator.setGoalTrashed(
    "board-1",
    { goal_id: "trash-active-work", trashed: true, reason: "活动工作不应被删除" },
    { actor_id: "user-1", idempotency_key: "trash-active-work-blocked" },
  );
  assert.equal(blocked.status, "blocked");
  assert.deepEqual(blocked.blocking_claim_ids, [claimed!.claim_id]);
  assert.deepEqual(blocked.blocking_run_ids, [run.run_id]);
  assert.equal(store.getGoal("trash-active-work")?.trashed_at, null);
  assert.equal(store.snapshot("board-1").relations.find((item) => item.relation_id === relationId)?.state, "active");

  coordinator.reportRun({
    board_id: "board-1",
    run_id: run.run_id,
    actor_id: "runtime-active",
    state: "failed",
    block_reason: "结束活动工作后才允许删除",
    idempotency_key: "trash-active-work-failed",
  });
  store.db.exec(`
    CREATE TRIGGER trash_relation_failure
    BEFORE UPDATE OF state ON goal_relations
    WHEN NEW.relation_id = '${relationId}' AND NEW.state = 'inactive'
    BEGIN SELECT RAISE(ABORT, 'injected trash relation failure'); END;
  `);
  assert.throws(
    () =>
      coordinator.setGoalTrashed(
        "board-1",
        { goal_id: "trash-active-work", trashed: true, reason: "注入失败应回滚全部修改" },
        { actor_id: "user-1", idempotency_key: "trash-active-work-rollback" },
      ),
    /injected trash relation failure/,
  );
  assert.equal(store.getGoal("trash-active-work")?.trashed_at, null);
  assert.equal(store.snapshot("board-1").relations.find((item) => item.relation_id === relationId)?.state, "active");
  assert.equal(
    store.db.prepare("SELECT COUNT(*) AS count FROM goal_trash_records WHERE goal_id = ?").get("trash-active-work").count,
    0,
  );
  store.db.exec("DROP TRIGGER trash_relation_failure");
  assert.equal(
    coordinator.setGoalTrashed(
      "board-1",
      { goal_id: "trash-active-work", trashed: true, reason: "活动工作结束后可以删除" },
      { actor_id: "user-1", idempotency_key: "trash-active-work-success" },
    ).status,
    "trashed",
  );
  store.close();
});

test("a Relation waits safely until both independently trashed endpoints are restored", () => {
  const { store, coordinator } = fixture();
  createLeaf(coordinator, "trash-left");
  createLeaf(coordinator, "trash-right");
  const relationId = coordinator.addRelation(
    "board-1",
    {
      from_goal_id: "trash-left",
      to_goal_id: "trash-right",
      type: "extends",
      reason: "两个 Goal 恢复后才应恢复关系",
    },
    { actor_id: "user-1", idempotency_key: "trash-two-endpoints-relation" },
  ).relation_id;
  coordinator.setGoalTrashed(
    "board-1",
    { goal_id: "trash-left", trashed: true, reason: "先删除左侧 Goal" },
    { actor_id: "user-1", idempotency_key: "trash-left" },
  );
  coordinator.setGoalTrashed(
    "board-1",
    { goal_id: "trash-right", trashed: true, reason: "再删除右侧 Goal" },
    { actor_id: "user-1", idempotency_key: "trash-right" },
  );
  const leftRestored = coordinator.setGoalTrashed(
    "board-1",
    { goal_id: "trash-left", trashed: false, reason: "右侧仍在回收站，关系保持停用" },
    { actor_id: "user-1", idempotency_key: "restore-left" },
  );
  assert.deepEqual(leftRestored.restored_relation_ids, []);
  assert.deepEqual(leftRestored.pending_relation_ids, [relationId]);
  assert.equal(store.snapshot("board-1").relations.find((item) => item.relation_id === relationId)?.state, "inactive");
  const rightRestored = coordinator.setGoalTrashed(
    "board-1",
    { goal_id: "trash-right", trashed: false, reason: "两端都恢复后才恢复关系" },
    { actor_id: "user-1", idempotency_key: "restore-right" },
  );
  assert.deepEqual(rightRestored.restored_relation_ids, [relationId]);
  assert.equal(store.snapshot("board-1").relations.find((item) => item.relation_id === relationId)?.state, "active");
  store.close();
});

test("a user can update one Draft Contract while accepted Contracts stay immutable", () => {
  const { store, coordinator } = fixture();
  coordinator.createGoal(
    "board-1",
    {
      goal_id: "editable-draft",
      title: "先记录一个方向",
      outcome: "",
      why: "",
      business_logic: "",
      definition_state: "draft",
      decomposition_state: "abstract",
      acceptance_criteria: [],
    },
    { actor_id: "user-1", idempotency_key: "editable-draft-create" },
  );

  const updated = coordinator.updateDraftGoal(
    "board-1",
    "editable-draft",
    {
      title: "形成一组可独立交付的子 Goal",
      outcome: "父 Goal 的拆分边界和验收都可被用户确认",
      why: "避免把多个能分别失败的结果塞进一个执行单元",
      business_logic: "复合 Goal 组织最小闭环子 Goal，本身不作为一个大任务执行。",
      in_scope: ["  拆分状态  ", "结构化验收", "结构化验收"],
      out_of_scope: ["自动接受 Runtime 提案"],
      constraints: ["accepted Contract 不原地修改"],
      required_inputs: ["用户确认的业务边界"],
      promised_outputs: ["可观察的拆分结果"],
      definition_state: "draft",
      decomposition_state: "closed_compound",
      priority: 68,
      acceptance_criteria: [
        {
          criterion_id: "draft-structured-criterion",
          statement: "拆分结果可以独立验收",
          decision_method: "measurement",
          pass_condition: "所有子 Goal 都有独立通过条件",
          target: { value: "100%" },
          required_evidence: [" test ", "inspection", "test"],
        },
      ],
    },
    {
      actor_id: "user-1",
      idempotency_key: "editable-draft-update",
      reason: "补充用户确认的 Goal 粒度和验收方式",
    },
  );
  assert.equal(updated.goal.definition_state, "draft");
  assert.equal(updated.goal.decomposition_state, "closed_compound");
  assert.equal(updated.goal.priority, 68);
  assert.deepEqual(updated.goal.in_scope, ["拆分状态", "结构化验收"]);
  assert.deepEqual(updated.goal.acceptance_criteria[0], {
    criterion_id: "draft-structured-criterion",
    goal_id: "editable-draft",
    statement: "拆分结果可以独立验收",
    decision_method: "measurement",
    pass_condition: "所有子 Goal 都有独立通过条件",
    target: { value: "100%" },
    required_evidence: ["test", "inspection"],
  });
  const event = store.db
    .prepare("SELECT reason, payload_json FROM events WHERE object_id = ? AND type = 'goal.draft_updated'")
    .get("editable-draft") as { reason: string; payload_json: string };
  assert.equal(event.reason, "补充用户确认的 Goal 粒度和验收方式");
  assert.equal(JSON.parse(event.payload_json).acceptance_criterion_count, 1);

  createLeaf(coordinator, "accepted-contract");
  assert.throws(
    () =>
      coordinator.updateDraftGoal(
        "board-1",
        "accepted-contract",
        {
          title: "尝试原地修改 accepted Goal",
          outcome: "不应写入",
          why: "验证边界",
          business_logic: "accepted Contract 需要新 Goal 和 Rewire。",
          definition_state: "draft",
          decomposition_state: "closed_leaf",
          acceptance_criteria: [
            {
              statement: "不应写入",
              decision_method: "inspection",
              pass_condition: "接口拒绝修改",
            },
          ],
        },
        {
          actor_id: "user-1",
          idempotency_key: "accepted-contract-update",
          reason: "验证不可变边界",
        },
      ),
    (error: unknown) =>
      error instanceof GoalBoardV1Error && error.code === "goal.accepted_contract_immutable",
  );
  store.close();
});

test("policy edits replace the same scope while Goal rules only strengthen project defaults", () => {
  const { store, coordinator } = fixture();
  createLeaf(coordinator, "policy-target");
  const firstProject = coordinator.setPolicy(
    "board-1",
    {
      policy: {
        goal_mode: "disabled",
        required_capabilities: [],
        self_verification: false,
        cross_reviewers: 0,
        adversarial_reviewers: 0,
        human_approval: false,
        max_lease_seconds: 3600,
      },
      reason: "项目默认暂不要求 Goal Mode",
    },
    { actor_id: "user-1", idempotency_key: "project-policy-off" },
  );
  assert.equal(
    coordinator.readGoalContract("board-1", "policy-target").resolved_policy.goal_mode,
    "disabled",
  );
  assert.equal(
    coordinator.readGoalContract("board-1", "policy-target").resolved_policy.self_verification,
    false,
  );

  const firstGoal = coordinator.setPolicy(
    "board-1",
    {
      goal_id: "policy-target",
      policy: {
        goal_mode: "preferred",
        required_capabilities: ["browser"],
        self_verification: true,
        cross_reviewers: 1,
        adversarial_reviewers: 0,
        human_approval: false,
        max_lease_seconds: 2400,
      },
      reason: "当前 Goal 需要浏览器能力和交叉验证",
    },
    { actor_id: "user-1", idempotency_key: "goal-policy-first" },
  );
  const strengthened = coordinator.readGoalContract("board-1", "policy-target").resolved_policy;
  assert.equal(strengthened.goal_mode, "preferred");
  assert.deepEqual(strengthened.required_capabilities, ["browser"]);
  assert.equal(strengthened.cross_reviewers, 1);
  assert.equal(strengthened.max_lease_seconds, 2400);

  const secondProject = coordinator.setPolicy(
    "board-1",
    {
      policy: {
        goal_mode: "required",
        required_capabilities: ["typescript"],
        self_verification: true,
        cross_reviewers: 0,
        adversarial_reviewers: 0,
        human_approval: true,
        max_lease_seconds: 1800,
      },
      reason: "提高项目默认门槛",
    },
    { actor_id: "user-1", idempotency_key: "project-policy-required" },
  );
  const secondGoal = coordinator.setPolicy(
    "board-1",
    {
      goal_id: "policy-target",
      policy: {
        goal_mode: "disabled",
        required_capabilities: [],
        self_verification: false,
        cross_reviewers: 0,
        adversarial_reviewers: 0,
        human_approval: false,
        max_lease_seconds: 7200,
      },
      reason: "尝试降低当前 Goal 门槛",
    },
    { actor_id: "user-1", idempotency_key: "goal-policy-second" },
  );
  const resolved = coordinator.readGoalContract("board-1", "policy-target").resolved_policy;
  assert.equal(resolved.goal_mode, "required");
  assert.equal(resolved.self_verification, true);
  assert.equal(resolved.human_approval, true);
  assert.deepEqual(resolved.required_capabilities, ["typescript"]);
  assert.equal(resolved.max_lease_seconds, 1800);

  const bindingStates = store.db
    .prepare(
      "SELECT policy_binding_id, state FROM policy_bindings WHERE policy_binding_id IN (?, ?, ?, ?) ORDER BY policy_binding_id",
    )
    .all(
      firstProject.policy_binding_id,
      firstGoal.policy_binding_id,
      secondProject.policy_binding_id,
      secondGoal.policy_binding_id,
    ) as Array<{ policy_binding_id: string; state: string }>;
  assert.equal(bindingStates.filter((binding) => binding.state === "active").length, 2);
  assert.equal(bindingStates.filter((binding) => binding.state === "replaced").length, 2);
  store.close();
});

test("user relation maintenance keeps direction, reason, history, and idempotency", () => {
  const { store, coordinator } = fixture();
  createLeaf(coordinator, "relation-source");
  createLeaf(coordinator, "relation-target");

  const added = coordinator.addRelation(
    "board-1",
    {
      from_goal_id: "relation-source",
      to_goal_id: "relation-target",
      type: "extends",
      reason: "source 在 target 的已交付结果上继续扩展",
    },
    { actor_id: "user-1", idempotency_key: "relation-maintenance-add" },
  );
  assert.throws(
    () =>
      coordinator.addRelation(
        "board-1",
        {
          from_goal_id: "relation-source",
          to_goal_id: "relation-target",
          type: "extends",
          reason: "不能重复添加同一条生效关系",
        },
        { actor_id: "user-1", idempotency_key: "relation-maintenance-duplicate" },
      ),
    (error: unknown) =>
      error instanceof GoalBoardV1Error && error.code === "relation.already_exists",
  );

  const deactivated = coordinator.deactivateRelation(
    "board-1",
    {
      relation_id: added.relation_id,
      reason: "扩展结果已经并入新的独立 Goal",
    },
    { actor_id: "user-1", idempotency_key: "relation-maintenance-deactivate" },
  );
  assert.equal(deactivated.relation.from_goal_id, "relation-source");
  assert.equal(deactivated.relation.to_goal_id, "relation-target");
  assert.equal(deactivated.relation.type, "extends");
  assert.equal(deactivated.relation.state, "inactive");
  assert.ok(deactivated.relation.deactivated_at);

  const replay = coordinator.deactivateRelation(
    "board-1",
    {
      relation_id: added.relation_id,
      reason: "扩展结果已经并入新的独立 Goal",
    },
    { actor_id: "user-1", idempotency_key: "relation-maintenance-deactivate" },
  );
  assert.equal(replay.replayed, true);
  assert.throws(
    () =>
      coordinator.deactivateRelation(
        "board-1",
        { relation_id: added.relation_id, reason: "再次解除" },
        { actor_id: "user-1", idempotency_key: "relation-maintenance-deactivate-again" },
      ),
    (error: unknown) =>
      error instanceof GoalBoardV1Error && error.code === "relation.not_active",
  );
  const event = store.db
    .prepare("SELECT reason FROM events WHERE type = 'relation.deactivated' AND object_id = ?")
    .get(added.relation_id) as { reason: string } | undefined;
  assert.equal(event?.reason, "扩展结果已经并入新的独立 Goal");
  store.close();
});

test("ready query explains dependency and Goal Mode blockers in plain language", () => {
  const { store, coordinator } = fixture();
  createLeaf(coordinator, "foundation");
  createLeaf(coordinator, "feature", 10);
  coordinator.addRelation(
    "board-1",
    {
      from_goal_id: "feature",
      to_goal_id: "foundation",
      type: "depends_on",
      reason: "功能必须建立在基础能力之上",
    },
    { actor_id: "user-1", idempotency_key: "dependency-1" },
  );
  coordinator.setPolicy(
    "board-1",
    { goal_id: "foundation", policy: { goal_mode: "required" }, reason: "执行时保持目标约束" },
    { actor_id: "user-1", idempotency_key: "policy-1" },
  );

  const blocked = coordinator.explainGoal({
    board_id: "board-1",
    goal_id: "feature",
    actor_id: "runtime-a",
  });
  assert.equal(blocked.ready, false);
  assert.ok(blocked.reasons.some((item) => item.code === "dependency.unsatisfied"));
  assert.match(blocked.reasons[0]?.message ?? "", /前置 Goal/);

  const foundation = coordinator.explainGoal({
    board_id: "board-1",
    goal_id: "foundation",
    actor_id: "runtime-a",
  });
  assert.ok(foundation.reasons.some((item) => item.code === "policy.goal_mode_required"));
  assert.equal(
    coordinator.queryReady({ board_id: "board-1", actor_id: "runtime-a" }).ready.length,
    0,
  );
  assert.deepEqual(
    coordinator
      .queryReady({
        board_id: "board-1",
        actor_id: "runtime-a",
        goal_mode_attestation: true,
      })
      .ready.map((item) => item.goal.goal_id),
    ["foundation"],
  );
  store.close();
});

test("claim is atomic, idempotent, and expired leases stop blocking", () => {
  const { store, coordinator, setNow } = fixture();
  createLeaf(coordinator, "goal-a");

  const first = coordinator.claimGoal({
    board_id: "board-1",
    goal_id: "goal-a",
    actor_id: "runtime-a",
    lease_seconds: 60,
    idempotency_key: "claim-a",
  });
  assert.equal(first.allowed, true);
  assert.ok(first.claim);

  const replay = coordinator.claimGoal({
    board_id: "board-1",
    goal_id: "goal-a",
    actor_id: "runtime-a",
    lease_seconds: 60,
    idempotency_key: "claim-a",
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.claim?.claim_id, first.claim?.claim_id);

  const denied = coordinator.claimGoal({
    board_id: "board-1",
    goal_id: "goal-a",
    actor_id: "runtime-b",
    idempotency_key: "claim-b-blocked",
  });
  assert.equal(denied.allowed, false);
  assert.ok(denied.reasons.some((item) => item.code === "claim.already_active"));
  assert.deepEqual(
    store.db.prepare("SELECT COUNT(*) AS count FROM claims").get(),
    { count: 1 },
  );

  setNow("2026-08-15T00:02:00.000Z");
  const afterExpiry = coordinator.claimGoal({
    board_id: "board-1",
    goal_id: "goal-a",
    actor_id: "runtime-b",
    idempotency_key: "claim-b-after-expiry",
  });
  assert.equal(afterExpiry.allowed, true);
  assert.equal(afterExpiry.claim?.actor_id, "runtime-b");
  const states = store.db
    .prepare("SELECT actor_id, state FROM claims ORDER BY actor_id")
    .all() as Array<{ actor_id: string; state: string }>;
  assert.deepEqual(states, [
    { actor_id: "runtime-a", state: "expired" },
    { actor_id: "runtime-b", state: "active" },
  ]);
  store.close();
});

test("confirmed impact bindings prevent two active writers", () => {
  const { store, coordinator } = fixture();
  createLeaf(coordinator, "writer-a");
  createLeaf(coordinator, "writer-b");
  for (const goalId of ["writer-a", "writer-b"]) {
    coordinator.addImpact(
      "board-1",
      {
        goal_id: goalId,
        surface: "src/domain/user.ts",
        access: "write",
        reason: "会修改用户领域模块",
      },
      { actor_id: "user-1", idempotency_key: `impact-${goalId}` },
    );
  }
  assert.equal(
    coordinator.claimGoal({
      board_id: "board-1",
      goal_id: "writer-a",
      actor_id: "runtime-a",
      idempotency_key: "claim-writer-a",
    }).allowed,
    true,
  );
  const second = coordinator.claimGoal({
    board_id: "board-1",
    goal_id: "writer-b",
    actor_id: "runtime-b",
    idempotency_key: "claim-writer-b",
  });
  assert.equal(second.allowed, false);
  assert.ok(second.reasons.some((item) => item.code === "impact.write_write_conflict"));
  store.close();
});

test("Impact bindings can be updated and deactivated without erasing their history", () => {
  const { store, coordinator, setNow } = fixture();
  createLeaf(coordinator, "impact-maintenance");
  createLeaf(coordinator, "impact-maintenance-target");
  const created = coordinator.addImpact(
    "board-1",
    {
      goal_id: "impact-maintenance",
      surface: "src/web",
      access: "read",
      input_snapshot: "commit://one",
      state: "proposed",
      reason: "先记录可能读取的区域",
    },
    { actor_id: "user-1", idempotency_key: "impact-maintenance-add" },
  );
  assert.equal(created.impact.state, "proposed");
  assert.equal(created.impact.updated_at, created.impact.created_at);

  setNow("2026-08-15T01:00:00.000Z");
  const updateInput = {
    binding_id: created.binding_id,
    goal_id: "impact-maintenance",
    surface: "src/web/render.ts",
    access: "write" as const,
    input_snapshot: "contract://impact-maintenance",
    state: "confirmed" as const,
    reason: "实现会写入 Goal 文档渲染区域",
  };
  const updated = coordinator.updateImpact(
    "board-1",
    updateInput,
    {
      actor_id: "user-1",
      idempotency_key: "impact-maintenance-update",
      reason: "确认实际修改范围和访问方式",
    },
  );
  assert.equal(updated.impact.surface, "src/web/render.ts");
  assert.equal(updated.impact.access, "write");
  assert.equal(updated.impact.state, "confirmed");
  assert.equal(updated.impact.updated_at, "2026-08-15T01:00:00.000Z");
  assert.equal(
    coordinator.updateImpact(
      "board-1",
      updateInput,
      {
        actor_id: "user-1",
        idempotency_key: "impact-maintenance-update",
        reason: "确认实际修改范围和访问方式",
      },
    ).replayed,
    true,
  );
  assert.throws(
    () => coordinator.updateImpact(
      "board-1",
      updateInput,
      { actor_id: "user-1", idempotency_key: "impact-maintenance-no-audit", reason: "" },
    ),
    /必须说明修改原因/,
  );
  assert.throws(
    () => coordinator.updateImpact(
      "board-1",
      { ...updateInput, goal_id: "impact-maintenance-target" },
      {
        actor_id: "user-1",
        idempotency_key: "impact-maintenance-move-goal",
        reason: "尝试把绑定迁移到另一个 Goal",
      },
    ),
    /归属 Goal 不能通过更新迁移/,
  );

  setNow("2026-08-15T02:00:00.000Z");
  const deactivated = coordinator.deactivateImpact(
    "board-1",
    { binding_id: created.binding_id, reason: "该渲染区域已由新的 Goal 接管" },
    { actor_id: "user-1", idempotency_key: "impact-maintenance-deactivate" },
  );
  assert.equal(deactivated.impact.state, "inactive");
  assert.equal(deactivated.impact.deactivated_at, "2026-08-15T02:00:00.000Z");
  assert.equal(deactivated.impact.deactivation_reason, "该渲染区域已由新的 Goal 接管");
  assert.equal(deactivated.impact.reason, "实现会写入 Goal 文档渲染区域");
  assert.ok(store.snapshot("board-1").impacts.some((item) => item.binding_id === created.binding_id));
  assert.throws(
    () => coordinator.updateImpact(
      "board-1",
      updateInput,
      {
        actor_id: "user-1",
        idempotency_key: "impact-maintenance-edit-inactive",
        reason: "尝试修改历史",
      },
    ),
    /不能原地修改/,
  );
  assert.ok(store.db.prepare("SELECT 1 FROM events WHERE object_id = ? AND type = 'impact.updated'").get(created.binding_id));
  assert.ok(store.db.prepare("SELECT 1 FROM events WHERE object_id = ? AND type = 'impact.deactivated'").get(created.binding_id));
  store.close();
});

test("reusing an idempotency key with another request is rejected", () => {
  const { store, coordinator } = fixture();
  createLeaf(coordinator, "goal-a");
  coordinator.claimGoal({
    board_id: "board-1",
    goal_id: "goal-a",
    actor_id: "runtime-a",
    lease_seconds: 60,
    idempotency_key: "same-key",
  });
  assert.throws(
    () =>
      coordinator.claimGoal({
        board_id: "board-1",
        goal_id: "goal-a",
        actor_id: "runtime-a",
        lease_seconds: 30,
        idempotency_key: "same-key",
      }),
    (error) => error instanceof GoalBoardV1Error && error.code === "request.idempotency_key_reused",
  );
  store.close();
});

test("Run, Evidence, independent Review, and completion form one enforceable loop", () => {
  const { store, coordinator } = fixture();
  createLeaf(coordinator, "delivery");
  coordinator.setPolicy(
    "board-1",
    { goal_id: "delivery", policy: { cross_reviewers: 1 }, reason: "交付结果需要另一人复核" },
    { actor_id: "user-1", idempotency_key: "delivery-review-policy" },
  );
  const claim = coordinator.claimGoal({
    board_id: "board-1",
    goal_id: "delivery",
    actor_id: "runtime-a",
    idempotency_key: "delivery-claim",
  }).claim;
  assert.ok(claim);
  const run = coordinator.startRun({
    board_id: "board-1",
    claim_id: claim.claim_id,
    actor_id: "runtime-a",
    idempotency_key: "delivery-run",
  }).run;
  coordinator.reportRun({
    board_id: "board-1",
    run_id: run.run_id,
    actor_id: "runtime-a",
    state: "completed",
    output_refs: ["artifact://delivery"],
    idempotency_key: "delivery-run-complete",
  });

  const tooEarly = coordinator.evaluateLeafCompletion({
    board_id: "board-1",
    goal_id: "delivery",
    actor_id: "runtime-a",
    idempotency_key: "delivery-completion-too-early",
  });
  assert.equal(tooEarly.satisfied, false);
  assert.ok(tooEarly.reasons.some((item) => item.code === "evidence.criterion_uncovered"));
  assert.equal(tooEarly.reasons.filter((item) => item.code === "policy.review_pending").length, 2);

  const evidence = coordinator.submitEvidence({
    board_id: "board-1",
    goal_id: "delivery",
    actor_id: "runtime-a",
    run_id: run.run_id,
    criterion_ids: ["delivery-criterion"],
    kind: "test",
    locator: "command://pnpm-test",
    result: "passed",
    idempotency_key: "delivery-evidence",
  }).evidence;
  const obligations = store.snapshot("board-1").review_obligations;
  const selfReview = obligations.find((item) => item.role === "self_verifier");
  const crossReview = obligations.find((item) => item.role === "cross_reviewer");
  assert.ok(selfReview && crossReview);
  coordinator.submitReview({
    board_id: "board-1",
    goal_id: "delivery",
    obligation_id: selfReview.obligation_id,
    actor_id: "runtime-a",
    verdict: "pass",
    evidence_refs: [evidence.evidence_id],
    reasoning: "验收命令通过，产物位置可访问",
    idempotency_key: "delivery-self-review",
  });
  assert.throws(
    () =>
      coordinator.submitReview({
        board_id: "board-1",
        goal_id: "delivery",
        obligation_id: crossReview.obligation_id,
        actor_id: "runtime-a",
        verdict: "pass",
        evidence_refs: [evidence.evidence_id],
        reasoning: "尝试复核自己的结果",
        idempotency_key: "delivery-invalid-cross-review",
      }),
    (error) => error instanceof GoalBoardV1Error && error.code === "review.independence_failed",
  );
  coordinator.submitReview({
    board_id: "board-1",
    goal_id: "delivery",
    obligation_id: crossReview.obligation_id,
    actor_id: "reviewer-b",
    verdict: "pass",
    evidence_refs: [evidence.evidence_id],
    reasoning: "独立复核运行结果和证据，条件满足",
    idempotency_key: "delivery-cross-review",
  });
  const completion = coordinator.evaluateLeafCompletion({
    board_id: "board-1",
    goal_id: "delivery",
    actor_id: "runtime-a",
    idempotency_key: "delivery-completion",
  });
  assert.equal(completion.satisfied, true);
  assert.equal(store.getGoal("delivery")?.fulfillment_state, "satisfied");
  assert.equal(coordinator.queryReady({ board_id: "board-1", actor_id: "runtime-c" }).ready.length, 0);
  store.close();
});

test("Runtime can submit a Candidate Goal but only a user can decide it", () => {
  const { store, coordinator } = fixture();
  createLeaf(coordinator, "current-goal");
  const claim = coordinator.claimGoal({
    board_id: "board-1",
    goal_id: "current-goal",
    actor_id: "runtime-a",
    idempotency_key: "candidate-claim",
  }).claim;
  assert.ok(claim);
  const run = coordinator.startRun({
    board_id: "board-1",
    claim_id: claim.claim_id,
    actor_id: "runtime-a",
    idempotency_key: "candidate-run",
  }).run;
  const candidate = coordinator.submitCandidate({
    board_id: "board-1",
    actor_id: "runtime-a",
    discovered_in_run_id: run.run_id,
    proposed_goal: {
      title: "补充数据清理",
      outcome: "历史数据符合新的字段约束",
      why: "当前实现发现旧数据会导致验收不稳定",
      business_logic: "在不扩大当前 Goal 的前提下，另建工作清理旧数据并单独验收。",
      acceptance_criteria: [
        {
          statement: "旧数据全部通过约束检查",
          decision_method: "automated_check",
          pass_condition: "数据检查命令返回 0 条违规记录",
        },
      ],
    },
    blocking_mode: "current_run",
    idempotency_key: "candidate-submit",
  }).candidate;
  assert.equal(candidate.state, "pending");
  assert.throws(
    () =>
      coordinator.decideCandidate({
        board_id: "board-1",
        candidate_id: candidate.candidate_id,
        actor_id: "runtime-a",
        actor_kind: "runtime",
        decision: "approved",
        reason: "Runtime 自己批准",
        idempotency_key: "candidate-runtime-decision",
      }),
    (error) =>
      error instanceof GoalBoardV1Error && error.code === "candidate.user_decision_required",
  );
  const decided = coordinator.decideCandidate({
    board_id: "board-1",
    candidate_id: candidate.candidate_id,
    actor_id: "user-1",
    actor_kind: "user",
    decision: "rejected",
    reason: "当前产品不需要迁移历史数据",
    idempotency_key: "candidate-user-decision",
  }).candidate;
  assert.equal(decided.state, "rejected");
  store.close();
});

test("clarifier completes the same Draft only through a user-approved Contract Proposal", () => {
  const { store, coordinator } = fixture();
  const draft = coordinator.createGoal(
    "board-1",
    {
      goal_id: "rough-draft",
      title: "改善新用户第一次使用",
      outcome: "",
      why: "",
      business_logic: "",
      definition_state: "draft",
      decomposition_state: "abstract",
      priority: 20,
      acceptance_criteria: [],
    },
    { actor_id: "user-1", idempotency_key: "create-minimal-draft" },
  ).goal;
  createLeaf(coordinator, "existing-provider");
  assert.equal(draft.outcome, "");
  assert.ok(
    coordinator
      .explainGoal({
        board_id: "board-1",
        goal_id: "rough-draft",
        actor_id: "runtime-executor",
        role: "executor",
      })
      .reasons.some((reason) => reason.code === "goal.not_accepted"),
  );
  assert.ok(
    coordinator
      .queryReady({ board_id: "board-1", actor_id: "runtime-clarifier", role: "clarifier" })
      .ready.some((item) => item.goal.goal_id === "rough-draft"),
  );
  const claim = coordinator.claimGoal({
    board_id: "board-1",
    goal_id: "rough-draft",
    actor_id: "runtime-clarifier",
    role: "clarifier",
    idempotency_key: "draft-clarifier-claim",
  }).claim;
  assert.ok(claim);
  const run = coordinator.startRun({
    board_id: "board-1",
    claim_id: claim.claim_id,
    actor_id: "runtime-clarifier",
    idempotency_key: "draft-clarifier-run",
  }).run;
  const proposedGoal = {
    goal_id: "rough-draft",
    title: "让新用户完成第一次 Goal 领取",
    outcome: "新用户可以从创建 Draft 到 Runtime 领取一个可执行 Goal",
    why: "第一次使用必须看懂 Goal 如何从想法变成可执行工作",
    business_logic: "用户先记录想法，澄清者补齐边界和验收；只有用户确认后，Runtime 才能领取并执行同一个 Goal。",
    in_scope: ["Draft 创建", "Contract 确认", "第一次领取"],
    out_of_scope: ["自动启动 Runtime"],
    constraints: [],
    required_inputs: [],
    promised_outputs: ["accepted Goal"],
    definition_state: "accepted" as const,
    decomposition_state: "closed_leaf" as const,
    priority: 72,
    acceptance_criteria: [
      {
        criterion_id: "rough-draft-first-claim",
        statement: "确认后同一个 Goal 可以被 executor 查询到",
        decision_method: "automated_check" as const,
        pass_condition: "executor Ready Set 包含 rough-draft",
        required_evidence: ["test"],
      },
    ],
  };
  const reviewPolicy = {
    goal_mode: "required" as const,
    required_capabilities: [],
    self_verification: true,
    cross_reviewers: 0,
    adversarial_reviewers: 0,
    human_approval: false,
    max_lease_seconds: 1200,
  };
  assert.throws(
    () =>
      coordinator.submitContractProposal({
        board_id: "board-1",
        goal_id: "rough-draft",
        actor_id: "runtime-clarifier",
        discovered_in_run_id: run.run_id,
        proposed_goal: proposedGoal,
        field_sources: [],
        review_policy: reviewPolicy,
        idempotency_key: "incomplete-contract-proposal",
      }),
    (error) =>
      error instanceof GoalBoardV1Error && error.code === "contract_proposal.source_missing",
  );
  assert.equal(store.snapshot("board-1").contract_proposals.length, 0);

  const firstProposal = coordinator.submitContractProposal({
    board_id: "board-1",
    goal_id: "rough-draft",
    actor_id: "runtime-clarifier",
    discovered_in_run_id: run.run_id,
    proposed_goal: proposedGoal,
    field_sources: contractFieldSources(run.run_id) as never,
    review_policy: reviewPolicy,
    proposed_impacts: [
      { surface: "src/onboarding", access: "write", reason: "实现第一次使用闭环" },
    ],
    proposed_risks: [
      {
        risk_id: "risk-first-use-copy",
        description: "用户仍可能看不懂 Contract 术语",
        probability: "medium",
        impact: "无法完成第一次领取",
        affected_surfaces: ["Goal detail"],
        trigger: "测试用户无法说明下一步",
        treatment: "mitigate",
        blocking_mode: "none",
        revisit_condition: "完成一次可用性检查",
        owner: "product-user",
      },
    ],
    idempotency_key: "complete-contract-proposal",
  }).proposal;
  assert.equal(firstProposal.state, "pending");
  assert.deepEqual(store.getGoal("rough-draft"), draft);
  assert.equal(store.snapshot("board-1").impacts.length, 0);
  assert.equal(store.snapshot("board-1").risks.length, 0);
  assert.throws(
    () =>
      coordinator.decideContractProposal({
        board_id: "board-1",
        proposal_id: firstProposal.proposal_id,
        actor_id: "runtime-clarifier",
        actor_kind: "runtime",
        decision: "approved",
        reason: "Runtime 不能批准自己的提案",
        idempotency_key: "runtime-contract-decision",
      }),
    (error) =>
      error instanceof GoalBoardV1Error &&
      error.code === "contract_proposal.user_decision_required",
  );
  const rejected = coordinator.decideContractProposal({
    board_id: "board-1",
    proposal_id: firstProposal.proposal_id,
    actor_id: "user-1",
    actor_kind: "user",
    decision: "rejected",
    reason: "业务逻辑还需要明确用户确认步骤",
    idempotency_key: "reject-contract-proposal",
  });
  assert.equal(rejected.proposal.state, "rejected");
  assert.deepEqual(rejected.goal, draft);

  const dependency = coordinator.submitDependencyProposal({
    board_id: "board-1",
    actor_id: "runtime-clarifier",
    discovered_in_run_id: run.run_id,
    dependencies: [
      dependencyProposal(
        "rough-draft",
        "existing-provider",
        "第一次领取可能需要既有身份能力",
      ),
    ],
    idempotency_key: "draft-contract-dependency",
  }).rewire;
  const secondProposal = coordinator.submitContractProposal({
    board_id: "board-1",
    goal_id: "rough-draft",
    actor_id: "runtime-clarifier",
    discovered_in_run_id: run.run_id,
    proposed_goal: proposedGoal,
    field_sources: contractFieldSources(run.run_id) as never,
    review_policy: reviewPolicy,
    proposed_impacts: [
      { surface: "src/onboarding", access: "write", reason: "实现第一次使用闭环" },
    ],
    proposed_risks: [
      {
        risk_id: "risk-first-use-copy",
        description: "用户仍可能看不懂 Contract 术语",
        probability: "medium",
        impact: "无法完成第一次领取",
        affected_surfaces: ["Goal detail"],
        trigger: "测试用户无法说明下一步",
        treatment: "mitigate",
        blocking_mode: "none",
        revisit_condition: "完成一次可用性检查",
        owner: "product-user",
      },
    ],
    dependency_rewire_ids: [dependency.rewire_id],
    idempotency_key: "revised-contract-proposal",
  }).proposal;
  assert.throws(
    () =>
      coordinator.decideContractProposal({
        board_id: "board-1",
        proposal_id: secondProposal.proposal_id,
        actor_id: "user-1",
        actor_kind: "user",
        decision: "approved",
        reason: "接受完整 Contract",
        idempotency_key: "approve-before-dependency-decision",
      }),
    (error) =>
      error instanceof GoalBoardV1Error && error.code === "contract_proposal.dependency_pending",
  );
  assert.equal(store.getGoal("rough-draft")?.definition_state, "draft");
  coordinator.confirmRewire({
    board_id: "board-1",
    rewire_id: dependency.rewire_id,
    actor_id: "user-1",
    actor_kind: "user",
    decision: "rejected",
    reason: "当前 Draft 不需要这项上游依赖",
    idempotency_key: "reject-draft-dependency",
  });
  const approved = coordinator.decideContractProposal({
    board_id: "board-1",
    proposal_id: secondProposal.proposal_id,
    actor_id: "user-1",
    actor_kind: "user",
    decision: "approved",
    reason: "字段来源、验收和 Review policy 已确认",
    idempotency_key: "approve-draft-contract",
  });
  assert.equal(approved.proposal.state, "approved");
  assert.equal(approved.goal.goal_id, "rough-draft");
  assert.equal(approved.goal.definition_state, "accepted");
  assert.equal(approved.goal.decomposition_state, "closed_leaf");
  assert.equal(approved.goal.outcome, proposedGoal.outcome);
  assert.equal(approved.goal.acceptance_criteria[0]?.criterion_id, "rough-draft-first-claim");
  const after = coordinator.readGoalContract("board-1", "rough-draft");
  const approvedProposal = after.contract_proposals.find(
    (proposal) => proposal.proposal_id === secondProposal.proposal_id,
  );
  assert.equal(approvedProposal?.state, "approved");
  assert.equal(approvedProposal?.field_sources[0]?.status, "proposed");
  assert.equal(after.resolved_policy.goal_mode, "required");
  assert.equal(after.resolved_policy.max_lease_seconds, 1200);
  assert.equal(after.impacts[0]?.surface, "src/onboarding");
  assert.equal(after.impacts[0]?.state, "confirmed");
  assert.equal(after.risks[0]?.risk_id, "risk-first-use-copy");
  coordinator.reportRun({
    board_id: "board-1",
    run_id: run.run_id,
    actor_id: "runtime-clarifier",
    state: "completed",
    output_refs: [secondProposal.proposal_id],
    idempotency_key: "draft-clarifier-complete",
  });
  coordinator.releaseClaim({
    board_id: "board-1",
    claim_id: claim.claim_id,
    actor_id: "runtime-clarifier",
    reason: "用户已确认 Contract",
    idempotency_key: "draft-clarifier-release",
  });
  assert.ok(
    coordinator
      .queryReady({
        board_id: "board-1",
        actor_id: "runtime-executor",
        role: "executor",
        goal_mode_attestation: true,
      })
      .ready.some((item) => item.goal.goal_id === "rough-draft"),
  );
  assert.ok(
    !coordinator
      .queryReady({ board_id: "board-1", actor_id: "runtime-clarifier-2", role: "clarifier" })
      .ready.some((item) => item.goal.goal_id === "rough-draft"),
  );
  store.close();
});

test("current Runtime persists a Draft dialogue and can resume it without canonizing its inferences", () => {
  const { store, coordinator } = fixture();
  const started = coordinator.startDraftDialogue({
    board_id: "board-1",
    actor_id: "runtime-current-session",
    rough_idea: "我想让新用户第一次就能理解 GoalBoard，并完成一项自己的工作。",
    draft_title: "改善第一次 GoalBoard 使用体验",
    idempotency_key: "draft-dialogue-start",
  });
  assert.equal(started.replayed, false);
  assert.equal(started.goal.definition_state, "draft");
  assert.equal(started.goal.decomposition_state, "abstract");
  assert.equal(started.goal.outcome, "");
  assert.equal(started.work_state.work_state, "clarifying");
  assert.equal(started.claim?.role, "clarifier");
  assert.equal(started.run?.role, "clarifier");
  assert.equal(started.dialogue.state, "clarifying");
  assert.equal(started.turns.length, 1);
  assert.equal(started.turns[0]?.turn_kind, "rough_idea");
  assert.equal(started.turns[0]?.user_message, started.dialogue.rough_idea);

  const replayedStart = coordinator.startDraftDialogue({
    board_id: "board-1",
    actor_id: "runtime-current-session",
    rough_idea: "我想让新用户第一次就能理解 GoalBoard，并完成一项自己的工作。",
    draft_title: "改善第一次 GoalBoard 使用体验",
    idempotency_key: "draft-dialogue-start",
  });
  assert.equal(replayedStart.replayed, true);
  assert.equal(replayedStart.dialogue.session_id, started.dialogue.session_id);

  const answered = coordinator.recordDraftDialogueTurn({
    board_id: "board-1",
    goal_id: started.goal.goal_id,
    run_id: started.run!.run_id,
    actor_id: "runtime-current-session",
    user_message: "第一版只面向已安装 GoalBoard 的技术用户，不需要自动打开网页。",
    current_understanding: "首版重点是让已安装用户在当前 Runtime 对话里建立并推进自己的 Goal；网页只在用户主动需要时查看。",
    known_facts: [
      {
        statement: "首版目标用户是已安装 GoalBoard 的技术用户。",
        source_kind: "user_answer",
      },
    ],
    assumptions: [
      {
        statement: "首次使用可先只支持当前 Runtime 的 Skill 引导。",
        confidence: 0.7,
      },
    ],
    next_question: "用户完成第一项工作后，最需要得到什么可见结果？",
    idempotency_key: "draft-dialogue-answer-1",
  });
  assert.equal(answered.replayed, false);
  assert.equal(answered.dialogue.state, "clarifying");
  assert.equal(answered.dialogue.next_question, "用户完成第一项工作后，最需要得到什么可见结果？");
  assert.equal(answered.turns.length, 2);
  assert.equal(answered.turns[1]?.known_facts[0]?.source_kind, "user_answer");
  assert.equal(answered.turns[1]?.known_facts[0]?.confirmed_by_user, true);
  assert.ok(answered.turns[1]?.known_facts[0]?.source_refs.some((ref) => ref.startsWith("clarification-turn:")));
  assert.equal(answered.turns[1]?.assumptions[0]?.requires_user_confirmation, true);

  assert.throws(
    () =>
      coordinator.recordDraftDialogueTurn({
        board_id: "board-1",
        goal_id: started.goal.goal_id,
        run_id: started.run!.run_id,
        actor_id: "runtime-current-session",
        user_message: "Runtime 自己猜了一个需求。",
        current_understanding: "这不应被记录为用户确认的事实。",
        known_facts: [
          {
            statement: "Runtime 猜测用户喜欢自动打开网页。",
            source_kind: "runtime_inference" as never,
          },
        ],
        next_question: "用户是否同意？",
        idempotency_key: "draft-dialogue-reject-inference",
      }),
    (error: unknown) =>
      error instanceof GoalBoardV1Error && error.code === "draft_dialogue.fact_source_invalid",
  );
  assert.equal(store.snapshot("board-1").clarification_turns.length, 2);

  const canonicalBeforeResume = store.getGoal(started.goal.goal_id);
  assert.ok(canonicalBeforeResume);
  assert.equal(canonicalBeforeResume?.outcome, "");
  assert.equal(store.snapshot("board-1").contract_proposals.length, 0);
  assert.equal(store.snapshot("board-1").relations.length, 0);

  coordinator.releaseClaim({
    board_id: "board-1",
    claim_id: started.claim!.claim_id,
    actor_id: "runtime-current-session",
    reason: "当前 Session 被中断，下一次从保存的澄清记录恢复",
    idempotency_key: "draft-dialogue-release",
  });
  const resumed = coordinator.resumeDraftDialogue({
    board_id: "board-1",
    goal_id: started.goal.goal_id,
    actor_id: "runtime-current-session",
    idempotency_key: "draft-dialogue-resume",
  });
  assert.equal(resumed.replayed, false);
  assert.equal(resumed.dialogue.session_id, started.dialogue.session_id);
  assert.equal(resumed.turns.length, 2);
  assert.equal(resumed.dialogue.next_question, answered.dialogue.next_question);
  assert.notEqual(resumed.run?.run_id, started.run?.run_id);
  assert.equal(resumed.work_state.work_state, "clarifying");

  assert.throws(
    () =>
      coordinator.resumeDraftDialogue({
        board_id: "board-1",
        goal_id: started.goal.goal_id,
        actor_id: "other-runtime-session",
        idempotency_key: "draft-dialogue-steal",
      }),
    (error: unknown) => error instanceof GoalBoardV1Error && error.code === "draft_dialogue.active_elsewhere",
  );

  const readyForProposal = coordinator.recordDraftDialogueTurn({
    board_id: "board-1",
    goal_id: started.goal.goal_id,
    run_id: resumed.run!.run_id,
    actor_id: "runtime-current-session",
    user_message: "完成后用户应该能看到自己的 Goal 已被 Runtime 领取并推进的完整记录。",
    current_understanding: "第一版围绕当前 Runtime 的 Skill 对话推进，不主动打开网页；用户要的是从粗略想法到可见推进记录的闭环。",
    known_facts: [
      {
        statement: "用户期望看到 Goal 被 Runtime 领取和推进的完整记录。",
        source_kind: "user_answer",
      },
    ],
    proposal_summary: "建议把“首次 GoalBoard 使用体验”作为复合父 Goal，先拆成“当前 Runtime 内的自然语言澄清”和“用户可见的推进记录”两个子 Goal；提案仍需用户确认，尚未写入正式 Goal Contract 或子 Goal 关系。",
    idempotency_key: "draft-dialogue-proposal-ready",
  });
  assert.equal(readyForProposal.dialogue.state, "proposal_ready");
  assert.equal(readyForProposal.dialogue.proposal_summary?.includes("复合父 Goal"), true);
  assert.equal(store.getGoal(started.goal.goal_id)?.definition_state, "draft");
  assert.equal(store.getGoal(started.goal.goal_id)?.outcome, "");
  assert.equal(store.snapshot("board-1").contract_proposals.length, 0);
  assert.equal(store.snapshot("board-1").relations.length, 0);
  store.close();
});

test("current Runtime can begin clarification for an existing Draft without creating a second Goal", () => {
  const { store, coordinator } = fixture();
  coordinator.createGoal(
    "board-1",
    {
      goal_id: "existing-draft-dialogue",
      title: "用户手工录入的 Draft",
      outcome: "",
      why: "",
      business_logic: "",
      definition_state: "draft",
      decomposition_state: "abstract",
      acceptance_criteria: [],
    },
    { actor_id: "user-1", idempotency_key: "existing-draft-dialogue-create" },
  );
  const goalCountBeforeStart = store.snapshot("board-1").goals.length;

  const started = coordinator.startDraftDialogue({
    board_id: "board-1",
    goal_id: "existing-draft-dialogue",
    actor_id: "runtime-current-session",
    rough_idea: "用户要求当前 Runtime 在同一对话继续澄清这条 Draft。",
    idempotency_key: "existing-draft-dialogue-start",
  });
  assert.equal(started.goal.goal_id, "existing-draft-dialogue");
  assert.equal(store.snapshot("board-1").goals.length, goalCountBeforeStart);
  assert.equal(started.work_state.work_state, "clarifying");
  assert.equal(started.claim?.role, "clarifier");
  assert.equal(started.run?.role, "clarifier");
  assert.equal(started.turns.length, 1);

  assert.throws(
    () =>
      coordinator.startDraftDialogue({
        board_id: "board-1",
        goal_id: "existing-draft-dialogue",
        actor_id: "runtime-current-session",
        rough_idea: "不能创建第二份澄清会话。",
        idempotency_key: "existing-draft-dialogue-start-again",
      }),
    (error: unknown) =>
      error instanceof GoalBoardV1Error && error.code === "draft_dialogue.already_open",
  );

  const resumed = coordinator.resumeDraftDialogue({
    board_id: "board-1",
    goal_id: "existing-draft-dialogue",
    actor_id: "runtime-current-session",
    idempotency_key: "existing-draft-dialogue-resume",
  });
  assert.equal(resumed.dialogue.session_id, started.dialogue.session_id);
  assert.equal(resumed.run?.run_id, started.run?.run_id);
  store.close();
});

test("a denied Draft dialogue start rolls back its draft, claim, run, and dialogue session together", () => {
  const { store, coordinator } = fixture();
  coordinator.setPolicy(
    "board-1",
    { policy: { goal_mode: "required" }, reason: "验证 Draft 初始化也遵守 Goal Mode" },
    { actor_id: "user-1", idempotency_key: "draft-dialogue-required-policy" },
  );
  const before = store.snapshot("board-1");
  assert.throws(
    () =>
      coordinator.startDraftDialogue({
        board_id: "board-1",
        actor_id: "runtime-current-session",
        rough_idea: "这次没有声明 Goal Mode，不能留下半条 Draft。",
        idempotency_key: "draft-dialogue-denied-start",
      }),
    (error: unknown) => error instanceof GoalBoardV1Error && error.code === "draft_dialogue.claim_denied",
  );
  const after = store.snapshot("board-1");
  assert.equal(after.goals.length, before.goals.length);
  assert.equal(after.claims.length, before.claims.length);
  assert.equal(after.runs.length, before.runs.length);
  assert.equal(after.clarification_sessions.length, before.clarification_sessions.length);
  assert.equal(after.clarification_turns.length, before.clarification_turns.length);
  assert.equal(after.goals.some((goal) => goal.title.includes("没有声明 Goal Mode")), false);
  store.close();
});

test("only an approved Contract closes its Draft clarification session", () => {
  const { store, coordinator } = fixture();
  const dialogue = coordinator.startDraftDialogue({
    board_id: "board-1",
    actor_id: "runtime-contract-dialogue",
    rough_idea: "把这条粗略想法澄清成可执行的叶子 Goal。",
    goal_id: "contract-dialogue-lifecycle",
    idempotency_key: "contract-dialogue-lifecycle-start",
  });
  const proposedGoal = {
    ...treeGoalPayload({
      goal_id: "contract-dialogue-lifecycle",
      title: "通过 Contract 确认关闭澄清会话",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
    }),
    priority: 50,
  };
  const reviewPolicy = {
    goal_mode: "preferred" as const,
    required_capabilities: [],
    self_verification: true,
    cross_reviewers: 0,
    adversarial_reviewers: 0,
    human_approval: false,
    max_lease_seconds: 1800,
  };
  const submit = (idempotencyKey: string) => coordinator.submitContractProposal({
    board_id: "board-1",
    goal_id: "contract-dialogue-lifecycle",
    actor_id: "runtime-contract-dialogue",
    discovered_in_run_id: dialogue.run!.run_id,
    proposed_goal: proposedGoal,
    field_sources: contractFieldSources(dialogue.run!.run_id) as never,
    review_policy: reviewPolicy,
    idempotency_key: idempotencyKey,
  }).proposal;

  const rejectedProposal = submit("contract-dialogue-lifecycle-propose-rejected");
  coordinator.decideContractProposal({
    board_id: "board-1",
    proposal_id: rejectedProposal.proposal_id,
    actor_id: "user-1",
    actor_kind: "user",
    decision: "rejected",
    reason: "先保留 Draft 继续澄清。",
    idempotency_key: "contract-dialogue-lifecycle-reject",
  });
  assert.equal(
    store.snapshot("board-1").clarification_sessions.find(
      (session) => session.session_id === dialogue.dialogue.session_id,
    )?.state,
    "clarifying",
  );

  const approvedProposal = submit("contract-dialogue-lifecycle-propose-approved");
  const decisionInput = {
    board_id: "board-1",
    proposal_id: approvedProposal.proposal_id,
    actor_id: "user-1",
    actor_kind: "user" as const,
    decision: "approved" as const,
    reason: "Contract 的结果、边界和验收已经确认。",
    idempotency_key: "contract-dialogue-lifecycle-approve",
  };
  coordinator.decideContractProposal(decisionInput);
  const closed = store.snapshot("board-1").clarification_sessions.find(
    (session) => session.session_id === dialogue.dialogue.session_id,
  );
  assert.equal(closed?.state, "closed");
  assert.equal(closed?.closed_at, "2026-08-15T00:00:00.000Z");
  const closeEventCount = () => (store.db
    .prepare("SELECT COUNT(*) AS count FROM events WHERE type = 'clarification.closed' AND object_id = ?")
    .get(dialogue.dialogue.session_id) as { count: number }).count;
  assert.equal(closeEventCount(), 1);
  coordinator.decideContractProposal(decisionInput);
  assert.equal(closeEventCount(), 1);
  store.close();
});

test("a clarifier submits one atomic, versioned Goal Tree proposal without touching canonical facts", () => {
  const { store, coordinator } = fixture();
  const dialogue = coordinator.startDraftDialogue({
    board_id: "board-1",
    actor_id: "runtime-clarifier",
    rough_idea: "我想把首次使用体验拆成几个能独立推进的 Goal。",
    goal_id: "tree-root",
    idempotency_key: "tree-proposal-dialogue-start",
  });
  const canonicalBefore = {
    goals: store.snapshot("board-1").goals,
    relations: store.snapshot("board-1").relations,
    risks: store.snapshot("board-1").risks,
    policies: store.db.prepare("SELECT * FROM policy_bindings WHERE board_id = ?").all("board-1"),
  };
  const proposalInput = {
    board_id: "board-1",
    actor_id: "runtime-clarifier",
    discovered_in_run_id: dialogue.run!.run_id,
    root_goal_id: "tree-root",
    summary: "建议以首次使用体验为复合父 Goal，确认后再分别物化澄清、引导和进度可见性子 Goal。",
    items: [
      goalTreeProposalItem({
        item_id: "item-new-child",
        kind: "goal",
        operation: "create",
        payload: { goal_id: "first-use-guide", title: "在当前 Runtime 中完成首次引导" },
        object_type: "goal",
        object_id: "first-use-guide",
      }),
      goalTreeProposalItem({
        item_id: "item-root-contract",
        kind: "contract",
        operation: "update",
        payload: { goal_id: "tree-root", decomposition_state: "closed_compound" },
        object_type: "goal",
        object_id: "tree-root",
      }),
      goalTreeProposalItem({
        item_id: "item-parent-child",
        kind: "relation",
        operation: "create",
        payload: { from_goal_id: "first-use-guide", to_goal_id: "tree-root", type: "part_of" },
        object_type: "relation",
        object_id: "relation:new:first-use-guide:tree-root:part_of",
      }),
      goalTreeProposalItem({
        item_id: "item-dependency",
        kind: "dependency",
        operation: "create",
        payload: { from_goal_id: "first-use-guide", to_goal_id: "runtime-connection", type: "depends_on" },
        object_type: "relation",
        object_id: "relation:new:first-use-guide:runtime-connection:depends_on",
      }),
      goalTreeProposalItem({
        item_id: "item-risk",
        kind: "risk",
        operation: "create",
        payload: { risk_id: "first-use-copy-risk", description: "引导文案仍可能不清楚" },
        object_type: "risk",
        object_id: "first-use-copy-risk",
      }),
      goalTreeProposalItem({
        item_id: "item-policy",
        kind: "policy",
        operation: "update",
        payload: { goal_id: "first-use-guide", goal_mode: "preferred" },
        object_type: "policy",
        object_id: "policy:new:first-use-guide",
      }),
      goalTreeProposalItem({
        item_id: "item-candidate",
        kind: "candidate",
        operation: "create",
        payload: { title: "补充首次使用文案验证" },
        object_type: "candidate",
        object_id: "candidate:first-use-copy",
      }),
      goalTreeProposalItem({
        item_id: "item-rewire",
        kind: "rewire",
        operation: "update",
        payload: { relation_action: "add", from_goal_id: "first-use-guide", to_goal_id: "runtime-connection" },
        object_type: "rewire",
        object_id: "rewire:first-use-dependency",
      }),
    ],
    idempotency_key: "tree-proposal-submit",
  };
  const submitted = coordinator.submitGoalTreeProposal(proposalInput);
  assert.equal(submitted.replayed, false);
  assert.equal(submitted.proposal.origin, "native");
  assert.equal(submitted.proposal.state, "pending");
  assert.equal(submitted.proposal.version, 1);
  assert.equal(submitted.proposal.root_goal_id, "tree-root");
  assert.equal(submitted.proposal.items.length, 8);
  assert.deepEqual(
    submitted.proposal.items.map((item) => item.kind),
    ["goal", "contract", "relation", "dependency", "risk", "policy", "candidate", "rewire"],
  );
  assert.ok(submitted.proposal.items.every((item) => item.requires_user_confirmation));
  assert.ok(submitted.proposal.items.every((item) => item.baseline_versions.length === 1));
  assert.equal(submitted.proposal.base_event_cursor, dialogue.observed_event_cursor);
  const replay = coordinator.submitGoalTreeProposal(proposalInput);
  assert.equal(replay.replayed, true);
  assert.equal(replay.proposal.proposal_id, submitted.proposal.proposal_id);
  assert.equal(store.snapshot("board-1").goal_tree_proposals.length, 1);
  assert.deepEqual(
    {
      goals: store.snapshot("board-1").goals,
      relations: store.snapshot("board-1").relations,
      risks: store.snapshot("board-1").risks,
      policies: store.db.prepare("SELECT * FROM policy_bindings WHERE board_id = ?").all("board-1"),
    },
    canonicalBefore,
  );

  store.db
    .prepare("UPDATE goals SET title = ?, updated_at = ? WHERE goal_id = ?")
    .run("另一个 Runtime 已更新的 Draft 标题", "2026-08-15T00:10:00.000Z", "tree-root");
  const checked = coordinator.checkGoalTreeProposal({
    board_id: "board-1",
    proposal_id: submitted.proposal.proposal_id,
    actor_id: "runtime-clarifier",
    idempotency_key: "tree-proposal-check",
  });
  assert.deepEqual(checked.conflict_item_ids, ["item-root-contract"]);
  assert.equal(
    checked.proposal.items.find((item) => item.item_id === "item-root-contract")?.state,
    "conflict",
  );
  assert.equal(
    checked.proposal.items.find((item) => item.item_id === "item-new-child")?.state,
    "pending",
  );

  const revised = coordinator.submitGoalTreeProposal({
    ...proposalInput,
    summary: "按最新 Draft 标题修订后的同一组首次使用 Goal Tree 变更。",
    items: [
      goalTreeProposalItem({
        item_id: "item-root-contract-v2",
        supersedes_item_id: "item-root-contract",
        kind: "contract",
        operation: "update",
        payload: { goal_id: "tree-root", decomposition_state: "closed_compound", title: "另一个 Runtime 已更新的 Draft 标题" },
        object_type: "goal",
        object_id: "tree-root",
      }),
    ],
    supersedes_proposal_id: submitted.proposal.proposal_id,
    idempotency_key: "tree-proposal-revise",
  });
  assert.equal(revised.proposal.version, 2);
  assert.equal(revised.proposal.supersedes_proposal_id, submitted.proposal.proposal_id);
  assert.equal(revised.proposal.items[0]?.supersedes_item_id, "item-root-contract");
  const history = coordinator.listGoalTreeProposals({
    board_id: "board-1",
    root_goal_id: "tree-root",
    include_legacy: false,
  }).proposals.sort((left, right) => right.version - left.version);
  assert.deepEqual(history.map((proposal) => [proposal.version, proposal.state]), [[2, "pending"], [1, "superseded"]]);
  assert.ok(history[1]?.items.every((item) => item.state === "superseded"));
  const databasePath = store.path;
  store.close();
  const recoveredStore = new SqliteGoalBoardStore(databasePath);
  const recoveredCoordinator = new GoalBoardCoordinator(recoveredStore);
  const recovered = recoveredCoordinator.listGoalTreeProposals({
    board_id: "board-1",
    proposal_id: revised.proposal.proposal_id,
    include_legacy: false,
  }).proposals;
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0]?.proposal_id, revised.proposal.proposal_id);
  assert.equal(recovered[0]?.version, 2);
  assert.equal(recovered[0]?.items[0]?.supersedes_item_id, "item-root-contract");
  recoveredStore.close();
});

test("trusted partial Goal Tree decisions materialize a hierarchy and derive parent, leaf, and draft states", () => {
  const { store, coordinator } = fixture();
  const dialogue = coordinator.startDraftDialogue({
    board_id: "board-1",
    actor_id: "runtime-clarifier",
    rough_idea: "把 Runtime 内的提案确认后变成可推进的父子 Goal。",
    goal_id: "tree-decision-parent",
    idempotency_key: "tree-decision-dialogue",
  });
  const proposal = coordinator.submitGoalTreeProposal({
    board_id: "board-1",
    actor_id: "runtime-clarifier",
    discovered_in_run_id: dialogue.run!.run_id,
    root_goal_id: "tree-decision-parent",
    summary: "确认父 Goal、一个可执行叶子和一个仍待澄清的子 Goal；其余项分别拒绝或修订。",
    items: [
      goalTreeProposalItem({
        item_id: "parent-contract",
        kind: "contract",
        operation: "update",
        payload: treeGoalPayload({
          goal_id: "tree-decision-parent",
          title: "Runtime 中确认的复合父 Goal",
          definition_state: "accepted",
          decomposition_state: "closed_compound",
        }),
        object_type: "goal",
        object_id: "tree-decision-parent",
      }),
      goalTreeProposalItem({
        item_id: "execution-leaf",
        kind: "goal",
        operation: "create",
        payload: treeGoalPayload({
          goal_id: "tree-decision-leaf",
          title: "可执行的叶子 Goal",
          definition_state: "accepted",
          decomposition_state: "closed_leaf",
        }),
        object_type: "goal",
        object_id: "tree-decision-leaf",
      }),
      goalTreeProposalItem({
        item_id: "draft-child",
        kind: "goal",
        operation: "create",
        payload: treeGoalPayload({
          goal_id: "tree-decision-draft-child",
          title: "仍需对话澄清的子 Goal",
          definition_state: "draft",
          decomposition_state: "abstract",
        }),
        object_type: "goal",
        object_id: "tree-decision-draft-child",
      }),
      goalTreeProposalItem({
        item_id: "leaf-parent-relation",
        kind: "relation",
        operation: "create",
        payload: {
          from_goal_id: "tree-decision-leaf",
          to_goal_id: "tree-decision-parent",
          type: "part_of",
          reason: "叶子是父 Goal 的最小可执行工作。",
        },
        object_type: "relation",
        object_id: "relation:new:tree-decision-leaf:tree-decision-parent:part_of",
      }),
      goalTreeProposalItem({
        item_id: "draft-parent-relation",
        kind: "relation",
        operation: "create",
        payload: {
          from_goal_id: "tree-decision-draft-child",
          to_goal_id: "tree-decision-parent",
          type: "part_of",
          reason: "这一支仍需要 Runtime 与用户继续澄清。",
        },
        object_type: "relation",
        object_id: "relation:new:tree-decision-draft-child:tree-decision-parent:part_of",
      }),
      goalTreeProposalItem({
        item_id: "rejected-relation",
        kind: "relation",
        operation: "create",
        payload: {
          from_goal_id: "tree-decision-leaf",
          to_goal_id: "missing-goal",
          type: "depends_on",
          reason: "用户不接受这项推断依赖。",
        },
        object_type: "relation",
        object_id: "relation:new:tree-decision-leaf:missing-goal:depends_on",
      }),
      goalTreeProposalItem({
        item_id: "revised-future-child",
        kind: "goal",
        operation: "create",
        payload: treeGoalPayload({
          goal_id: "tree-decision-future-child",
          title: "需要按用户意见改写的子 Goal",
          definition_state: "draft",
          decomposition_state: "abstract",
        }),
        object_type: "goal",
        object_id: "tree-decision-future-child",
      }),
    ],
    idempotency_key: "tree-decision-propose",
  }).proposal;

  const decisionInput = {
    board_id: "board-1",
    proposal_id: proposal.proposal_id,
    runtime_actor_id: "runtime-clarifier",
    authority: {
      actor_id: "user-1",
      actor_kind: "user" as const,
      authority_source: "runtime_trusted_host" as const,
      conversation_ref: "conversation://current-session",
      message_ref: "message://user-confirm-tree",
    },
    decisions: [
      { item_id: "parent-contract", decision: "confirm" as const, reason: "父 Goal 的范围和拆分已经确认。" },
      { item_id: "execution-leaf", decision: "confirm" as const, reason: "这个叶子可以开始执行。" },
      { item_id: "draft-child", decision: "confirm" as const, reason: "先保留这条分支，继续在 Runtime 里澄清。" },
      { item_id: "leaf-parent-relation", decision: "confirm" as const, reason: "它属于这个父 Goal。" },
      { item_id: "draft-parent-relation", decision: "confirm" as const, reason: "它也是父 Goal 的一部分。" },
      { item_id: "rejected-relation", decision: "reject" as const, reason: "用户不接受这个不存在的前置依赖。" },
      {
        item_id: "revised-future-child",
        decision: "revise" as const,
        reason: "把这项改成先验证用户是否需要它。",
        revised_item: goalTreeProposalItem({
          item_id: "revised-future-child-v2",
          kind: "goal",
          operation: "create",
          payload: treeGoalPayload({
            goal_id: "tree-decision-future-child-v2",
            title: "先验证需求的子 Goal",
            definition_state: "draft",
            decomposition_state: "abstract",
          }),
          object_type: "goal",
          object_id: "tree-decision-future-child-v2",
        }),
      },
    ],
    idempotency_key: "tree-decision-apply",
  };
  const applied = coordinator.decideGoalTreeProposal(decisionInput);
  assert.deepEqual(applied.applied_item_ids.sort(), [
    "draft-child",
    "draft-parent-relation",
    "execution-leaf",
    "leaf-parent-relation",
    "parent-contract",
  ]);
  assert.deepEqual(applied.rejected_item_ids, ["rejected-relation"]);
  assert.deepEqual(applied.revised_item_ids, ["revised-future-child"]);
  assert.deepEqual(applied.conflict_item_ids, []);
  assert.equal(applied.proposal.state, "closed");
  assert.equal(applied.revision_proposals.length, 1);
  assert.equal(applied.revision_proposals[0]?.items[0]?.state, "pending");
  assert.equal(store.getGoal("tree-decision-future-child"), null);
  assert.equal(store.getGoal("tree-decision-parent")?.definition_state, "accepted");
  assert.equal(
    store.snapshot("board-1").clarification_sessions.find(
      (session) => session.session_id === dialogue.dialogue.session_id,
    )?.state,
    "closed",
  );
  const treeClarificationCloseCount = () => (store.db
    .prepare("SELECT COUNT(*) AS count FROM events WHERE type = 'clarification.closed' AND object_id = ?")
    .get(dialogue.dialogue.session_id) as { count: number }).count;
  assert.equal(treeClarificationCloseCount(), 1);
  assert.equal(
    coordinator.readGoalContract("board-1", "tree-decision-parent").work_state.work_state,
    "waiting_children",
  );
  assert.equal(
    coordinator.readGoalContract("board-1", "tree-decision-leaf").work_state.work_state,
    "execution_pending",
  );
  assert.equal(
    coordinator.readGoalContract("board-1", "tree-decision-draft-child").work_state.work_state,
    "clarification_pending",
  );
  assert.equal(
    store.snapshot("board-1").relations.some(
      (relation) => relation.to_goal_id === "missing-goal" && relation.state === "active",
    ),
    false,
  );
  const persisted = applied.proposal.items.find((item) => item.item_id === "execution-leaf");
  assert.equal(persisted?.decision?.actor_id, "user-1");
  assert.equal(persisted?.decision?.runtime_actor_id, "runtime-clarifier");
  assert.equal(persisted?.decision?.conversation_ref, "conversation://current-session");
  assert.equal(persisted?.materialized_objects[0]?.object_type, "goal");
  const replay = coordinator.decideGoalTreeProposal(decisionInput);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.applied_item_ids.sort(), applied.applied_item_ids.sort());
  assert.equal(treeClarificationCloseCount(), 1);
  const databasePath = store.path;
  store.close();
  const recoveredStore = new SqliteGoalBoardStore(databasePath);
  const recoveredCoordinator = new GoalBoardCoordinator(recoveredStore);
  const recovered = recoveredCoordinator.listGoalTreeProposals({
    board_id: "board-1",
    proposal_id: proposal.proposal_id,
    include_legacy: false,
  }).proposals[0];
  assert.equal(recovered?.items.find((item) => item.item_id === "rejected-relation")?.decision?.decision, "rejected");
  assert.equal(recovered?.items.find((item) => item.item_id === "revised-future-child")?.revision_proposal_id, applied.revision_proposals[0]?.proposal_id);
  recoveredStore.close();
});

test("a user can close an accepted parent without changing its Contract", () => {
  const { store, coordinator } = fixture();
  createAcceptedCompoundParent(coordinator, "accepted-closure-parent");
  createLeaf(coordinator, "accepted-closure-child");
  coordinator.addRelation(
    "board-1",
    {
      from_goal_id: "accepted-closure-child",
      to_goal_id: "accepted-closure-parent",
      type: "part_of",
      reason: "这是已接受父 Goal 已确认的必需子结果。",
    },
    { actor_id: "user-1", idempotency_key: "accepted-closure-child-relation" },
  );
  const before = store.getGoal("accepted-closure-parent")!;
  const businessContractBefore = {
    title: before.title,
    outcome: before.outcome,
    why: before.why,
    business_logic: before.business_logic,
    in_scope: before.in_scope,
    out_of_scope: before.out_of_scope,
    constraints: before.constraints,
    required_inputs: before.required_inputs,
    promised_outputs: before.promised_outputs,
    priority: before.priority,
    acceptance_criteria: before.acceptance_criteria,
    accepted_by: before.accepted_by,
    accepted_at: before.accepted_at,
  };
  assert.equal(before.decomposition_state, "abstract");
  assert.equal(
    coordinator.getGoalWorkState({ board_id: "board-1", goal_id: "accepted-closure-parent" }).work_state,
    "clarification_pending",
  );

  const dialogue = coordinator.startDraftDialogue({
    board_id: "board-1",
    actor_id: "runtime-clarifier",
    goal_id: "accepted-closure-context",
    rough_idea: "用户正在确认一个已有 accepted 父 Goal 的完整子树。",
    idempotency_key: "accepted-closure-dialogue",
  });
  const proposal = coordinator.submitGoalTreeProposal({
    board_id: "board-1",
    actor_id: "runtime-clarifier",
    discovered_in_run_id: dialogue.run!.run_id,
    root_goal_id: "accepted-closure-parent",
    summary: "只结束这个已接受父 Goal 的拆分，不修改它的业务 Contract。",
    items: [
      goalTreeProposalItem({
        item_id: "accepted-parent-close",
        kind: "contract",
        operation: "update",
        payload: acceptedCompoundClosurePayload(before),
        object_type: "goal",
        object_id: "accepted-closure-parent",
      }),
    ],
    idempotency_key: "accepted-closure-proposal",
  }).proposal;
  const decided = coordinator.decideGoalTreeProposal({
    board_id: "board-1",
    proposal_id: proposal.proposal_id,
    runtime_actor_id: "runtime-clarifier",
    authority: {
      actor_id: "user-1",
      actor_kind: "user",
      authority_source: "runtime_trusted_host",
      conversation_ref: "conversation://accepted-closure",
      message_ref: "message://accepted-closure-confirm",
    },
    decisions: [{ item_id: "accepted-parent-close", decision: "confirm", reason: "确认该父 Goal 已结束拆分。" }],
    idempotency_key: "accepted-closure-decision",
  });
  assert.deepEqual(decided.applied_item_ids, ["accepted-parent-close"]);
  const after = store.getGoal("accepted-closure-parent")!;
  assert.equal(after.definition_state, "accepted");
  assert.equal(after.decomposition_state, "closed_compound");
  assert.deepEqual(
    {
      title: after.title,
      outcome: after.outcome,
      why: after.why,
      business_logic: after.business_logic,
      in_scope: after.in_scope,
      out_of_scope: after.out_of_scope,
      constraints: after.constraints,
      required_inputs: after.required_inputs,
      promised_outputs: after.promised_outputs,
      priority: after.priority,
      acceptance_criteria: after.acceptance_criteria,
      accepted_by: after.accepted_by,
      accepted_at: after.accepted_at,
    },
    businessContractBefore,
  );
  assert.equal(
    coordinator.readGoalContract("board-1", "accepted-closure-parent").work_state.work_state,
    "waiting_children",
  );
  const event = store.db
    .prepare("SELECT payload_json FROM events WHERE type = ? AND object_id = ?")
    .get("goal.accepted_compound_closed_from_tree_proposal", "accepted-closure-parent") as { payload_json: string } | undefined;
  assert.deepEqual(JSON.parse(event!.payload_json), {
    previous_decomposition_state: "abstract",
    decomposition_state: "closed_compound",
    child_goal_ids: ["accepted-closure-child"],
    proposal_item_id: "accepted-parent-close",
  });
  store.close();
});

test("closing an accepted parent reconciles completed children and compound ancestors", () => {
  const { store, coordinator } = fixture();
  createAcceptedCompoundParent(coordinator, "accepted-closure-ancestor", "closed_compound");
  createAcceptedCompoundParent(coordinator, "accepted-closure-complete-parent");
  createLeaf(coordinator, "accepted-closure-complete-child");
  store.db.prepare("UPDATE goals SET fulfillment_state = 'satisfied' WHERE goal_id = ?")
    .run("accepted-closure-complete-child");
  coordinator.addRelation(
    "board-1",
    {
      from_goal_id: "accepted-closure-complete-parent",
      to_goal_id: "accepted-closure-ancestor",
      type: "part_of",
      reason: "这个已接受父 Goal 是上层复合 Goal 的直接子结果。",
    },
    { actor_id: "user-1", idempotency_key: "accepted-closure-ancestor-relation" },
  );
  coordinator.addRelation(
    "board-1",
    {
      from_goal_id: "accepted-closure-complete-child",
      to_goal_id: "accepted-closure-complete-parent",
      type: "part_of",
      reason: "这个子 Goal 已完成，等待父 Goal 正式结束拆分。",
    },
    { actor_id: "user-1", idempotency_key: "accepted-closure-complete-child-relation" },
  );
  const dialogue = coordinator.startDraftDialogue({
    board_id: "board-1",
    actor_id: "runtime-clarifier",
    goal_id: "accepted-closure-complete-context",
    rough_idea: "确认已完成子树的已接受父 Goal 正式结束拆分。",
    idempotency_key: "accepted-closure-complete-dialogue",
  });
  const proposal = coordinator.submitGoalTreeProposal({
    board_id: "board-1",
    actor_id: "runtime-clarifier",
    discovered_in_run_id: dialogue.run!.run_id,
    root_goal_id: "accepted-closure-complete-parent",
    summary: "用户确认该 accepted 父 Goal 的子树已经完整，应该立即重算上层状态。",
    items: [
      goalTreeProposalItem({
        item_id: "accepted-complete-parent-close",
        kind: "contract",
        operation: "update",
        payload: acceptedCompoundClosurePayload(store.getGoal("accepted-closure-complete-parent")!),
        object_type: "goal",
        object_id: "accepted-closure-complete-parent",
      }),
    ],
    idempotency_key: "accepted-closure-complete-proposal",
  }).proposal;
  const decided = coordinator.decideGoalTreeProposal({
    board_id: "board-1",
    proposal_id: proposal.proposal_id,
    runtime_actor_id: "runtime-clarifier",
    authority: {
      actor_id: "user-1",
      actor_kind: "user",
      authority_source: "runtime_trusted_host",
      conversation_ref: "conversation://accepted-complete-closure",
      message_ref: "message://accepted-complete-closure-confirm",
    },
    decisions: [{ item_id: "accepted-complete-parent-close", decision: "confirm", reason: "确认该子树已经结束。" }],
    idempotency_key: "accepted-closure-complete-decision",
  });
  assert.deepEqual(decided.applied_item_ids, ["accepted-complete-parent-close"]);
  assert.equal(store.getGoal("accepted-closure-complete-parent")?.fulfillment_state, "satisfied");
  assert.equal(store.getGoal("accepted-closure-ancestor")?.fulfillment_state, "satisfied");
  assert.equal(
    coordinator.readGoalContract("board-1", "accepted-closure-complete-parent").work_state.work_state,
    "satisfied",
  );
  assert.equal(
    coordinator.readGoalContract("board-1", "accepted-closure-ancestor").work_state.work_state,
    "satisfied",
  );
  assert.deepEqual(
    (store.db
      .prepare("SELECT object_id FROM events WHERE type = ? ORDER BY rowid")
      .all("goal.compound_satisfied") as Array<{ object_id: string }>)
      .map((event) => event.object_id),
    ["accepted-closure-complete-parent", "accepted-closure-ancestor"],
  );
  store.close();
});

test("Goal Tree decisions reconcile newly accepted and historical compound parents safely and idempotently", () => {
  const { store, coordinator } = fixture();

  createAcceptedCompoundParent(coordinator, "historical-compound-ancestor", "closed_compound");
  createAcceptedCompoundParent(coordinator, "historical-compound-parent", "closed_compound");
  createLeaf(coordinator, "historical-compound-child");
  coordinator.addRelation(
    "board-1",
    {
      from_goal_id: "historical-compound-parent",
      to_goal_id: "historical-compound-ancestor",
      type: "part_of",
      reason: "历史父级依赖下层复合 Goal 的完成结果。",
    },
    { actor_id: "user-1", idempotency_key: "historical-compound-ancestor-relation" },
  );
  coordinator.addRelation(
    "board-1",
    {
      from_goal_id: "historical-compound-child",
      to_goal_id: "historical-compound-parent",
      type: "part_of",
      reason: "先建立历史父子关系，再模拟遗漏了向上结算的旧完成事实。",
    },
    { actor_id: "user-1", idempotency_key: "historical-compound-parent-relation" },
  );
  store.db
    .prepare("UPDATE goals SET fulfillment_state = 'satisfied' WHERE goal_id = ?")
    .run("historical-compound-child");

  createAcceptedCompoundParent(coordinator, "incomplete-compound-parent", "closed_compound");
  createLeaf(coordinator, "incomplete-compound-child");
  coordinator.addRelation(
    "board-1",
    {
      from_goal_id: "incomplete-compound-child",
      to_goal_id: "incomplete-compound-parent",
      type: "part_of",
      reason: "未完成子 Goal 必须让父级继续等待。",
    },
    { actor_id: "user-1", idempotency_key: "incomplete-compound-parent-relation" },
  );

  const draftParent = treeGoalPayload({
    goal_id: "newly-accepted-compound-parent",
    title: "确认已经完成子树的 Draft 父 Goal",
    definition_state: "draft",
    decomposition_state: "abstract",
  });
  coordinator.createGoal(
    "board-1",
    draftParent,
    { actor_id: "user-1", idempotency_key: "newly-accepted-compound-parent-create" },
  );
  createLeaf(coordinator, "newly-accepted-compound-child");
  coordinator.addRelation(
    "board-1",
    {
      from_goal_id: "newly-accepted-compound-child",
      to_goal_id: "newly-accepted-compound-parent",
      type: "part_of",
      reason: "用户确认父级前，子 Goal 已经完成。",
    },
    { actor_id: "user-1", idempotency_key: "newly-accepted-compound-parent-relation" },
  );
  store.db
    .prepare("UPDATE goals SET fulfillment_state = 'satisfied' WHERE goal_id = ?")
    .run("newly-accepted-compound-child");

  const immutableGoal = (goalId: string) => {
    const goal = store.getGoal(goalId)!;
    const { fulfillment_state: _fulfillmentState, updated_at: _updatedAt, ...immutable } = goal;
    return immutable;
  };
  const immutableBefore = [
    "historical-compound-ancestor",
    "historical-compound-parent",
    "incomplete-compound-parent",
  ].map(immutableGoal);
  const relationsBefore = store.snapshot("board-1").relations;

  const dialogue = coordinator.startDraftDialogue({
    board_id: "board-1",
    actor_id: "runtime-clarifier",
    goal_id: "compound-reconciliation-context",
    rough_idea: "确认复合父 Goal 后统一结算当前与历史派生状态。",
    idempotency_key: "compound-reconciliation-dialogue",
  });
  const proposal = coordinator.submitGoalTreeProposal({
    board_id: "board-1",
    actor_id: "runtime-clarifier",
    discovered_in_run_id: dialogue.run!.run_id,
    root_goal_id: "newly-accepted-compound-parent",
    summary: "确认父 Goal 的完整 Contract 和拆分，并在同一事务中结算复合状态。",
    items: [
      goalTreeProposalItem({
        item_id: "accept-completed-draft-parent",
        kind: "contract",
        operation: "update",
        payload: treeGoalPayload({
          goal_id: "newly-accepted-compound-parent",
          title: "确认已经完成子树的 Draft 父 Goal",
          definition_state: "accepted",
          decomposition_state: "closed_compound",
        }),
        object_type: "goal",
        object_id: "newly-accepted-compound-parent",
      }),
    ],
    idempotency_key: "compound-reconciliation-proposal",
  }).proposal;
  const authority = {
    actor_id: "user-1",
    actor_kind: "user" as const,
    authority_source: "runtime_trusted_host" as const,
    conversation_ref: "conversation://compound-reconciliation",
    message_ref: "message://compound-reconciliation-confirm",
  };
  const decided = coordinator.decideGoalTreeProposal({
    board_id: "board-1",
    proposal_id: proposal.proposal_id,
    runtime_actor_id: "runtime-clarifier",
    authority,
    decisions: [
      {
        item_id: "accept-completed-draft-parent",
        decision: "confirm",
        reason: "用户确认该父 Goal 的 Contract 和完整子树。",
      },
    ],
    idempotency_key: "compound-reconciliation-decision",
  });

  assert.deepEqual(decided.applied_item_ids, ["accept-completed-draft-parent"]);
  assert.equal(store.getGoal("newly-accepted-compound-parent")?.fulfillment_state, "satisfied");
  assert.equal(store.getGoal("historical-compound-parent")?.fulfillment_state, "satisfied");
  assert.equal(store.getGoal("historical-compound-ancestor")?.fulfillment_state, "satisfied");
  assert.equal(store.getGoal("incomplete-compound-parent")?.fulfillment_state, "unmet");
  assert.equal(
    coordinator.getGoalWorkState({ board_id: "board-1", goal_id: "incomplete-compound-parent" }).work_state,
    "waiting_children",
  );
  assert.deepEqual(
    [
      "historical-compound-ancestor",
      "historical-compound-parent",
      "incomplete-compound-parent",
    ].map(immutableGoal),
    immutableBefore,
  );
  assert.deepEqual(store.snapshot("board-1").relations, relationsBefore);

  const eventCounts = () => Object.fromEntries(
    [
      "newly-accepted-compound-parent",
      "historical-compound-parent",
      "historical-compound-ancestor",
      "incomplete-compound-parent",
    ].map((goalId) => [
      goalId,
      (store.db
        .prepare("SELECT COUNT(*) AS count FROM events WHERE type = 'goal.compound_satisfied' AND object_id = ?")
        .get(goalId) as { count: number }).count,
    ]),
  );
  assert.deepEqual(eventCounts(), {
    "newly-accepted-compound-parent": 1,
    "historical-compound-parent": 1,
    "historical-compound-ancestor": 1,
    "incomplete-compound-parent": 0,
  });

  const secondProposal = coordinator.submitGoalTreeProposal({
    board_id: "board-1",
    actor_id: "runtime-clarifier",
    discovered_in_run_id: dialogue.run!.run_id,
    summary: "物化另一项独立 Goal，验证重复结算不重复写入完成事件。",
    items: [
      goalTreeProposalItem({
        item_id: "create-reconciliation-trigger",
        kind: "goal",
        operation: "create",
        payload: treeGoalPayload({
          goal_id: "compound-reconciliation-trigger",
          title: "触发第二次复合状态结算",
          definition_state: "accepted",
          decomposition_state: "closed_leaf",
        }),
        object_type: "goal",
        object_id: "compound-reconciliation-trigger",
      }),
    ],
    idempotency_key: "compound-reconciliation-second-proposal",
  }).proposal;
  coordinator.decideGoalTreeProposal({
    board_id: "board-1",
    proposal_id: secondProposal.proposal_id,
    runtime_actor_id: "runtime-clarifier",
    authority: { ...authority, message_ref: "message://compound-reconciliation-confirm-second" },
    decisions: [
      {
        item_id: "create-reconciliation-trigger",
        decision: "confirm",
        reason: "用户确认独立测试 Goal。",
      },
    ],
    idempotency_key: "compound-reconciliation-second-decision",
  });
  assert.deepEqual(eventCounts(), {
    "newly-accepted-compound-parent": 1,
    "historical-compound-parent": 1,
    "historical-compound-ancestor": 1,
    "incomplete-compound-parent": 0,
  });
  store.close();
});

test("accepted compound closure rejects missing children, invalid transitions, and Contract edits", () => {
  const { store, coordinator } = fixture();
  const dialogue = coordinator.startDraftDialogue({
    board_id: "board-1",
    actor_id: "runtime-clarifier",
    goal_id: "accepted-closure-rejection-context",
    rough_idea: "验证 accepted 父 Goal 收口不会绕过用户确认边界。",
    idempotency_key: "accepted-closure-rejection-dialogue",
  });
  const authority = {
    actor_id: "user-1",
    actor_kind: "user" as const,
    authority_source: "runtime_trusted_host" as const,
    conversation_ref: "conversation://accepted-closure-rejection",
    message_ref: "message://accepted-closure-rejection-confirm",
  };
  const submitAndConfirm = (goalId: string, itemId: string, payload: Record<string, unknown>) => {
    const proposal = coordinator.submitGoalTreeProposal({
      board_id: "board-1",
      actor_id: "runtime-clarifier",
      discovered_in_run_id: dialogue.run!.run_id,
      root_goal_id: goalId,
      summary: `验证 ${goalId} 的收口边界。`,
      items: [
        goalTreeProposalItem({
          item_id: itemId,
          kind: "contract",
          operation: "update",
          payload,
          object_type: "goal",
          object_id: goalId,
        }),
      ],
      idempotency_key: `accepted-closure-rejection-proposal-${goalId}`,
    }).proposal;
    return coordinator.decideGoalTreeProposal({
      board_id: "board-1",
      proposal_id: proposal.proposal_id,
      runtime_actor_id: "runtime-clarifier",
      authority,
      decisions: [{ item_id: itemId, decision: "confirm", reason: "验证受限收口必须拒绝不安全变更。" }],
      idempotency_key: `accepted-closure-rejection-decision-${goalId}`,
    });
  };

  createAcceptedCompoundParent(coordinator, "accepted-closure-no-child");
  const noChild = submitAndConfirm(
    "accepted-closure-no-child",
    "accepted-close-no-child",
    acceptedCompoundClosurePayload(store.getGoal("accepted-closure-no-child")!),
  );
  assert.deepEqual(noChild.conflict_item_ids, ["accepted-close-no-child"]);
  assert.equal(
    (noChild.proposal.items[0]?.conflict as { code?: string } | null)?.code,
    "goal.accepted_compound_closure_children_required",
  );
  assert.equal(store.getGoal("accepted-closure-no-child")?.decomposition_state, "abstract");

  createAcceptedCompoundParent(coordinator, "accepted-closure-invalid-transition");
  createLeaf(coordinator, "accepted-closure-invalid-transition-child");
  coordinator.addRelation(
    "board-1",
    {
      from_goal_id: "accepted-closure-invalid-transition-child",
      to_goal_id: "accepted-closure-invalid-transition",
      type: "part_of",
      reason: "有子 Goal 也不能把 accepted 父级收口为叶子。",
    },
    { actor_id: "user-1", idempotency_key: "accepted-closure-invalid-transition-child-relation" },
  );
  const invalidTransition = submitAndConfirm(
    "accepted-closure-invalid-transition",
    "accepted-close-invalid-transition",
    acceptedCompoundClosurePayload(store.getGoal("accepted-closure-invalid-transition")!, {
      decomposition_state: "closed_leaf",
    }),
  );
  assert.deepEqual(invalidTransition.conflict_item_ids, ["accepted-close-invalid-transition"]);
  assert.equal(
    (invalidTransition.proposal.items[0]?.conflict as { code?: string } | null)?.code,
    "goal.accepted_compound_closure_invalid",
  );
  assert.equal(store.getGoal("accepted-closure-invalid-transition")?.decomposition_state, "abstract");

  createAcceptedCompoundParent(coordinator, "accepted-closure-mutated-contract");
  createLeaf(coordinator, "accepted-closure-mutated-contract-child");
  coordinator.addRelation(
    "board-1",
    {
      from_goal_id: "accepted-closure-mutated-contract-child",
      to_goal_id: "accepted-closure-mutated-contract",
      type: "part_of",
      reason: "先记录已确认子 Goal，再验证 Contract 不可变。",
    },
    { actor_id: "user-1", idempotency_key: "accepted-closure-mutated-contract-child-relation" },
  );
  const mutated = submitAndConfirm(
    "accepted-closure-mutated-contract",
    "accepted-close-mutated-contract",
    acceptedCompoundClosurePayload(store.getGoal("accepted-closure-mutated-contract")!, {
      title: "不允许改写的已接受父 Goal 标题",
    }),
  );
  assert.deepEqual(mutated.conflict_item_ids, ["accepted-close-mutated-contract"]);
  assert.equal(
    (mutated.proposal.items[0]?.conflict as { code?: string } | null)?.code,
    "goal.accepted_contract_immutable",
  );
  assert.equal(store.getGoal("accepted-closure-mutated-contract")?.title, "收口 accepted-closure-mutated-contract");
  assert.equal(store.getGoal("accepted-closure-mutated-contract")?.decomposition_state, "abstract");
  store.close();
});

test("Goal Tree decisions keep independent items, conflicts, cycles, and short confirmations safe", () => {
  const { store, coordinator } = fixture();
  const dialogue = coordinator.startDraftDialogue({
    board_id: "board-1",
    actor_id: "runtime-clarifier",
    rough_idea: "验证用户确认在并发和循环拆分下仍只应用安全条目。",
    goal_id: "decision-conflict-root",
    idempotency_key: "decision-conflict-dialogue",
  });
  const submit = (idempotencyKey: string, items: ReturnType<typeof goalTreeProposalItem>[]) =>
    coordinator.submitGoalTreeProposal({
      board_id: "board-1",
      actor_id: "runtime-clarifier",
      discovered_in_run_id: dialogue.run!.run_id,
      root_goal_id: "decision-conflict-root",
      summary: `测试 ${idempotencyKey}`,
      items,
      idempotency_key: idempotencyKey,
    }).proposal;
  const proposal = submit("decision-conflict-propose", [
    goalTreeProposalItem({
      item_id: "stale-root-contract",
      kind: "contract",
      operation: "update",
      payload: treeGoalPayload({
        goal_id: "decision-conflict-root",
        title: "原始待确认 Contract",
        definition_state: "accepted",
        decomposition_state: "closed_compound",
      }),
      object_type: "goal",
      object_id: "decision-conflict-root",
    }),
    goalTreeProposalItem({
      item_id: "safe-child",
      kind: "goal",
      operation: "create",
      payload: treeGoalPayload({
        goal_id: "decision-conflict-child",
        title: "不受并发影响的 Draft 子 Goal",
        definition_state: "draft",
        decomposition_state: "abstract",
      }),
      object_type: "goal",
      object_id: "decision-conflict-child",
    }),
    goalTreeProposalItem({
      item_id: "safe-child-parent",
      kind: "relation",
      operation: "create",
      payload: {
        from_goal_id: "decision-conflict-child",
        to_goal_id: "decision-conflict-root",
        type: "part_of",
        reason: "独立 Draft 仍属于同一个产品想法。",
      },
      object_type: "relation",
      object_id: "relation:new:decision-conflict-child:decision-conflict-root:part_of",
    }),
  ]);
  store.db
    .prepare("UPDATE goals SET title = ?, updated_at = ? WHERE goal_id = ?")
    .run("另一个 Session 已修改的根 Goal", "2026-08-15T00:05:00.000Z", "decision-conflict-root");
  const authority = {
    actor_id: "user-1",
    actor_kind: "user" as const,
    authority_source: "runtime_trusted_host" as const,
    conversation_ref: "conversation://conflict",
    message_ref: "message://conflict-confirm",
  };
  const result = coordinator.decideGoalTreeProposal({
    board_id: "board-1",
    proposal_id: proposal.proposal_id,
    runtime_actor_id: "runtime-clarifier",
    authority,
    decisions: [
      { item_id: "stale-root-contract", decision: "confirm", reason: "确认旧版本。" },
      { item_id: "safe-child", decision: "confirm", reason: "确认独立子 Goal。" },
      { item_id: "safe-child-parent", decision: "confirm", reason: "确认父子关系。" },
    ],
    idempotency_key: "decision-conflict-apply",
  });
  assert.deepEqual(result.conflict_item_ids, ["stale-root-contract"]);
  assert.deepEqual(result.applied_item_ids.sort(), ["safe-child", "safe-child-parent"]);
  assert.equal(result.proposal.state, "partially_applied");
  assert.equal(store.getGoal("decision-conflict-root")?.title, "另一个 Session 已修改的根 Goal");
  assert.ok(store.getGoal("decision-conflict-child"));

  const cycleProposal = submit("decision-cycle-propose", [
    goalTreeProposalItem({
      item_id: "cycle-relation",
      kind: "relation",
      operation: "create",
      payload: {
        from_goal_id: "decision-conflict-root",
        to_goal_id: "decision-conflict-child",
        type: "part_of",
        reason: "故意反向确认，验证不能形成父子循环。",
      },
      object_type: "relation",
      object_id: "relation:new:decision-conflict-root:decision-conflict-child:part_of",
    }),
  ]);
  const cycle = coordinator.decideGoalTreeProposal({
    board_id: "board-1",
    proposal_id: cycleProposal.proposal_id,
    runtime_actor_id: "runtime-clarifier",
    authority: { ...authority, message_ref: "message://cycle-confirm" },
    decisions: [{ item_id: "cycle-relation", decision: "confirm", reason: "尝试反向关系。" }],
    idempotency_key: "decision-cycle-apply",
  });
  assert.deepEqual(cycle.conflict_item_ids, ["cycle-relation"]);
  assert.equal(
    store.snapshot("board-1").relations.some(
      (relation) =>
        relation.from_goal_id === "decision-conflict-root" &&
        relation.to_goal_id === "decision-conflict-child" &&
        relation.type === "part_of" &&
        relation.state === "active",
    ),
    false,
  );

  const confirmationA = submit("decision-ambiguity-a", [
    goalTreeProposalItem({
      item_id: "ambiguity-a",
      kind: "goal",
      operation: "create",
      payload: treeGoalPayload({
        goal_id: "ambiguity-a-goal",
        title: "第一份等待确认的 Draft",
        definition_state: "draft",
        decomposition_state: "abstract",
      }),
      object_type: "goal",
      object_id: "ambiguity-a-goal",
    }),
  ]);
  assert.throws(
    () =>
      coordinator.decideGoalTreeProposal({
        board_id: "board-1",
        proposal_id: confirmationA.proposal_id,
        runtime_actor_id: "runtime-clarifier",
        authority: { ...authority, actor_kind: "runtime" as never },
        decisions: [{ item_id: "ambiguity-a", decision: "confirm", reason: "Runtime 不能伪装用户。" }],
        idempotency_key: "decision-untrusted",
      }),
    (error: unknown) => error instanceof GoalBoardV1Error && error.code === "goal_tree_proposal.user_authority_required",
  );
  assert.throws(
    () =>
      coordinator.decideGoalTreeProposal({
        board_id: "board-1",
        proposal_id: confirmationA.proposal_id,
        runtime_actor_id: "runtime-clarifier",
        authority,
        reason: "嗯，确认。",
        confirm_all_pending: true,
        idempotency_key: "decision-short-not-prompted",
      }),
    (error: unknown) => error instanceof GoalBoardV1Error && error.code === "goal_tree_proposal.whole_confirmation_ambiguous",
  );
  const confirmationB = submit("decision-ambiguity-b", [
    goalTreeProposalItem({
      item_id: "ambiguity-b",
      kind: "goal",
      operation: "create",
      payload: treeGoalPayload({
        goal_id: "ambiguity-b-goal",
        title: "第二份等待确认的 Draft",
        definition_state: "draft",
        decomposition_state: "abstract",
      }),
      object_type: "goal",
      object_id: "ambiguity-b-goal",
    }),
  ]);
  assert.throws(
    () =>
      coordinator.decideGoalTreeProposal({
        board_id: "board-1",
        proposal_id: confirmationB.proposal_id,
        runtime_actor_id: "runtime-clarifier",
        authority: { ...authority, whole_confirmation_prompted: true },
        reason: "确认。",
        confirm_all_pending: true,
        idempotency_key: "decision-short-ambiguous",
      }),
    (error: unknown) => error instanceof GoalBoardV1Error && error.code === "goal_tree_proposal.whole_confirmation_ambiguous",
  );
  assert.equal(store.getGoal("ambiguity-a-goal"), null);
  assert.equal(store.getGoal("ambiguity-b-goal"), null);
  store.close();
});

test("a failed unified Goal Tree submission leaves neither proposal rows nor canonical writes", () => {
  const { store, coordinator } = fixture();
  const dialogue = coordinator.startDraftDialogue({
    board_id: "board-1",
    actor_id: "runtime-clarifier",
    rough_idea: "失败时不能留下半份 Goal Tree 提案。",
    goal_id: "atomic-tree-root",
    idempotency_key: "atomic-tree-dialogue-start",
  });
  const beforeGoals = store.snapshot("board-1").goals;
  store.db.exec(`
    CREATE TRIGGER reject_goal_tree_item
    BEFORE INSERT ON goal_tree_proposal_items
    BEGIN
      SELECT RAISE(ABORT, 'forced goal tree item failure');
    END;
  `);
  assert.throws(
    () =>
      coordinator.submitGoalTreeProposal({
        board_id: "board-1",
        actor_id: "runtime-clarifier",
        discovered_in_run_id: dialogue.run!.run_id,
        root_goal_id: "atomic-tree-root",
        summary: "这份提案应整体回滚。",
        items: [
          goalTreeProposalItem({
            kind: "goal",
            operation: "create",
            payload: { goal_id: "would-be-child" },
            object_type: "goal",
            object_id: "would-be-child",
          }),
        ],
        idempotency_key: "atomic-tree-submit",
      }),
    /forced goal tree item failure/,
  );
  assert.equal(store.snapshot("board-1").goal_tree_proposals.length, 0);
  assert.deepEqual(store.snapshot("board-1").goals, beforeGoals);
  store.close();
});

test("the unified Goal Tree read view maps legacy Contract Proposals, Candidates, and Rewires without rewriting history", () => {
  const { store, coordinator } = fixture();
  const dialogue = coordinator.startDraftDialogue({
    board_id: "board-1",
    actor_id: "runtime-clarifier",
    rough_idea: "历史提案也必须能被统一读取。",
    goal_id: "legacy-draft",
    idempotency_key: "legacy-tree-dialogue-start",
  });
  createLeaf(coordinator, "legacy-provider");
  const legacyContractGoal = {
    goal_id: "legacy-draft",
    title: "历史 Draft 的完整 Contract",
    outcome: "历史 Contract Proposal 能被统一视图读取",
    why: "升级新模型时不能丢失旧用户决定和来源",
    business_logic: "保留旧 Contract Proposal 的原始内容，并将它映射为统一提案的一条 Contract item。",
    in_scope: ["历史映射"],
    out_of_scope: [],
    constraints: [],
    required_inputs: [],
    promised_outputs: ["统一读取结果"],
    definition_state: "accepted" as const,
    decomposition_state: "closed_leaf" as const,
    priority: 50,
    acceptance_criteria: [
      {
        criterion_id: "legacy-contract-view",
        statement: "统一视图返回历史 Contract Proposal 内容",
        decision_method: "inspection" as const,
        pass_condition: "字段、来源和状态均与旧记录一致",
      },
    ],
  };
  const legacyContract = coordinator.submitContractProposal({
    board_id: "board-1",
    goal_id: "legacy-draft",
    actor_id: "runtime-clarifier",
    discovered_in_run_id: dialogue.run!.run_id,
    proposed_goal: legacyContractGoal,
    field_sources: contractFieldSources(dialogue.run!.run_id) as never,
    review_policy: {
      goal_mode: "preferred",
      required_capabilities: [],
      self_verification: true,
      cross_reviewers: 0,
      adversarial_reviewers: 0,
      human_approval: false,
      max_lease_seconds: 1800,
    },
    idempotency_key: "legacy-tree-contract",
  }).proposal;
  const legacyCandidate = coordinator.submitCandidate({
    board_id: "board-1",
    actor_id: "runtime-clarifier",
    discovered_in_run_id: dialogue.run!.run_id,
    proposed_goal: {
      goal_id: "legacy-candidate-goal",
      title: "历史 Candidate",
      outcome: "候选 Goal 内容可被统一读取",
      why: "验证映射不会丢失 Candidate",
      business_logic: "旧 Candidate 保持原记录，同时在统一视图中表现为一个 candidate item。",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [
        {
          criterion_id: "legacy-candidate-view",
          statement: "候选内容可读",
          decision_method: "inspection",
          pass_condition: "统一视图包含原始 Candidate",
        },
      ],
    },
    idempotency_key: "legacy-tree-candidate",
  }).candidate;
  const legacyRewire = coordinator.submitDependencyProposal({
    board_id: "board-1",
    actor_id: "runtime-clarifier",
    discovered_in_run_id: dialogue.run!.run_id,
    dependencies: [
      dependencyProposal("legacy-draft", "legacy-provider", "历史 Draft 依赖已有 Provider"),
    ],
    idempotency_key: "legacy-tree-rewire",
  }).rewire;

  const unified = coordinator.listGoalTreeProposals({ board_id: "board-1" }).proposals;
  assert.equal(store.snapshot("board-1").goal_tree_proposals.length, 0);
  assert.equal(unified.filter((proposal) => proposal.origin !== "native").length, 3);
  const mappedContract = unified.find(
    (proposal) => proposal.proposal_id === `legacy-contract-proposal:${legacyContract.proposal_id}`,
  );
  assert.equal(mappedContract?.origin, "legacy_contract_proposal");
  assert.deepEqual(mappedContract?.items[0]?.payload.proposed_goal, legacyContractGoal);
  assert.deepEqual(mappedContract?.items[0]?.payload.field_sources, legacyContract.field_sources);
  assert.equal(mappedContract?.state, legacyContract.state);
  const mappedCandidate = unified.find(
    (proposal) => proposal.proposal_id === `legacy-candidate:${legacyCandidate.candidate_id}`,
  );
  assert.equal(mappedCandidate?.origin, "legacy_candidate");
  assert.deepEqual(mappedCandidate?.items[0]?.payload.proposed_goal, legacyCandidate.proposed_goal);
  assert.equal(mappedCandidate?.state, legacyCandidate.state);
  const mappedRewire = unified.find(
    (proposal) => proposal.proposal_id === `legacy-rewire:${legacyRewire.rewire_id}`,
  );
  assert.equal(mappedRewire?.origin, "legacy_rewire");
  assert.deepEqual(mappedRewire?.items[0]?.payload, legacyRewire.proposal);
  assert.equal(mappedRewire?.decision?.legacy_state, legacyRewire.state);
  store.close();
});

test("Candidate validation prevents unrecoverable Rewires and unbound current-run blockers", () => {
  const { store, coordinator } = fixture();
  createLeaf(coordinator, "candidate-source");
  const proposedGoal = {
    goal_id: "candidate-target",
    title: "候选最小 Goal",
    outcome: "候选结果可以独立验收",
    why: "避免扩大当前 Goal",
    business_logic: "新发现的工作独立形成 Goal，用户确认关系后再进入执行。",
    decomposition_state: "closed_leaf" as const,
    acceptance_criteria: [
      {
        criterion_id: "candidate-target-result",
        statement: "候选结果存在",
        decision_method: "inspection" as const,
        pass_condition: "用户可以检查候选结果",
      },
    ],
  };
  const before = store.snapshot("board-1").candidates.length;
  assert.throws(
    () =>
      coordinator.submitCandidate({
        board_id: "board-1",
        actor_id: "runtime-a",
        proposed_goal: proposedGoal,
        proposed_relations: [
          {
            from_goal_id: "candidate-source",
            to_goal_id: "$new_goal",
            type: "invented_relation",
            reason: "非法关系不应进入待确认状态",
          },
        ],
        idempotency_key: "invalid-candidate-relation",
      }),
    (error) =>
      error instanceof GoalBoardV1Error && error.code === "candidate.relation_invalid",
  );
  assert.equal(store.snapshot("board-1").candidates.length, before);
  assert.equal(store.getGoal("candidate-target"), null);
  assert.throws(
    () =>
      coordinator.submitCandidate({
        board_id: "board-1",
        actor_id: "runtime-a",
        proposed_goal: proposedGoal,
        blocking_mode: "current_run",
        idempotency_key: "unbound-current-run-candidate",
      }),
    (error) => error instanceof GoalBoardV1Error && error.code === "candidate.run_required",
  );
  assert.equal(store.snapshot("board-1").candidates.length, before);
  store.close();
});

test("Dependency Proposal requires reviewable evidence and only a user-applied Rewire changes active relations", () => {
  const { store, coordinator } = fixture();
  createLeaf(coordinator, "consumer");
  createLeaf(coordinator, "provider");
  const claim = coordinator.claimGoal({
    board_id: "board-1",
    goal_id: "consumer",
    actor_id: "runtime-a",
    idempotency_key: "dependency-proposal-claim",
  }).claim;
  assert.ok(claim);
  const run = coordinator.startRun({
    board_id: "board-1",
    claim_id: claim.claim_id,
    actor_id: "runtime-a",
    idempotency_key: "dependency-proposal-run",
  }).run;

  assert.throws(
    () =>
      coordinator.submitDependencyProposal({
        board_id: "board-1",
        actor_id: "runtime-a",
        discovered_in_run_id: run.run_id,
        dependencies: [
          {
            from_goal_id: "consumer",
            to_goal_id: "provider",
            type: "depends_on",
            reason: "consumer 使用 provider 的结果",
          },
        ],
        idempotency_key: "dependency-proposal-incomplete",
      }),
    (error) =>
      error instanceof GoalBoardV1Error && error.code === "dependency_proposal.field_missing",
  );
  assert.equal(store.snapshot("board-1").rewires.length, 0);

  const addProposal = coordinator.submitDependencyProposal({
    board_id: "board-1",
    actor_id: "runtime-a",
    discovered_in_run_id: run.run_id,
    dependencies: [
      dependencyProposal("consumer", "provider", "consumer 的验收输入由 provider 产出"),
    ],
    blocking_mode: "current_run",
    idempotency_key: "dependency-proposal-add",
  }).rewire;
  assert.equal(addProposal.state, "pending");
  assert.equal(addProposal.proposal.proposal_kind, "dependency");
  assert.equal(store.snapshot("board-1").relations.length, 0);
  assert.equal(
    addProposal.proposal.relations?.[0]?.direction_reason,
    "consumer 消费 provider 的承诺结果，反方向没有对应输入",
  );
  assert.ok(
    coordinator
      .readGoalContract("board-1", "consumer")
      .rewires.some((rewire) => rewire.rewire_id === addProposal.rewire_id),
  );
  const pendingCompletion = coordinator.evaluateLeafCompletion({
    board_id: "board-1",
    goal_id: "consumer",
    actor_id: "runtime-a",
    idempotency_key: "dependency-proposal-completion-pending",
  });
  assert.ok(
    pendingCompletion.reasons.some(
      (reason) =>
        reason.code === "rewire.user_confirmation_required" &&
        reason.subject_id === addProposal.rewire_id,
    ),
  );
  assert.throws(
    () =>
      coordinator.confirmRewire({
        board_id: "board-1",
        rewire_id: addProposal.rewire_id,
        actor_id: "runtime-a",
        actor_kind: "runtime",
        reason: "Runtime 不能自批",
        idempotency_key: "dependency-proposal-runtime-confirm",
      }),
    (error) =>
      error instanceof GoalBoardV1Error && error.code === "rewire.user_confirmation_required",
  );
  const applied = coordinator.confirmRewire({
    board_id: "board-1",
    rewire_id: addProposal.rewire_id,
    actor_id: "user-1",
    actor_kind: "user",
    reason: "证据和方向成立，确认新增依赖",
    idempotency_key: "dependency-proposal-user-confirm-add",
  }).rewire;
  assert.equal(applied.state, "applied");
  assert.equal(store.getGoal("consumer")?.validity_state, "needs_revalidation");
  assert.ok(
    store.snapshot("board-1").relations.some(
      (relation) =>
        relation.from_goal_id === "consumer" &&
        relation.to_goal_id === "provider" &&
        relation.type === "depends_on" &&
        relation.state === "active",
    ),
  );

  const rejectedRemoval = coordinator.submitDependencyProposal({
    board_id: "board-1",
    actor_id: "runtime-a",
    discovered_in_run_id: run.run_id,
    dependencies: [
      dependencyProposal(
        "consumer",
        "provider",
        "代码调整后 consumer 不再读取 provider 输出",
        "deactivate",
      ),
    ],
    idempotency_key: "dependency-proposal-deactivate-rejected",
  }).rewire;
  coordinator.confirmRewire({
    board_id: "board-1",
    rewire_id: rejectedRemoval.rewire_id,
    actor_id: "user-1",
    actor_kind: "user",
    decision: "rejected",
    reason: "现有证据不足以移除依赖",
    idempotency_key: "dependency-proposal-reject-deactivate",
  });
  assert.ok(
    store.snapshot("board-1").relations.some(
      (relation) => relation.type === "depends_on" && relation.state === "active",
    ),
  );

  const confirmedRemoval = coordinator.submitDependencyProposal({
    board_id: "board-1",
    actor_id: "runtime-a",
    discovered_in_run_id: run.run_id,
    dependencies: [
      {
        ...dependencyProposal(
          "consumer",
          "provider",
          "更新后的 Contract 已取消 provider 输入",
          "deactivate",
        ),
        basis: "code_reference",
        evidence_refs: ["src/domain/consumer.ts", "tests/consumer.test.ts"],
        confidence: 0.96,
      },
    ],
    idempotency_key: "dependency-proposal-deactivate-confirmed",
  }).rewire;
  const removed = coordinator.confirmRewire({
    board_id: "board-1",
    rewire_id: confirmedRemoval.rewire_id,
    actor_id: "user-1",
    actor_kind: "user",
    reason: "新证据证明可以移除依赖",
    idempotency_key: "dependency-proposal-confirm-deactivate",
  }).rewire;
  assert.equal(removed.state, "applied");
  assert.ok(
    store.snapshot("board-1").relations.some(
      (relation) => relation.type === "depends_on" && relation.state === "inactive",
    ),
  );
  assert.ok(Array.isArray(removed.impact.deactivated_relation_ids));
  store.close();
});

test("Candidate idempotency replays the original result after approval changes Board state", () => {
  const { store, coordinator } = fixture();
  createLeaf(coordinator, "candidate-replay-source");
  const claim = coordinator.claimGoal({
    board_id: "board-1",
    goal_id: "candidate-replay-source",
    actor_id: "runtime-a",
    idempotency_key: "candidate-replay-claim",
  }).claim;
  assert.ok(claim);
  const run = coordinator.startRun({
    board_id: "board-1",
    claim_id: claim.claim_id,
    actor_id: "runtime-a",
    idempotency_key: "candidate-replay-run",
  }).run;
  const input = {
    board_id: "board-1",
    actor_id: "runtime-a",
    discovered_in_run_id: run.run_id,
    proposed_goal: {
      goal_id: "candidate-replay-target",
      title: "可重放的候选 Goal",
      outcome: "重复请求返回同一个 Candidate",
      why: "网络重试不能创造分叉状态",
      business_logic: "Runtime 使用相同幂等键重试时，GoalBoard 返回首次写入结果。",
      decomposition_state: "closed_leaf" as const,
      acceptance_criteria: [
        {
          criterion_id: "candidate-replay-result",
          statement: "相同请求返回相同 Candidate",
          decision_method: "automated_check" as const,
          pass_condition: "candidate_id 相同且 replayed=true",
        },
      ],
    },
    proposed_relations: [
      dependencyProposal(
        "candidate-replay-source",
        "$new_goal",
        "原 Goal 后续依赖新发现的结果",
      ),
    ],
    blocking_mode: "current_run" as const,
    idempotency_key: "candidate-replay-submit",
  };
  const first = coordinator.submitCandidate(input);
  coordinator.decideCandidate({
    board_id: "board-1",
    candidate_id: first.candidate.candidate_id,
    actor_id: "user-1",
    actor_kind: "user",
    decision: "approved",
    reason: "批准候选以改变 Board 状态",
    idempotency_key: "candidate-replay-approve",
  });
  assert.ok(store.getGoal("candidate-replay-target"));
  const replay = coordinator.submitCandidate(input);
  assert.equal(replay.replayed, true);
  assert.equal(replay.candidate.candidate_id, first.candidate.candidate_id);
  store.close();
});

test("CLI and MCP operate on the same SQLite truth and return the same Ready semantics", async () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-v1-interfaces-"));
  const databasePath = join(directory, "goalboard.db");
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  try {
    assert.equal(
      await runV1Cli([
        "init",
        "--db",
        databasePath,
        "--json",
        JSON.stringify({
          board_id: "shared-board",
          title: "共享真相",
          actor_id: "user-1",
          idempotency_key: "shared-init",
        }),
      ]),
      0,
    );
    assert.equal(
      await runV1Cli([
        "create-goal",
        "--db",
        databasePath,
        "--json",
        JSON.stringify({
          board_id: "shared-board",
          actor_id: "user-1",
          idempotency_key: "shared-goal",
          goal: {
            goal_id: "shared-leaf",
            title: "共享叶子 Goal",
            outcome: "CLI 和 MCP 看到同一个可领取结果",
            why: "证明所有入口没有各自维护状态",
            business_logic: "用户只维护一份真相，Runtime 从任何接口看到的可执行工作都一致。",
            definition_state: "accepted",
            decomposition_state: "closed_leaf",
            acceptance_criteria: [
              {
                criterion_id: "shared-criterion",
                statement: "两个接口返回同一 Goal",
                decision_method: "automated_check",
                pass_condition: "Goal ID 和 Ready 结果一致",
              },
            ],
          },
        }),
      ]),
      0,
    );
    logs.length = 0;
    assert.equal(
      await runV1Cli([
        "contract",
        "--db",
        databasePath,
        "--json",
        JSON.stringify({ board_id: "shared-board", goal_id: "shared-leaf" }),
        "--web-base-url",
        "https://goalboard.example/app/",
      ]),
      0,
    );
    const cliContract = JSON.parse(logs.at(-1) ?? "{}") as {
      goal: { goal_id: string };
      goal_path: string;
      goal_url: string;
    };
    assert.equal(cliContract.goal.goal_id, "shared-leaf");
    assert.equal(cliContract.goal_path, "/goals/shared-leaf");
    assert.equal(cliContract.goal_url, "https://goalboard.example/goals/shared-leaf");
  } finally {
    console.log = originalLog;
  }

  const server = new GoalBoardServer("runtime", {
    databasePath,
    boardId: "shared-board",
    webBaseUrl: "https://goalboard.example/app/",
  });
  const ready = JSON.parse(
    await server.callTool("goalboard_v1_ready", {
      board_id: "shared-board",
      actor_id: "runtime-mcp",
    }),
  ) as { ready: Array<{ goal: { goal_id: string } }> };
  assert.deepEqual(ready.ready.map((item) => item.goal.goal_id), ["shared-leaf"]);

  const claim = JSON.parse(
    await server.callTool("goalboard_v1_claim", {
      board_id: "shared-board",
      goal_id: "shared-leaf",
      actor_id: "runtime-mcp",
      idempotency_key: "shared-claim",
    }),
  ) as { allowed: boolean; claim: { actor_id: string } };
  assert.equal(claim.allowed, true);

  const store = new SqliteGoalBoardStore(databasePath);
  assert.equal(store.snapshot("shared-board").claims[0]?.actor_id, "runtime-mcp");
  store.close();
});

test("approved Candidate creates a pending Rewire and confirmation never retargets an active Run", () => {
  const { store, coordinator } = fixture();
  createLeaf(coordinator, "active-work");
  const claim = coordinator.claimGoal({
    board_id: "board-1",
    goal_id: "active-work",
    actor_id: "runtime-a",
    idempotency_key: "rewire-active-claim",
  }).claim;
  assert.ok(claim);
  const run = coordinator.startRun({
    board_id: "board-1",
    claim_id: claim.claim_id,
    actor_id: "runtime-a",
    idempotency_key: "rewire-active-run",
  }).run;
  const candidate = coordinator.submitCandidate({
    board_id: "board-1",
    actor_id: "runtime-a",
    discovered_in_run_id: run.run_id,
    proposed_goal: {
      goal_id: "new-required-work",
      title: "补充必要前置工作",
      outcome: "当前工作依赖的新结果被单独完成",
      why: "执行中确认了原 Goal 外的必要依赖",
      business_logic: "新工作单独验收，用户确认依赖线路后，原工作重新验证但活动 Run 不改目标。",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [
        {
          criterion_id: "new-required-work-c1",
          statement: "新前置结果可用",
          decision_method: "inspection",
          pass_condition: "产物通过检查",
        },
      ],
    },
    proposed_relations: [
      dependencyProposal("active-work", "$new_goal", "原工作依赖新发现的结果"),
    ],
    proposed_risks: [
      {
        risk_id: "new-work-input-risk",
        goal_ids: ["$new_goal"],
        description: "新前置结果仍缺少已确认输入",
        probability: "medium",
        impact: "错误执行会让原工作失去依据",
        affected_surfaces: ["new-required-work"],
        trigger: "输入来源未确认",
        treatment: "mitigate",
        blocking_mode: "claim",
        revisit_condition: "用户确认输入来源",
        owner: "user-1",
      },
    ],
    blocking_mode: "current_run",
    idempotency_key: "rewire-candidate-submit",
  }).candidate;
  const approved = coordinator.decideCandidate({
    board_id: "board-1",
    candidate_id: candidate.candidate_id,
    actor_id: "user-1",
    actor_kind: "user",
    decision: "approved",
    reason: "确认这是独立的新目标",
    idempotency_key: "rewire-candidate-approve",
  }).candidate;
  assert.equal(approved.state, "approved");
  const pending = store.snapshot("board-1").rewires[0];
  assert.equal(pending?.state, "pending");
  assert.equal(store.getGoal("new-required-work")?.validity_state, "needs_revalidation");
  const completionBeforeRewire = coordinator.evaluateLeafCompletion({
    board_id: "board-1",
    goal_id: "active-work",
    actor_id: "runtime-a",
    idempotency_key: "completion-before-rewire",
  });
  assert.equal(completionBeforeRewire.satisfied, false);
  assert.ok(
    completionBeforeRewire.reasons.some(
      (item) => item.code === "rewire.user_confirmation_required",
    ),
  );
  assert.throws(
    () =>
      coordinator.confirmRewire({
        board_id: "board-1",
        rewire_id: pending.rewire_id,
        actor_id: "runtime-a",
        actor_kind: "runtime",
        reason: "Runtime 尝试确认",
        idempotency_key: "rewire-runtime-confirm",
      }),
    (error) =>
      error instanceof GoalBoardV1Error && error.code === "rewire.user_confirmation_required",
  );
  const applied = coordinator.confirmRewire({
    board_id: "board-1",
    rewire_id: pending.rewire_id,
    actor_id: "user-1",
    actor_kind: "user",
    reason: "确认新依赖线路和影响",
    idempotency_key: "rewire-user-confirm",
  }).rewire;
  assert.equal(applied.state, "applied");
  const snapshot = store.snapshot("board-1");
  assert.equal(snapshot.runs.find((item) => item.run_id === run.run_id)?.goal_id, "active-work");
  assert.equal(store.getGoal("new-required-work")?.validity_state, "valid");
  assert.equal(store.getGoal("active-work")?.validity_state, "needs_revalidation");
  assert.ok(snapshot.risks.some((item) => item.risk_id === "new-work-input-risk"));
  assert.ok(
    coordinator
      .explainGoal({
        board_id: "board-1",
        goal_id: "new-required-work",
        actor_id: "runtime-b",
        role: "executor",
      })
      .reasons.some((item) => item.code === "risk.blocks_claim"),
  );
  assert.ok(
    snapshot.relations.some(
      (item) =>
        item.from_goal_id === "active-work" &&
        item.to_goal_id === "new-required-work" &&
        item.type === "depends_on",
    ),
  );
  store.close();
});

test("user can accept a Candidate Goal while rejecting its proposed Rewire", () => {
  const { store, coordinator } = fixture();
  createLeaf(coordinator, "current-work");
  const claim = coordinator.claimGoal({
    board_id: "board-1",
    goal_id: "current-work",
    actor_id: "runtime-a",
    idempotency_key: "reject-rewire-claim",
  }).claim;
  assert.ok(claim);
  const run = coordinator.startRun({
    board_id: "board-1",
    claim_id: claim.claim_id,
    actor_id: "runtime-a",
    idempotency_key: "reject-rewire-run",
  }).run;
  const candidate = coordinator.submitCandidate({
    board_id: "board-1",
    actor_id: "runtime-a",
    discovered_in_run_id: run.run_id,
    proposed_goal: {
      goal_id: "independent-new-goal",
      title: "保留为独立新 Goal",
      outcome: "新需求被单独记录",
      why: "用户认可需求存在，但不认可它阻塞当前工作",
      business_logic: "新 Goal 独立进入 Goal Tree，不改变当前 Goal 的完成线路。",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [
        {
          criterion_id: "independent-new-goal-c1",
          statement: "新 Goal 可独立验收",
          decision_method: "inspection",
          pass_condition: "独立结果可检查",
        },
      ],
    },
    proposed_relations: [
      dependencyProposal(
        "current-work",
        "$new_goal",
        "Runtime 推测它是当前工作的前置依赖",
      ),
    ],
    blocking_mode: "current_run",
    idempotency_key: "reject-rewire-candidate",
  }).candidate;
  coordinator.decideCandidate({
    board_id: "board-1",
    candidate_id: candidate.candidate_id,
    actor_id: "user-1",
    actor_kind: "user",
    decision: "approved",
    reason: "同意新 Goal 存在",
    idempotency_key: "reject-rewire-approve-candidate",
  });
  const pending = store.snapshot("board-1").rewires.find((item) => item.state === "pending");
  assert.ok(pending);
  assert.throws(
    () =>
      coordinator.confirmRewire({
        board_id: "board-1",
        rewire_id: pending.rewire_id,
        actor_id: "runtime-a",
        actor_kind: "runtime",
        decision: "rejected",
        reason: "Runtime 不能替用户拒绝",
        idempotency_key: "runtime-reject-rewire",
      }),
    (error) =>
      error instanceof GoalBoardV1Error && error.code === "rewire.user_confirmation_required",
  );
  const rejected = coordinator.confirmRewire({
    board_id: "board-1",
    rewire_id: pending.rewire_id,
    actor_id: "user-1",
    actor_kind: "user",
    decision: "rejected",
    reason: "保留新 Goal，但不让它阻塞当前 Goal",
    idempotency_key: "user-reject-rewire",
  }).rewire;
  assert.equal(rejected.state, "rejected");
  assert.equal(rejected.impact.proposed_changes_applied, false);
  assert.equal(store.getGoal("independent-new-goal")?.validity_state, "valid");
  assert.equal(store.getGoal("current-work")?.validity_state, "valid");
  assert.ok(
    !store.snapshot("board-1").relations.some(
      (relation) =>
        relation.from_goal_id === "current-work" &&
        relation.to_goal_id === "independent-new-goal" &&
        relation.type === "depends_on",
    ),
  );
  const completion = coordinator.evaluateLeafCompletion({
    board_id: "board-1",
    goal_id: "current-work",
    actor_id: "runtime-a",
    idempotency_key: "completion-after-rewire-rejection",
  });
  assert.ok(!completion.reasons.some((reason) => reason.code === "rewire.user_confirmation_required"));
  store.close();
});

test("human approval Review requires an explicitly trusted user actor", () => {
  const { store, coordinator } = fixture();
  createLeaf(coordinator, "human-reviewed-goal");
  coordinator.setPolicy(
    "board-1",
    {
      goal_id: "human-reviewed-goal",
      policy: { human_approval: true },
      reason: "这项结果需要用户确认",
    },
    { actor_id: "user-1", idempotency_key: "human-review-policy" },
  );
  const claim = coordinator.claimGoal({
    board_id: "board-1",
    goal_id: "human-reviewed-goal",
    actor_id: "runtime-a",
    idempotency_key: "human-reviewed-claim",
  }).claim;
  assert.ok(claim);
  const run = coordinator.startRun({
    board_id: "board-1",
    claim_id: claim.claim_id,
    actor_id: "runtime-a",
    idempotency_key: "human-reviewed-run",
  }).run;
  coordinator.reportRun({
    board_id: "board-1",
    run_id: run.run_id,
    actor_id: "runtime-a",
    state: "completed",
    idempotency_key: "human-reviewed-run-completed",
  });
  coordinator.releaseClaim({
    board_id: "board-1",
    claim_id: claim.claim_id,
    actor_id: "runtime-a",
    reason: "交给用户确认",
    idempotency_key: "human-reviewed-release",
  });
  const obligation = store
    .snapshot("board-1")
    .review_obligations.find((item) => item.role === "human_approver");
  assert.ok(obligation);
  assert.throws(
    () =>
      coordinator.submitReview({
        board_id: "board-1",
        goal_id: "human-reviewed-goal",
        obligation_id: obligation.obligation_id,
        actor_id: "runtime-a",
        actor_kind: "runtime",
        verdict: "pass",
        reasoning: "Runtime 不应替用户批准",
        idempotency_key: "runtime-human-review",
      }),
    (error) =>
      error instanceof GoalBoardV1Error && error.code === "review.user_authority_required",
  );
  const review = coordinator.submitReview({
    board_id: "board-1",
    goal_id: "human-reviewed-goal",
    obligation_id: obligation.obligation_id,
    actor_id: "user-1",
    actor_kind: "user",
    verdict: "pass",
    reasoning: "用户确认结果符合业务预期",
    idempotency_key: "user-human-review",
  }).review;
  assert.equal(review.verdict, "pass");
  store.close();
});

test("V3 import preserves safe structure and explicitly refuses to invent completion semantics", () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-v3-import-"));
  const store = new SqliteGoalBoardStore(join(directory, "import.db"));
  const coordinator = new GoalBoardCoordinator(store);
  const legacy = {
    schema_version: "3.0",
    goal_id: "legacy-board",
    meta: {
      title: "旧版目标",
      source: { seed: "交付旧版目标" },
    },
    root_goal: {
      constraints: ["不破坏公开接口"],
    },
    coverage_ledger: [
      {
        id: "r1",
        requirement: "核心流程",
        status: "now",
        owner_goal: "g2",
      },
      {
        id: "r2",
        requirement: "未来扩展",
        status: "later",
        owner_goal: null,
        revisit_at: "V1 发布后",
      },
    ],
    goals: [
      {
        id: "g1",
        parent: null,
        one_liner: "交付旧版目标",
        covers: [],
        inputs: [],
        outputs: ["结果"],
      },
      {
        id: "g2",
        parent: "g1",
        one_liner: "完成核心流程",
        covers: ["r1"],
        inputs: ["需求"],
        outputs: ["核心流程"],
      },
    ],
  } satisfies LegacyV3ImportInput;
  const report = importV3Board(store, coordinator, legacy, {
    target_board_id: "imported-board",
    actor_id: "user-1",
    idempotency_key: "import-v3",
  });
  assert.equal(report.board_id, "imported-board");
  assert.ok(report.regenerate.some((item) => item.includes("业务逻辑")));
  assert.ok(report.regenerate.some((item) => item.includes("accepted / satisfied")));
  const snapshot = store.snapshot("imported-board");
  assert.equal(snapshot.goals.length, 2);
  assert.ok(snapshot.goals.every((goal) => goal.definition_state === "draft"));
  assert.ok(snapshot.goals.every((goal) => goal.fulfillment_state === "unmet"));
  assert.equal(snapshot.relations[0]?.type, "part_of");
  const coverage = store.db
    .prepare("SELECT disposition FROM coverage_items WHERE board_id = ? ORDER BY requirement_id")
    .all("imported-board") as Array<{ disposition: string }>;
  assert.deepEqual(coverage.map((item) => item.disposition), ["covered", "deferred"]);
  assert.throws(
    () =>
      importV3Board(store, coordinator, legacy, {
        target_board_id: "imported-board",
        actor_id: "user-1",
        idempotency_key: "import-v3-again",
      }),
    /不会覆盖/,
  );
  store.close();
});

test("two Runtime processes racing to select one Goal produce exactly one Claim and Run", async () => {
  const { store, coordinator } = fixture();
  const databasePath = store.path;
  createLeaf(coordinator, "race-goal");
  store.close();
  const startAt = Date.now() + 350;
  const worker = `
    const { SqliteGoalBoardStore, GoalBoardCoordinator } = await import('./dist/index.js');
    const wait = Math.max(0, Number(process.env.START_AT) - Date.now());
    await new Promise(resolve => setTimeout(resolve, wait));
    const store = new SqliteGoalBoardStore(process.env.GOAL_DB);
    try {
      const result = new GoalBoardCoordinator(store).selectGoalAndStart({
        board_id: 'board-1', goal_id: 'race-goal', actor_id: process.env.ACTOR,
        idempotency_key: 'race-' + process.env.ACTOR
      });
      process.stdout.write(JSON.stringify({ allowed: result.allowed, actor: process.env.ACTOR }));
    } finally { store.close(); }
  `;
  const run = (actor: string) =>
    execFileAsync(process.execPath, ["--input-type=module", "-e", worker], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        GOAL_DB: databasePath,
        ACTOR: actor,
        START_AT: String(startAt),
      },
    });
  const results = await Promise.all([run("runtime-a"), run("runtime-b")]);
  const decisions = results.map((result) => JSON.parse(result.stdout) as { allowed: boolean });
  assert.equal(decisions.filter((item) => item.allowed).length, 1);
  const verify = new SqliteGoalBoardStore(databasePath);
  const activeClaims = verify.snapshot("board-1").claims.filter((item) => item.state === "active");
  assert.equal(activeClaims.length, 1);
  assert.equal(
    verify.snapshot("board-1").runs.filter((item) => ["started", "blocked"].includes(item.state)).length,
    1,
  );
  verify.close();
});

test("Risk operations block Claim and propagate triggered invalidation explicitly", () => {
  const { store, coordinator } = fixture();
  createLeaf(coordinator, "risk-goal");
  createLeaf(coordinator, "risk-linked-goal");
  coordinator.setActiveGoal(
    "board-1",
    { goal_id: "risk-goal", reason: "当前聚焦这个产品结果" },
    { actor_id: "user-1", idempotency_key: "risk-active-goal" },
  );
  assert.equal(store.snapshot("board-1").board.active_goal_id, "risk-goal");
  coordinator.addRisk(
    "board-1",
    {
      risk_id: "claim-risk",
      goal_ids: ["risk-goal"],
      description: "关键输入还没有确认",
      probability: "high",
      impact: "执行结果可能无效",
      trigger: "输入来源仍为空",
      treatment: "mitigate",
      blocking_mode: "claim",
      revisit_condition: "输入来源被用户确认",
      owner: "user-1",
    },
    { actor_id: "user-1", idempotency_key: "risk-add-claim" },
  );
  assert.ok(
    coordinator
      .explainGoal({ board_id: "board-1", goal_id: "risk-goal", actor_id: "runtime-a" })
      .reasons.some((item) => item.code === "risk.blocks_claim"),
  );
  coordinator.setRiskState(
    "board-1",
    { risk_id: "claim-risk", state: "resolved", reason: "输入已经确认" },
    { actor_id: "user-1", idempotency_key: "risk-resolve-claim" },
  );
  assert.equal(
    coordinator.explainGoal({ board_id: "board-1", goal_id: "risk-goal", actor_id: "runtime-a" }).ready,
    true,
  );
  coordinator.addRisk(
    "board-1",
    {
      risk_id: "invalidating-risk",
      goal_ids: ["risk-goal"],
      description: "上游规则可能改变",
      probability: "medium",
      impact: "现有验收依据失效",
      trigger: "上游规则正式改变",
      treatment: "mitigate",
      blocking_mode: "invalidate_on_trigger",
      revisit_condition: "完成重新验证",
      owner: "user-1",
    },
    { actor_id: "user-1", idempotency_key: "risk-add-invalidating" },
  );
  const updateInput = {
    risk_id: "invalidating-risk",
    goal_ids: ["risk-goal", "risk-linked-goal"],
    description: "上游规则已经进入变更窗口",
    probability: "high",
    impact: "现有验收依据与两个关联 Goal 都会失效",
    affected_surfaces: ["contract", "tests"],
    trigger: "上游规则正式发布",
    treatment: "avoid" as const,
    blocking_mode: "invalidate_on_trigger" as const,
    revisit_condition: "规则稳定并完成重新验证",
    owner: "risk-owner",
  };
  const updatedRisk = coordinator.updateRisk(
    "board-1",
    updateInput,
    { actor_id: "user-1", idempotency_key: "risk-update-invalidating", reason: "补齐影响范围和关联 Goal" },
  );
  assert.equal(updatedRisk.risk.description, updateInput.description);
  assert.equal(updatedRisk.risk.treatment, "avoid");
  assert.deepEqual(updatedRisk.risk.affected_surfaces, ["contract", "tests"]);
  assert.deepEqual(
    (store.db.prepare("SELECT goal_id FROM goal_risks WHERE risk_id = ? ORDER BY goal_id").all("invalidating-risk") as Array<{ goal_id: string }>).map((item) => item.goal_id),
    ["risk-goal", "risk-linked-goal"],
  );
  assert.equal(
    coordinator.updateRisk(
      "board-1",
      updateInput,
      { actor_id: "user-1", idempotency_key: "risk-update-invalidating", reason: "补齐影响范围和关联 Goal" },
    ).replayed,
    true,
  );
  coordinator.setRiskState(
    "board-1",
    { risk_id: "invalidating-risk", state: "triggered", reason: "上游规则已改变" },
    { actor_id: "user-1", idempotency_key: "risk-trigger" },
  );
  assert.equal(store.getGoal("risk-goal")?.validity_state, "invalidated");
  assert.equal(store.getGoal("risk-linked-goal")?.validity_state, "invalidated");
  coordinator.updateRisk(
    "board-1",
    { ...updateInput, goal_ids: ["risk-linked-goal"] },
    { actor_id: "user-1", idempotency_key: "risk-unlink-triggered", reason: "当前只影响关联 Goal" },
  );
  assert.equal(store.getGoal("risk-goal")?.validity_state, "needs_revalidation");
  assert.equal(store.getGoal("risk-linked-goal")?.validity_state, "invalidated");
  coordinator.setRiskState(
    "board-1",
    { risk_id: "invalidating-risk", state: "accepted", reason: "用户接受风险，但历史结果仍需重新验证" },
    { actor_id: "user-1", idempotency_key: "risk-accept-invalidating" },
  );
  assert.equal(store.getGoal("risk-linked-goal")?.validity_state, "needs_revalidation");
  assert.throws(
    () => coordinator.setRiskState(
      "board-1",
      { risk_id: "invalidating-risk", state: "open", reason: "" },
      { actor_id: "user-1", idempotency_key: "risk-empty-state-reason" },
    ),
    /必须说明原因/,
  );
  assert.throws(
    () => coordinator.setRiskState(
      "board-1",
      { risk_id: "invalidating-risk", state: "unknown" as never, reason: "错误状态" },
      { actor_id: "user-1", idempotency_key: "risk-invalid-state" },
    ),
    /状态必须是/,
  );
  assert.throws(
    () => coordinator.updateRisk(
      "board-1",
      updateInput,
      { actor_id: "user-1", idempotency_key: "risk-empty-update-reason", reason: "" },
    ),
    /必须说明原因/,
  );
  store.close();
});

test("revalidator alone can restore a Goal after Contract, dependency, and Risk gates pass", async () => {
  const { store, coordinator } = fixture(new Date().toISOString());
  createLeaf(coordinator, "revalidation-target");
  createLeaf(coordinator, "revalidation-dependency");

  const executorClaim = coordinator.claimGoal({
    board_id: "board-1",
    goal_id: "revalidation-target",
    actor_id: "runtime-executor",
    role: "executor",
    lease_seconds: 1800,
    idempotency_key: "revalidation-executor-claim",
  }).claim;
  assert.ok(executorClaim);
  const executorRun = coordinator.startRun({
    board_id: "board-1",
    claim_id: executorClaim.claim_id,
    actor_id: "runtime-executor",
    idempotency_key: "revalidation-executor-run",
  }).run;
  store.db
    .prepare("UPDATE goals SET validity_state = 'needs_revalidation' WHERE goal_id = ?")
    .run("revalidation-target");

  assert.ok(
    coordinator
      .explainGoal({
        board_id: "board-1",
        goal_id: "revalidation-target",
        actor_id: "runtime-other",
        role: "executor",
      })
      .reasons.some((item) => item.code === "goal.needs_revalidation"),
  );
  assert.throws(
    () =>
      coordinator.revalidateGoal({
        board_id: "board-1",
        goal_id: "revalidation-target",
        run_id: executorRun.run_id,
        actor_id: "runtime-executor",
        reason: "executor 不应拥有这个状态转换",
        evidence_refs: ["test://executor-role"],
        idempotency_key: "revalidation-executor-denied",
      }),
    (error: unknown) =>
      error instanceof GoalBoardV1Error && error.code === "revalidation.role_required",
  );
  coordinator.releaseClaim({
    board_id: "board-1",
    claim_id: executorClaim.claim_id,
    actor_id: "runtime-executor",
    reason: "交给 revalidator",
    idempotency_key: "revalidation-release-executor",
  });

  const ready = coordinator.queryReady({
    board_id: "board-1",
    actor_id: "runtime-revalidator",
    role: "revalidator",
  });
  assert.ok(ready.ready.some((item) => item.goal.goal_id === "revalidation-target"));
  assert.match(
    ready.ready.find((item) => item.goal.goal_id === "revalidation-target")?.why_now ?? "",
    /重新核对/,
  );
  const firstRevalidatorClaim = coordinator.claimGoal({
    board_id: "board-1",
    goal_id: "revalidation-target",
    actor_id: "runtime-revalidator",
    role: "revalidator",
    lease_seconds: 1800,
    idempotency_key: "revalidation-first-claim",
  }).claim;
  assert.ok(firstRevalidatorClaim);
  const firstRevalidatorRun = coordinator.startRun({
    board_id: "board-1",
    claim_id: firstRevalidatorClaim.claim_id,
    actor_id: "runtime-revalidator",
    idempotency_key: "revalidation-first-run",
  }).run;
  assert.throws(
    () =>
      coordinator.revalidateGoal({
        board_id: "board-1",
        goal_id: "revalidation-target",
        run_id: firstRevalidatorRun.run_id,
        actor_id: "runtime-impostor",
        reason: "错误 actor",
        evidence_refs: ["test://wrong-actor"],
        idempotency_key: "revalidation-wrong-actor",
      }),
    (error: unknown) => error instanceof GoalBoardV1Error && error.code === "run.not_owner",
  );
  coordinator.releaseClaim({
    board_id: "board-1",
    claim_id: firstRevalidatorClaim.claim_id,
    actor_id: "runtime-revalidator",
    reason: "验证 inactive Claim 门禁",
    idempotency_key: "revalidation-release-first",
  });
  assert.throws(
    () =>
      coordinator.revalidateGoal({
        board_id: "board-1",
        goal_id: "revalidation-target",
        run_id: firstRevalidatorRun.run_id,
        actor_id: "runtime-revalidator",
        reason: "已释放 Claim 不应生效",
        evidence_refs: ["test://inactive-claim"],
        idempotency_key: "revalidation-inactive-claim",
      }),
    (error: unknown) =>
      error instanceof GoalBoardV1Error && error.code === "revalidation.claim_inactive",
  );

  const claim = coordinator.claimGoal({
    board_id: "board-1",
    goal_id: "revalidation-target",
    actor_id: "runtime-revalidator",
    role: "revalidator",
    lease_seconds: 1800,
    idempotency_key: "revalidation-second-claim",
  }).claim;
  assert.ok(claim);
  const run = coordinator.startRun({
    board_id: "board-1",
    claim_id: claim.claim_id,
    actor_id: "runtime-revalidator",
    idempotency_key: "revalidation-second-run",
  }).run;

  coordinator.addRelation(
    "board-1",
    {
      from_goal_id: "revalidation-target",
      to_goal_id: "revalidation-dependency",
      type: "depends_on",
      reason: "重新验证必须确认新的前置结果已经可信可用",
    },
    { actor_id: "user-1", idempotency_key: "revalidation-add-dependency" },
  );
  coordinator.addRisk(
    "board-1",
    {
      risk_id: "revalidation-risk",
      goal_ids: ["revalidation-target"],
      description: "迁移证据仍不完整",
      probability: "medium",
      impact: "恢复 valid 后执行依据可能错误",
      trigger: "迁移检查缺少记录",
      treatment: "mitigate",
      blocking_mode: "completion",
      revisit_condition: "补齐迁移检查并关闭风险",
      owner: "runtime-revalidator",
    },
    { actor_id: "user-1", idempotency_key: "revalidation-add-risk" },
  );

  const blocked = coordinator.revalidateGoal({
    board_id: "board-1",
    goal_id: "revalidation-target",
    run_id: run.run_id,
    actor_id: "runtime-revalidator",
    reason: "检查发现前置与风险尚未闭环",
    evidence_refs: ["test://blocked-revalidation"],
    idempotency_key: "revalidation-blocked",
  });
  assert.equal(blocked.revalidated, false);
  assert.ok(blocked.reasons.some((item) => item.code === "dependency.unsatisfied"));
  assert.ok(blocked.reasons.some((item) => item.code === "risk.blocks_revalidation"));
  assert.equal(store.getGoal("revalidation-target")?.validity_state, "needs_revalidation");

  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  try {
    assert.equal(
      await runV1Cli([
        "revalidate",
        "--db",
        store.path,
        "--json",
        JSON.stringify({
          board_id: "board-1",
          goal_id: "revalidation-target",
          run_id: run.run_id,
          actor_id: "runtime-revalidator",
          reason: "CLI 读取同一组门禁",
          evidence_refs: ["test://cli-revalidation"],
          idempotency_key: "revalidation-cli-blocked",
        }),
      ]),
      0,
    );
  } finally {
    console.log = originalLog;
  }
  assert.equal((JSON.parse(logs.at(-1) ?? "{}") as { revalidated: boolean }).revalidated, false);

  store.db
    .prepare("UPDATE goals SET fulfillment_state = 'satisfied' WHERE goal_id = ?")
    .run("revalidation-dependency");
  coordinator.setRiskState(
    "board-1",
    { risk_id: "revalidation-risk", state: "resolved", reason: "迁移证据已经补齐" },
    { actor_id: "user-1", idempotency_key: "revalidation-resolve-risk" },
  );

  const server = new GoalBoardServer("runtime", {
    databasePath: store.path,
    boardId: "board-1",
    webBaseUrl: "http://127.0.0.1:4173",
  });
  const succeeded = JSON.parse(
    await server.callTool("goalboard_v1_revalidate", {
      board_id: "board-1",
      payload: {
        goal_id: "revalidation-target",
        run_id: run.run_id,
        actor_id: "runtime-revalidator",
        reason: "Contract、前置 Goal 与风险均已重新核对",
        evidence_refs: ["test://dependency-satisfied", "test://risk-resolved"],
        idempotency_key: "revalidation-success",
      },
    }),
  ) as { revalidated: boolean; goal: { validity_state: string } };
  assert.equal(succeeded.revalidated, true);
  assert.equal(succeeded.goal.validity_state, "valid");

  const replay = coordinator.revalidateGoal({
    board_id: "board-1",
    goal_id: "revalidation-target",
    run_id: run.run_id,
    actor_id: "runtime-revalidator",
    reason: "Contract、前置 Goal 与风险均已重新核对",
    evidence_refs: ["test://dependency-satisfied", "test://risk-resolved"],
    idempotency_key: "revalidation-success",
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.revalidated, true);
  assert.equal(store.getGoal("revalidation-target")?.validity_state, "valid");
  assert.equal(
    (store.db
      .prepare("SELECT COUNT(*) AS count FROM events WHERE type = 'goal.revalidated'")
      .get() as { count: number }).count,
    1,
  );
  store.close();
});

test("clarifier and executor pull different Goal states without weakening execution gates", () => {
  const { store, coordinator } = fixture();
  coordinator.createGoal(
    "board-1",
    {
      goal_id: "rough-idea",
      title: "整理一个还不完整的新需求",
      outcome: "用户意图被整理成可执行 Goal",
      why: "Runtime 需要先澄清，再允许执行",
      business_logic: "用户先写下目标意图；澄清者补齐边界、拆分、依赖与验收，再交给用户决定。",
      definition_state: "draft",
      decomposition_state: "abstract",
      acceptance_criteria: [],
    },
    { actor_id: "user-1", idempotency_key: "create-rough-idea" },
  );
  createLeaf(coordinator, "ready-leaf", 10);
  coordinator.addRelation(
    "board-1",
    {
      from_goal_id: "rough-idea",
      to_goal_id: "ready-leaf",
      type: "depends_on",
      reason: "澄清时需要理解前置结果，但不代表可以直接执行",
    },
    { actor_id: "user-1", idempotency_key: "rough-dependency" },
  );

  const executorBlocked = coordinator.explainGoal({
    board_id: "board-1",
    goal_id: "rough-idea",
    actor_id: "runtime-executor",
    role: "executor",
  });
  assert.equal(executorBlocked.ready, false);
  assert.ok(executorBlocked.reasons.some((item) => item.code === "goal.not_accepted"));
  assert.ok(executorBlocked.reasons.some((item) => item.code === "goal.acceptance_missing"));

  const clarifierReady = coordinator.queryReady({
    board_id: "board-1",
    actor_id: "runtime-clarifier",
    role: "clarifier",
  });
  assert.deepEqual(clarifierReady.ready.map((item) => item.goal.goal_id), ["rough-idea"]);
  assert.equal(
    coordinator.explainGoal({
      board_id: "board-1",
      goal_id: "ready-leaf",
      actor_id: "runtime-clarifier",
      role: "clarifier",
    }).ready,
    false,
  );

  const claim = coordinator.claimGoal({
    board_id: "board-1",
    goal_id: "rough-idea",
    actor_id: "runtime-clarifier",
    role: "clarifier",
    idempotency_key: "clarifier-claim",
  });
  assert.equal(claim.allowed, true);
  assert.equal(claim.claim?.role, "clarifier");
  const competingClarifier = coordinator.claimGoal({
    board_id: "board-1",
    goal_id: "rough-idea",
    actor_id: "runtime-clarifier-2",
    role: "clarifier",
    idempotency_key: "clarifier-claim-2",
  });
  assert.equal(competingClarifier.allowed, false);
  assert.ok(
    competingClarifier.reasons.some((item) => item.code === "claim.already_active"),
  );

  const run = coordinator.startRun({
    board_id: "board-1",
    claim_id: claim.claim!.claim_id,
    actor_id: "runtime-clarifier",
    idempotency_key: "clarifier-run",
  }).run;
  assert.equal(run.role, "clarifier");
  const candidate = coordinator.submitCandidate({
    board_id: "board-1",
    actor_id: "runtime-clarifier",
    discovered_in_run_id: run.run_id,
    proposed_goal: {
      goal_id: "clarified-leaf",
      title: "实现澄清后的最小结果",
      outcome: "最小结果可验收",
      why: "让用户确认后再执行",
      business_logic: "这项工作在自身边界内完成并提供可检查结果。",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [
        {
          criterion_id: "clarified-result",
          statement: "结果可以被自动检查",
          decision_method: "automated_check",
          pass_condition: "测试退出码为 0",
        },
      ],
    },
    idempotency_key: "clarifier-candidate",
  }).candidate;
  assert.throws(
    () =>
      coordinator.decideCandidate({
        board_id: "board-1",
        candidate_id: candidate.candidate_id,
        actor_id: "runtime-clarifier",
        actor_kind: "runtime",
        decision: "approved",
        reason: "Runtime 不应越权批准",
        idempotency_key: "runtime-candidate-decision",
      }),
    (error) =>
      error instanceof GoalBoardV1Error && error.code === "candidate.user_decision_required",
  );
  coordinator.decideCandidate({
    board_id: "board-1",
    candidate_id: candidate.candidate_id,
    actor_id: "user-1",
    actor_kind: "user",
    decision: "rejected",
    reason: "测试结束，不纳入候选 Goal",
    idempotency_key: "user-candidate-decision",
  });

  const contract = coordinator.readGoalContract("board-1", "rough-idea");
  assert.equal(contract.goal.goal_id, "rough-idea");
  assert.equal(contract.goal_path, "/goals/rough-idea");
  assert.ok(contract.relations.every((item) => item.from_goal_id === "rough-idea" || item.to_goal_id === "rough-idea"));
  assert.ok(contract.claims.every((item) => item.goal_id === "rough-idea"));
  assert.ok(contract.runs.every((item) => item.goal_id === "rough-idea"));
  assert.equal(contract.candidates[0]?.candidate_id, candidate.candidate_id);
  assert.equal(contract.review_obligations.length, 0);
  store.close();
});

test("unified Available lets the Runtime choose across clarification, execution, review, and revalidation", () => {
  const { store, coordinator } = fixture();
  coordinator.createGoal(
    "board-1",
    {
      goal_id: "rough-draft",
      title: "还需要澄清的想法",
      outcome: "用户确认合适的 Goal Tree",
      why: "不能把未澄清的想法直接执行",
      business_logic: "当前 Runtime 先和用户对话，补齐会改变范围或拆分的事实。",
      definition_state: "draft",
      decomposition_state: "abstract",
      acceptance_criteria: [],
    },
    { actor_id: "user-1", idempotency_key: "available-create-draft" },
  );
  createLeaf(coordinator, "ready-execution", 30);
  createLeaf(coordinator, "ready-review", 25);
  createLeaf(coordinator, "needs-revalidation", 20);
  store.db
    .prepare("UPDATE goals SET validity_state = 'needs_revalidation' WHERE goal_id = ?")
    .run("needs-revalidation");
  const reviewProducer = coordinator.selectGoalAndStart({
    board_id: "board-1",
    goal_id: "ready-review",
    actor_id: "runtime-producer",
    role: "executor",
    idempotency_key: "available-review-producer",
  });
  coordinator.reportRun({
    board_id: "board-1",
    run_id: reviewProducer.run!.run_id,
    actor_id: "runtime-producer",
    state: "completed",
    idempotency_key: "available-review-producer-complete",
  });
  coordinator.releaseClaim({
    board_id: "board-1",
    claim_id: reviewProducer.claim!.claim_id,
    actor_id: "runtime-producer",
    reason: "进入 Review 阶段",
    idempotency_key: "available-review-producer-release",
  });

  const available = coordinator.queryAvailable({
    board_id: "board-1",
    actor_id: "runtime-a",
  }).available;
  assert.deepEqual(
    available.map((item) => [item.goal.goal_id, item.next_action, item.role]),
    [
      ["ready-execution", "execute", "executor"],
      ["ready-review", "review", "self_verifier"],
      ["needs-revalidation", "revalidate", "revalidator"],
      ["rough-draft", "clarify", "clarifier"],
    ],
  );
  assert.equal(
    coordinator.getGoalWorkState({ board_id: "board-1", goal_id: "rough-draft" }).work_state,
    "clarification_pending",
  );
  assert.equal(
    coordinator.getGoalWorkState({ board_id: "board-1", goal_id: "ready-execution" }).work_state,
    "execution_pending",
  );
  assert.equal(
    coordinator.getGoalWorkState({ board_id: "board-1", goal_id: "needs-revalidation" }).work_state,
    "revalidation_pending",
  );
  assert.equal(
    coordinator.getGoalWorkState({ board_id: "board-1", goal_id: "ready-review" }).work_state,
    "review_pending",
  );
  const reviewSelection = coordinator.selectGoalAndStart({
    board_id: "board-1",
    goal_id: "ready-review",
    actor_id: "runtime-reviewer",
    role: "self_verifier",
    idempotency_key: "available-self-review-select",
  });
  assert.equal(reviewSelection.work_state?.work_state, "reviewing");
  assert.equal(reviewSelection.run?.role, "self_verifier");
  store.close();
});

test("Runtime selection atomically creates a Claim and Run, and compound parents complete from children", () => {
  const { store, coordinator } = fixture();
  coordinator.createGoal(
    "board-1",
    {
      goal_id: "parent",
      title: "交付完整复合结果",
      outcome: "子 Goal 全部独立完成后父 Goal 自动完成",
      why: "父 Goal 是工作树的汇总，不应被当成叶子领取",
      business_logic: "用户确认当前层级拆分后，父 Goal 等待所有必需子 Goal 的完成。",
      definition_state: "accepted",
      decomposition_state: "closed_compound",
      acceptance_criteria: [
        {
          criterion_id: "parent-children",
          statement: "全部子 Goal 已完成",
          decision_method: "inspection",
          pass_condition: "每个活跃子 Goal 都是已完成",
        },
      ],
    },
    { actor_id: "user-1", idempotency_key: "compound-parent-create" },
  );
  createLeaf(coordinator, "child", 60);
  coordinator.addRelation(
    "board-1",
    { from_goal_id: "child", to_goal_id: "parent", type: "part_of", reason: "这是父 Goal 的必需子结果" },
    { actor_id: "user-1", idempotency_key: "compound-parent-child" },
  );
  assert.equal(
    coordinator.getGoalWorkState({ board_id: "board-1", goal_id: "parent" }).work_state,
    "waiting_children",
  );
  assert.equal(
    coordinator.queryAvailable({ board_id: "board-1", actor_id: "runtime-a" }).available.some((item) => item.goal.goal_id === "parent"),
    false,
  );

  const selected = coordinator.selectGoalAndStart({
    board_id: "board-1",
    goal_id: "child",
    actor_id: "runtime-a",
    role: "executor",
    idempotency_key: "compound-child-select",
  });
  assert.equal(selected.allowed, true);
  assert.ok(selected.claim);
  assert.ok(selected.run);
  assert.equal(selected.claim?.claim_id, selected.run?.claim_id);
  assert.equal(
    coordinator.getGoalWorkState({ board_id: "board-1", goal_id: "child" }).work_state,
    "executing",
  );
  const replay = coordinator.selectGoalAndStart({
    board_id: "board-1",
    goal_id: "child",
    actor_id: "runtime-a",
    role: "executor",
    idempotency_key: "compound-child-select",
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.claim?.claim_id, selected.claim?.claim_id);
  assert.equal(
    (store.db.prepare("SELECT COUNT(*) AS count FROM claims WHERE goal_id = 'child'").get() as { count: number }).count,
    1,
  );
  assert.equal(
    (store.db.prepare("SELECT COUNT(*) AS count FROM runs WHERE goal_id = 'child'").get() as { count: number }).count,
    1,
  );

  coordinator.reportRun({
    board_id: "board-1",
    run_id: selected.run!.run_id,
    actor_id: "runtime-a",
    state: "completed",
    output_refs: ["test://compound-child"],
    idempotency_key: "compound-child-run-complete",
  });
  const evidence = coordinator.submitEvidence({
    board_id: "board-1",
    goal_id: "child",
    actor_id: "runtime-a",
    run_id: selected.run!.run_id,
    criterion_ids: ["child-criterion"],
    kind: "test",
    locator: "test://compound-child",
    result: "passed",
    idempotency_key: "compound-child-evidence",
  }).evidence;
  const selfReview = store
    .snapshot("board-1")
    .review_obligations.find((item) => item.goal_id === "child" && item.role === "self_verifier");
  assert.ok(selfReview);
  coordinator.submitReview({
    board_id: "board-1",
    goal_id: "child",
    obligation_id: selfReview!.obligation_id,
    actor_id: "runtime-a",
    verdict: "pass",
    evidence_refs: [evidence.evidence_id],
    reasoning: "子 Goal 的验收证据完整",
    idempotency_key: "compound-child-review",
  });
  const completion = coordinator.evaluateLeafCompletion({
    board_id: "board-1",
    goal_id: "child",
    actor_id: "runtime-a",
    idempotency_key: "compound-child-complete",
  });
  assert.equal(completion.satisfied, true);
  assert.equal(store.getGoal("parent")?.fulfillment_state, "satisfied");
  assert.equal(
    coordinator.getGoalWorkState({ board_id: "board-1", goal_id: "parent" }).work_state,
    "satisfied",
  );
  assert.equal(
    (store.db.prepare("SELECT COUNT(*) AS count FROM events WHERE type = 'goal.compound_satisfied'").get() as { count: number }).count,
    1,
  );
  createLeaf(coordinator, "new-child", 50);
  coordinator.addRelation(
    "board-1",
    { from_goal_id: "new-child", to_goal_id: "parent", type: "part_of", reason: "用户决定把新发现的结果纳入父 Goal" },
    { actor_id: "user-1", idempotency_key: "compound-parent-new-child" },
  );
  assert.equal(store.getGoal("parent")?.definition_state, "draft");
  assert.equal(store.getGoal("parent")?.decomposition_state, "frontier_open");
  assert.equal(
    coordinator.getGoalWorkState({ board_id: "board-1", goal_id: "parent" }).work_state,
    "clarification_pending",
  );
  store.close();
});

test("linking a child does not silently accept a Draft compound parent", () => {
  const { store, coordinator } = fixture();
  coordinator.createGoal(
    "board-1",
    {
      goal_id: "draft-compound-parent",
      title: "仍在澄清的复合父 Goal",
      outcome: "用户稍后确认完整拆分后再推进子 Goal",
      why: "一条父子关系本身不能代替对父 Goal Contract 的确认",
      business_logic: "当前可以先记录已知子 Goal，但父级保持 Draft，直到同一棵树的完整拆分被用户确认。",
      definition_state: "draft",
      decomposition_state: "closed_compound",
      acceptance_criteria: [
        {
          criterion_id: "draft-compound-parent-criterion",
          statement: "完整拆分已由用户确认",
          decision_method: "human_decision",
          pass_condition: "用户通过 Goal Tree 决定确认父 Goal",
        },
      ],
    },
    { actor_id: "user-1", idempotency_key: "draft-compound-parent-create" },
  );
  createLeaf(coordinator, "draft-compound-child");
  coordinator.addRelation(
    "board-1",
    {
      from_goal_id: "draft-compound-child",
      to_goal_id: "draft-compound-parent",
      type: "part_of",
      reason: "先记录当前已知的子 Goal，父级仍等待用户确认完整拆分。",
    },
    { actor_id: "user-1", idempotency_key: "draft-compound-parent-child" },
  );
  assert.equal(store.getGoal("draft-compound-parent")?.definition_state, "draft");
  assert.equal(store.getGoal("draft-compound-parent")?.decomposition_state, "closed_compound");
  assert.equal(
    coordinator.getGoalWorkState({ board_id: "board-1", goal_id: "draft-compound-parent" }).work_state,
    "clarification_pending",
  );
  store.close();
});

test("a failed atomic selection leaves no orphan Claim", () => {
  const { store, coordinator } = fixture();
  createLeaf(coordinator, "trigger-failure");
  store.db.exec(`
    CREATE TRIGGER reject_atomic_run
    BEFORE INSERT ON runs
    BEGIN
      SELECT RAISE(ABORT, 'forced run failure');
    END;
  `);
  assert.throws(
    () =>
      coordinator.selectGoalAndStart({
        board_id: "board-1",
        goal_id: "trigger-failure",
        actor_id: "runtime-a",
        idempotency_key: "forced-atomic-failure",
      }),
    /forced run failure/,
  );
  assert.equal(
    (store.db.prepare("SELECT COUNT(*) AS count FROM claims WHERE goal_id = 'trigger-failure'").get() as { count: number }).count,
    0,
  );
  assert.equal(
    (store.db.prepare("SELECT COUNT(*) AS count FROM runs WHERE goal_id = 'trigger-failure'").get() as { count: number }).count,
    0,
  );
  store.close();
});

test("work states preserve phase through blocks and recover after Claim loss", () => {
  const { store, coordinator, setNow } = fixture();
  coordinator.createGoal(
    "board-1",
    {
      goal_id: "draft-phase",
      title: "澄清阶段状态",
      outcome: "验证澄清受阻保留阶段",
      why: "用户不能只看到笼统阻塞",
      business_logic: "澄清 Run 受阻时明确展示澄清受阻。",
      definition_state: "draft",
      decomposition_state: "abstract",
      acceptance_criteria: [],
    },
    { actor_id: "user-1", idempotency_key: "phase-draft" },
  );
  createLeaf(coordinator, "execution-phase");
  createLeaf(coordinator, "revalidation-phase");
  createLeaf(coordinator, "review-phase");
  store.db
    .prepare("UPDATE goals SET validity_state = 'needs_revalidation' WHERE goal_id = ?")
    .run("revalidation-phase");

  const clarify = coordinator.selectGoalAndStart({
    board_id: "board-1",
    goal_id: "draft-phase",
    actor_id: "runtime-clarifier",
    role: "clarifier",
    idempotency_key: "phase-clarify",
  });
  coordinator.reportRun({
    board_id: "board-1",
    run_id: clarify.run!.run_id,
    actor_id: "runtime-clarifier",
    state: "blocked",
    block_reason: "需要用户确认目标边界",
    idempotency_key: "phase-clarify-block",
  });
  assert.equal(
    coordinator.getGoalWorkState({ board_id: "board-1", goal_id: "draft-phase" }).work_state,
    "clarification_blocked",
  );
  coordinator.releaseClaim({
    board_id: "board-1",
    claim_id: clarify.claim!.claim_id,
    actor_id: "runtime-clarifier",
    reason: "把澄清交还给下一轮 Runtime",
    idempotency_key: "phase-clarify-release",
  });
  assert.equal(
    coordinator.getGoalWorkState({ board_id: "board-1", goal_id: "draft-phase" }).work_state,
    "clarification_pending",
  );

  const execute = coordinator.selectGoalAndStart({
    board_id: "board-1",
    goal_id: "execution-phase",
    actor_id: "runtime-executor",
    role: "executor",
    idempotency_key: "phase-execute",
  });
  coordinator.reportRun({
    board_id: "board-1",
    run_id: execute.run!.run_id,
    actor_id: "runtime-executor",
    state: "blocked",
    block_reason: "等待外部输入",
    idempotency_key: "phase-execute-block",
  });
  assert.equal(
    coordinator.getGoalWorkState({ board_id: "board-1", goal_id: "execution-phase" }).work_state,
    "execution_blocked",
  );
  coordinator.releaseClaim({
    board_id: "board-1",
    claim_id: execute.claim!.claim_id,
    actor_id: "runtime-executor",
    reason: "当前 Runtime 无法继续执行",
    idempotency_key: "phase-execute-release",
  });
  assert.equal(
    coordinator.getGoalWorkState({ board_id: "board-1", goal_id: "execution-phase" }).work_state,
    "execution_pending",
  );

  const revalidate = coordinator.selectGoalAndStart({
    board_id: "board-1",
    goal_id: "revalidation-phase",
    actor_id: "runtime-revalidator",
    role: "revalidator",
    idempotency_key: "phase-revalidate",
  });
  coordinator.reportRun({
    board_id: "board-1",
    run_id: revalidate.run!.run_id,
    actor_id: "runtime-revalidator",
    state: "blocked",
    block_reason: "需要重新核对依赖",
    idempotency_key: "phase-revalidate-block",
  });
  assert.equal(
    coordinator.getGoalWorkState({ board_id: "board-1", goal_id: "revalidation-phase" }).work_state,
    "revalidation_blocked",
  );
  coordinator.releaseClaim({
    board_id: "board-1",
    claim_id: revalidate.claim!.claim_id,
    actor_id: "runtime-revalidator",
    reason: "等待下一轮重新验证",
    idempotency_key: "phase-revalidate-release",
  });
  assert.equal(
    coordinator.getGoalWorkState({ board_id: "board-1", goal_id: "revalidation-phase" }).work_state,
    "revalidation_pending",
  );

  coordinator.setPolicy(
    "board-1",
    { goal_id: "review-phase", policy: { cross_reviewers: 1 }, reason: "需要交叉复核" },
    { actor_id: "user-1", idempotency_key: "phase-review-policy" },
  );
  const reviewExecution = coordinator.selectGoalAndStart({
    board_id: "board-1",
    goal_id: "review-phase",
    actor_id: "runtime-author",
    role: "executor",
    idempotency_key: "phase-review-execution",
  });
  coordinator.reportRun({
    board_id: "board-1",
    run_id: reviewExecution.run!.run_id,
    actor_id: "runtime-author",
    state: "completed",
    idempotency_key: "phase-review-execution-completed",
  });
  coordinator.releaseClaim({
    board_id: "board-1",
    claim_id: reviewExecution.claim!.claim_id,
    actor_id: "runtime-author",
    reason: "交给交叉复核者",
    idempotency_key: "phase-review-release-author",
  });
  assert.equal(
    coordinator.getGoalWorkState({ board_id: "board-1", goal_id: "review-phase" }).work_state,
    "review_pending",
  );
  const review = coordinator.selectGoalAndStart({
    board_id: "board-1",
    goal_id: "review-phase",
    actor_id: "runtime-reviewer",
    role: "cross_reviewer",
    idempotency_key: "phase-review-select",
  });
  assert.equal(review.work_state?.work_state, "reviewing");
  coordinator.reportRun({
    board_id: "board-1",
    run_id: review.run!.run_id,
    actor_id: "runtime-reviewer",
    state: "blocked",
    block_reason: "证据链接暂时不可访问",
    idempotency_key: "phase-review-block",
  });
  assert.equal(
    coordinator.getGoalWorkState({ board_id: "board-1", goal_id: "review-phase" }).work_state,
    "review_blocked",
  );
  coordinator.reportRun({
    board_id: "board-1",
    run_id: review.run!.run_id,
    actor_id: "runtime-reviewer",
    state: "started",
    idempotency_key: "phase-review-resume",
  });
  assert.equal(
    coordinator.getGoalWorkState({ board_id: "board-1", goal_id: "review-phase" }).work_state,
    "reviewing",
  );
  coordinator.revokeClaim({
    board_id: "board-1",
    claim_id: review.claim!.claim_id,
    actor_id: "user-1",
    reason: "复核 Runtime 已失联",
    idempotency_key: "phase-review-revoke",
  });
  assert.equal(
    coordinator.getGoalWorkState({ board_id: "board-1", goal_id: "review-phase" }).work_state,
    "review_pending",
  );

  createLeaf(coordinator, "interrupted-phase");
  const interrupted = coordinator.selectGoalAndStart({
    board_id: "board-1",
    goal_id: "interrupted-phase",
    actor_id: "runtime-interrupted",
    role: "executor",
    idempotency_key: "phase-interrupted-select",
  });
  coordinator.reportRun({
    board_id: "board-1",
    run_id: interrupted.run!.run_id,
    actor_id: "runtime-interrupted",
    state: "abandoned",
    block_reason: "Runtime 进程意外结束",
    idempotency_key: "phase-interrupted-abandoned",
  });
  assert.equal(
    coordinator.getGoalWorkState({ board_id: "board-1", goal_id: "interrupted-phase" }).work_state,
    "execution_pending",
  );
  assert.equal(store.snapshot("board-1").claims.find((item) => item.claim_id === interrupted.claim!.claim_id)?.state, "released");

  createLeaf(coordinator, "expiry-phase");
  const expiring = coordinator.selectGoalAndStart({
    board_id: "board-1",
    goal_id: "expiry-phase",
    actor_id: "runtime-expiring",
    role: "executor",
    lease_seconds: 10,
    idempotency_key: "phase-expiry-select",
  });
  setNow("2026-08-15T00:00:11.000Z");
  assert.equal(
    coordinator.getGoalWorkState({ board_id: "board-1", goal_id: "expiry-phase" }).work_state,
    "execution_pending",
  );
  const recoveredAfterExpiry = coordinator.selectGoalAndStart({
    board_id: "board-1",
    goal_id: "expiry-phase",
    actor_id: "runtime-recovered",
    role: "executor",
    idempotency_key: "phase-expiry-recover",
  });
  assert.equal(recoveredAfterExpiry.allowed, true);
  assert.equal(
    store.snapshot("board-1").claims.find((item) => item.claim_id === expiring.claim!.claim_id)?.state,
    "expired",
  );
  assert.equal(
    store.snapshot("board-1").runs.find((item) => item.run_id === expiring.run!.run_id)?.state,
    "abandoned",
  );
  store.close();
});

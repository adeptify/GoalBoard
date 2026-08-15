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
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 4")
      .get(),
  );
  assert.equal(reopened.snapshot("board-1").board.title, "产品目标");
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

test("two Runtime processes racing for one Goal produce exactly one active Claim", async () => {
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
      const result = new GoalBoardCoordinator(store).claimGoal({
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
  verify.close();
});

test("Risk operations block Claim and propagate triggered invalidation explicitly", () => {
  const { store, coordinator } = fixture();
  createLeaf(coordinator, "risk-goal");
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
  coordinator.setRiskState(
    "board-1",
    { risk_id: "invalidating-risk", state: "triggered", reason: "上游规则已改变" },
    { actor_id: "user-1", idempotency_key: "risk-trigger" },
  );
  assert.equal(store.getGoal("risk-goal")?.validity_state, "invalidated");
  coordinator.setRiskState(
    "board-1",
    { risk_id: "invalidating-risk", state: "resolved", reason: "风险已处理，等待重新验证" },
    { actor_id: "user-1", idempotency_key: "risk-resolve-invalidating" },
  );
  assert.equal(store.getGoal("risk-goal")?.validity_state, "needs_revalidation");
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
    competingClarifier.reasons.some((item) => item.code === "claim.clarifier_already_active"),
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

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createCliExecutionValidationAdapter } from "@adeptify/goalboard-app-cli";
import { createMcpExecutionValidationAdapter } from "@adeptify/goalboard-app-mcp";
import {
  createWorkbenchExecutionValidationAdapter,
  createWorkbenchExecutionValidationRenderer,
} from "@adeptify/goalboard-app-workbench";

import { GoalBoardCoordinator } from "../src/v1/coordinator.js";
import { SqliteGoalBoardStore } from "../src/v1/store.js";

test("Workbench, MCP, and CLI share one no-loss execution-validation chain", () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-execution-app-adapters-"));
  const store = new SqliteGoalBoardStore(join(directory, "goalboard.sqlite"));
  try {
    const coordinator = new GoalBoardCoordinator(store);
    coordinator.initializeBoard({
      board_id: "board-execution-adapters",
      title: "Execution App Adapters",
      actor_id: "user-1",
      idempotency_key: "initialize",
    });
    coordinator.goals.commands.createGoal("board-execution-adapters", {
      goal_id: "goal-cross-entry",
      title: "跨入口完成执行与验收",
      outcome: "同一个 Goal 可由 CLI、MCP 与 Workbench 接力完成",
      why: "验证入口迁移没有复制规则或丢失状态",
      business_logic: "CLI 领取，MCP 报告，Workbench 写入依据并复核。",
      promised_outputs: ["跨入口执行验收结果"],
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [{
        criterion_id: "cross-entry-result",
        statement: "跨入口链路保持统一状态",
        decision_method: "automated_check",
        pass_condition: "执行、依据和复核均完成",
        required_evidence: ["test"],
      }],
    }, {
      actor_id: "user-1",
      idempotency_key: "create-goal",
    });

    const cli = createCliExecutionValidationAdapter(coordinator.executionValidation);
    const mcp = createMcpExecutionValidationAdapter(coordinator.executionValidation);
    const workbench = createWorkbenchExecutionValidationAdapter(coordinator.executionValidation);
    for (const adapter of [cli, mcp, workbench]) {
      assert.equal(adapter.query, coordinator.executionValidation.query);
      assert.equal(adapter.commands, coordinator.executionValidation.commands);
    }

    const readyProjection = mcp.query.getGoalActionProjection({
      board_id: "board-execution-adapters",
      goal_id: "goal-cross-entry",
    });
    const executeAction = readyProjection.actions.find((action) =>
      action.actor === "runtime" && action.kind === "execute" && action.status === "ready"
    );
    assert.ok(executeAction);
    const selected = cli.commands.selectGoalAndStart({
      board_id: "board-execution-adapters",
      goal_id: "goal-cross-entry",
      actor_id: "runtime-executor",
      action_id: executeAction.action_id,
      action_token: readyProjection.action_token,
      idempotency_key: "select",
    });
    assert.equal(selected.allowed, true);
    assert.ok(selected.run);

    assert.throws(
      () => mcp.commands.reportRun({
        board_id: "board-execution-adapters",
        run_id: selected.run!.run_id,
        actor_id: "runtime-not-owner",
        state: "completed",
        idempotency_key: "not-owner",
      }),
      (error: unknown) =>
        typeof error === "object" && error != null && "code" in error &&
        error.code === "run.not_owner",
    );
    assert.throws(
      () => mcp.commands.reportRun({
        board_id: "board-execution-adapters",
        run_id: selected.run!.run_id,
        actor_id: "runtime-executor",
        state: "started",
        action_token: readyProjection.action_token,
        idempotency_key: "stale-action",
      }),
      (error: unknown) =>
        typeof error === "object" && error != null && "code" in error &&
        error.code === "action.token_stale",
    );

    const reported = mcp.commands.reportRun({
      board_id: "board-execution-adapters",
      run_id: selected.run!.run_id,
      actor_id: "runtime-executor",
      state: "completed",
      output_refs: ["test://cross-entry"],
      idempotency_key: "report",
    });
    assert.equal(reported.transition.projection.primary_action?.kind, "submit_evidence");

    const submitted = workbench.commands.submitEvidence({
      board_id: "board-execution-adapters",
      goal_id: "goal-cross-entry",
      actor_id: "runtime-executor",
      run_id: selected.run!.run_id,
      criterion_ids: ["cross-entry-result"],
      kind: "test",
      locator: "test://cross-entry",
      result: "passed",
      idempotency_key: "evidence",
    });
    assert.equal(submitted.transition.projection.primary_action?.kind, "review");

    const obligation = store.snapshot("board-execution-adapters").review_obligations.find(
      (item) => item.goal_id === "goal-cross-entry" && item.role === "self_verifier",
    );
    assert.ok(obligation);
    const reviewProjection = cli.query.getGoalActionProjection({
      board_id: "board-execution-adapters",
      goal_id: "goal-cross-entry",
    });
    const reviewAction = reviewProjection.actions.find((action) =>
      action.kind === "review" && action.target_id === obligation.obligation_id
    );
    assert.ok(reviewAction);
    const reviewSelection = cli.commands.selectGoalAndStart({
      board_id: "board-execution-adapters",
      goal_id: "goal-cross-entry",
      actor_id: "runtime-reviewer",
      role: "self_verifier",
      action_id: reviewAction.action_id,
      action_token: reviewProjection.action_token,
      idempotency_key: "select-review",
    });
    assert.equal(reviewSelection.run?.role, "self_verifier");

    const reviewed = workbench.commands.submitReview({
      board_id: "board-execution-adapters",
      goal_id: "goal-cross-entry",
      obligation_id: obligation.obligation_id,
      actor_id: "runtime-reviewer",
      actor_kind: "runtime",
      verdict: "pass",
      evidence_refs: [submitted.evidence.evidence_id],
      reasoning: "执行结果、测试依据与验收条件一致。",
      idempotency_key: "review",
    });
    assert.equal(reviewed.transition.projection.display_status, "completed");
    assert.equal(
      mcp.query.getGoalWorkState({
        board_id: "board-execution-adapters",
        goal_id: "goal-cross-entry",
      }).work_state,
      "satisfied",
    );

    const snapshot = store.snapshot("board-execution-adapters");
    assert.equal(snapshot.evidence.filter((item) => item.goal_id === "goal-cross-entry").length, 1);
    assert.equal(snapshot.reviews.filter((item) => item.goal_id === "goal-cross-entry").length, 1);

    const renderer = createWorkbenchExecutionValidationRenderer({
      translate: (value) => value,
      escapeHtml: (value) => value,
      formatDate: (value) => value,
      renderIcon: (name) => `[${name}]`,
      renderReference: (value) => `<a>${value}</a>`,
      isProjectReference: () => false,
      currentLocale: () => "zh-CN",
    });
    const view = {
      goal: snapshot.goals.find((item) => item.goal_id === "goal-cross-entry")!,
      action_projection: reviewed.transition.projection,
      active_claim: snapshot.claims.find((item) =>
        item.goal_id === "goal-cross-entry" && item.state === "active"
      ) ?? null,
      claims: snapshot.claims.filter((item) => item.goal_id === "goal-cross-entry"),
      runs: snapshot.runs.filter((item) => item.goal_id === "goal-cross-entry"),
      evidence: snapshot.evidence.filter((item) => item.goal_id === "goal-cross-entry"),
      review_obligations: snapshot.review_obligations.filter((item) => item.goal_id === "goal-cross-entry"),
      reviews: snapshot.reviews.filter((item) => item.goal_id === "goal-cross-entry"),
    };
    assert.match(renderer.renderRunCell(view), /Run/);
    assert.match(renderer.renderEvidenceCell(view, false), /test:\/\/cross-entry/);
    assert.match(renderer.renderReviewCell(view), /执行者自检/);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

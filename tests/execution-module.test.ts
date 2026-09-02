import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ExecutionError, ExecutionModule } from "@adeptify/goalboard-module-execution";
import type { GoalPolicy } from "@adeptify/goalboard-contracts/modules/goals";

import { DEMO_BOARD_ID, seedDemoBoard } from "../src/v1/demo.js";
import { SqliteGoalBoardStore } from "../src/v1/store.js";

const POLICY: GoalPolicy = {
  goal_mode: "preferred",
  required_capabilities: [],
  self_verification: true,
  cross_reviewers: 0,
  adversarial_reviewers: 0,
  human_approval: false,
  max_lease_seconds: 120,
};

test("Execution public module owns Claim/Run transitions without a Coordinator", () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-execution-module-"));
  const databasePath = join(directory, "goalboard.sqlite");
  seedDemoBoard(databasePath);
  const store = new SqliteGoalBoardStore(databasePath);
  let now = "2026-09-02T00:00:00.000Z";
  try {
    const execution = new ExecutionModule({
      db: store.db,
      now: () => now,
      appendEvent: (input) => store.appendEvent(input),
    });
    const claim = execution.commands.createAuthorizedClaim({
      board_id: DEMO_BOARD_ID,
      goal_id: "V1",
      actor_id: "runtime-a",
      role: "executor",
      contract_revision: 1,
      action_id: "action-V1-execute",
      action_kind: "execute",
      action_target_id: "V1",
      capabilities: ["shell", "shell"],
      goal_mode_attestation: true,
      resolved_policy: POLICY,
      lease_seconds: 60,
      reason: "test claim",
    });
    assert.deepEqual(claim.capabilities, ["shell"]);
    assert.equal(claim.expires_at, "2026-09-02T00:01:00.000Z");

    now = "2026-09-02T00:00:30.000Z";
    const renewed = execution.commands.renewClaim({
      board_id: DEMO_BOARD_ID,
      claim_id: claim.claim_id,
      actor_id: "runtime-a",
      lease_seconds: 90,
    });
    assert.equal(renewed.expires_at, "2026-09-02T00:02:00.000Z");

    const run = execution.commands.startRun({
      board_id: DEMO_BOARD_ID,
      claim_id: claim.claim_id,
      actor_id: "runtime-a",
    });
    assert.equal(run.state, "started");
    assert.equal(execution.query.getRunWithClaim(DEMO_BOARD_ID, run.run_id)?.claim.claim_id, claim.claim_id);

    const blocked = execution.commands.reportRun({
      board_id: DEMO_BOARD_ID,
      run_id: run.run_id,
      actor_id: "runtime-a",
      state: "blocked",
      block_reason: "waiting for input",
      output_refs: ["artifact:one", "artifact:one"],
    });
    assert.equal(blocked.run.state, "blocked");
    assert.deepEqual(blocked.run.output_refs, ["artifact:one"]);

    execution.commands.reportRun({
      board_id: DEMO_BOARD_ID,
      run_id: run.run_id,
      actor_id: "runtime-a",
      state: "started",
    });
    const completed = execution.commands.reportRun({
      board_id: DEMO_BOARD_ID,
      run_id: run.run_id,
      actor_id: "runtime-a",
      state: "completed",
      discovery_refs: ["goal:new"],
    });
    assert.equal(completed.run.state, "completed");
    assert.equal(completed.released_claim, null);

    const released = execution.commands.releaseClaim({
      board_id: DEMO_BOARD_ID,
      claim_id: claim.claim_id,
      actor_id: "runtime-a",
      reason: "done",
    });
    assert.equal(released.claim.state, "released");
    assert.deepEqual(released.abandoned_run_ids, []);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Execution recovery expires the lease and abandons its active Run exactly once", () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-execution-recovery-"));
  const databasePath = join(directory, "goalboard.sqlite");
  seedDemoBoard(databasePath);
  const store = new SqliteGoalBoardStore(databasePath);
  let now = "2026-09-02T00:00:00.000Z";
  try {
    const execution = new ExecutionModule({
      db: store.db,
      now: () => now,
      appendEvent: (input) => store.appendEvent(input),
    });
    const claim = execution.commands.createAuthorizedClaim({
      board_id: DEMO_BOARD_ID,
      goal_id: "PLATFORM",
      actor_id: "runtime-b",
      role: "executor",
      contract_revision: 1,
      action_kind: "execute",
      action_target_id: "PLATFORM",
      capabilities: [],
      goal_mode_attestation: false,
      resolved_policy: POLICY,
      lease_seconds: 30,
      reason: "test recovery",
    });
    const run = execution.commands.startRun({
      board_id: DEMO_BOARD_ID,
      claim_id: claim.claim_id,
      actor_id: "runtime-b",
    });

    now = "2026-09-02T00:00:31.000Z";
    assert.deepEqual(execution.commands.expirePastClaims(DEMO_BOARD_ID, "system"), [claim.claim_id]);
    assert.deepEqual(execution.commands.expirePastClaims(DEMO_BOARD_ID, "system"), []);
    assert.equal(execution.query.getClaim(DEMO_BOARD_ID, claim.claim_id)?.state, "expired");
    assert.equal(execution.query.getRun(DEMO_BOARD_ID, run.run_id)?.state, "abandoned");
    assert.throws(
      () => execution.commands.releaseClaim({
        board_id: DEMO_BOARD_ID,
        claim_id: claim.claim_id,
        actor_id: "runtime-b",
        reason: "late release",
      }),
      (error: unknown) => error instanceof ExecutionError && error.code === "claim.lease_expired",
    );
    assert.throws(
      () => execution.commands.reportRun({
        board_id: DEMO_BOARD_ID,
        run_id: run.run_id,
        actor_id: "runtime-b",
        state: "completed",
      }),
      (error: unknown) => error instanceof ExecutionError && error.code === "run.claim_expired",
    );
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

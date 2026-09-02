import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  EvidenceVerificationError,
  EvidenceVerificationModule,
} from "@adeptify/goalboard-module-evidence-verification";

import { DEMO_BOARD_ID, seedDemoBoard } from "../src/v1/demo.js";
import { SqliteGoalBoardStore } from "../src/v1/store.js";

test("Evidence public module owns locator preflight, records, review links, and criterion coverage", () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-evidence-module-"));
  const databasePath = join(directory, "goalboard.sqlite");
  const evidencePath = join(directory, "evidence.md");
  writeFileSync(evidencePath, "# Verification Result\n\nAll checks passed.\n", "utf8");
  seedDemoBoard(databasePath);
  const store = new SqliteGoalBoardStore(databasePath);
  let now = "2026-09-02T00:00:00.000Z";
  try {
    const evidence = new EvidenceVerificationModule({
      db: store.db,
      now: () => now,
      appendEvent: (input) => store.appendEvent(input),
    });
    const first = evidence.commands.submitAuthorizedEvidence({
      board_id: DEMO_BOARD_ID,
      goal_id: "V1",
      contract_revision: 1,
      criterion_ids: ["criterion-a", "criterion-a"],
      producer_actor_id: "runtime-a",
      kind: "test",
      locator: `${evidencePath}#Verification Result`,
      locator_context: { project_root: directory, workspace_id: "workspace-a" },
      result: "passed",
    }).evidence;

    assert.deepEqual(first.criterion_ids, ["criterion-a"]);
    assert.equal(first.locator, "project://evidence.md#Verification%20Result");
    assert.equal(first.locator_status, "verified");
    assert.equal(first.locator_workspace_id, "workspace-a");
    assert.equal(evidence.query.hasPassingEvidence({
      board_id: DEMO_BOARD_ID,
      goal_id: "V1",
      criterion_id: "criterion-a",
      compatible_contract_revisions: [1],
    }), true);
    assert.equal(evidence.query.hasPassingEvidence({
      board_id: DEMO_BOARD_ID,
      goal_id: "V1",
      criterion_id: "criterion-a",
      compatible_contract_revisions: [2],
    }), false);

    now = "2026-09-02T00:00:01.000Z";
    store.appendEvent({
      eventId: "rework-event",
      boardId: DEMO_BOARD_ID,
      actorId: "reviewer",
      type: "goal.rework_requested",
      objectType: "goal",
      objectId: "V1",
      reason: "fresh evidence required",
      payload: { criterion_ids: ["criterion-a"] },
      at: now,
    });
    assert.deepEqual(evidence.query.uncoveredCriterionIds({
      board_id: DEMO_BOARD_ID,
      goal_id: "V1",
      criterion_ids: ["criterion-a", "criterion-b"],
      compatible_contract_revisions: [1],
    }), ["criterion-a", "criterion-b"]);

    now = "2026-09-02T00:00:02.000Z";
    const fresh = evidence.commands.submitAuthorizedEvidence({
      board_id: DEMO_BOARD_ID,
      goal_id: "V1",
      contract_revision: 1,
      criterion_ids: ["criterion-a"],
      producer_actor_id: "runtime-a",
      kind: "inspection",
      locator: "command://fresh-check",
      result: "passed",
    }).evidence;
    const linked = evidence.commands.attachReview({
      board_id: DEMO_BOARD_ID,
      evidence_id: fresh.evidence_id,
      review_id: "review-a",
    });
    assert.equal(linked.review_id, "review-a");
    assert.ok(evidence.query.getReviewReference(fresh.evidence_id)?.submitted_event_seq);
    assert.equal(evidence.query.hasPassingEvidence({
      board_id: DEMO_BOARD_ID,
      goal_id: "V1",
      criterion_id: "criterion-a",
      compatible_contract_revisions: [1],
    }), true);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Evidence corrections are immutable, owner-scoped, acyclic, and remove stale passing coverage", () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-evidence-correction-module-"));
  const databasePath = join(directory, "goalboard.sqlite");
  seedDemoBoard(databasePath);
  const store = new SqliteGoalBoardStore(databasePath);
  try {
    const evidence = new EvidenceVerificationModule({
      db: store.db,
      now: () => "2026-09-02T00:00:00.000Z",
      appendEvent: (input) => store.appendEvent(input),
    });
    let sequence = 0;
    const submit = (result: "passed" | "failed") => evidence.commands.submitAuthorizedEvidence({
      board_id: DEMO_BOARD_ID,
      goal_id: "PLATFORM",
      contract_revision: 1,
      criterion_ids: ["criterion-a"],
      producer_actor_id: "runtime-a",
      kind: "test",
      locator: `command://${result}-${sequence += 1}`,
      result,
    }).evidence;
    const original = submit("passed");
    const replacement = submit("failed");
    const corrected = evidence.commands.correctEvidence({
      board_id: DEMO_BOARD_ID,
      goal_id: "PLATFORM",
      actor_id: "runtime-a",
      target_evidence_id: original.evidence_id,
      action: "supersede",
      replacement_evidence_id: replacement.evidence_id,
      reason: "the first check was invalid",
    });

    assert.equal(corrected.invalidates_passing_evidence, true);
    assert.equal(corrected.target_evidence.lifecycle_state, "superseded");
    assert.equal(corrected.replacement_evidence?.lifecycle_state, "effective");
    assert.equal(evidence.query.hasPassingEvidence({
      board_id: DEMO_BOARD_ID,
      goal_id: "PLATFORM",
      criterion_id: "criterion-a",
      compatible_contract_revisions: [1],
    }), false);
    assert.throws(
      () => evidence.commands.correctEvidence({
        board_id: DEMO_BOARD_ID,
        goal_id: "PLATFORM",
        actor_id: "runtime-b",
        target_evidence_id: original.evidence_id,
        action: "retract",
        reason: "not mine",
      }),
      (error: unknown) =>
        error instanceof EvidenceVerificationError && error.code === "evidence.correction_not_owner",
    );
    assert.throws(
      () => evidence.commands.correctEvidence({
        board_id: DEMO_BOARD_ID,
        goal_id: "PLATFORM",
        actor_id: "runtime-a",
        target_evidence_id: replacement.evidence_id,
        action: "supersede",
        replacement_evidence_id: original.evidence_id,
        reason: "would create a cycle",
      }),
      (error: unknown) =>
        error instanceof EvidenceVerificationError && error.code === "evidence.correction_cycle",
    );
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

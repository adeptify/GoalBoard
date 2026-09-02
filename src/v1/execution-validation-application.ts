import {
  deriveGoalActionProjection,
  deriveGoalActionProjections,
  type ExecutionValidationApplicationApi,
} from "@adeptify/goalboard-plugin-goals";

import { GoalBoardV1Error } from "./errors.js";
import { ExecutionValidationClaimCommands } from "./execution-validation-claim-commands.js";
import type { ExecutionValidationApplicationPorts } from "./execution-validation-ports.js";
import { ExecutionValidationRunCommands } from "./execution-validation-run-commands.js";
import { ExecutionValidationVerificationCommands } from "./execution-validation-verification-commands.js";
import type { BoardSnapshot } from "./types.js";

export class ExecutionValidationApplication
  implements ExecutionValidationApplicationApi<BoardSnapshot> {
  readonly query: ExecutionValidationApplicationApi<BoardSnapshot>["query"];
  readonly commands: ExecutionValidationApplicationApi<BoardSnapshot>["commands"];

  constructor(ports: ExecutionValidationApplicationPorts) {
    const claimCommands = new ExecutionValidationClaimCommands(ports);
    const runCommands = new ExecutionValidationRunCommands(ports);
    const verificationCommands = new ExecutionValidationVerificationCommands(ports);

    this.query = {
      getGoalWorkState: (input) => {
        ports.requireBoard(input.board_id);
        const snapshot = ports.store.snapshot(input.board_id);
        const goal = snapshot.goals.find((item) => item.goal_id === input.goal_id);
        if (!goal) throw new GoalBoardV1Error("goal.not_found", `找不到这个 Goal: ${input.goal_id}`);
        return ports.deriveGoalWorkState(
          input.board_id,
          goal,
          snapshot,
          ports.clock().toISOString(),
        );
      },
      getGoalWorkStates: (input) => {
        ports.requireBoard(input.board_id);
        const snapshot = input.snapshot ?? ports.store.snapshot(input.board_id);
        if (snapshot.board.board_id !== input.board_id) {
          throw new GoalBoardV1Error("board.snapshot_mismatch", "BoardSnapshot 不属于请求的 Board");
        }
        return snapshot.goals.map((goal) =>
          ports.deriveGoalWorkState(input.board_id, goal, snapshot, ports.clock().toISOString())
        );
      },
      getGoalActionProjection: (input) => {
        ports.requireBoard(input.board_id);
        const snapshot = ports.store.snapshot(input.board_id);
        const goal = snapshot.goals.find((item) => item.goal_id === input.goal_id);
        if (!goal) throw new GoalBoardV1Error("goal.not_found", `找不到这个 Goal: ${input.goal_id}`);
        return deriveGoalActionProjection(goal, snapshot, ports.clock().toISOString());
      },
      getGoalActionProjections: (input) => {
        ports.requireBoard(input.board_id);
        const snapshot = input.snapshot ?? ports.store.snapshot(input.board_id);
        if (snapshot.board.board_id !== input.board_id) {
          throw new GoalBoardV1Error("board.snapshot_mismatch", "BoardSnapshot 不属于请求的 Board");
        }
        return deriveGoalActionProjections(snapshot, ports.clock().toISOString());
      },
    };
    this.commands = {
      claimGoal: (input) => claimCommands.claimGoal(input),
      renewClaim: (input) => claimCommands.renewClaim(input),
      selectGoalAndStart: (input) => claimCommands.selectGoalAndStart(input),
      releaseClaim: (input) => claimCommands.releaseClaim(input),
      revokeClaim: (input) => claimCommands.revokeClaim(input),
      startRun: (input) => claimCommands.startRun(input),
      requestGoalRework: (input) => runCommands.requestGoalRework(input),
      reportRun: (input) => runCommands.reportRun(input),
      submitEvidence: (input) => verificationCommands.submitEvidence(input),
      correctEvidence: (input) => verificationCommands.correctEvidence(input),
      submitReview: (input) => verificationCommands.submitReview(input),
      submitHumanReview: (input) => verificationCommands.submitHumanReviewFromDialogue(input),
    };
  }
}

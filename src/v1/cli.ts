import fs from "node:fs";
import path from "node:path";
import { GoalBoardCoordinator } from "./coordinator.js";
import { SqliteGoalBoardStore } from "./store.js";
import type { ClaimRequest, CreateGoalInput } from "./types.js";
import { importV3Board } from "./migration.js";

const DEFAULT_DATABASE = ".goalboard/goalboard.db";

function value(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function payload(args: string[]): Record<string, unknown> {
  const inline = value(args, "--json");
  const file = value(args, "--file");
  if (inline) return JSON.parse(inline) as Record<string, unknown>;
  if (file) return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  return {};
}

function print(value_: unknown): void {
  console.log(JSON.stringify(value_, null, 2));
}

export function printV1Help(): void {
  console.log(`goalboard v1 <operation> --db PATH --json '{...}'

Operations:
  init | create-goal | snapshot | contract | ready | explain | claim | release
  run-start | run-report | revalidate | evidence-submit | review-submit | complete
  relation-add | impact-add | policy-set | risk-add | risk-state | active-goal
  contract-propose | contract-decide | candidate-submit | dependency-propose
  candidate-decide | rewire-confirm | import-v3

Complex payloads may use --file payload.json instead of --json.
The SQLite database defaults to ${DEFAULT_DATABASE}.`);
}

export async function runV1Cli(args: string[]): Promise<number> {
  const operation = args[0];
  if (!operation || operation === "--help" || operation === "-h") {
    printV1Help();
    return 0;
  }
  const databasePath = path.resolve(value(args, "--db") ?? DEFAULT_DATABASE);
  if (operation === "init" || operation === "import-v3") {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }
  if (operation !== "init" && operation !== "import-v3" && !fs.existsSync(databasePath)) {
    throw new Error(`GoalBoard 数据库不存在: ${databasePath}`);
  }
  const input = payload(args);
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  try {
    switch (operation) {
      case "init":
        print(
          coordinator.initializeBoard({
            board_id: String(input.board_id),
            title: String(input.title),
            actor_id: String(input.actor_id),
            idempotency_key: String(input.idempotency_key),
          }),
        );
        break;
      case "create-goal":
        print(
          coordinator.createGoal(String(input.board_id), input.goal as CreateGoalInput, {
            actor_id: String(input.actor_id),
            idempotency_key: String(input.idempotency_key),
            reason: input.reason == null ? undefined : String(input.reason),
          }),
        );
        break;
      case "relation-add":
        print(
          coordinator.addRelation(
            String(input.board_id),
            input.relation as Parameters<GoalBoardCoordinator["addRelation"]>[1],
            {
              actor_id: String(input.actor_id),
              idempotency_key: String(input.idempotency_key),
              reason: input.reason == null ? undefined : String(input.reason),
            },
          ),
        );
        break;
      case "impact-add":
        print(
          coordinator.addImpact(
            String(input.board_id),
            input.impact as Parameters<GoalBoardCoordinator["addImpact"]>[1],
            { actor_id: String(input.actor_id), idempotency_key: String(input.idempotency_key) },
          ),
        );
        break;
      case "policy-set":
        print(
          coordinator.setPolicy(
            String(input.board_id),
            input.binding as Parameters<GoalBoardCoordinator["setPolicy"]>[1],
            { actor_id: String(input.actor_id), idempotency_key: String(input.idempotency_key) },
          ),
        );
        break;
      case "risk-add":
        print(
          coordinator.addRisk(
            String(input.board_id),
            input.risk as Parameters<GoalBoardCoordinator["addRisk"]>[1],
            { actor_id: String(input.actor_id), idempotency_key: String(input.idempotency_key) },
          ),
        );
        break;
      case "risk-state":
        print(
          coordinator.setRiskState(
            String(input.board_id),
            input.risk as Parameters<GoalBoardCoordinator["setRiskState"]>[1],
            { actor_id: String(input.actor_id), idempotency_key: String(input.idempotency_key) },
          ),
        );
        break;
      case "active-goal":
        print(
          coordinator.setActiveGoal(
            String(input.board_id),
            { goal_id: String(input.goal_id), reason: String(input.reason) },
            { actor_id: String(input.actor_id), idempotency_key: String(input.idempotency_key) },
          ),
        );
        break;
      case "snapshot":
        print(store.snapshot(String(input.board_id)));
        break;
      case "contract": {
        const contract = coordinator.readGoalContract(String(input.board_id), String(input.goal_id));
        const baseUrl =
          value(args, "--web-base-url") ??
          process.env.GOALBOARD_WEB_URL ??
          "http://127.0.0.1:4173";
        let goalUrl: string;
        try {
          goalUrl = new URL(contract.goal_path, baseUrl).toString();
        } catch {
          throw new Error(`无效的 GoalBoard Web 地址: ${baseUrl}`);
        }
        print({ ...contract, goal_url: goalUrl });
        break;
      }
      case "ready":
        print(
          coordinator.queryReady({
            board_id: String(input.board_id),
            actor_id: String(input.actor_id),
            role: input.role as Parameters<GoalBoardCoordinator["queryReady"]>[0]["role"],
            capabilities: (input.capabilities as string[]) ?? [],
            goal_mode_attestation: Boolean(input.goal_mode_attestation),
          }),
        );
        break;
      case "explain":
        print(
          coordinator.explainGoal({
            board_id: String(input.board_id),
            goal_id: String(input.goal_id),
            actor_id: String(input.actor_id),
            role: input.role as Parameters<GoalBoardCoordinator["explainGoal"]>[0]["role"],
            capabilities: (input.capabilities as string[]) ?? [],
            goal_mode_attestation: Boolean(input.goal_mode_attestation),
          }),
        );
        break;
      case "claim":
        print(coordinator.claimGoal(input as unknown as ClaimRequest));
        break;
      case "release":
        print(
          coordinator.releaseClaim(
            input as unknown as Parameters<GoalBoardCoordinator["releaseClaim"]>[0],
          ),
        );
        break;
      case "run-start":
        print(
          coordinator.startRun(input as unknown as Parameters<GoalBoardCoordinator["startRun"]>[0]),
        );
        break;
      case "revalidate":
        print(
          coordinator.revalidateGoal(
            input as unknown as Parameters<GoalBoardCoordinator["revalidateGoal"]>[0],
          ),
        );
        break;
      case "run-report":
        print(
          coordinator.reportRun(input as unknown as Parameters<GoalBoardCoordinator["reportRun"]>[0]),
        );
        break;
      case "evidence-submit":
        print(
          coordinator.submitEvidence(
            input as unknown as Parameters<GoalBoardCoordinator["submitEvidence"]>[0],
          ),
        );
        break;
      case "review-submit":
        print(
          coordinator.submitReview(
            input as unknown as Parameters<GoalBoardCoordinator["submitReview"]>[0],
          ),
        );
        break;
      case "complete":
        print(
          coordinator.evaluateLeafCompletion(
            input as unknown as Parameters<GoalBoardCoordinator["evaluateLeafCompletion"]>[0],
          ),
        );
        break;
      case "contract-propose":
        print(
          coordinator.submitContractProposal(
            input as unknown as Parameters<GoalBoardCoordinator["submitContractProposal"]>[0],
          ),
        );
        break;
      case "contract-decide":
        print(
          coordinator.decideContractProposal(
            input as unknown as Parameters<GoalBoardCoordinator["decideContractProposal"]>[0],
          ),
        );
        break;
      case "candidate-submit":
        print(
          coordinator.submitCandidate(
            input as unknown as Parameters<GoalBoardCoordinator["submitCandidate"]>[0],
          ),
        );
        break;
      case "dependency-propose":
        print(
          coordinator.submitDependencyProposal(
            input as unknown as Parameters<GoalBoardCoordinator["submitDependencyProposal"]>[0],
          ),
        );
        break;
      case "candidate-decide":
        print(
          coordinator.decideCandidate(
            input as unknown as Parameters<GoalBoardCoordinator["decideCandidate"]>[0],
          ),
        );
        break;
      case "rewire-confirm":
        print(
          coordinator.confirmRewire(
            input as unknown as Parameters<GoalBoardCoordinator["confirmRewire"]>[0],
          ),
        );
        break;
      case "import-v3":
        print(
          importV3Board(store, coordinator, input as never, {
            target_board_id: String(value(args, "--board-id")),
            actor_id: String(value(args, "--actor")),
            idempotency_key: String(value(args, "--key")),
          }),
        );
        break;
      default:
        throw new Error(`未知 V1 operation: ${operation}`);
    }
    return 0;
  } finally {
    store.close();
  }
}

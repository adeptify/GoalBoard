import type {
  ExecutionApplicationApi,
  ExecutionCommandApi,
  ExecutionQueryApi,
} from "@adeptify/goalboard-contracts/modules/execution";

import { ExecutionLifecycle, type ExecutionLifecycleOptions } from "./lifecycle.js";
import { ExecutionRepository, type ExecutionSqliteDatabase } from "./repository.js";

export const packageDescriptor = {
  packageName: "@adeptify/goalboard-module-execution",
  packagePath: "modules/execution",
  kind: "module",
  maturity: "partial",
  contract: "@adeptify/goalboard-contracts/modules/execution",
  migrationGoals: ["goal-reorg-f2", "goal-reorg-ex1", "goal-reorg-ex4"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [
    "execution.claim-lifecycle.v1",
    "execution.run-lifecycle.v1",
    "execution.repository.v1",
    "execution.recovery.v1",
  ],
} as const;

export type GoalBoardPackageDescriptor = typeof packageDescriptor;

export interface ExecutionModuleOptions extends ExecutionLifecycleOptions {
  db: ExecutionSqliteDatabase;
}

export class ExecutionModule implements ExecutionApplicationApi {
  readonly repository: ExecutionRepository;
  readonly lifecycle: ExecutionLifecycle;
  readonly query: ExecutionQueryApi;
  readonly commands: ExecutionCommandApi;

  constructor(options: ExecutionModuleOptions) {
    this.repository = new ExecutionRepository(options.db);
    this.lifecycle = new ExecutionLifecycle(this.repository, options);
    this.commands = this.lifecycle;
    this.query = {
      getClaim: (boardId, claimId) => this.repository.getClaim(boardId, claimId),
      getRun: (boardId, runId) => this.repository.getRun(boardId, runId),
      getRunWithClaim: (boardId, runId) => this.repository.getRunWithClaim(boardId, runId),
      listClaims: (boardId) => this.repository.listClaims(boardId),
      listRuns: (boardId) => this.repository.listRuns(boardId),
    };
  }
}

export { ExecutionError, type ExecutionErrorFactory } from "./errors.js";
export { ExecutionLifecycle, type ExecutionLifecycleOptions } from "./lifecycle.js";
export {
  migrateClarifierRoles,
  migrateExecutionActionColumns,
  migrateReviewerRunRoles,
  migrateUnifiedClaimRolesAndExclusivity,
  type ExecutionMigrationDatabase,
} from "./migrations.js";
export {
  EXECUTION_SCHEMA_SQL,
  ExecutionRepository,
  createExecutionSchema,
  mapExecutionClaim,
  mapExecutionRun,
  type ExecutionEventInput,
  type ExecutionSqliteDatabase,
  type ExecutionSqliteStatement,
} from "./repository.js";

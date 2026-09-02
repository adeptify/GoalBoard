import path from "node:path";

import {
  LocalHost,
} from "@adeptify/goalboard-app-local-host";
import type {
  HostCapabilityDefinition,
  LocalHostProjectClient,
  LocalHostProjectReference,
  LocalHostStatus,
} from "@adeptify/goalboard-contracts/platform/app-host";
import type { PlanningMethodPack } from "@adeptify/goalboard-contracts/modules/goals";

import { GoalBoardCoordinator } from "../v1/coordinator.js";
import { SqliteGoalBoardStore } from "../v1/store.js";
import type { CreateGoalInput } from "../v1/types.js";

export interface GoalBoardProjectRuntime {
  store: SqliteGoalBoardStore;
  coordinator: GoalBoardCoordinator;
}

export interface GoalBoardLocalHostOptions {
  planningMethods?: () => readonly PlanningMethodPack[];
  clock?: () => Date;
  instanceId?: string;
  onRuntimeOpen?: (reference: LocalHostProjectReference) => void;
  onRuntimeClose?: (reference: LocalHostProjectReference) => void;
}

type InitializeBoardInput = Parameters<GoalBoardCoordinator["initializeBoard"]>[0];
type InitializeBoardOutput = ReturnType<GoalBoardCoordinator["initializeBoard"]>;
type SnapshotOutput = ReturnType<SqliteGoalBoardStore["snapshot"]>;

export interface CreateGoalCapabilityInput {
  board_id: string;
  goal: CreateGoalInput;
  actor_id: string;
  idempotency_key: string;
  reason?: string;
}

type CreateGoalCapabilityOutput = ReturnType<GoalBoardCoordinator["goals"]["commands"]["createGoal"]>;

export const initializeBoardCapability = {
  capability_id: "io.goalboard.local-host.board.initialize",
  version: 1,
  operation: "command",
} as HostCapabilityDefinition<InitializeBoardInput, InitializeBoardOutput>;

export const snapshotBoardCapability = {
  capability_id: "io.goalboard.local-host.board.snapshot",
  version: 1,
  operation: "query",
} as HostCapabilityDefinition<{ board_id: string }, SnapshotOutput>;

export const createGoalCapability = {
  capability_id: "io.goalboard.local-host.goals.create",
  version: 1,
  operation: "command",
} as HostCapabilityDefinition<CreateGoalCapabilityInput, CreateGoalCapabilityOutput>;

export function goalBoardHostProjectReference(input: {
  databasePath: string;
  boardId: string;
  projectId?: string | null;
}): LocalHostProjectReference {
  const storageKey = path.resolve(input.databasePath);
  const boardId = input.boardId.trim() || `database:${storageKey}`;
  return {
    project_id: input.projectId?.trim() || boardId,
    board_id: boardId,
    storage_key: storageKey,
  };
}

/**
 * Compatibility composition adapter. It is the only legacy location allowed
 * to construct Store + Coordinator while their remaining owners migrate.
 */
export class GoalBoardLocalHost {
  private readonly host: LocalHost<GoalBoardProjectRuntime>;

  constructor(options: GoalBoardLocalHostOptions = {}) {
    this.host = new LocalHost({
      instanceId: options.instanceId,
      runtimeFactory: {
        open: (reference) => {
          options.onRuntimeOpen?.(reference);
          const store = new SqliteGoalBoardStore(reference.storage_key);
          return {
            store,
            coordinator: new GoalBoardCoordinator(
              store,
              options.clock ?? (() => new Date()),
              [...(options.planningMethods?.() ?? [])],
            ),
          };
        },
        close: (runtime, reference) => {
          runtime.store.close();
          options.onRuntimeClose?.(reference);
        },
      },
    });
    this.host.register(initializeBoardCapability, (runtime, input) =>
      runtime.coordinator.initializeBoard(input));
    this.host.register(snapshotBoardCapability, (runtime, input) =>
      runtime.store.snapshot(input.board_id));
    this.host.register(createGoalCapability, (runtime, input) =>
      runtime.coordinator.goals.commands.createGoal(
        input.board_id,
        input.goal,
        {
          actor_id: input.actor_id,
          idempotency_key: input.idempotency_key,
          reason: input.reason,
        },
      ));
  }

  client(reference: LocalHostProjectReference): LocalHostProjectClient {
    return this.host.client(reference);
  }

  withProject<Result>(
    reference: LocalHostProjectReference,
    operation: (runtime: GoalBoardProjectRuntime) => Result | Promise<Result>,
  ): Promise<Result> {
    return this.host.withRuntime(reference, operation);
  }

  closeProject(referenceOrStorageKey: LocalHostProjectReference | string): Promise<boolean> {
    return this.host.closeProject(referenceOrStorageKey);
  }

  close(): Promise<void> {
    return this.host.close();
  }

  status(): LocalHostStatus {
    return this.host.status();
  }
}

export function createGoalBoardLocalHost(options: GoalBoardLocalHostOptions = {}): GoalBoardLocalHost {
  return new GoalBoardLocalHost(options);
}

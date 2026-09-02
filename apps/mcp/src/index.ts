import type { GoalsApplicationApi } from "@adeptify/goalboard-contracts/modules/goals";
import type { ExecutionValidationApplicationApi } from "@adeptify/goalboard-plugin-goals";

export const packageDescriptor = {
  packageName: "@adeptify/goalboard-app-mcp",
  packagePath: "apps/mcp",
  kind: "app",
  maturity: "partial",
  contract: "@adeptify/goalboard-contracts/platform/app-host",
  migrationGoals: ["goal-reorg-f2", "goal-reorg-dv1", "goal-reorg-dv2", "goal-reorg-gw4", "goal-reorg-ex4"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["mcp.goals-command-adapter.v1", "mcp.execution-validation-adapter.v1"],
} as const;

export type GoalBoardPackageDescriptor = typeof packageDescriptor;

export type McpGoalsAdapter<TTransition = unknown> = GoalsApplicationApi<TTransition>;

/** Bind MCP tools to the public Goals Contract without copying Module rules. */
export function createMcpGoalsAdapter<TTransition>(
  goals: GoalsApplicationApi<TTransition>,
): McpGoalsAdapter<TTransition> {
  return {
    commands: goals.commands,
    lifecycle: goals.lifecycle,
    planning: goals.planning,
  };
}

export type McpExecutionValidationAdapter<TSnapshot = unknown> =
  ExecutionValidationApplicationApi<TSnapshot>;

/** Bind MCP tools to the transport-neutral execution and review application port. */
export function createMcpExecutionValidationAdapter<TSnapshot>(
  application: ExecutionValidationApplicationApi<TSnapshot>,
): McpExecutionValidationAdapter<TSnapshot> {
  return { query: application.query, commands: application.commands };
}

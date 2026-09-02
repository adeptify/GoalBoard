# @adeptify/goalboard-app-mcp

Status: `partial`  
Workspace path: `apps/mcp`  
Contract entrypoint: `@adeptify/goalboard-contracts/platform/app-host`

## Purpose

Thin MCP schema, audience, and capability adapter.

This package explicitly does **not** own Business rules, direct Store access, or Runtime Skill policy.

## Public entrypoint

`src/index.ts` binds MCP Goal tools to `GoalsApplicationApi` and Claim → Run → Evidence → Review tools to `ExecutionValidationApplicationApi`. It does not register a Runtime provider, create a Store, or copy business rules.

## Dependencies

Dependencies are limited to public Contracts and the protected Goals Native Plugin entrypoint that publishes the execution-validation application Contract.

## Commands

```bash
pnpm --filter @adeptify/goalboard-app-mcp typecheck
pnpm --filter @adeptify/goalboard-app-mcp build
```

## Migration Goals

- `goal-reorg-f2`
- `goal-reorg-dv1`
- `goal-reorg-dv2`
- `goal-reorg-gw4`
- `goal-reorg-ex4`

## Legacy sources

- `src/mcp/`

GW4 moved Goal write, Lifecycle, and Planning calls through this adapter. EX4 moved execution and acceptance calls through the same public application port while preserving the existing MCP schema, errors, authority checks, and results. See [the architecture SSOT](../../docs/SSOT-MATRIX.md) and [migration matrix](../../docs/system/MIGRATION.md).

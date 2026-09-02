# @adeptify/goalboard-app-cli

Status: `partial`  
Workspace path: `apps/cli`  
Contract entrypoint: `@adeptify/goalboard-contracts/platform/app-host`

## Purpose

Thin CLI protocol, argument, and presentation adapter.

This package explicitly does **not** own Business decisions, Module Stores, or duplicated application rules.

## Public entrypoint

`src/index.ts` binds CLI Goal writes to `GoalsApplicationApi` and Claim → Run → Evidence → Review operations to `ExecutionValidationApplicationApi`. It does not create a Store or copy business rules.

## Dependencies

Dependencies are limited to public Contracts and the protected Goals Native Plugin entrypoint that publishes the execution-validation application Contract.

## Commands

```bash
pnpm --filter @adeptify/goalboard-app-cli typecheck
pnpm --filter @adeptify/goalboard-app-cli build
```

## Migration Goals

- `goal-reorg-f2`
- `goal-reorg-dv1`
- `goal-reorg-gw4`
- `goal-reorg-ex4`

## Legacy sources

- `src/cli/`

GW4 moved Goal write and Lifecycle operations through this adapter. EX4 moved execution and acceptance calls through the same public application port while preserving existing CLI payloads, errors, and results. See [the architecture SSOT](../../docs/SSOT-MATRIX.md) and [migration matrix](../../docs/system/MIGRATION.md).

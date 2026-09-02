# @adeptify/goalboard-module-execution

Status: `partial`  
Workspace path: `modules/execution`  
Contract entrypoint: `@adeptify/goalboard-contracts/modules/execution`

## Purpose

Claim, Run, attempt, lease, and execution lifecycle facts.

This package explicitly does **not** own Goal Contracts, Evidence, Reviews, Sessions, or Runtime processes.

## Public entrypoint

`src/index.ts` exports `ExecutionModule` with `query` and `commands`, plus the public Repository, lifecycle, schema, and migration helpers. The Module owns Claim/Run persistence, lease renewal and expiry, state transitions, active-Run recovery, and lifecycle events.

The existing Coordinator remains an application compatibility layer for Goal action eligibility, Contract-revision checks, idempotency receipts, and cross-owner lifecycle reconciliation. CLI, MCP, and Web still enter that compatibility layer until EX4; they do not bypass the Execution public API to write Claim/Run state.

## Dependencies

The only declared workspace dependency is `@adeptify/goalboard-contracts`. Execution receives Goal and event capabilities through narrow constructor ports; it does not import the Goals Store, Evidence Store, Session Registry, Web server, or a Runtime adapter.

## Commands

```bash
pnpm --filter @adeptify/goalboard-module-execution typecheck
pnpm --filter @adeptify/goalboard-module-execution build
```

## Migration Goals

- `goal-reorg-f2`
- `goal-reorg-ex1`
- `goal-reorg-ex4`

## Legacy sources

- `src/v1/coordinator.ts`
- `src/v1/store.ts`

EX1 has moved the real Claim/Run schema, migrations, Repository, lifecycle, recovery, Store snapshot reads, and Coordinator/Project Catalog callers into this boundary. EX4 still owns removal of the application compatibility facade and the final Web/CLI/MCP/action-projection cutover. See [the architecture SSOT](../../docs/SSOT-MATRIX.md), [migration matrix](../../docs/system/MIGRATION.md), and [EX1 validation](../../specs/goalboard-architecture-reorganization/ex1-validation.md).

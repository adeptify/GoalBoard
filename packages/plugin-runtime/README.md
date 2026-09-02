# @adeptify/goalboard-plugin-runtime

Status: `partial`  
Workspace path: `packages/plugin-runtime`  
Contract entrypoint: `@adeptify/goalboard-contracts/platform/plugin`

## Purpose

Plugin identity, install, grants, isolation, lifecycle, and rollback boundary.

This package explicitly does **not** own Module business facts or provider-specific protocols.

## Public entrypoint

`src/index.ts` exports the in-process reference Runtime: definition registration, signature-bound installation identity, Manifest grant ceiling, start, crash reporting, bounded recovery, uninstall, Receipts, and an injectable repository/executor boundary.

## Dependencies

The only workspace dependency is the public Plugin Contract. Provider protocols and Module Stores are deliberately absent.

## Commands

```bash
pnpm --filter @adeptify/goalboard-plugin-runtime typecheck
pnpm --filter @adeptify/goalboard-plugin-runtime build
```

## Migration Goals

- `goal-reorg-f2`
- `goal-reorg-fd3`
- `goal-reorg-dv3`

## Legacy sources

- `src/install/`

FD3 supplies the first real Contract → Runtime → official Plugin → Listener/Signal caller slice. Durable host persistence and process isolation remain later Runtime work. See [the architecture SSOT](../../docs/SSOT-MATRIX.md) and [migration matrix](../../docs/system/MIGRATION.md).

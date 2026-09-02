# @adeptify/goalboard-ui-host

Status: `partial`  
Workspace path: `packages/ui-host`  
Contract entrypoint: `@adeptify/goalboard-contracts/platform/ui`

## Purpose

UI Contribution, Slot, Embed, isolation, and Host bridge boundary.

This package explicitly does **not** own Native Plugin product behavior or Module business facts.

## Public entrypoint

`src/index.ts` exports `UiHost`, a small registry that validates and mounts public `UiContribution` objects. It owns contribution identity, surface lookup, and compatibility between declared Plugin surfaces and Workbench slots; it does not own Feed behavior, product facts, browser state, or a Store.

## Dependencies

The only declared workspace dependency is `@adeptify/goalboard-contracts`. Implementation dependencies are added by the Goal that migrates a complete use case, never by deep-importing legacy code.

## Commands

```bash
pnpm --filter @adeptify/goalboard-ui-host typecheck
pnpm --filter @adeptify/goalboard-ui-host build
```

## Migration Goals

- `goal-reorg-f2`
- `goal-reorg-ap3`
- `goal-reorg-fd4`

## Legacy sources

- `src/web/render.ts`

FD4 supplied the first real consumer: `apps/workbench` registers the official Feed contribution and renders it through this host. See [the architecture SSOT](../../docs/SSOT-MATRIX.md) and [migration matrix](../../docs/system/MIGRATION.md).

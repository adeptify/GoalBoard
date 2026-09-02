# @adeptify/goalboard-plugin-feed

Status: `partial`  
Workspace path: `plugins/native/feed`  
Contract entrypoint: `@adeptify/goalboard-contracts/platform/plugin`

## Purpose

First-party Feed navigation, UI, disposition, and Module composition.

This package explicitly does **not** own Source/Signal/Feed/Attention facts or Provider implementations.

## Public entrypoint

`src/index.ts` exposes the native Plugin's public module composition, UI Contribution, and HTTP route table. The contribution renders Feed / Attention lists and details, source management, connector setup, scheduling, empty/error/retry states, and Relay migration entrypoints. `apps/workbench` registers it through `packages/ui-host`; Web only supplies host primitives and current view data.

## Dependencies

The only declared workspace dependency is `@adeptify/goalboard-contracts`. Feed facts remain owned by the Feed and Attention Modules; this package consumes their public records and does not open Stores or deep-import another package.

## Commands

```bash
pnpm --filter @adeptify/goalboard-plugin-feed typecheck
pnpm --filter @adeptify/goalboard-plugin-feed build
```

## Migration Goals

- `goal-reorg-f2`
- `goal-reorg-fd4`

## Legacy sources

- `src/web/render.ts`
- `src/web/server.ts`

FD4 moved the real Feed UI and HTTP route ownership here and switched the Web callers. Goal-specific decision cards remain host-owned content inserted through the declared Feed detail slot. See [the architecture SSOT](../../../docs/SSOT-MATRIX.md) and [migration matrix](../../../docs/system/MIGRATION.md).

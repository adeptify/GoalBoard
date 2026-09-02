# @adeptify/goalboard-module-feed

<!-- Updated by the FD2 vertical migration. -->

Status: `partial`  
Workspace path: `modules/feed`  
Contract entrypoint: `@adeptify/goalboard-contracts/modules/feed`

## Purpose

Feed Item visibility, read/archive state, disposition, and promotion provenance.

This package explicitly does **not** own Provider listening, Signal ownership, or direct Goal/Artifact/Action creation.

## Public entrypoint

`FeedModule` exposes Feed Query, Command, Event and migration APIs. It owns the existing `feed_items` and `feed_materials` schemas, preserves local disposition during legacy imports, and records the accepted Signal id + revision when a Signal forms or updates an item.

## Dependencies

The package depends only on published Contract subpaths. Attention coordination is injected as `AttentionApi`; Feed never imports the Attention implementation or writes `inbox_entries`.

## Commands

```bash
pnpm --filter @adeptify/goalboard-module-feed typecheck
pnpm --filter @adeptify/goalboard-module-feed build
```

## Migration Goals

- `goal-reorg-f2`
- `goal-reorg-fd2`

## Legacy sources

- `src/feed/store.ts`

The old `FeedStore` methods are compatibility forwards. Relay import and the Goal advance context query now use those public forwards rather than direct Feed table SQL. FD4 will move the remaining Web UI/route composition. See [the architecture SSOT](../../docs/SSOT-MATRIX.md) and [migration matrix](../../docs/system/MIGRATION.md).

# @adeptify/goalboard-module-attention-resumption

<!-- Updated by the FD2 vertical migration. -->

Status: `partial`  
Workspace path: `modules/attention-resumption`  
Contract entrypoint: `@adeptify/goalboard-contracts/modules/attention-resumption`

## Purpose

Attention items, reasons, snooze state, and resume cues.

This package explicitly does **not** own Feed Items, Actions, Goals, Sessions, notifications, or Runtime processes.

## Public entrypoint

`AttentionModule` exposes Inbox/Attention Query, Command, Event and narrow legacy-migration APIs. It owns `inbox_entries`, validates subject/reason combinations, enforces optimistic revisions and controls the open/in-progress/done/dismissed state machine.

## Dependencies

The package depends only on its public Contract. Subject existence is supplied through `AttentionSubjectResolver`, so Attention never imports Feed, Source or Goal implementations and never copies their content.

## Commands

```bash
pnpm --filter @adeptify/goalboard-module-attention-resumption typecheck
pnpm --filter @adeptify/goalboard-module-attention-resumption build
```

## Migration Goals

- `goal-reorg-f2`
- `goal-reorg-fd2`

## Legacy sources

- `src/feed/store.ts`

The old Inbox methods on `FeedStore` are compatibility forwards. Full snooze/resume cues remain a future product feature; FD2 migrates only behavior that already exists. See [the architecture SSOT](../../docs/SSOT-MATRIX.md) and [migration matrix](../../docs/system/MIGRATION.md).

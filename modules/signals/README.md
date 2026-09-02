# @adeptify/goalboard-module-signals

Status: `partial`  
Workspace path: `modules/signals`  
Contract entrypoint: `@adeptify/goalboard-contracts/modules/signals`

## What it owns

Normalized external-event identity, Source-scoped provider dedupe identity, revision, controlled content references, adapter/provenance records and accepted validation state.

`SignalsModule.commands.submitDraft` validates and accepts a Draft. The SQLite repository creates one stable Signal per `project_id + source_id + provider_dedupe_id`; an unchanged duplicate returns the existing fact, while changed normalized content creates the next revision. Query methods never expose the repository.

It does not connect to Providers, store Listener cursor/lease, decide Feed/Attention placement or mutate Goals and Automation.

## FD1 implementation

The GitHub/Gmail compatibility caller now passes Raw Events through Listener Host and this Module before creating the current Feed projection. `signals` and `signal_revisions` are the formal external-event facts; `feed_items` remain the current Feed facts until `goal-reorg-fd2`.

## Remaining legacy callers

Public RSS/Web Query/YouTube collection still normalizes directly in `src/feed/sources/service.ts`; provider adapters move in `goal-reorg-fd3`. The Feed projection switches fully in `goal-reorg-fd2` and UI callers in `goal-reorg-fd4`.

## Commands

```bash
pnpm --filter @adeptify/goalboard-module-signals typecheck
pnpm --filter @adeptify/goalboard-module-signals build
```

Migration Goals: `goal-reorg-f2`, `goal-reorg-fd1`.

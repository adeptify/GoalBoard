# @adeptify/goalboard-module-sources

Status: `partial`  
Workspace path: `modules/sources`  
Contract entrypoint: `@adeptify/goalboard-contracts/modules/sources`

## What it owns

Source identity, display/configuration, enabled/paused/disconnected state, listening scope, schedule intent and connection reference. `SourcesModule.query` and `SourcesModule.commands` are the only public behavior entrypoints.

Listener cursor, lease, retry and quarantine are intentionally absent from `SourceRecord`; they belong to Listener Host. Secrets, Signals, Feed disposition and Goals also remain outside this package.

## FD1 implementation

`SourcesModule` now owns the existing `feed_sources` schema and Source transition rules. The old `FeedStore` methods are compatibility forwards to this public API. The legacy `cursor_json` column is retained only as a migration input for existing databases and is no longer read or updated as the active cursor.

## Remaining legacy callers

- `src/feed/sources/service.ts` still contains public-source registration/provider orchestration and calls the compatibility facade.
- `src/feed/connectors/service.ts` still owns provider authorization composition until `goal-reorg-fd3`.
- Web routes switch from the facade in `goal-reorg-fd4`.

The compatibility Source methods can be deleted after those callers use `SourcesApi` directly and FD4 completes behavior comparison.

## Commands

```bash
pnpm --filter @adeptify/goalboard-module-sources typecheck
pnpm --filter @adeptify/goalboard-module-sources build
```

Migration Goals: `goal-reorg-f2`, `goal-reorg-fd1`.

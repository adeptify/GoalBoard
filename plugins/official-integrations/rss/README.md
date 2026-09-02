# @adeptify/goalboard-integration-rss

Status: `partial`  
Workspace path: `plugins/official-integrations/rss`  
Contract entrypoint: `@adeptify/goalboard-contracts/platform/plugin`

## Purpose

Official catalog and custom RSS provider adapters.

This package explicitly does **not** own Source/Signal/Feed facts or a general-purpose HTTP platform.

## Public entrypoint

`src/index.ts` exports the reviewed Manifest and an Integration Plugin definition factory. `manifest.json` is the package-facing install declaration; the current provider port is injected by the local composition layer.

## Dependencies

The Plugin depends only on the public Plugin Contract and Plugin SDK. It does not import Feed/Signal stores, Host internals, or another Plugin.

## Commands

```bash
pnpm --filter @adeptify/goalboard-integration-rss typecheck
pnpm --filter @adeptify/goalboard-integration-rss build
```

## Migration Goals

- `goal-reorg-f2`
- `goal-reorg-fd3`

## Legacy sources

- `src/feed/sources/`

FD3 establishes the installable identity, grants, lifecycle contribution, and Signal transformation. Moving the remaining provider protocol from its compatibility path is later cleanup behind the same public contract. See [the architecture SSOT](../../../docs/SSOT-MATRIX.md) and [migration matrix](../../../docs/system/MIGRATION.md).

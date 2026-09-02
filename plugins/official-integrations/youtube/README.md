# @adeptify/goalboard-integration-youtube

Status: `partial`  
Workspace path: `plugins/official-integrations/youtube`  
Contract entrypoint: `@adeptify/goalboard-contracts/platform/plugin`

## Purpose

Official YouTube Channel provider adapter and settings boundary.

This package explicitly does **not** own Source/Signal/Feed facts or a general media client.

## Public entrypoint

`src/index.ts` exports the reviewed Manifest and an Integration Plugin definition factory. `manifest.json` is the package-facing install declaration; the current provider port is injected by the local composition layer.

## Dependencies

The Plugin depends only on the public Plugin Contract and Plugin SDK. It does not import Feed/Signal stores, Host internals, or another Plugin.

## Commands

```bash
pnpm --filter @adeptify/goalboard-integration-youtube typecheck
pnpm --filter @adeptify/goalboard-integration-youtube build
```

## Migration Goals

- `goal-reorg-f2`
- `goal-reorg-fd3`

## Legacy sources

- `src/feed/sources/youtube.ts`

FD3 establishes the installable identity, grants, lifecycle contribution, and Signal transformation. Moving the remaining provider protocol from its compatibility path is later cleanup behind the same public contract. See [the architecture SSOT](../../../docs/SSOT-MATRIX.md) and [migration matrix](../../../docs/system/MIGRATION.md).

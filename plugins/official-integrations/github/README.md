# @adeptify/goalboard-integration-github

Status: `partial`  
Workspace path: `plugins/official-integrations/github`  
Contract entrypoint: `@adeptify/goalboard-contracts/platform/plugin`

## Purpose

Official GitHub authorization, connector, listener, Signal, settings, and Action adapters.

This package explicitly does **not** own Source/Signal/Feed/Action facts or Host business decisions.

## Public entrypoint

`src/index.ts` exports the reviewed Manifest, the Integration Plugin definition factory, and the real GitHub notification Provider. `manifest.json` is the package-facing install declaration.

## Dependencies

The Plugin depends only on the public Plugin Contract and Plugin SDK. Credential resolution is injected by the local composition layer; credentials never enter Signal or Feed records.

## Commands

```bash
pnpm --filter @adeptify/goalboard-integration-github typecheck
pnpm --filter @adeptify/goalboard-integration-github build
```

## Migration Goals

- `goal-reorg-f2`
- `goal-reorg-fd3`

## Legacy sources

- `src/feed/connectors/github.ts` is now a thin compatibility entrypoint.
- `src/feed/connectors/github-oauth.ts`

FD3 moved the GitHub protocol implementation and event transformation behind this Plugin. OAuth UI/application composition remains a compatibility seam until the app cutover. See [the architecture SSOT](../../../docs/SSOT-MATRIX.md) and [migration matrix](../../../docs/system/MIGRATION.md).

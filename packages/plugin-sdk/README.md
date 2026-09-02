# @adeptify/goalboard-plugin-sdk

Status: `partial`  
Workspace path: `packages/plugin-sdk`  
Contract entrypoint: `@adeptify/goalboard-contracts/platform/plugin`

## Purpose

Stable author-facing Plugin APIs, UI extension types, and testing entrypoints.

This package explicitly does **not** own Internal Host implementations or an automatically published marketplace.

## Public entrypoint

`src/index.ts` exports Manifest validation, `definePlugin`, and the polling Integration helper that converts a provider-neutral port into a Connector Driver plus Raw Event → Signal Adapter contribution.

## Dependencies

The only workspace dependency is the public Plugin Contract. The SDK does not import Runtime internals, any Module implementation, or another Plugin.

## Commands

```bash
pnpm --filter @adeptify/goalboard-plugin-sdk typecheck
pnpm --filter @adeptify/goalboard-plugin-sdk build
```

## Migration Goals

- `goal-reorg-f2`
- `goal-reorg-fd3`
- `goal-reorg-dv3`

## Legacy sources

- The pre-FD3 connector wrapper embedded in `src/feed/connectors/service.ts`.

FD3 supplies the first real Integration authoring surface. UI contribution authoring and packaged-plugin developer tooling remain with later Goals. See [the architecture SSOT](../../docs/SSOT-MATRIX.md) and [migration matrix](../../docs/system/MIGRATION.md).

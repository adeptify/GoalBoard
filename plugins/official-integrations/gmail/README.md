# @adeptify/goalboard-integration-gmail

Status: `partial`  
Workspace path: `plugins/official-integrations/gmail`  
Contract entrypoint: `@adeptify/goalboard-contracts/platform/plugin`

## Purpose

Official Gmail OAuth, connector, listener, Signal, settings, and Action adapters.

This package explicitly does **not** own Source/Signal/Feed/Attention facts or Host business decisions.

## Public entrypoint

`src/index.ts` exports the reviewed Manifest, Integration Plugin definition factory, Gmail Provider, scope/cursor rules, and closed error normalization. The local composition layer injects only Secret/OAuth ports.

## Dependencies

The Plugin depends only on the public Plugin Contract and Plugin SDK. Gmail token refresh and OAuth remain behind the injected provider boundary during this compatibility phase.

## Commands

```bash
pnpm --filter @adeptify/goalboard-integration-gmail typecheck
pnpm --filter @adeptify/goalboard-integration-gmail build
```

## Migration Goals

- `goal-reorg-f2`
- `goal-reorg-fd3`

## Legacy sources

- `src/feed/connectors/gmail.ts` is now a thin Secret/OAuth compatibility entrypoint.
- `src/feed/connectors/gmail-oauth.ts`

FD3 moved Gmail Provider protocol, scope, history cursor, error normalization, identity, and Signal transformation into this package. OAuth Secret persistence remains a Host-injected compatibility seam, not a second Integration model. See [the architecture SSOT](../../../docs/SSOT-MATRIX.md) and [migration matrix](../../../docs/system/MIGRATION.md).

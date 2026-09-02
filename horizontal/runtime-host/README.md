# @adeptify/goalboard-service-runtime-host

Status: `partial`  
Workspace path: `horizontal/runtime-host`  
Contract entrypoint: `@adeptify/goalboard-contracts/services/runtime-host`

## Purpose

Runtime provider discovery, start/resume/stream/interrupt/stop, and technical Receipts.

This package explicitly does **not** own Claims, Runs, Goals, Sessions, workspaces, conversation lineage, or Artifacts.

## Public entrypoint

`src/index.ts` exports the provider-neutral `RuntimeHostRouter`, Codex app-server transport/Session Adapter, Terminal/PT​Y process host and their Contract types. Callers do not deep-import Adapter files.

## Dependencies

The only workspace dependency is `@adeptify/goalboard-contracts`; `node-pty` is the Terminal Adapter's local implementation dependency. The package does not depend on Session, Execution, Goal, Web or Store implementations.

## Commands

```bash
pnpm --filter @adeptify/goalboard-service-runtime-host typecheck
pnpm --filter @adeptify/goalboard-service-runtime-host build
```

## Migration Goals

- `goal-reorg-f2`
- `goal-reorg-wk2`

## Legacy sources

- `src/sessions/`
- `src/web/pty-client.ts`

WK2 moved the real Contract → implementation → caller → compatibility-test slice. The old Session/Codex/PT​Y files are thin compatibility exports; Work product composition continues in WK3. See [the architecture SSOT](../../docs/SSOT-MATRIX.md) and [migration matrix](../../docs/system/MIGRATION.md).

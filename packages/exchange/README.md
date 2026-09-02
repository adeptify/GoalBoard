# @adeptify/goalboard-exchange

<!-- Generated as the F2 contract-only workspace boundary. -->

Status: `contract-only`  
Workspace path: `packages/exchange`  
Contract entrypoint: `@adeptify/goalboard-contracts/platform/exchange`

## Purpose

Envelope routing, ordering, CAS, ACK, Cursor, Replay, Blob, and retention boundary.

This package explicitly does **not** own Plugin payload semantics, Goal completion, or local Sync decisions.

## Public entrypoint

`src/index.ts` exports only a package descriptor and Contract identity in F2. It does not register a Runtime provider, create a Store, expose a fake UI entry, or return placeholder success.

## Dependencies

The only declared workspace dependency is `@adeptify/goalboard-contracts`. Implementation dependencies are added by the Goal that migrates a complete use case, never by deep-importing legacy code.

## Commands

```bash
pnpm --filter @adeptify/goalboard-exchange typecheck
pnpm --filter @adeptify/goalboard-exchange build
```

## Migration Goals

- `goal-reorg-f2`

## Legacy sources

- No current implementation source; a future feature Spec is required.

The package becomes `partial` only after a real Contract → implementation → caller → compatibility-test slice moves into this boundary. See [the architecture SSOT](../../docs/SSOT-MATRIX.md) and [migration matrix](../../docs/system/MIGRATION.md).

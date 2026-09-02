# @adeptify/goalboard-module-context-ledger

<!-- Generated as the F2 contract-only workspace boundary. -->

Status: `contract-only`  
Workspace path: `modules/context-ledger`  
Contract entrypoint: `@adeptify/goalboard-contracts/modules/context-ledger`

## Purpose

Object references, cross-owner relationships, publication, and materialization records.

This package explicitly does **not** own The referenced Goal, Artifact, Feed, or Session content.

## Public entrypoint

`src/index.ts` exports only a package descriptor and Contract identity in F2. It does not register a Runtime provider, create a Store, expose a fake UI entry, or return placeholder success.

## Dependencies

The only declared workspace dependency is `@adeptify/goalboard-contracts`. Implementation dependencies are added by the Goal that migrates a complete use case, never by deep-importing legacy code.

## Commands

```bash
pnpm --filter @adeptify/goalboard-module-context-ledger typecheck
pnpm --filter @adeptify/goalboard-module-context-ledger build
```

## Migration Goals

- `goal-reorg-f2`
- `goal-reorg-ar2`

## Legacy sources

- `src/v1/coordinator.ts`
- `src/feed/`
- `src/sessions/`

The package becomes `partial` only after a real Contract → implementation → caller → compatibility-test slice moves into this boundary. See [the architecture SSOT](../../docs/SSOT-MATRIX.md) and [migration matrix](../../docs/system/MIGRATION.md).

# @adeptify/goalboard-storage

<!-- Generated as the F2 contract-only workspace boundary. -->

Status: `contract-only`  
Workspace path: `packages/storage`  
Contract entrypoint: `@adeptify/goalboard-contracts/platform/storage`

## Purpose

SQLite, filesystem, Blob, transaction, migration, and backup technical ports.

This package explicitly does **not** own The business meaning of Module schemas or cross-Module queries.

## Public entrypoint

`src/index.ts` exports only a package descriptor and Contract identity in F2. It does not register a Runtime provider, create a Store, expose a fake UI entry, or return placeholder success.

## Dependencies

The only declared workspace dependency is `@adeptify/goalboard-contracts`. Implementation dependencies are added by the Goal that migrates a complete use case, never by deep-importing legacy code.

## Commands

```bash
pnpm --filter @adeptify/goalboard-storage typecheck
pnpm --filter @adeptify/goalboard-storage build
```

## Migration Goals

- `goal-reorg-f2`
- `goal-reorg-ap2`

## Legacy sources

- `src/v1/store.ts`
- `src/feed/store.ts`

The package becomes `partial` only after a real Contract → implementation → caller → compatibility-test slice moves into this boundary. See [the architecture SSOT](../../docs/SSOT-MATRIX.md) and [migration matrix](../../docs/system/MIGRATION.md).

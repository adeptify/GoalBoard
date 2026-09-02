# @adeptify/goalboard-contracts

<!-- Generated as the F2 contract-only workspace boundary. -->

Status: `contract-only`  
Workspace path: `packages/contracts`  
Contract entrypoint: `@adeptify/goalboard-contracts/platform/package`

## Purpose

Publishable Module, service, and platform Contract subpaths.

This package explicitly does **not** own Business implementations, database access, network clients, Apps, or Plugin implementations.

## Public entrypoint

`src/index.ts` exports only a package descriptor and Contract identity in F2. It does not register a Runtime provider, create a Store, expose a fake UI entry, or return placeholder success.

## Dependencies

This foundation package has no workspace dependency. Implementation dependencies are added by the Goal that migrates a complete use case, never by deep-importing legacy code.

## Commands

```bash
pnpm --filter @adeptify/goalboard-contracts typecheck
pnpm --filter @adeptify/goalboard-contracts build
```

## Migration Goals

- `goal-reorg-f2`
- `goal-reorg-f3`

## Legacy sources

- `src/v1/types.ts`
- `src/feed/types.ts`
- `src/sessions/types.ts`

The package becomes `partial` only after a real Contract → implementation → caller → compatibility-test slice moves into this boundary. See [the architecture SSOT](../../docs/SSOT-MATRIX.md) and [migration matrix](../../docs/system/MIGRATION.md).

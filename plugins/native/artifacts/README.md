# @adeptify/goalboard-plugin-artifacts

<!-- Generated as the F2 contract-only workspace boundary. -->

Status: `contract-only`  
Workspace path: `plugins/native/artifacts`  
Contract entrypoint: `@adeptify/goalboard-contracts/platform/plugin`

## Purpose

Protected first-party Artifact browsing, embedding, and composition.

This package explicitly does **not** own Artifact facts, Stores, or producer/consumer implementations.

## Public entrypoint

`src/index.ts` exports only a package descriptor and Contract identity in F2. It does not register a Runtime provider, create a Store, expose a fake UI entry, or return placeholder success.

## Dependencies

The only declared workspace dependency is `@adeptify/goalboard-contracts`. Implementation dependencies are added by the Goal that migrates a complete use case, never by deep-importing legacy code.

## Commands

```bash
pnpm --filter @adeptify/goalboard-plugin-artifacts typecheck
pnpm --filter @adeptify/goalboard-plugin-artifacts build
```

## Migration Goals

- `goal-reorg-f2`
- `goal-reorg-ar1`
- `goal-reorg-ar3`

## Legacy sources

- `src/web/render.ts`
- `src/web/server.ts`

AR1 has established the formal Artifact Contract and Core in `packages/contracts/modules/artifacts` and `modules/artifacts`. This protected first-party Plugin deliberately remains `contract-only`: AR3 owns the actual browser/embed UI, the eligible legacy result conversions, and the first real Plugin caller. Keeping it contract-only prevents the UI package from silently becoming a second Artifact Store.

The package becomes `partial` only after a real Contract → implementation → caller → compatibility-test slice moves into this boundary. See [the architecture SSOT](../../../docs/SSOT-MATRIX.md) and [migration matrix](../../../docs/system/MIGRATION.md).

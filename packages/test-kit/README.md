# @adeptify/goalboard-test-kit

<!-- F2 created the boundary; F3 adds the first real, business-neutral capability. -->

Status: `partial`  
Workspace path: `packages/test-kit`  
Contract entrypoint: `@adeptify/goalboard-contracts/platform/testing`

## Purpose

Deterministic clocks, fake capabilities, temporary storage, and Contract harnesses.

This package explicitly does **not** own Shared business fixtures, rules, or assertions owned by a Module.

## Public entrypoint

`src/index.ts` now exports the shared package-boundary policy used by repository checks and tests. The policy receives package/import metadata and returns violations; it does not read the filesystem, own business fixtures, register a Runtime provider, create a Store, or return placeholder product success.

## Dependencies

The only declared workspace dependency is `@adeptify/goalboard-contracts`. Implementation dependencies are added by the Goal that migrates a complete use case, never by deep-importing legacy code.

## Commands

```bash
pnpm --filter @adeptify/goalboard-test-kit typecheck
pnpm --filter @adeptify/goalboard-test-kit build
pnpm --filter @adeptify/goalboard-test-kit test
```

## Migration Goals

- `goal-reorg-f2`
- `goal-reorg-f3`

## Legacy sources

- No current implementation source; a future feature Spec is required.

F3 upgrades this package to `partial` because the boundary policy is now a real, tested engineering capability consumed by the repository scanner. Deterministic clocks, fake capabilities, storage and composition harnesses remain future work. See [the architecture SSOT](../../docs/SSOT-MATRIX.md) and [migration matrix](../../docs/system/MIGRATION.md).

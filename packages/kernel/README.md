# @adeptify/goalboard-kernel

Status: `partial`  
Workspace path: `packages/kernel`  
Contract entrypoint: `@adeptify/goalboard-contracts/platform/kernel`

## Purpose

Capability registration, selection, grants, and lifecycle skeleton.

This package explicitly does **not** own Business state machines, Provider implementations, or application UI.

## Public entrypoint

`CapabilityRegistry` registers versioned Query/Command handlers, rejects invalid or duplicate identities, publishes stable descriptors, and invokes a handler against Host-provided context. It never stores Module facts or selects business outcomes.

## Dependencies

The only declared workspace dependency is `@adeptify/goalboard-contracts`. Implementation dependencies are added by the Goal that migrates a complete use case, never by deep-importing legacy code.

## Commands

```bash
pnpm --filter @adeptify/goalboard-kernel typecheck
pnpm --filter @adeptify/goalboard-kernel build
```

## Migration Goals

- `goal-reorg-f2`
- `goal-reorg-f3`
- `goal-reorg-ap2`

## Legacy sources

- No current implementation source; a future feature Spec is required.

AP2 uses the registry from the Local Host public entrypoint and verifies duplicate/missing capability errors. Grants, provider policy, and Plugin lifecycle remain with their own later slices. See [the architecture SSOT](../../docs/SSOT-MATRIX.md) and [migration matrix](../../docs/system/MIGRATION.md).

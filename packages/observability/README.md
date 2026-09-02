# @adeptify/goalboard-observability

<!-- Generated as the F2 contract-only workspace boundary. -->

Status: `contract-only`  
Workspace path: `packages/observability`  
Contract entrypoint: `@adeptify/goalboard-contracts/platform/observability`

## Purpose

Structured logs, traces, diagnostics, and redaction mechanisms.

This package explicitly does **not** own Business success criteria, Secrets, or private Session content.

## Public entrypoint

`src/index.ts` exports only a package descriptor and Contract identity in F2. It does not register a Runtime provider, create a Store, expose a fake UI entry, or return placeholder success.

## Dependencies

The only declared workspace dependency is `@adeptify/goalboard-contracts`. Implementation dependencies are added by the Goal that migrates a complete use case, never by deep-importing legacy code.

## Commands

```bash
pnpm --filter @adeptify/goalboard-observability typecheck
pnpm --filter @adeptify/goalboard-observability build
```

## Migration Goals

- `goal-reorg-f2`
- `goal-7f442b3c-bf89-4696-ba50-721211740ff1`

## Legacy sources

- No current implementation source; a future feature Spec is required.

The package becomes `partial` only after a real Contract → implementation → caller → compatibility-test slice moves into this boundary. See [the architecture SSOT](../../docs/SSOT-MATRIX.md) and [migration matrix](../../docs/system/MIGRATION.md).

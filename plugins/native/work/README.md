# @adeptify/goalboard-plugin-work

<!-- Generated as the F2 contract-only workspace boundary. -->

Status: `contract-only`  
Workspace path: `plugins/native/work`  
Contract entrypoint: `@adeptify/goalboard-contracts/platform/plugin`

## Purpose

First-party Session, Runtime, resume, and handoff product UI.

This package explicitly does **not** own Session/Run/Goal facts or Runtime adapter implementations.

## Public entrypoint

`src/index.ts` exports only a package descriptor and Contract identity in F2. It does not register a Runtime provider, create a Store, expose a fake UI entry, or return placeholder success.

## Dependencies

The only declared workspace dependency is `@adeptify/goalboard-contracts`. Implementation dependencies are added by the Goal that migrates a complete use case, never by deep-importing legacy code.

## Commands

```bash
pnpm --filter @adeptify/goalboard-plugin-work typecheck
pnpm --filter @adeptify/goalboard-plugin-work build
```

## Migration Goals

- `goal-reorg-f2`
- `goal-reorg-wk3`

## Legacy sources

- `src/web/render.ts`
- `src/web/server.ts`
- `src/web/pty-client.ts`

The package becomes `partial` only after a real Contract → implementation → caller → compatibility-test slice moves into this boundary. See [the architecture SSOT](../../../docs/SSOT-MATRIX.md) and [migration matrix](../../../docs/system/MIGRATION.md).

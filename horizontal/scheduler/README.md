# @adeptify/goalboard-service-scheduler

<!-- Generated as the F2 contract-only workspace boundary. -->

Status: `contract-only`  
Workspace path: `horizontal/scheduler`  
Contract entrypoint: `@adeptify/goalboard-contracts/services/scheduler`

## Purpose

Durable one-shot wakeup, lease, catch-up, and delivery Receipt mechanisms.

This package explicitly does **not** own Business schedules, Automation rules, Source intent, Action parameters, or Attention content.

## Public entrypoint

`src/index.ts` exports only a package descriptor and Contract identity in F2. It does not register a Runtime provider, create a Store, expose a fake UI entry, or return placeholder success.

## Dependencies

The only declared workspace dependency is `@adeptify/goalboard-contracts`. Implementation dependencies are added by the Goal that migrates a complete use case, never by deep-importing legacy code.

## Commands

```bash
pnpm --filter @adeptify/goalboard-service-scheduler typecheck
pnpm --filter @adeptify/goalboard-service-scheduler build
```

## Migration Goals

- `goal-reorg-f2`
- `goal-reorg-fd1`

## Legacy sources

- `src/feed/sources/scheduler.ts`
- `src/web/server.ts`

The package becomes `partial` only after a real Contract → implementation → caller → compatibility-test slice moves into this boundary. See [the architecture SSOT](../../docs/SSOT-MATRIX.md) and [migration matrix](../../docs/system/MIGRATION.md).

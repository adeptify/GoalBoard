# @adeptify/goalboard-module-private-work-context

Status: `partial`  
Workspace path: `modules/private-work-context`  
Contract entrypoint: `@adeptify/goalboard-contracts/modules/private-work-context`

## Purpose

Private Session, content reference, workspace association, resume, and handoff facts.

This package explicitly does **not** own Execution Runs, Goals, Artifacts, or Runtime process handles.

## Public entrypoint

`src/index.ts` exports the Contract, `GoalBoardSessionRegistry`, encrypted local content store, Runtime context binding Repository and schema migration helpers. Callers must not deep-import the internal responsibility files.

## Dependencies

The only declared workspace dependency is `@adeptify/goalboard-contracts`; `better-sqlite3` is the package-local persistence adapter. It does not depend on Projects, Goals, Execution, Runtime Host, Web or Desktop implementations.

## Commands

```bash
pnpm --filter @adeptify/goalboard-module-private-work-context typecheck
pnpm --filter @adeptify/goalboard-module-private-work-context build
```

## Migration Goals

- `goal-reorg-f2`
- `goal-reorg-wk1`

## Legacy sources

- `src/sessions/`
- `src/projects/catalog.ts`

WK1 moved the Session Registry, encrypted content, events, handoff state, legacy migration and Runtime context binding facts into this owner. `src/sessions/` keeps only Runtime/UI composition and thin compatibility entrypoints until WK2/WK3. See [the architecture SSOT](../../docs/SSOT-MATRIX.md), [module boundary](../../docs/modules/private-work-context.md) and [migration matrix](../../docs/system/MIGRATION.md).

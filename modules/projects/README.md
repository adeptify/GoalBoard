# @adeptify/goalboard-module-projects

<!-- Updated by AP1 after the first real Projects vertical slice. -->

Status: `partial`  
Workspace path: `modules/projects`  
Contract entrypoint: `@adeptify/goalboard-contracts/modules/projects`

## Purpose

Project identity, Catalog, membership, lifecycle, and board_id migration facts.

This package explicitly does **not** own Sessions, Desktop panels, Goals, Artifacts, or Runtime process state.

## Public entrypoint

`src/index.ts` exports `ProjectsModule` with public `query` and `commands` ports. The local composition root also uses its explicit `lifecycle` port while filesystem provisioning remains in the compatibility Catalog.

The Module owns canonical `project_id`, V1 `board_id` compatibility, Project records/events, durable Project↔workspace memberships, deletion receipts, and their schema migrations. `src/projects/catalog.ts` no longer queries or writes these tables directly.

## Dependencies

The only declared workspace dependency is `@adeptify/goalboard-contracts`. SQLite is supplied through a structural storage port by the local composition root; this package does not import the legacy Store or Catalog.

## Commands

```bash
pnpm --filter @adeptify/goalboard-module-projects typecheck
pnpm --filter @adeptify/goalboard-module-projects build
```

## Migration Goals

- `goal-reorg-f2`
- `goal-reorg-ap1`

## Legacy sources

- `src/projects/catalog.ts`

AP1 supplies the first Contract → implementation → caller → compatibility-test slice. Runtime Session binding remains with WK1, Desktop panel state with AP4, and local composition/filesystem cutover with AP2. See [the architecture SSOT](../../docs/SSOT-MATRIX.md), [Projects module contract](../../docs/modules/projects.md), and [migration matrix](../../docs/system/MIGRATION.md).

# @adeptify/goalboard-module-goals

Status: `partial`  
Workspace path: `modules/goals`  
Contract entrypoint: `@adeptify/goalboard-contracts/modules/goals`

## Purpose

Goal Contract, graph, policy, risk, lifecycle, guidance, and planning facts.

This package explicitly does **not** own Claims/Runs, Evidence, Reviews/Decisions, or cross-Module provenance.

## Public entrypoint

`src/index.ts` exports the public Goals Contract implementation. `GoalsModule.query` owns Goal/Relation/Risk/Policy/Guidance reads and Goal-owned snapshots. `GoalsModule.commands` owns Goal and Draft writes, relations, Policy, Risk, and project Guidance. `GoalsModule.lifecycle` owns Draft acceptance, Contract revision, completion/revalidation, archive, trash/restore, compound-parent reconciliation, and Goal lifecycle migrations. `GoalsModule.planning` owns project method selection/versioning, graph checks, metrics, and change-impact analysis. `GoalsRepository` is the repository used by those handlers.

The 37 built-in planning methods are package assets under `methods/`. Keeping them beside their owner makes source builds, npm packages, and the installed home runtime load the same catalog. The home installer exposes a contained compatibility link under the installed Runtime Skill for older readers; it does not create a second source copy.

Claims/Runs, Review obligations, Project active-Goal state, and action projection stay with their own owners. Lifecycle calls them through narrow ports; it does not read or write their stores. Planning consumes proposal-shaped values only for validation; Proposal and Decision persistence remain Governance-owned.

## Dependencies

The only declared workspace dependency is `@adeptify/goalboard-contracts`. Implementation dependencies are added by the Goal that migrates a complete use case, never by deep-importing legacy code.

## Commands

```bash
pnpm --filter @adeptify/goalboard-module-goals typecheck
pnpm --filter @adeptify/goalboard-module-goals build
```

## Migration Goals

- `goal-reorg-f2`
- `goal-f826dfb8-bf63-4e98-b6b7-57f6b4b7c3b8`
- `goal-reorg-gw1`
- `goal-reorg-gw2`
- `goal-reorg-gw3`
- `goal-reorg-gw4`

## Legacy sources

- `src/v1/`
- `src/planning/`

Goals Query, GW1 Command/Repository, GW2 Lifecycle/Migrations, GW3 Planning Engine, and GW4 application-entry migration are implemented. Web, MCP, and CLI Goal reads use the separate `goalQueries` boundary; Goal writes, lifecycle operations, and planning calls use app-owned adapters over `GoalsApplicationApi`. The old Coordinator write/lifecycle/planning forwarding methods and zero-caller Planning re-export files have been removed. Query compatibility delegates and cross-owner work/action projection remain until their owning migration Goals finish; EX4 owns the latter. See [the architecture SSOT](../../docs/SSOT-MATRIX.md), [migration matrix](../../docs/system/MIGRATION.md), and [one-off migration tooling](../../tooling/migrations/README.md).

# @adeptify/goalboard-plugin-goals

Status: `partial`  
Workspace path: `plugins/native/goals`  
Contract entrypoint: `@adeptify/goalboard-contracts/platform/plugin`

## Purpose

Protected first-party Goals navigation, UI, commands, and composition.

This package explicitly does **not** own Goal facts, Stores, or another Plugin implementation.

## Public entrypoint

`src/index.ts` exports the execution-validation application Contract and the pure action/work projection used by every product entry. It does not create a Store or own Goal, Claim, Run, Evidence, or Review persistence.

## Dependencies

Dependencies are public Goals and Evidence Module entrypoints. They provide read-only rules required to compose the cross-owner action projection; no Module Store or implementation deep import escapes this package.

## Commands

```bash
pnpm --filter @adeptify/goalboard-plugin-goals typecheck
pnpm --filter @adeptify/goalboard-plugin-goals build
```

## Migration Goals

- `goal-reorg-f2`
- `goal-f826dfb8-bf63-4e98-b6b7-57f6b4b7c3b8`
- `goal-reorg-gw4`
- `goal-reorg-gw5`
- `goal-reorg-ex4`

## Legacy sources

- `src/web/render.ts`

EX4 moved the Claim → Run → Evidence → Review application Contract and action projection here, switched Web/CLI/MCP callers, and deleted the former legacy projection implementation. The pending GW5 Candidate still owns Goals navigation, editing, Planning, Risk/Policy UI, and product copy; EX4 does not claim those screens. See [the architecture SSOT](../../../docs/SSOT-MATRIX.md) and [migration matrix](../../../docs/system/MIGRATION.md).

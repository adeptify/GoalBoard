# @adeptify/goalboard-design-system

Status: `partial`  
Workspace path: `packages/design-system`  
Contract entrypoint: `@adeptify/goalboard-contracts/platform/ui`

## Purpose

Tokens, primitives, icons, themes, and accessibility foundations.

This package explicitly does **not** own Product-page business decisions or Plugin state.

## Public entrypoint

`src/index.ts` exports the theme, density and terminal-theme types and storage keys together with the browser bootstrap, interaction behavior and shared visual styles. The former huge visual foundation now lives inside this owner.

## Dependencies

The only declared workspace dependency is `@adeptify/goalboard-contracts`. Implementation dependencies are added by the Goal that migrates a complete use case, never by deep-importing legacy code.

## Commands

```bash
pnpm --filter @adeptify/goalboard-design-system typecheck
pnpm --filter @adeptify/goalboard-design-system build
```

## Migration Goals

- `goal-reorg-f2`
- `goal-reorg-ap3`

## Migrated sources

- `src/web/visual-foundation.ts` is now a 15-line compatibility re-export.
- The implementation lives in `packages/design-system/src/visual-foundation.ts`.

Product-page business decisions and Plugin state remain outside this package. See [the architecture SSOT](../../docs/SSOT-MATRIX.md) and [migration matrix](../../docs/system/MIGRATION.md).

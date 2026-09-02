# @adeptify/goalboard-app-desktop

Status: `partial`  
Workspace path: `apps/desktop`  
Contract entrypoint: `@adeptify/goalboard-contracts/platform/app-host`

## Purpose

GoalBoard macOS product shell and native bridge composition root.

This package explicitly does **not** own Business facts, Module rules, or Runtime state.

## Public entrypoint

`src/index.ts` exposes native-shell detection/bootstrap, Runtime launch recipes, guarded advance prompts, Desktop Panel lifecycle and the Capsule presentation shell. The legacy `src/desktop/` and `src/web/desktop-shell.ts` files are compatibility re-exports only.

## Dependencies

The app depends on public Contracts and the Feed native Plugin's external-content redactor. Panel persistence and Project context are injected ports. It does not deep-import legacy code, import SQLite, or own Module Stores.

The native adapter source lives under `adapters/tauri/src/`, split into window/Capsule composition, PTY, managed Web service and Runtime environment responsibilities. `../../desktop/src-tauri/` remains distribution configuration and points its binary at this adapter.

## Commands

```bash
pnpm --filter @adeptify/goalboard-app-desktop typecheck
pnpm --filter @adeptify/goalboard-app-desktop build
```

## Migration Goals

- `goal-reorg-f2`
- `goal-reorg-ap4`
- `goal-reorg-dv4`

## Legacy sources

- `desktop/`
- `src/desktop/`

AP4 moved the real callers, Desktop Panel rules, Capsule presentation and Tauri source into this boundary while preserving existing behavior. System notifications and a Desktop Keychain were not present in the baseline and are not represented by fake implementations. Final install/sign/notarize/SBOM validation remains DV4. See [the Desktop boundary](../../docs/platform/DESKTOP.md), [architecture SSOT](../../docs/SSOT-MATRIX.md) and [migration matrix](../../docs/system/MIGRATION.md).

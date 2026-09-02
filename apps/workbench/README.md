# @adeptify/goalboard-app-workbench

Status: `partial`  
Workspace path: `apps/workbench`  
Contract entrypoint: `@adeptify/goalboard-contracts/platform/app-host`

## Purpose

Local product UI composition root for the Workbench. It owns the stable HTML document shell, named directory/main/overlay slots, and the execution-validation UI contribution, then mounts Native or Installed Plugin UI through UI Host.

This package explicitly does **not** own Business Stores, Node-only implementations, or Tauri commands.

## Public entrypoint

`src/index.ts` is the local UI composition root. It renders the stable document shell, declares Workbench slots, registers the official Feed Native Plugin, and binds Goal and execution-validation routes to public application ports. `src/execution-validation-ui.ts` renders Claim, Run, Evidence, and Review views from that public model. It does not own Goal/Feed facts, SQL, connector behavior, or Tauri commands.

## Dependencies

Dependencies are limited to public entrypoints from Contracts, UI Host, and the protected Goals/Feed Native Plugins.

## Commands

```bash
pnpm --filter @adeptify/goalboard-app-workbench typecheck
pnpm --filter @adeptify/goalboard-app-workbench build
```

## Migration Goals

- `goal-reorg-f2`
- `goal-reorg-ap3`
- `goal-reorg-fd4`
- `goal-reorg-gw4`
- `goal-reorg-gw5`
- `goal-reorg-ex4`

## Legacy sources

- `src/web/`

FD4 switched Feed UI composition, GW4 switched Web Goal writes to the public Goals application port, AP3 moved the document shell plus slot validation here, and EX4 moved Claim/Run/Evidence/Review presentation plus the execution-validation adapter here. The pending GW5 Candidate will move the remaining Goals UI and product copy out of the legacy renderer after user confirmation. Existing browser and HTTP behavior remains compatible. See [the architecture SSOT](../../docs/SSOT-MATRIX.md) and [migration matrix](../../docs/system/MIGRATION.md).

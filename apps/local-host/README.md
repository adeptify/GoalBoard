# @adeptify/goalboard-app-local-host

Status: `partial`  
Workspace path: `apps/local-host`  
Contract entrypoint: `@adeptify/goalboard-contracts/platform/app-host`

## Purpose

The single local composition root for Modules, services, plugins, and storage.

This package explicitly does **not** own a second business coordinator or user-facing product shell.

## Public entrypoint

`LocalHost` discovers one runtime per Project storage key, exposes a typed `LocalHostProjectClient`, serializes Capability calls, and owns runtime close/reopen. Concurrent clients for the same Project reuse the same runtime rather than opening competing writers.

The temporary root adapter `src/local-host/composition.ts` is the only place that constructs the remaining legacy Store and Coordinator. Web, CLI, and MCP consume that Host; Desktop consumes it through Web. As owner migrations continue, the adapter registers public Module/Service capabilities instead of growing into another business coordinator.

The AP2 transport is embedded/in-process and supports explicit Host injection. A standalone daemon or cross-process transport is not claimed here; the Client Contract is kept independent from those future deployment choices.

## Dependencies

The package depends only on public App Host Contract types and `@adeptify/goalboard-kernel`. It does not import any Module implementation or legacy Store.

## Commands

```bash
pnpm --filter @adeptify/goalboard-app-local-host typecheck
pnpm --filter @adeptify/goalboard-app-local-host build
```

## Migration Goals

- `goal-reorg-f2`
- `goal-reorg-ap2`

## Legacy sources

- `src/web/server.ts`
- `src/cli/`
- `src/mcp/`

AP2 supplied the first real Contract → capability registry → Local Host → CLI/MCP/Web caller → compatibility-test slice. See [the architecture SSOT](../../docs/SSOT-MATRIX.md), [Local Host design](../../docs/platform/LOCAL-HOST.md), and [migration matrix](../../docs/system/MIGRATION.md).

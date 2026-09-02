# @adeptify/goalboard-module-artifacts

Status: `partial`  
Workspace path: `modules/artifacts`  
Contract entrypoint: `@adeptify/goalboard-contracts/modules/artifacts`

## Purpose

Artifact identity, version, type, content reference, scope, and provenance facts.

This package explicitly does **not** own Plugin implementation dependencies, cross-object relationships, transport receipts, or private drafts.

## Public entrypoint

`src/index.ts` exports the Contract-typed `ArtifactsModule`, its Query/Command API, Repository, schema migration and opaque-content helpers.

The Module stores an Artifact identity separately from its Plugin-managed integer versions. An exact `artifact_id + version` is the reference boundary; the platform does not invent a canonical head or interpret custom payload fields.

- Inline JSON is normalized, hashed and returned without domain interpretation.
- Large content remains behind a Storage-validated content reference.
- Producer Plugin version may change, but the Plugin ID and binding signature stay fixed for one Artifact lineage.
- Local publication defaults to personal. A `team_project` version requires explicit sharing authorization.
- A missing compatible consumer leaves the Artifact readable and exchangeable as opaque data.

## Dependencies

The only declared workspace dependency is `@adeptify/goalboard-contracts`. SQLite is supplied through a narrow port by the Local Host composition; the package does not import Plugin implementations, Goals/Evidence Stores, or Server transport.

## Commands

```bash
pnpm --filter @adeptify/goalboard-module-artifacts typecheck
pnpm --filter @adeptify/goalboard-module-artifacts build
```

## Migration Goals

- `goal-reorg-f2`
- `goal-reorg-ar1`
- `goal-reorg-ar3`

## Legacy sources

- `src/v1/`
- `src/evidence/`

AR1 owns the Artifact facts and Repository. AR3 will add the Native Plugin UI and explicitly convert eligible legacy result/file references; AR1 does not guess Artifact records from old strings. See [the architecture SSOT](../../docs/SSOT-MATRIX.md) and [migration matrix](../../docs/system/MIGRATION.md).

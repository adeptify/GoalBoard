# @adeptify/goalboard-module-identity-team-access

<!-- Generated as the F2 contract-only workspace boundary. -->

Status: `contract-only`  
Workspace path: `modules/identity-team-access`  
Contract entrypoint: `@adeptify/goalboard-contracts/modules/identity-team-access`

## Purpose

User, Team, membership, grant, and Access Decision facts.

This package explicitly does **not** own Project content, Secrets, Goals, Artifacts, or automatic Personal-data sharing.

## Public entrypoint

`src/index.ts` exports only a package descriptor and Contract identity in F2. It does not register a Runtime provider, create a Store, expose a fake UI entry, or return placeholder success.

## Dependencies

The only declared workspace dependency is `@adeptify/goalboard-contracts`. Implementation dependencies are added by the Goal that migrates a complete use case, never by deep-importing legacy code.

## Commands

```bash
pnpm --filter @adeptify/goalboard-module-identity-team-access typecheck
pnpm --filter @adeptify/goalboard-module-identity-team-access build
```

## Migration Goals

- `goal-reorg-f2`

## Legacy sources

- No current implementation source; a future feature Spec is required.

The package becomes `partial` only after a real Contract → implementation → caller → compatibility-test slice moves into this boundary. See [the architecture SSOT](../../docs/SSOT-MATRIX.md) and [migration matrix](../../docs/system/MIGRATION.md).

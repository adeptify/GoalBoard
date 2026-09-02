# @adeptify/goalboard-module-evidence-verification

Status: `partial`  
Workspace path: `modules/evidence-verification`  
Contract entrypoint: `@adeptify/goalboard-contracts/modules/evidence-verification`

## Purpose

Evidence, immutable corrections, safe project-file references, criterion coverage, and automatic verification gates.

This package explicitly does **not** own Artifact bodies, Goal Contracts, Runs, or Review verdicts.

## Public entrypoint

`src/index.ts` exports the real `EvidenceVerificationModule`, its public Repository and migration helpers, file-reference utilities, and pure coverage projection functions.

The application API exposes:

- Query: Evidence and Correction lists, review-safe Evidence references, project-reference source lookup, criterion coverage, and post-rework freshness.
- Command: authorized Evidence submission, immutable supersede/retract, and attaching the Review that consumed human-verdict Evidence.
- Events: `evidence.submitted`, `evidence.superseded`, and `evidence.retracted` through the host event port.

`AuthorizedEvidenceSubmissionInput` means the caller has already checked the Goal Contract and optional Run ownership. The Module still owns Evidence invariants, locator validation, persistence, Correction rules, and coverage decisions; it never reads or writes the Goals Store.

## Internal boundaries

- `repository.ts`: Evidence/Correction schema, queries, mappings, and event-sequence reads.
- `lifecycle.ts`: submission, locator preflight, immutable Correction, ownership and cycle rules.
- `verification.ts` / `coverage.ts`: current criterion coverage, rework freshness, and snapshot projection rules.
- `locator.ts`: bounded local text/Markdown preflight and safe registered-worktree handling.
- `migrations.ts`: migrations 17–20 and the Evidence columns owned inside migration 30.

## Dependencies

The only declared workspace dependency is `@adeptify/goalboard-contracts`. Node filesystem and Git inspection use built-in APIs. The package does not deep-import legacy code or another Module implementation.

## Commands

```bash
pnpm --filter @adeptify/goalboard-module-evidence-verification typecheck
pnpm --filter @adeptify/goalboard-module-evidence-verification build
```

## Migration Goals

- `goal-reorg-f2`
- `goal-reorg-ex2`
- `goal-reorg-ex4`

## EX2 caller cutover

- `src/v1/coordinator.ts` keeps Goal/Run authorization, idempotency, action tokens, lifecycle reconciliation, and Review decisions; Evidence writes and coverage rules call this package.
- `src/v1/store.ts` composes this package's schema, migrations, Repository, and snapshot results instead of owning Evidence SQL and mappings.
- `src/v1/action-projection.ts` calls public pure coverage functions; it no longer copies Evidence validity rules.
- `src/web/server.ts` opens verified project references through public Evidence query/locator utilities.
- The legacy `src/evidence/locator.ts` helper has no remaining caller and was removed.

Web/CLI/MCP keep their current payloads and compatibility entrypoints. EX3 migrates Review/Proposal/Decision, while EX4 removes the remaining Coordinator application facade. See [the architecture SSOT](../../docs/SSOT-MATRIX.md), [migration matrix](../../docs/system/MIGRATION.md), and [EX2 validation](../../specs/goalboard-architecture-reorganization/ex2-validation.md).

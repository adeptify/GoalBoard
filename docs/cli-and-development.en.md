# CLI & Development

## One-time V3 import

Legacy JSON is not a parallel running mode; it can only be written into a brand-new V1 Board through an explicit import:

```bash
goalboard v1 import-v3 \
  --db .goalboard/imported.db \
  --board-id imported \
  --actor user \
  --key import-1 \
  --file legacy-goal-board.json
```

The import keeps only Goal names and parent/child structure, inputs/outputs, root constraints, coverage disposition, and source identity. Business logic, acceptance, accepted/satisfied, dependencies, Risk, Policy, Evidence, and Review are never fabricated; the import report lists them under `regenerate`. Import refuses to overwrite an existing target Board.

The management MCP exposes `goalboard_v1_import_v3` on the same Coordinator; the Runtime MCP does not expose import.

## CLI

The public CLI top level provides program install, the persistent service, demo, safe uninstall, and the `goalboard v1 <operation>` management surface:

```text
init | create-goal | snapshot | contract | ready | explain | claim | release
run-start | run-report | revalidate | evidence-submit | review-submit | complete
draft-dialogue-start | draft-dialogue-turn | draft-dialogue-resume
goal-tree-propose | goal-tree-read | goal-tree-check | goal-tree-decide
relation-add | impact-add | policy-set | risk-add | risk-state | active-goal
contract-propose | contract-decide | candidate-submit | dependency-propose
candidate-decide | rewire-confirm | import-v3
```

Complex payloads can be passed with `--json` or `--file payload.json`. The CLI is the user/management and local debugging entry point, not a fallback for Runtime service failures.

## Project structure

> The repository is now a monorepo: 18 target packages remain `contract-only`, while 30 packages have a real migrated slice and are marked `partial`. The root `@adeptify/goalboard` package continues to carry the working product and release compatibility surface. A package directory does not mean every responsibility has migrated; see the [Architecture SSOT](SSOT-MATRIX.md) for truthful status and migration ownership.

```text
apps/                        Six product-entry and composition-root boundaries
packages/                    Ten foundation packages; contracts exposes 30 public subpaths
modules/                     Sixteen business-fact owner boundaries
horizontal/                  Four horizontal runtime-service boundaries
plugins/                     Six native and five official integration plugin boundaries
packages/plugin-runtime/     FD3 local Plugin lifecycle reference implementation
packages/plugin-sdk/         FD3 Manifest and Integration Plugin definition API
plugins/official-integrations/
                             Official Manifests, Provider adapters, and install packages
apps/workbench/              AP3 shell/slots/assets plus FD4/GW4/EX4 wiring and execution-validation UI
apps/desktop/                AP4 Desktop shell, panels, Capsule, and Tauri native adapter
apps/cli/                    GW4 Goals + EX4 execution-validation adapter; DV1 finishes protocol migration
apps/mcp/                    GW4 Goals + EX4 execution-validation adapter; DV1/DV2 finish schema/context
packages/ui-host/            UI Contribution registry, surface rendering, and Slot mount validation
packages/design-system/      AP3 theme preferences, browser visual foundation, and layered styles
plugins/native/feed/         FD4 Feed/Attention/Source UI and HTTP route table
modules/goals/               Goals Query + GW1–GW4 Commands/Lifecycle/Planning and public app port
modules/governance-collaboration/
                             EX3 Review/Proposal/Decision facts, state machines, and public app port
tooling/plugin-cli/          Plugin CLI boundary; DV3 implements the real developer tool
scripts/workspace-packages.mjs
                             Inventory, manifest, entrypoint, README, and Contract wiring check
src/v1/                      SQLite Store, Coordinator, types, CLI, and one-time import
src/mcp/server.ts            V1-only MCP Server
src/web/                     Remaining product UI, Goal Tree, PTY, and Host adapters; Shell, visual foundation, and Feed renderers have moved
src/desktop/                 AP4 compatibility forwards for old launch/prompt imports
src/install/                 Install, Runtime integration, persistent service, and safe uninstall
src/cli/main.ts              Product CLI and V1 management entry
desktop/                     macOS Cargo/Tauri distribution config; source lives under apps/desktop/adapters/tauri
examples/seed-demo.mts       Dev script calling the product demo lifecycle
docs/screenshots/            README product screenshots
skills/goal-advance/         Runtime working protocol
tests/v1.test.ts             Coordinator, CLI, migration, and protocol regression
tests/goals-command-module.test.ts
                             Goals public Command API, idempotency, and side-effect regression
tests/goals-app-adapters.test.ts
                             Workbench/MCP/CLI Goal adapter parity, idempotency, and error regression
tests/execution-validation-app-adapters.test.ts
                             Cross-entry execution, permission, recovery, and UI-contribution regression
tests/governance-collaboration-module.test.ts
                             Governance public API, authority provenance, transitions, and atomic rollback
tests/mcp.test.ts            MCP audience, permission, and connection regression
tests/web.test.ts            Web data and interaction regression
tests/desktop-tui.test.ts    Third-pane launch, panels, and local PTY regression
tests/i18n.test.ts           UI language regression
tests/uninstall.test.ts      User-data retention, strong confirmation, and receipt regression
PRODUCT.md                   Product definition
DESIGN.md                    Shipped UI design system
docs/SSOT-MATRIX.md          Canonical architecture, package status, and migration-owner index
docs/system/                 Layers, dependencies, migration, and huge-class exit rules
docs/modules/                Fact ownership and API boundaries for all 16 Modules
docs/horizontal/             Technical boundaries for the four horizontal services
docs/platform/               Plugin, Storage, Exchange, and UI platform mechanisms
specs/goalboard-architecture-reorganization/spec.md
                             Accepted full contract for this reorganization
```

### Development rules during the reorganization

- Root `pnpm` commands continue to verify the current product; `workspace:*` commands verify the 48 new packages, and `*:all` commands cover both.
- Cross-owner calls use public entrypoints only; deep imports, cross-Module Store access, and App database writes are forbidden.
- `contract-only` means a real boundary without a fake provider, store, UI entry, or success response.
- Every migration slice updates its package README, `docs/system/MIGRATION.md`, and the affected Module/Service document.
- See the [Huge Class responsibility map](system/HUGE-CLASS-MIGRATION.md) for ownership and removal gates.

## Development verification

```bash
# Target package tree
pnpm workspace:check
pnpm boundary:test
pnpm boundary:check
pnpm workspace:verify
pnpm workspace:typecheck
pnpm workspace:build

# Current product compatibility surface plus target packages
pnpm typecheck:all
pnpm build:all

# Current-product regression and release contents
pnpm typecheck
pnpm test
pnpm pack --dry-run --json
```

Use the published-style package name to verify one package independently, for example:

```bash
pnpm --filter @adeptify/goalboard-module-goals typecheck
pnpm --filter @adeptify/goalboard-module-goals build
pnpm --filter @adeptify/goalboard-plugin-runtime typecheck
pnpm --filter @adeptify/goalboard-integration-github typecheck
```

`workspace:check` validates only the F2 package inventory. `boundary:check` scans real imports, dependency direction, Contract entrypoints, cycles, and the legacy Huge Class allowlist. `workspace:verify` is the complete package gate shared by local development and CI.

The release package contains only GoalBoard V1's `dist`, the Runtime Skill, and the README — no second runtime.

That sentence describes the current release. DV4 and the final Cutover Goal will update and verify monorepo packaging, installation, and release commands in a clean environment.

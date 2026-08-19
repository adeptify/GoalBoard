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

```text
src/v1/                      SQLite Store, Coordinator, types, CLI, and one-time import
src/mcp/server.ts            V1-only MCP Server
src/web/                     Goal Tree, document workspace, local PTY, and i18n
src/desktop/                 Third-pane launch recipes and advance prompts
src/install/                 Install, Runtime integration, persistent service, and safe uninstall
src/cli/main.ts              Product CLI and V1 management entry
desktop/                     Optional macOS App shell reusing the same Web pages
examples/seed-demo.mts       Dev script calling the product demo lifecycle
docs/screenshots/            README product screenshots
skills/goal-advance/         Runtime working protocol
tests/v1.test.ts             Coordinator, CLI, migration, and protocol regression
tests/mcp.test.ts            MCP audience, permission, and connection regression
tests/web.test.ts            Web data and interaction regression
tests/desktop-tui.test.ts    Third-pane launch, panels, and local PTY regression
tests/i18n.test.ts           UI language regression
tests/uninstall.test.ts      User-data retention, strong confirmation, and receipt regression
PRODUCT.md                   Product definition
DESIGN.md                    Shipped UI design system
```

## Development verification

```bash
pnpm typecheck
pnpm test
pnpm pack --dry-run --json
```

The release package contains only GoalBoard V1's `dist`, the Runtime Skill, and the README — no second runtime.

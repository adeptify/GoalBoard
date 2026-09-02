import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const entry = (
  packagePath,
  name,
  kind,
  contract,
  migrationGoals,
  summary,
  notResponsibleFor,
  legacySources = [],
  status = {},
) => ({
  path: packagePath,
  name,
  kind,
  contract,
  migrationGoals: ["goal-reorg-f2", ...migrationGoals],
  summary,
  notResponsibleFor,
  legacySources,
  maturity: status.maturity ?? "contract-only",
  capabilities: status.capabilities ?? [],
  extraWorkspaceDependencies: status.extraWorkspaceDependencies ?? [],
  extraDependencies: status.extraDependencies ?? {},
});

export const WORKSPACE_PACKAGES = [
  entry("apps/desktop", "@adeptify/goalboard-app-desktop", "app", "@adeptify/goalboard-contracts/platform/app-host", ["goal-reorg-ap4", "goal-reorg-dv4"], "GoalBoard macOS product shell and native bridge composition root.", "Business facts, Module rules, or Runtime state.", ["desktop/", "src/desktop/"], { maturity: "partial", capabilities: ["desktop.shell.v1", "desktop.runtime-launch.v1", "desktop.advance-prompt.v1", "desktop.panels.v1", "desktop.capsule-shell.v1"], extraWorkspaceDependencies: ["@adeptify/goalboard-plugin-feed"] }),
  entry("apps/workbench", "@adeptify/goalboard-app-workbench", "app", "@adeptify/goalboard-contracts/platform/app-host", ["goal-reorg-fd4", "goal-reorg-ap3", "goal-reorg-gw4", "goal-reorg-gw5", "goal-reorg-ex4"], "Local product UI composition root for the Workbench.", "Business Stores, Node-only implementations, or Tauri commands.", ["src/web/"], { maturity: "partial", capabilities: ["workbench.shell.v1", "workbench.ui-slots.v1", "workbench.feed-composition.v1", "workbench.goals-command-adapter.v1", "workbench.execution-validation-adapter.v1"], extraWorkspaceDependencies: ["@adeptify/goalboard-plugin-goals", "@adeptify/goalboard-plugin-feed", "@adeptify/goalboard-ui-host"] }),
  entry("apps/local-host", "@adeptify/goalboard-app-local-host", "app", "@adeptify/goalboard-contracts/platform/app-host", ["goal-reorg-ap2"], "The single local composition root for Modules, services, plugins, and storage.", "A second business coordinator or user-facing product shell.", ["src/web/server.ts", "src/cli/", "src/mcp/"], { maturity: "partial", capabilities: ["local-host.client.v1", "local-host.single-writer.v1"], extraWorkspaceDependencies: ["@adeptify/goalboard-kernel"] }),
  entry("apps/server", "@adeptify/goalboard-app-server", "app", "@adeptify/goalboard-contracts/platform/app-host", [], "Lightweight Team control, exchange, and Team Plugin host boundary.", "A cloud copy of the complete local product or custom Plugin payload semantics."),
  entry("apps/cli", "@adeptify/goalboard-app-cli", "app", "@adeptify/goalboard-contracts/platform/app-host", ["goal-reorg-dv1", "goal-reorg-gw4", "goal-reorg-ex4"], "Thin CLI protocol, argument, and presentation adapter.", "Business decisions, Module Stores, or duplicated application rules.", ["src/cli/"], { maturity: "partial", capabilities: ["cli.goals-command-adapter.v1", "cli.execution-validation-adapter.v1"], extraWorkspaceDependencies: ["@adeptify/goalboard-plugin-goals"] }),
  entry("apps/mcp", "@adeptify/goalboard-app-mcp", "app", "@adeptify/goalboard-contracts/platform/app-host", ["goal-reorg-dv1", "goal-reorg-dv2", "goal-reorg-gw4", "goal-reorg-ex4"], "Thin MCP schema, audience, and capability adapter.", "Business rules, direct Store access, or Runtime Skill policy.", ["src/mcp/"], { maturity: "partial", capabilities: ["mcp.goals-command-adapter.v1", "mcp.execution-validation-adapter.v1"], extraWorkspaceDependencies: ["@adeptify/goalboard-plugin-goals"] }),

  entry("packages/contracts", "@adeptify/goalboard-contracts", "foundation", "@adeptify/goalboard-contracts/platform/package", ["goal-reorg-f3"], "Publishable Module, service, and platform Contract subpaths.", "Business implementations, database access, network clients, Apps, or Plugin implementations.", ["src/v1/types.ts", "src/feed/types.ts", "src/sessions/types.ts"]),
  entry("packages/kernel", "@adeptify/goalboard-kernel", "foundation", "@adeptify/goalboard-contracts/platform/kernel", ["goal-reorg-f3", "goal-reorg-ap2"], "Capability registration, selection, grants, and lifecycle skeleton.", "Business state machines, Provider implementations, or application UI.", [], { maturity: "partial", capabilities: ["kernel.capability-registry.v1"] }),
  entry("packages/plugin-runtime", "@adeptify/goalboard-plugin-runtime", "foundation", "@adeptify/goalboard-contracts/platform/plugin", ["goal-reorg-fd3", "goal-reorg-dv3"], "Plugin identity, install, grants, isolation, lifecycle, and rollback boundary.", "Module business facts or provider-specific protocols.", ["src/install/"], { maturity: "partial", capabilities: ["plugin.lifecycle.v1", "plugin.grants.v1", "plugin.recovery.v1"] }),
  entry("packages/plugin-sdk", "@adeptify/goalboard-plugin-sdk", "foundation", "@adeptify/goalboard-contracts/platform/plugin", ["goal-reorg-fd3", "goal-reorg-dv3"], "Stable author-facing Plugin APIs, UI extension types, and testing entrypoints.", "Internal Host implementations or an automatically published marketplace.", [], { maturity: "partial", capabilities: ["plugin.define.v1", "integration.polling.v1"] }),
  entry("packages/storage", "@adeptify/goalboard-storage", "foundation", "@adeptify/goalboard-contracts/platform/storage", ["goal-reorg-ap2"], "SQLite, filesystem, Blob, transaction, migration, and backup technical ports.", "The business meaning of Module schemas or cross-Module queries.", ["src/v1/store.ts", "src/feed/store.ts"]),
  entry("packages/exchange", "@adeptify/goalboard-exchange", "foundation", "@adeptify/goalboard-contracts/platform/exchange", [], "Envelope routing, ordering, CAS, ACK, Cursor, Replay, Blob, and retention boundary.", "Plugin payload semantics, Goal completion, or local Sync decisions."),
  entry("packages/ui-host", "@adeptify/goalboard-ui-host", "foundation", "@adeptify/goalboard-contracts/platform/ui", ["goal-reorg-fd4", "goal-reorg-ap3"], "UI Contribution, Slot, Embed, isolation, and Host bridge boundary.", "Native Plugin product behavior or Module business facts.", ["src/web/render.ts"], { maturity: "partial", capabilities: ["ui.contribution.registry.v1", "ui.surface.render.v1", "ui.slot.mount.v1"] }),
  entry("packages/design-system", "@adeptify/goalboard-design-system", "foundation", "@adeptify/goalboard-contracts/platform/ui", ["goal-reorg-ap3"], "Tokens, primitives, icons, themes, and accessibility foundations.", "Product-page business decisions or Plugin state.", ["src/web/visual-foundation.ts", "DESIGN.md"], { maturity: "partial", capabilities: ["design-system.theme.v1", "design-system.tokens.v1", "design-system.accessibility.v1"] }),
  entry("packages/observability", "@adeptify/goalboard-observability", "foundation", "@adeptify/goalboard-contracts/platform/observability", ["goal-7f442b3c-bf89-4696-ba50-721211740ff1"], "Structured logs, traces, diagnostics, and redaction mechanisms.", "Business success criteria, Secrets, or private Session content."),
  entry("packages/test-kit", "@adeptify/goalboard-test-kit", "foundation", "@adeptify/goalboard-contracts/platform/testing", ["goal-reorg-f3"], "Deterministic clocks, fake capabilities, temporary storage, and Contract harnesses.", "Shared business fixtures, rules, or assertions owned by a Module.", [], { maturity: "partial", capabilities: ["workspace-boundary-policy"] }),

  entry("modules/identity-team-access", "@adeptify/goalboard-module-identity-team-access", "module", "@adeptify/goalboard-contracts/modules/identity-team-access", [], "User, Team, membership, grant, and Access Decision facts.", "Project content, Secrets, Goals, Artifacts, or automatic Personal-data sharing."),
  entry("modules/projects", "@adeptify/goalboard-module-projects", "module", "@adeptify/goalboard-contracts/modules/projects", ["goal-reorg-ap1"], "Project identity, Catalog, membership, lifecycle, and board_id migration facts.", "Sessions, Desktop panels, Goals, Artifacts, or Runtime process state.", ["src/projects/catalog.ts"], { maturity: "partial", capabilities: ["project-identity", "project-catalog", "workspace-membership", "project-deletion-receipts"] }),
  entry("modules/context-ledger", "@adeptify/goalboard-module-context-ledger", "module", "@adeptify/goalboard-contracts/modules/context-ledger", ["goal-reorg-ar2"], "Object references, cross-owner relationships, publication, and materialization records.", "The referenced Goal, Artifact, Feed, or Session content.", ["src/v1/coordinator.ts", "src/feed/", "src/sessions/"]),
  entry("modules/sync-replication", "@adeptify/goalboard-module-sync-replication", "module", "@adeptify/goalboard-contracts/modules/sync-replication", [], "Publication intent, replica relationships, conflicts, and visible sync state.", "Transport ACK, Cursor, Replay, Blob transfer, or direct Goal/Artifact Store writes."),
  entry("modules/sources", "@adeptify/goalboard-module-sources", "module", "@adeptify/goalboard-contracts/modules/sources", ["goal-reorg-fd1"], "Source identity, desired listening state, scope, schedule intent, and provider binding references.", "Secrets, listener cursors, Signals, Feed disposition, or Goals.", ["src/feed/sources/", "src/feed/store.ts"], { maturity: "partial", capabilities: ["sources.query.v1", "sources.command.v1"] }),
  entry("modules/signals", "@adeptify/goalboard-module-signals", "module", "@adeptify/goalboard-contracts/modules/signals", ["goal-reorg-fd1"], "Normalized external-event facts, deduplication identity, revisions, and provenance.", "Provider connections, listener leases, Feed decisions, Attention, Goals, or Automation.", ["src/feed/"], { maturity: "partial", capabilities: ["signals.query.v1", "signals.command.v1"] }),
  entry("modules/feed", "@adeptify/goalboard-module-feed", "module", "@adeptify/goalboard-contracts/modules/feed", ["goal-reorg-fd2"], "Feed Item visibility, read/archive state, disposition, and promotion provenance.", "Provider listening, Signal ownership, or direct Goal/Artifact/Action creation.", ["src/feed/store.ts"], { maturity: "partial", capabilities: ["feed.query.v1", "feed.command.v1"] }),
  entry("modules/actions", "@adeptify/goalboard-module-actions", "module", "@adeptify/goalboard-contracts/modules/actions", [], "Personal and external Action request, lifecycle, idempotency, and result references.", "Execution Claims/Runs, Automation rules, Scheduler timing, or Provider protocols."),
  entry("modules/attention-resumption", "@adeptify/goalboard-module-attention-resumption", "module", "@adeptify/goalboard-contracts/modules/attention-resumption", ["goal-reorg-fd2"], "Attention items, reasons, snooze state, and resume cues.", "Feed Items, Actions, Goals, Sessions, notifications, or Runtime processes.", ["src/feed/store.ts"], { maturity: "partial", capabilities: ["attention.query.v1", "attention.command.v1"] }),
  entry("modules/goals", "@adeptify/goalboard-module-goals", "module", "@adeptify/goalboard-contracts/modules/goals", ["goal-f826dfb8-bf63-4e98-b6b7-57f6b4b7c3b8", "goal-reorg-gw1", "goal-reorg-gw2", "goal-reorg-gw3", "goal-reorg-gw4"], "Goal Contract, graph, policy, risk, lifecycle, guidance, and planning facts.", "Claims/Runs, Evidence, Reviews/Decisions, or cross-Module provenance.", ["src/v1/", "src/planning/"], { maturity: "partial", capabilities: ["goals.command.v1", "goals.repository.v1", "goals.lifecycle.v1", "goals.planning.v1", "goals.query.v1"] }),
  entry("modules/private-work-context", "@adeptify/goalboard-module-private-work-context", "module", "@adeptify/goalboard-contracts/modules/private-work-context", ["goal-reorg-wk1"], "Private Session, content reference, workspace association, resume, and handoff facts.", "Execution Runs, Goals, Artifacts, or Runtime process handles.", ["src/sessions/", "src/projects/catalog.ts"], { maturity: "partial", capabilities: ["private-session-registry", "encrypted-content-store", "session-events", "session-handoff-facts", "legacy-session-migration", "runtime-context-bindings"], extraDependencies: { "better-sqlite3": "12.8.0" } }),
  entry("modules/execution", "@adeptify/goalboard-module-execution", "module", "@adeptify/goalboard-contracts/modules/execution", ["goal-reorg-ex1", "goal-reorg-ex4"], "Claim, Run, attempt, lease, and execution lifecycle facts.", "Goal Contracts, Evidence, Reviews, Sessions, or Runtime processes.", ["src/v1/coordinator.ts", "src/v1/store.ts"], { maturity: "partial", capabilities: ["execution.claim-lifecycle.v1", "execution.run-lifecycle.v1", "execution.repository.v1", "execution.recovery.v1"] }),
  entry("modules/artifacts", "@adeptify/goalboard-module-artifacts", "module", "@adeptify/goalboard-contracts/modules/artifacts", ["goal-reorg-ar1", "goal-reorg-ar3"], "Artifact identity, version, type, content reference, scope, and provenance facts.", "Plugin implementation dependencies, cross-object relationships, transport receipts, or private drafts.", ["src/v1/", "src/evidence/"], { maturity: "partial", capabilities: ["artifacts.identity.v1", "artifacts.version-repository.v1", "artifacts.opaque-content.v1", "artifacts.compatibility.v1"] }),
  entry("modules/evidence-verification", "@adeptify/goalboard-module-evidence-verification", "module", "@adeptify/goalboard-contracts/modules/evidence-verification", ["goal-reorg-ex2", "goal-reorg-ex4"], "Evidence, immutable corrections, criterion coverage, and verification obligations.", "Artifact bodies, Goal Contracts, Runs, or Review verdicts.", ["src/v1/", "src/evidence/"], { maturity: "partial", capabilities: ["evidence.records.v1", "evidence.corrections.v1", "evidence.locator-preflight.v1", "evidence.verification-gates.v1"] }),
  entry("modules/governance-collaboration", "@adeptify/goalboard-module-governance-collaboration", "module", "@adeptify/goalboard-contracts/modules/governance-collaboration", ["goal-reorg-ex3", "goal-reorg-ex4"], "Review obligations, Reviews, Proposals, Decisions, and confirmation provenance.", "Direct mutation of Goal, Artifact, or Project facts.", ["src/v1/"], { maturity: "partial", capabilities: ["governance.review-obligations.v1", "governance.reviews.v1", "governance.proposals.v1", "governance.decisions.v1"] }),
  entry("modules/automation", "@adeptify/goalboard-module-automation", "module", "@adeptify/goalboard-contracts/modules/automation", [], "Trigger, Rule, Automation Run, deduplication, and generated Action references.", "Action dispatch, Provider calls, Scheduler leases, or a general Event Bus."),

  entry("horizontal/connector-host", "@adeptify/goalboard-service-connector-host", "horizontal", "@adeptify/goalboard-contracts/services/connector-host", ["goal-reorg-fd1", "goal-reorg-fd3"], "Provider connection, credential-reference, invocation, health, and Receipt mechanisms.", "Source desired state, Signal/Feed/Action facts, or provider-specific business rules.", ["src/feed/connectors/"], { maturity: "partial", capabilities: ["connector.host.v1"] }),
  entry("horizontal/listener-host", "@adeptify/goalboard-service-listener-host", "horizontal", "@adeptify/goalboard-contracts/services/listener-host", ["goal-reorg-fd1"], "Durable cursor, lease, retry, quarantine, and Raw Event delivery mechanisms.", "Source configuration, formal Signals, Feed/Attention/Goal/Automation decisions, or credentials.", ["src/feed/sources/scheduler.ts"], { maturity: "partial", capabilities: ["listener.host.v1"] }),
  entry("horizontal/scheduler", "@adeptify/goalboard-service-scheduler", "horizontal", "@adeptify/goalboard-contracts/services/scheduler", ["goal-reorg-fd1"], "Durable one-shot wakeup, lease, catch-up, and delivery Receipt mechanisms.", "Business schedules, Automation rules, Source intent, Action parameters, or Attention content.", ["src/feed/sources/scheduler.ts", "src/web/server.ts"]),
  entry("horizontal/runtime-host", "@adeptify/goalboard-service-runtime-host", "horizontal", "@adeptify/goalboard-contracts/services/runtime-host", ["goal-reorg-wk2"], "Runtime provider discovery, start/resume/stream/interrupt/stop, and technical Receipts.", "Claims, Runs, Goals, Sessions, workspaces, conversation lineage, or Artifacts.", ["src/sessions/", "src/web/pty-client.ts"], { maturity: "partial", capabilities: ["runtime.host.v1", "runtime.codex.v1", "runtime.terminal-pty.v1"], extraDependencies: { "node-pty": "1.1.0" } }),

  entry("plugins/native/goals", "@adeptify/goalboard-plugin-goals", "native-plugin", "@adeptify/goalboard-contracts/platform/plugin", ["goal-f826dfb8-bf63-4e98-b6b7-57f6b4b7c3b8", "goal-reorg-gw4", "goal-reorg-gw5", "goal-reorg-ex4"], "Protected first-party Goals navigation, UI, commands, and composition.", "Goal facts, Stores, or another Plugin implementation.", ["src/web/render.ts"], { maturity: "partial", capabilities: ["goals.execution-validation-application.v1"], extraWorkspaceDependencies: ["@adeptify/goalboard-module-evidence-verification", "@adeptify/goalboard-module-goals"] }),
  entry("plugins/native/artifacts", "@adeptify/goalboard-plugin-artifacts", "native-plugin", "@adeptify/goalboard-contracts/platform/plugin", ["goal-reorg-ar3"], "Protected first-party Artifact browsing, embedding, and composition.", "Artifact facts, Stores, or producer/consumer implementations.", ["src/web/render.ts", "src/web/server.ts"]),
  entry("plugins/native/feed", "@adeptify/goalboard-plugin-feed", "native-plugin", "@adeptify/goalboard-contracts/platform/plugin", ["goal-reorg-fd4"], "First-party Feed navigation, UI, disposition, and Module composition.", "Source/Signal/Feed/Attention facts or Provider implementations.", ["src/web/render.ts", "src/web/server.ts"], { maturity: "partial", capabilities: ["feed.native-plugin.contract.v1", "feed.ui-contribution.v1", "feed.http-routes.v1"] }),
  entry("plugins/native/actions", "@adeptify/goalboard-plugin-actions", "native-plugin", "@adeptify/goalboard-contracts/platform/plugin", [], "First-party Actions navigation, UI, and Module composition boundary.", "Action facts, dispatch workers, or Provider protocols."),
  entry("plugins/native/work", "@adeptify/goalboard-plugin-work", "native-plugin", "@adeptify/goalboard-contracts/platform/plugin", ["goal-reorg-wk3"], "First-party Session, Runtime, resume, and handoff product UI.", "Session/Run/Goal facts or Runtime adapter implementations.", ["src/web/render.ts", "src/web/server.ts", "src/web/pty-client.ts"]),
  entry("plugins/native/automation", "@adeptify/goalboard-plugin-automation", "native-plugin", "@adeptify/goalboard-contracts/platform/plugin", [], "First-party Automation navigation, UI, and Module composition boundary.", "Automation facts, Scheduler state, Action dispatch, or arbitrary scripts."),

  entry("plugins/official-integrations/github", "@adeptify/goalboard-integration-github", "integration-plugin", "@adeptify/goalboard-contracts/platform/plugin", ["goal-reorg-fd3"], "Official GitHub authorization, connector, listener, Signal, settings, and Action adapters.", "Source/Signal/Feed/Action facts or Host business decisions.", ["src/feed/connectors/github.ts", "src/feed/connectors/github-oauth.ts"], { maturity: "partial", capabilities: ["connector.github.v1", "signal-adapter.github.v1"], extraWorkspaceDependencies: ["@adeptify/goalboard-plugin-sdk"] }),
  entry("plugins/official-integrations/gmail", "@adeptify/goalboard-integration-gmail", "integration-plugin", "@adeptify/goalboard-contracts/platform/plugin", ["goal-reorg-fd3"], "Official Gmail OAuth, connector, listener, Signal, settings, and Action adapters.", "Source/Signal/Feed/Attention facts or Host business decisions.", ["src/feed/connectors/gmail.ts", "src/feed/connectors/gmail-oauth.ts"], { maturity: "partial", capabilities: ["connector.gmail.v1", "signal-adapter.gmail.v1"], extraWorkspaceDependencies: ["@adeptify/goalboard-plugin-sdk"] }),
  entry("plugins/official-integrations/rss", "@adeptify/goalboard-integration-rss", "integration-plugin", "@adeptify/goalboard-contracts/platform/plugin", ["goal-reorg-fd3"], "Official catalog and custom RSS provider adapters.", "Source/Signal/Feed facts or a general-purpose HTTP platform.", ["src/feed/sources/"], { maturity: "partial", capabilities: ["connector.rss.v1", "signal-adapter.rss.v1"], extraWorkspaceDependencies: ["@adeptify/goalboard-plugin-sdk"] }),
  entry("plugins/official-integrations/web-query", "@adeptify/goalboard-integration-web-query", "integration-plugin", "@adeptify/goalboard-contracts/platform/plugin", ["goal-reorg-fd3"], "Official Web Query provider adapter and settings boundary.", "Source/Signal/Feed facts or unrestricted web execution.", ["src/feed/sources/"], { maturity: "partial", capabilities: ["connector.web-query.v1", "signal-adapter.web-query.v1"], extraWorkspaceDependencies: ["@adeptify/goalboard-plugin-sdk"] }),
  entry("plugins/official-integrations/youtube", "@adeptify/goalboard-integration-youtube", "integration-plugin", "@adeptify/goalboard-contracts/platform/plugin", ["goal-reorg-fd3"], "Official YouTube Channel provider adapter and settings boundary.", "Source/Signal/Feed facts or a general media client.", ["src/feed/sources/youtube.ts"], { maturity: "partial", capabilities: ["connector.youtube.v1", "signal-adapter.youtube.v1"], extraWorkspaceDependencies: ["@adeptify/goalboard-plugin-sdk"] }),

  entry("tooling/plugin-cli", "@adeptify/goalboard-plugin-cli", "tooling", "@adeptify/goalboard-contracts/platform/tooling", ["goal-reorg-dv3"], "Plugin creation, Manifest/Contract validation, local debugging, packaging, and signing workflow boundary.", "A fake runnable CLI before the SDK and lifecycle implementation exist."),
];

export const WORKSPACE_GLOBS = [
  "apps/*",
  "packages/*",
  "modules/*",
  "horizontal/*",
  "plugins/native/*",
  "plugins/official-integrations/*",
  "tooling/plugin-cli",
];

const CONTRACT_SUBPATHS = [
  ...WORKSPACE_PACKAGES.filter((item) => item.kind === "module").map((item) => item.contract),
  ...WORKSPACE_PACKAGES.filter((item) => item.kind === "horizontal").map((item) => item.contract),
  ...WORKSPACE_PACKAGES.map((item) => item.contract).filter((value) => value.includes("/platform/")),
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function filesUnder(directory, filename) {
  if (!fs.existsSync(directory)) return [];
  const result = [];
  for (const name of fs.readdirSync(directory)) {
    if (name === "node_modules" || name === "dist") continue;
    const child = path.join(directory, name);
    const stat = fs.lstatSync(child);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) result.push(...filesUnder(child, filename));
    else if (name === filename) result.push(child);
  }
  return result;
}

export function checkWorkspacePackages(repositoryRoot) {
  const errors = [];
  const names = new Set();
  const expectedPaths = new Set(WORKSPACE_PACKAGES.map((item) => item.path));
  const contractsPath = path.join(repositoryRoot, "packages/contracts/package.json");
  const contractsManifest = fs.existsSync(contractsPath) ? readJson(contractsPath) : null;

  if (WORKSPACE_PACKAGES.length !== 48) {
    errors.push(`expected 48 workspace packages, configured ${WORKSPACE_PACKAGES.length}`);
  }

  for (const item of WORKSPACE_PACKAGES) {
    const packageRoot = path.join(repositoryRoot, item.path);
    const requiredFiles = ["package.json", "tsconfig.json", "README.md", "src/index.ts"];
    for (const relativeFile of requiredFiles) {
      if (!fs.existsSync(path.join(packageRoot, relativeFile))) {
        errors.push(`${item.path}: missing ${relativeFile}`);
      }
    }
    if (!fs.existsSync(path.join(packageRoot, "package.json"))) continue;

    const manifest = readJson(path.join(packageRoot, "package.json"));
    if (manifest.name !== item.name) errors.push(`${item.path}: package name mismatch`);
    if (names.has(manifest.name)) errors.push(`${item.path}: duplicate package name ${manifest.name}`);
    names.add(manifest.name);
    if (manifest.private !== true) errors.push(`${item.path}: package must remain private in F2`);
    if (manifest.version !== "0.0.0") errors.push(`${item.path}: package version must be 0.0.0 in F2`);
    if (manifest.goalboard?.path !== item.path) errors.push(`${item.path}: goalboard.path mismatch`);
    if (manifest.goalboard?.kind !== item.kind) errors.push(`${item.path}: goalboard.kind mismatch`);
    if (manifest.goalboard?.maturity !== item.maturity) errors.push(`${item.path}: package maturity must be ${item.maturity}`);
    if (manifest.goalboard?.contract !== item.contract) errors.push(`${item.path}: Contract entrypoint mismatch`);
    if (manifest.goalboard?.ssot !== "docs/SSOT-MATRIX.md") errors.push(`${item.path}: architecture SSOT mismatch`);
    if (JSON.stringify(manifest.goalboard?.migrationGoals) !== JSON.stringify(item.migrationGoals)) {
      errors.push(`${item.path}: migration Goal list mismatch`);
    }
    const dependencies = Object.entries(manifest.dependencies ?? {}).sort(([left], [right]) => left.localeCompare(right));
    const expectedDependencies = item.path === "packages/contracts"
      ? []
      : [
          ...["@adeptify/goalboard-contracts", ...item.extraWorkspaceDependencies]
            .map((name) => [name, "workspace:*"]),
          ...Object.entries(item.extraDependencies),
        ].sort(([left], [right]) => left.localeCompare(right));
    if (JSON.stringify(dependencies) !== JSON.stringify(expectedDependencies)) {
      errors.push(`${item.path}: workspace dependency boundary does not match its declared migration slice`);
    }
    if (!manifest.scripts?.build || !manifest.scripts?.typecheck) {
      errors.push(`${item.path}: missing build/typecheck scripts`);
    }
    if (!manifest.exports?.["."]?.types || !manifest.exports?.["."]?.import) {
      errors.push(`${item.path}: missing public export entrypoint`);
    } else if (
      !manifest.exports["."].types.startsWith("./dist/") ||
      !manifest.exports["."].import.startsWith("./dist/")
    ) {
      errors.push(`${item.path}: public export must resolve through dist, not a source deep import`);
    }

    const indexPath = path.join(packageRoot, "src/index.ts");
    if (fs.existsSync(indexPath)) {
      const indexSource = fs.readFileSync(indexPath, "utf8");
      if (!indexSource.includes("packageDescriptor")) errors.push(`${item.path}: missing packageDescriptor export`);
      if (!indexSource.includes(`maturity: "${item.maturity}"`)) errors.push(`${item.path}: source maturity is not ${item.maturity}`);
      for (const capability of item.capabilities) {
        if (!indexSource.includes(`"${capability}"`)) errors.push(`${item.path}: source capability ${capability} missing`);
      }
      if (item.maturity === "contract-only" && item.path !== "packages/contracts" && /\b(class|registerProvider|createStore)\b/u.test(indexSource)) {
        errors.push(`${item.path}: contract-only entrypoint appears to register implementation behavior`);
      }
    }

    const readmePath = path.join(packageRoot, "README.md");
    if (fs.existsSync(readmePath)) {
      const readme = fs.readFileSync(readmePath, "utf8");
      if (!readme.includes(`Status: \`${item.maturity}\``)) errors.push(`${item.path}: README status missing`);
      if (!readme.includes(item.contract)) errors.push(`${item.path}: README Contract entrypoint missing`);
      for (const goalId of item.migrationGoals) {
        if (!readme.includes(goalId)) errors.push(`${item.path}: README missing migration Goal ${goalId}`);
      }
    }
  }

  const packageJsonFiles = [
    ...filesUnder(path.join(repositoryRoot, "apps"), "package.json"),
    ...filesUnder(path.join(repositoryRoot, "packages"), "package.json"),
    ...filesUnder(path.join(repositoryRoot, "modules"), "package.json"),
    ...filesUnder(path.join(repositoryRoot, "horizontal"), "package.json"),
    ...filesUnder(path.join(repositoryRoot, "plugins"), "package.json"),
    ...filesUnder(path.join(repositoryRoot, "tooling"), "package.json"),
  ];
  for (const packageJson of packageJsonFiles) {
    const relativePackage = path.relative(repositoryRoot, path.dirname(packageJson));
    if (!expectedPaths.has(relativePackage)) errors.push(`unexpected workspace package ${relativePackage}`);
  }

  if (contractsManifest) {
    for (const contract of new Set(CONTRACT_SUBPATHS)) {
      const subpath = contract.replace("@adeptify/goalboard-contracts", ".");
      if (!contractsManifest.exports?.[subpath]) errors.push(`contracts: missing export ${subpath}`);
    }
  }

  const workspaceFile = path.join(repositoryRoot, "pnpm-workspace.yaml");
  if (fs.existsSync(workspaceFile)) {
    const workspace = fs.readFileSync(workspaceFile, "utf8");
    for (const glob of WORKSPACE_GLOBS) {
      if (!workspace.includes(`'${glob}'`) && !workspace.includes(`\"${glob}\"`)) {
        errors.push(`pnpm-workspace.yaml: missing ${glob}`);
      }
    }
  } else {
    errors.push("missing pnpm-workspace.yaml");
  }

  return {
    packageCount: WORKSPACE_PACKAGES.length,
    uniquePackageNames: names.size,
    contractSubpaths: new Set(CONTRACT_SUBPATHS).size,
    errors,
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = checkWorkspacePackages(repositoryRoot);
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length > 0) process.exitCode = 1;
}

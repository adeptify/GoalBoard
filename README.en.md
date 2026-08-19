# GoalBoard

[中文](README.md) | **English**

> A goal ledger shared by humans and AI: the goal, the progress, and what "done" means are visible to both sides.

Have you been here before: the plan you worked out with AI yesterday is gone when you open a new conversation, and you have to explain the whole context again; requirements quietly drift while you talk, and by the time you notice, the work has already gone sideways; subtasks run in whatever order the AI feels like, so later work starts before earlier work is done and gets thrown away; the AI says "it's done" and you have no real way to know; you switch from Codex to Claude Code halfway and the two sides can't see each other's progress; the idea is still fuzzy but the AI rushes ahead, so you end up redoing it; you finally align on inputs and outputs, then the AI answers in jargon you can't follow; work stalls and you don't know what it's waiting for, while a pile of decisions that need you are buried in chat history.

So we built **GoalBoard** — a **non-intrusive** goal ledger shared between humans and AI, with **rich MCP integration** and **no AI of its own**:

- **Non-intrusive**: it doesn't launch your AI or force tasks onto anyone; work that can be done sits in a list and the AI picks it up itself;
- **Rich MCP**: connect to Codex, Claude Code, or any MCP runtime; switch conversations or switch AIs and the goal is still there;
- **No AI of its own**: it isn't tied to any model — your AI stays the main actor;
- **A goal ledger**: goals, breakdowns, progress, and completion criteria are all on the books — who's working, where things stand, what's blocked, what's missing, and what's waiting for your decision are visible at a glance, so you never have to guess from chat history.

```text
You say a rough idea → the current AI clarifies it with you → you confirm the goal tree
→ the AI picks an available item → implements and verifies → GoalBoard records progress and completion
```

## UI overview

![Goal Tree: goals, status, next steps, and completion evidence in business language](docs/screenshots/goalboard-tree.png)

The built-in demo walks a first-time user through a complete goal collaboration loop, using user goals rather than module names:

```text
Let a first-time user complete one round of goal collaboration
├─ Give every piece of work a trustworthy completion basis       Done
├─ Let different AI conversations see the same project progress  In progress
├─ Let users understand the goal and next step at a glance       Waiting on upstream work
└─ Let new users know how to start after install                 Needs clarification
```

The demo also includes pending decisions, a Risk for forgetting to open a new session after first-time integration, and an old proposal that can be restored from the trash. Goal documents read top-down: "what the goal is → what counts as done → how to move it forward → risks and rules → history." Older screenshots that no longer match the current structure or demo are not shown.

## 3-minute experience

You need Node.js 20+, pnpm, and macOS (the persistent Web service currently uses LaunchAgent; other platforms can still run Web in the foreground).

```bash
git clone https://github.com/adeptify/goalboard.git
cd goalboard
pnpm install --frozen-lockfile

# The only local install entry point: builds first, then installs into ~/.goalboard
pnpm install:local

# macOS: after explicit confirmation, keep Web running even after the terminal
# or Runtime Session closes
"$HOME/.goalboard/bin/goalboard" service install --home "$HOME/.goalboard" --confirm

# Create a rebuildable demo kept separate from user data
"$HOME/.goalboard/bin/goalboard" demo create --confirm
```

Open `http://127.0.0.1:4173`:

1. Enter the demo project and look at the Goal Tree, pending decisions, and completion evidence.
2. In "Settings → Runtime", pick Codex or Claude Code, review the change preview, and confirm the integration.
3. **Open a new Runtime Session** and say "continue with GoalBoard." Runtimes read MCP and Skill manifests only at Session startup, so tools installed just now won't appear in the current conversation.

Once integrated, you can also tell the Runtime to "start GoalBoard." It first checks the managed service state: on macOS, the first enablement explains that this is a user-level background service that starts at login and keeps running after the terminal closes, and only installs after your explicit confirmation; if it is already running, it just returns the page address. Only when you explicitly say "open GoalBoard temporarily" will it use a foreground process tied to the current terminal or Session. Non-macOS platforms currently have no system-level persistent service; the Runtime says so plainly and asks whether to open it temporarily.

To start from your own idea, you don't need to fill in any form first. After a new Session is connected, just say:

> Use GoalBoard to create a new project and clarify "make sure a friend can install and use it smoothly on the first try" into a Goal Tree.

GoalBoard keeps asking the key questions in the current conversation; only proposals you confirm enter the official Goal Tree.

## Updating an existing install

If you already installed from the repository, pull the new content first, then use the same install entry point. Even when the version number doesn't change, the installer compares the actual content and refreshes the program and Skill; user projects, Runtime configuration, and demos are never rewritten automatically:

```bash
git pull --ff-only
pnpm install --frozen-lockfile
pnpm install:local

# When the persistent Web service is in use, explicitly restart it onto the new release
"$HOME/.goalboard/bin/goalboard" service restart --home "$HOME/.goalboard" --confirm
```

After updating MCP or the Skill, also open a new Runtime Session, because an already-running Session does not reload tools. To make the built-in demo use the new example content, run `goalboard demo reset --confirm` separately; it clears changes inside the demo but never touches user projects.

## Demo data

Both the CLI and Web "Settings → Projects" can create the same demo data. Preview first, then write only after explicit confirmation:

```bash
"$HOME/.goalboard/bin/goalboard" demo create
"$HOME/.goalboard/bin/goalboard" demo create --confirm
"$HOME/.goalboard/bin/goalboard" demo reset --confirm
"$HOME/.goalboard/bin/goalboard" demo remove --confirm
```

This project is clearly marked `regenerable_demo` in the catalog, separate from `user` and `migrated_user` data. Re-creating opens the existing demo; resetting clears changes inside the demo; removal and normal uninstall only clean up the regenerable demo and never touch user projects. Repository development and screenshots can still use `examples/seed-demo.mts`, which calls the same classification and rebuild logic.

## Starting Web: persistent or temporary

In a Runtime already connected to the GoalBoard Skill, the recommended instruction is:

> Start GoalBoard

The Runtime first does a read-only `goalboard service status` check instead of launching a foreground process that easily disappears with the Session. On macOS, if the persistent service is not installed, it first explains that this modifies a user-level LaunchAgent, starts at login, and keeps running after the terminal closes; it installs only after explicit confirmation. If stopped, it starts the service; if already running, it only returns the address; if the existing config is outdated, it explains the repair before confirming. Service commands report success only after the page is healthy and reachable.

If you only want a temporary process for the current terminal, say explicitly:

> Open GoalBoard temporarily

This runs the foreground `goalboard-web`; the page stops when the terminal or Runtime Session closes. Non-macOS platforms currently support only this foreground mode and never fake a system-level persistent service with `nohup` or a background shell.

## Development and manual startup

You need Node.js 20 or higher.

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test

# Install from the repository: always builds first, then installs only the GoalBoard program
pnpm install:local

# Web lists browsable projects only from GoalBoard's own project directory
"$HOME/.goalboard/bin/goalboard-web" --home "$HOME/.goalboard"
```

After opening `http://127.0.0.1:4173`, you can create, import, rename, and open projects in Settings, and configure Codex / Claude Code integration first. Selecting a project only changes what the page browses; it does not bind or switch the current Runtime Session. Existing legacy DBs are migrated into a project only after you explicitly select and confirm.

Running `goalboard-web` directly is still foreground mode, good for temporary debugging; closing the terminal closes the page too. On macOS you can instead use the user-level LaunchAgent persistent service — preview first, then confirm:

> ```bash
> # Preview only; writes nothing to the system
> "$HOME/.goalboard/bin/goalboard" service install --home "$HOME/.goalboard"
>
> # Install and start after explicit confirmation; auto-starts at login and recovers after abnormal exit
> "$HOME/.goalboard/bin/goalboard" service install --home "$HOME/.goalboard" --confirm
>
> "$HOME/.goalboard/bin/goalboard" service status --home "$HOME/.goalboard"
> ```
>
> `stop` only stops the current service and keeps login startup; `remove` stops and removes the LaunchAgent that GoalBoard created and that hasn't been rewritten. Logs live in `~/.goalboard/logs/web-service.log` and `web-service.error.log`. Non-macOS platforms clearly report "not supported" and never pretend to install with a background shell. You can also run the same preview and confirmation from Web "Settings → Diagnostics".

### Install boundaries

`goalboard install` only maintains `~/.goalboard`: the versioned program, shared Skill, MCP/Web/CLI launchers, project DB root, logs, and install manifest. It never creates or starts projects, never writes into user projects, and never modifies any Runtime user-level configuration. Registering the MCP entry into a Runtime later requires the user-confirmed Runtime integration flow.

For local installs from the repository use `pnpm install:local`; this single entry point rebuilds first, then installs the current content. If you point `goalboard install --source ...` directly at a repository containing `src/`, the installer checks the build fingerprint and stops if source and `dist` disagree instead of silently copying a stale build. The release also records a content digest: when the version is the same but program or Skill content changed, it refreshes atomically; only when the content is identical does it report "already up to date". A failed refresh restores the previous release; project data is never part of the replacement.

Projects use an immutable `project_id`; display names can be renamed or duplicated, and every project has its own `goalboard.db`. `projects/catalog.db` stores project identity, DB location, optional Session bindings, historical workspace-to-project associations, a user-set unique default project, and deletion receipts; it never copies Goal facts and never depends on Git. A normal project selection does not automatically become the directory default; a new Session sees historical candidates and asks. Only after the user explicitly sets a default does it restore automatically. Unbinding an association does not delete the project; deleting a project and its DB requires separate confirmation and is refused while valid Claims or unfinished Runs exist.

### Safe uninstall

A normal uninstall first generates a plan and changes nothing without `--confirm`. After confirmation, it removes only what GoalBoard's ownership receipt still proves it owns — Runtime integrations, LaunchAgent, launchers, and releases — and cleans up demo data explicitly marked as rebuildable. User projects, the catalog, backups, and logs are kept and remain usable after reinstall:

```bash
"$HOME/.goalboard/bin/goalboard" uninstall
"$HOME/.goalboard/bin/goalboard" uninstall --confirm
```

Permanently erasing user data is a separate operation and cannot reuse the single confirmation from a normal uninstall. The preview shows the exact home and user project count; execution requires providing both again unchanged:

```bash
"$HOME/.goalboard/bin/goalboard" uninstall --purge-user-data
"$HOME/.goalboard/bin/goalboard" uninstall --purge-user-data --confirm \
  --confirm-home "$HOME/.goalboard" --confirm-project-count N
```

If a Runtime config, Skill link, LaunchAgent, or launcher was rewritten by the user, uninstall reports the conflict and stops instead of widening the deletion scope. A failure mid-run leaves the completed steps, kept projects, and the error in `~/.goalboard/config/uninstall.json`, so you can fix the conflict, preview again, and continue.

### Next steps after install

`goalboard install` only installs the GoalBoard program and prints the install location, CLI/MCP/Web launchers, and safety boundaries; automation can use `goalboard install --json`. The install never creates projects, associates Sessions, starts services, or modifies Runtime configuration.

Runtime integration is handled by the same domain service. The current adapter read-only probes Codex, Claude Code, OpenCode, Pi Agent, and Grok Build, then generates a preview containing config paths, the GoalBoard MCP entry, the Skill link, backup location, and restart instructions; it writes only after the user explicitly confirms the current Runtime and plan. MCP and Skill are validated as one transaction; on failure, the original config bytes and Skill state are restored. Removal only undoes what the GoalBoard ownership receipt still records as untouched by the user. Unknown same-name configs or Skills show a conflict and are never overwritten.

After the integration is confirmed, **you must open a new Codex / Claude Code Session** for it to take effect: Runtimes read MCP and Skill manifests only at Session startup, and the current conversation doesn't dynamically gain just-written tools. In the new Session you can copy "continue with GoalBoard" to resume; GoalBoard shows projects previously used in the current directory and asks you to confirm. If you want a project to be entered automatically in the future, you must additionally set it as the directory default. The integration preview lists every change and this resume note item by item.

Creating a project and associating the current Session are separate operations: after the user invokes the unified Skill in the current Runtime, the Skill uses `context-list-projects`, `context-bind`, or `context-create-and-bind`, and writes into GoalBoard's own data directory only after the user explicitly chooses. Web can create, import, rename, and open projects, and manage already-confirmed Session and workspace associations; selecting a project in the page never changes the Runtime connection, and a new Session still asks by default unless the user explicitly set a directory default project.

Web only listens on loopback. Every startup generates a random control token that exists only in the local page; all Web API write requests must also pass same-origin Origin, control token, and one-time operation key checks. The local terminal channel uses the same token: the WebSocket upgrades on loopback, and the first message after connect must carry the token. Non-local Hosts, blind third-party page submissions, missing credentials, or repeated requests are rejected before reaching the project catalog, Runtime config service, Goal Coordinator, or PTY. This browser gate does not replace the confirmation and idempotency rules in each domain flow.

## Core concepts

| Concept | One-liner |
| --- | --- |
| Goal | The smallest executable unit, at the same granularity as a Task, with observable or quantifiable acceptance criteria |
| Goal Tree | The user-confirmed goal breakdown; Plans and boards are derived views of it |
| Dependency | A confirmed prerequisite; a hard gate for claiming and completing work |
| Risk | Something that may block claiming or completion, and needs a human decision on how to handle it |
| Claim | A time-limited occupancy of a Goal by a Runtime, not a task assignment |
| Run | One execution, review, or revalidation process |
| Evidence | Proof mapped to acceptance criteria (tests, inspections, human confirmations, etc.) |
| Review | Self, cross, or adversarial review that must pass for work to count as done |
| Candidate | New work discovered during execution, which only the user can decide to accept |
| Rewire | A user-confirmed rearrangement of goal relationships |

A normal Runtime can only read, select, claim, execute, and submit proposals and evidence; it cannot rule on canonical Goals itself. Inferences and suggestions are not authoritative facts until the user confirms them.

## Goal Contract

A user can raise a rough idea in the current Runtime; the GoalBoard Skill uses MCP to create a title-only `draft / abstract` Goal. The clarifier Runtime reads project facts and progressively proposes completions for Outcome, Why, non-technical business logic, scope, inputs and outputs, acceptance, dependencies, risks, and Review Policy; these suggestions become an accepted Contract only after the user confirms them.

The smallest executable Goal is at the same granularity as a Task: results close within the Goal and have observable or quantifiable acceptance criteria. For example, "design the user Domain and provide testable CRUD methods" can be a leaf Goal; "make the account system good" still needs further breakdown.

An accepted Contract is never versioned in place. Later requirements create new Candidate Goals, and the user decides separately whether to accept each new Goal and whether to confirm the Rewire.

## Runtime workflow

After the unified GoalBoard Skill is invoked, it first resolves the optional Session ID and the current workspace: if the same Session is already bound, the connection is restored; otherwise, projects explicitly used in this directory before become candidates and are asked about in the current conversation — even a single candidate is never auto-connected. Only after the user explicitly chooses is `context-bind` called; with a Session ID the choice is saved for this Session, without one only the workspace history is recorded and the current MCP call flow continues. Setting a project as the directory default is a separate explicit decision: only when `binding_scope=workspace_default` is passed do new Sessions restore it automatically. Creating, rejecting a candidate, switching, unbinding a Session, unlinking a workspace, and deleting a project each have their own confirmations. Project deletion still protects valid Claims and unfinished Runs. This resolution never happens in the background at Runtime startup or during unrelated conversations.

Normal Skill replies first explain, in the user's current language, "what I understand, why this still needs confirmation, and what I'm asking or doing next" — never dumping MCP tool names or internal IDs. New ideas, resuming an existing Draft, and direction changes show an editable structured checkpoint that clearly separates user-confirmed facts, traceable project facts, Runtime assumptions, and suggestions; every material answer is written to a dialogue turn before the next question. When a proposal is ready, a readable Goal Tree summarizes the outcome, non-goals, relations and dependencies, leaf acceptance, risks, and post-confirmation states, and the user can decide as a whole or revise named items.

Once the project connection is clear, the current Runtime reads `available` and the selected Goal's Contract and decides on its own whether to pick an item. GoalBoard never returns "the one and only next task"; a Claim is a time-limited occupancy, not a task assignment.

```text
new rough idea:
  draft-dialogue-start → the current Runtime clarifies in natural language
  → draft-dialogue-turn on each material answer → proposal_summary
  → goal-tree-propose / read / check → the Runtime and user decide items in conversation → goal-tree-decide

existing Draft:
  contract → draft-dialogue-resume if a saved clarification session exists
  → otherwise draft-dialogue-start(goal_id) reusing the Draft and clarifying in this conversation
  → proposal / user confirmation → run-report → release

executor:
  available(next_action=execute) → contract → select-goal → implement and verify
  → run-report → evidence-submit → review-submit → complete → release

reviewer:
  available(next_action=review) → contract → select-goal
  → review-submit → run-report → release

revalidator:
  available(next_action=revalidate) → contract → select-goal
  → check Contract, active dependencies, Risks, and evidence
  → revalidate → run-report → release
```

`select-goal` creates the Claim and Run in the same SQLite transaction; a failure never leaves a fake "in progress" state with a Claim but no Run. Normal Runtime workflows use `available` and `select-goal`; `ready`, `claim`, and `run-start` exist only for low-level management or tests.

For a new idea, the Runtime doesn't require the user to open Web first or fill in a Contract field by field: `draft-dialogue-start` atomically creates a minimal `draft / abstract` Goal, a clarifier Claim, and a Run in one transaction; every material clarification step in the conversation then calls `draft-dialogue-turn` to save the user's answer, current understanding, sourced facts, assumptions, and the one next question; after an interruption, `draft-dialogue-resume` restores the session. When clarification completes, the current Runtime submits the whole confirmable breakdown/change plan once via `goal-tree-propose`, and can restore and check it across Sessions with `goal-tree-read` and `goal-tree-check`; inferences and suggestions are not canonical Goals, relations, Risks, or Policy before user confirmation. The user then confirms, rejects, or requests changes item by item in the current Runtime conversation; after the user's explicit answer, the Runtime calls `goal-tree-decide` with `user_confirmed=true`, a confirmation summary, and the concrete decisions, and GoalBoard records the audit source together with host Session metadata. This is a local conversational provenance record, not a fake cryptographic identity. Only confirmed safe items are materialized; expired, dangling, or cyclic items stay conflicted without affecting other confirmed items.

Materialization adds no second "is clarification done" state: a confirmed compound parent with children shows "clarified, waiting for children"; a confirmed minimal leaf shows "ready to execute"; only Drafts or still-open breakdowns show "needs clarification".

A normal Runtime cannot create canonical Goals, modify accepted Contracts, activate dependencies, or decide Candidates/Rewires on the user's behalf. New work discovered during execution can only be submitted as a Candidate; dependency changes can only be submitted as a Dependency Proposal with direction, basis, evidence, impact-if-rejected, and confidence.

## MCP

GoalBoard connects projects through the unified Skill: the Runtime may provide a Session ID and the host provides the current workspace; the Skill calls `goalboard_v1_context_resolve` before resolving a Session selection, directory history candidates, or an explicit default project from `~/.goalboard/projects/catalog.db`. The Runtime never treats directories, database paths, or `board_id` as the project identity a user is choosing.

### Runtime work-entry binding (recommended)

The Runtime host only provides a Session ID when it can guarantee stability; it is not a Git URL, directory name, repository structure, or a string inferred from conversation. GoalBoard supports any MCP Runtime providing a Session ID in `_meta.threadId`, `_meta.sessionId`, or `_meta["goalboard/sessionId"]` on each `tools/call`, and also supports stable environment signals from adapters like Claude Code; ordinary tool arguments are never treated as host identity. When the same long-lived MCP process receives a different Session ID, it clears the previous Session's connection. Without a Session ID, GoalBoard can still use the canonical workspace to find historical candidates, but never pretends a directory or MCP process is a Session. One workspace can associate multiple `project_id`s; a normal selection does not set a default automatically.

The install itself never writes Runtime configuration. Codex and Claude Code should use the stable launcher after the user confirms the integration preview; other Runtime hosts can explicitly provide the same set of environment values:

```bash
GOALBOARD_HOME="$HOME/.goalboard" \
GOALBOARD_RUNTIME_ID="<runtime-id>" \
GOALBOARD_WORK_CONTEXT_ID="<host-provided stable work-entry ID>" \
GOALBOARD_WORK_CONTEXT_STABLE="true" \
GOALBOARD_WEB_URL="http://127.0.0.1:4173" \
GOALBOARD_MCP_AUDIENCE="runtime" \
"$HOME/.goalboard/bin/goalboard-mcp"
```

This MCP process starts "not connected to a project" and opens no Board. The unified Skill calls `goalboard_v1_context_resolve` first:

> **Codex and generic Runtime fallback**: the Codex CLI/desktop stdio MCP startup environment does not inject `CODEX_THREAD_ID`, and the official request is marked as not planned ([openai/codex#19937](https://github.com/openai/codex/issues/19937), NOT_PLANNED). Newer Codex app-server call paths can carry the thread in `_meta.threadId` on individual tool calls; GoalBoard uses it when present. Without a Session signal, the working directory can still surface historical candidates for the user to choose, but the directory never acts as a Session ID, and new conversations ask again by default.

- `bound`: returns the unique `project_id`, `board_id`, and a fixed database connection; later normal GoalBoard MCP calls can only use that `board_id`.
- `suggested`: the new Session has workspace history or other host clues. The result contains only candidate projects and generic reasons that don't leak the original path, with no project connection; the current Runtime must ask the user in the same conversation whether to associate one.
- `unbound`: returns `missing_stable_context` or `unknown_context` plus `ask_user_to_select_or_create`, connecting to no project.
- When the user explicitly rejects a `suggested` candidate, the Skill calls `goalboard_v1_context_reject_suggestion` with `user_confirmed=true`. It only stops suggesting that candidate in this Session, then may return another candidate or an explicit project list/create path; it never unbinds, deletes, or affects other Sessions.
- After the user explicitly picks an existing project in the current conversation, the Skill calls `goalboard_v1_context_bind` with `user_confirmed=true`. A normal selection only affects this Session (when identifiable) and records workspace history; only when the user separately asks to enter it automatically in the future is `binding_scope=workspace_default` passed. Switching from another project in the same scope also requires `rebind_confirmed=true`.
- After the user explicitly asks to create a named project in the current conversation, the Skill calls `goalboard_v1_context_create_and_bind` with `user_confirmed=true`, the project name, and an idempotency key. It creates the project DB and binds it only under `~/.goalboard`; a failure leaves no orphan project.
- When the user asks to view projects, the Skill calls `goalboard_v1_context_list_projects`; it doesn't expose database paths and changes nothing.
- When the user explicitly asks to unbind only the current work entry, the Skill calls `goalboard_v1_context_unbind` with `user_confirmed=true`. It doesn't delete the project, DB, or other Runtimes' bindings.
- Deleting a project and its DB is a separate confirmation: after the user names the project and confirms deletion, the Skill calls `goalboard_v1_project_delete` with `delete_confirmed=true` and an idempotency key. It refuses while the project has a valid Claim or unfinished Run; on success it returns a deletion receipt and the Runtime can no longer use the old connection.

Web is an optional viewing and user-confirmation surface. GoalBoard never requires Web to be started for association resolution; a normal Web startup first shows the project list, and what the user selects is only what the page browses. Project Settings can manage already-confirmed Session associations and a workspace's multiple member projects, and explicitly set defaults or remove associations; it never shows full directory paths. Project creation, Runtime configuration, and legacy DB migration also show their impact first or require separate confirmation.

The Runtime audience only exposes work-entry resolution/explicit binding, reads, Available/atomic selection/Run, Contract/Candidate/Dependency Proposal, Goal Tree Proposal/Decision, revalidation, Evidence, Runtime Review, completion checks, and release. `goal-tree-decide` is not a license for the Runtime to reshape the tree on its own: only after the user has just explicitly decided in the current conversation may the Runtime pass `user_confirmed=true`, a confirmation summary, and the concrete decisions; GoalBoard generates the audit reference from host Session metadata. The Runtime cannot forge a Session identity or override a resolved project connection through ordinary tool arguments.

Trusted user entries that need to create Goals, maintain relations/risks/Policy, decide Contract/Candidate/Rewire, or import legacy data should use `GOALBOARD_MCP_AUDIENCE=management` separately. Never hand the management MCP to an autonomous Runtime.

When the service is unavailable or identities are inconsistent, the Runtime must stop; it cannot start another instance, switch databases, replace `board_id`, rewrite URLs, or fall back to the CLI. The full protocol lives in the [Runtime Skill](skills/goal-advance/SKILL.md).

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
src/web/                     Goal Tree and document-style Goal workspace
src/install/                 Install, Runtime integration, persistent service, and safe uninstall
src/cli/main.ts              Product CLI and V1 management entry
examples/seed-demo.mts       Dev script calling the product demo lifecycle
docs/screenshots/            README product screenshots
skills/goal-advance/         Runtime working protocol
tests/v1.test.ts             Coordinator, CLI, migration, and protocol regression
tests/mcp.test.ts            MCP audience, permission, and connection regression
tests/web.test.ts            Web data and interaction regression
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

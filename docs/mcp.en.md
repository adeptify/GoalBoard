# MCP Integration

GoalBoard connects projects through the unified Skill: the Runtime may provide a Session ID and the host provides the current workspace; the Skill calls `goalboard_v1_context_resolve` before resolving a Session selection, directory history candidates, or an explicit default project from `~/.goalboard/projects/catalog.db`. The Runtime never treats directories, database paths, or `board_id` as the project identity a user is choosing.

## Runtime work-entry binding (recommended)

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

> **Codex and generic Runtime fallback**: the Codex CLI/desktop stdio MCP startup environment does not inject `CODEX_THREAD_ID`, and the official request is marked as not planned ([openai/codex#19937](https://github.com/openai/codex/issues/19937), NOT_PLANNED). Newer Codex app-server call paths can carry the thread in `_meta.threadId` on individual tool calls; GoalBoard uses it when present. Without a Session signal, the working directory can still surface historical candidates, but the directory never acts as a Session ID; a new conversation asks again by default when the current message did not explicitly select a project.

- `bound`: returns the unique `project_id`, `board_id`, and a fixed database connection; later normal GoalBoard MCP calls can only use that `board_id`.
- `suggested`: the new Session has workspace history or other host clues. The result contains only candidate projects and generic reasons that don't leak the original path, with no project connection. If the current user message already explicitly asks to use GoalBoard with a named project and exactly one returned existing project unambiguously matches it, the Skill calls `context_bind` directly; otherwise it shows the candidates and asks.
- `unbound`: returns `missing_stable_context` or `unknown_context` and connects to no project. The Skill likewise reuses an explicit current-message selection of one unambiguous existing project; otherwise it shows the project list and asks the user to select or create one.
- When the user explicitly rejects a `suggested` candidate, the Skill calls `goalboard_v1_context_reject_suggestion` with `user_confirmed=true`. It only stops suggesting that candidate in this Session, then may return another candidate or an explicit project list/create path; it never unbinds, deletes, or affects other Sessions.
- After the user explicitly picks an existing project in the current conversation, the Skill calls `goalboard_v1_context_bind` with `user_confirmed=true`. A normal selection only affects this Session (when identifiable) and records workspace history; only when the user separately asks to enter it automatically in the future is `binding_scope=workspace_default` passed. Switching from another project in the same scope also requires `rebind_confirmed=true`.
- After the user explicitly asks to create a named project in the current conversation, the Skill calls `goalboard_v1_context_create_and_bind` with `user_confirmed=true`, the project name, and an idempotency key. It creates the project DB and binds it only under `~/.goalboard`; a failure leaves no orphan project.
- When the user asks to view projects, the Skill calls `goalboard_v1_context_list_projects`; it doesn't expose database paths and changes nothing.
- When the user explicitly asks to unbind only the current work entry, the Skill calls `goalboard_v1_context_unbind` with `user_confirmed=true`. It doesn't delete the project, DB, or other Runtimes' bindings.
- Deleting a project and its DB is a separate confirmation: after the user names the project and confirms deletion, the Skill calls `goalboard_v1_project_delete` with `delete_confirmed=true` and an idempotency key. It refuses while the project has a valid Claim or unfinished Run; on success it returns a deletion receipt and the Runtime can no longer use the old connection.

Web is an optional viewing and user-confirmation surface. GoalBoard never requires Web to be started for association resolution; a normal Web startup first shows the project list, and what the user selects is only what the page browses. Project Settings can manage already-confirmed Session associations and a workspace's multiple member projects, and explicitly set defaults or remove associations; it never shows full directory paths. Project creation, Runtime configuration, and legacy DB migration also show their impact first or require separate confirmation.

The Runtime audience only exposes work-entry resolution/explicit binding, reads, Available/atomic selection/Run, Contract/Candidate/Dependency Proposal, Goal Tree Proposal/Decision, revalidation, Evidence, Runtime Review, completion checks, and release. `goal-tree-decide` is not a license for the Runtime to reshape the tree on its own: only after the user has just explicitly decided in the current conversation may the Runtime pass `user_confirmed=true`, a confirmation summary, and the concrete decisions; GoalBoard generates the audit reference from host Session metadata. The Runtime cannot forge a Session identity or override a resolved project connection through ordinary tool arguments.

Trusted user entries that need to create Goals, maintain relations/risks/Policy, decide Contract/Candidate/Rewire, or import legacy data should use `GOALBOARD_MCP_AUDIENCE=management` separately. Never hand the management MCP to an autonomous Runtime.

When the service is unavailable or identities are inconsistent, the Runtime must stop; it cannot start another instance, switch databases, replace `board_id`, rewrite URLs, or fall back to the CLI. The full protocol lives in the [Runtime Skill](../skills/goal-advance/SKILL.md).

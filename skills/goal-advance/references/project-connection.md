# Project connection and recoverable deletion

Read this reference when the user asks to connect, create, switch, unbind, or delete a GoalBoard project; when a Desktop Runtime is opened beside one Goal; or when the user asks to trash or restore a Goal.

## Resolve before Goal work

Call `goalboard_v1_context_resolve` only after the user explicitly invokes GoalBoard in the current conversation.

- `bound`: use exactly the returned connection and `board_id`.
- `bound` may be a read-only automatic workspace recovery when the current realpath has exactly one verified project membership. Use it without asking again; GoalBoard does not create a Session binding merely to recover this unique project.
- `suggested`: the Session is still unbound. If the current user request already explicitly asks to use, connect, continue, or advance GoalBoard with a named project, and that reference unambiguously denotes exactly one returned existing project, call `goalboard_v1_context_bind` in the same turn; the user has already selected it. Otherwise show candidate names and safe generic reasons, explain that they are only suggestions, and ask which one to use.
- `unbound`: apply the same current-request rule when one returned existing project unambiguously matches the user's explicit selection. Otherwise show the returned existing project names and ask whether to connect one or create a named project.
- `missing_stable_context`: explain that GoalBoard cannot safely remember this conversation or workspace association. Do not fabricate identity. Offer a host with a stable Session signal, an explicitly configured stable work-context ID, or read-only Web browsing.

The working directory is never a Session ID or project identity. It may recover a project only through one exact, realpath-verified membership. Zero matches, multiple matches, path conflicts or unverified matches still require a user choice. Raw host clues, database paths, and internal project IDs stay out of normal user-facing text.

## Recover from a connection-context refresh

Treat `mcp.context_refresh_required` as an in-process connection refresh, not proof that the Session lost its project binding.

1. Call read-only `goalboard_v1_context_resolve` once for the current Session. Do not call `context_bind` and do not ask the user to select the project again for this recovery step.
2. If it returns `bound`, retry the failed lifecycle call unchanged. For a write, reuse the exact same `idempotency_key`; never mint a new request merely because the connection cache was refreshed.
3. If it returns `suggested`, `unbound`, or `missing_stable_context`, do not retry the lifecycle call. Follow the normal resolution rules above because the durable context is not currently bound.
4. If the same call still returns `mcp.context_refresh_required` after one successful `bound` resolve, stop automatic retries and report the repeated context-identity discontinuity. Do not weaken Session isolation or guess from the working directory.

The structured recovery fields are authoritative for this branch: `next_action=context_resolve_then_retry`, `requires_bind=false`, `requires_user_confirmation=false`, and `retry_same_idempotency_key=true`. These fields describe the refresh step only; the subsequent `context_resolve` result decides whether normal project selection is needed.

## Recover from an older Runtime reader

Treat `catalog.reader_too_old` as a Runtime/catalog version mismatch, not damaged user data. Report the returned `actual_schema_version` and `supported_schema_max` in plain language. The current Session cannot hot-reload its MCP process, so do not retry the same call unchanged.

Use this safe recovery sequence:

1. Preserve the current task and GoalBoard data. Never roll back `catalog.db`, edit SQLite, route writes through CLI or Web, or terminate the old task automatically.
2. Ask the user to create a new or Forked Session when one does not already exist. Host navigation or opening another task does not prove that the user's next message has the new task focus.
3. In the new or Forked Session, confirm the current task focus from host-visible context before any GoalBoard write. Then make a read-only `goalboard_v1_context_resolve` call.
4. Continue only after that call succeeds and the returned project is bound under the normal connection rules. A suggestion still requires a project decision; do not turn recovery into automatic rebinding.
5. If the message still lands in the old task, show the same version mismatch and focus guidance, and do not enter a write path.

GoalBoard owns the version diagnosis and the no-data-loss recovery instructions. The Runtime host owns task navigation and message focus; never claim that host navigation succeeded merely because a navigation call returned successfully.

## Bind or create only after a clear choice

- Existing project: call `goalboard_v1_context_bind(project_id, actor_id, user_confirmed=true)` after the user explicitly selects it.
- New project: obtain a user-facing name, repeat it back, then call `goalboard_v1_context_create_and_bind(display_name, user_confirmed=true, idempotency_key)`.
- Do not ask the user to copy a fixed confirmation phrase. If the Runtime has already repeated the project name and explained the create-and-bind operation, and the user already clearly authorized the named create-and-bind operation in the current reply, do not ask again. If the name, whether to create, or whether to bind remains unclear, ask one short confirmation question.
- Do not ask the user to repeat an existing-project selection made in the same message that invoked GoalBoard. A phrase such as “继续用 GoalBoard 推进 CGS” is selection authority only when `CGS` unambiguously denotes one returned existing project. A bare mention, an unclear shorthand, several possible matches, or “you decide” still requires one short question.
- Switch: when the current work entry is already bound elsewhere, ask a separate switch question before `rebind_confirmed=true`.
- Workspace history: ordinary selection records that the directory has used the project. A later Session can recover it without another question only when that exact verified workspace has one project membership; this is read-only recovery, not a hidden Session binding or a directory-default write. Multiple candidates still require a choice.
- Reject suggestion: after an explicit “not this candidate,” call `goalboard_v1_context_reject_suggestion` only when the resolved context contains a stable Session identity. Without one, acknowledge the answer without pretending it was persisted.

Silence, timeout, “not now,” “you decide,” and other ambiguous language are not confirmation.

Useful user-facing questions:

| Situation | Ask |
|---|---|
| One exact verified workspace membership | Do not ask. Say “已连接：{项目名}” and continue from the restored Goal focus. |
| One non-exact suggestion | “我找到一个可能相关的项目：{项目名}。它只是候选，还没有关联。要把当前会话关联到它吗？” |
| Several suggestions | List names, then ask which one to connect. |
| No suggestion | “当前会话还没有关联项目。要打开现有项目中的一个，还是新建一个？” |
| User mentions an existing project without clearly selecting it | “你提到了「{项目名}」。要把当前会话关联到它吗？” |
| User asks for a directory default | “GoalBoard 不保存目录默认项目；这个目录只会把「{项目名}」列为候选，每个新 Session 都会再确认。” |
| User asks to create the current project | Propose the working-directory name as a display name, repeat it, and ask for confirmation; do not treat the directory itself as identity. |

## Manage projects without conflating permissions

Use project lifecycle tools only after the user asks for that operation:

- `goalboard_v1_context_list_projects`: read-only choices; it authorizes no follow-up write.
- `goalboard_v1_context_unbind`: disconnect the current Session while preserving the project. Ask the user to confirm that exact meaning.
- `context_unbind(binding_scope="workspace", project_id)`: remove one workspace history association while preserving the project.
- `goalboard_v1_project_delete`: permanently remove the named managed project and its GoalBoard database only after a separate unmistakable deletion confirmation. It must reject valid Claims or unfinished Runs and return a deletion receipt.

“Use another project,” “not this suggestion,” “stop using GoalBoard here,” and “delete this project” are four different decisions. Never carry confirmation from one to another. If project cleanup returns `pending`, report that cleanup is unfinished and retry only the exact same request with the same idempotency key.

## Desktop-opened Goal

When `GOALBOARD_GOAL_ID` is present, the user opened this Runtime beside that Goal. After context resolution returns `bound`:

1. Read it with `goalboard_v1_contract`.
2. Do not call `select_goal`, `claim`, or `run_start` merely because the terminal exists.
3. When the user clicks “推进这个 Goal” or explicitly asks to advance it, follow the returned work state and the execution or planning reference as appropriate.
4. Stay associated with that Goal unless the user asks to work on another. The terminal tab does not silently retarget when another Goal is updated.

`GOALBOARD_WORK_CONTEXT_ID` and `GOALBOARD_PANEL_ID` are host identity. Never invent them or ask the user to paste a Session ID.

## Recoverable Goal trash

Goal deletion is recoverable trash, not project deletion or physical erasure. The original Goal ID, Contract, lifecycle history, Evidence, Risks, and relations remain recorded.

- List: `goalboard_v1_goal_trash_list` is read-only.
- Trash: identify the exact Goal, explain that the operation is recoverable, and only after a direct current-conversation instruction call `goalboard_v1_goal_trash(..., user_confirmed=true)`.
- Restore: identify the exact trashed Goal and only after a direct instruction call `goalboard_v1_goal_restore(..., user_confirmed=true)`.

“清理一下,” “先不要了,” and “以后再说” are not enough. Ask one short question.

Use returned facts exactly:

- `blocked`: report the valid Claim or unfinished Run; do not force-close another Runtime's work.
- `trashed`: report that the Goal can be restored and which active Relations were safely stopped.
- `restored`: the original Goal is active again. Relations whose other endpoint remains trashed stay inactive and appear in `pending_relation_ids`.
- `already_trashed` / `already_active`: report the idempotent existing state.

Never pass a database path, replace the resolved `board_id`, switch projects as a side effect, or invent a permanent-delete route for one Goal.

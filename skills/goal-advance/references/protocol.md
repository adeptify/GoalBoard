# GoalBoard Runtime MCP protocol

This reference implements the unified `goal-advance` Skill. The Runtime talks to GoalBoard only through its Runtime MCP surface. It does not write SQLite, call the management CLI, alter project files, or alter Runtime configuration.

## Project connection: explicit and user-led

Call `goalboard_v1_context_resolve` only after the user invokes GoalBoard in the current conversation.

```text
context_resolve
  → bound: use its board_id and connection
  → suggested: show candidate names and generic host-provided reasons, then ask the user
      → explicit yes: context_bind(user_confirmed=true)
      → explicit no: context_reject_suggestion(user_confirmed=true)
      → no clear answer: remain unbound; do not write anything
  → unbound: ask user to choose an existing project or name a new one
      → context_bind(user_confirmed=true)
      → or context_create_and_bind(display_name, user_confirmed=true, idempotency_key)
```

`context_resolve` never creates a binding. `suggested` means exactly that: host-owned clues changed candidate order, but GoalBoard returns no project connection and does not write a binding. Its reasons are generic and must not expose raw host paths, titles, or other clue values. `context_create_and_bind` creates one project database only in GoalBoard's own `~/.goalboard` data directory and then binds it in one recoverable operation. It changes neither a user project nor a Runtime configuration.

For an existing project, pass the selected `project_id`, current `actor_id`, and `user_confirmed=true` to `goalboard_v1_context_bind`. With a Session ID this stores a Session choice; without one it only records workspace history and lets the current MCP flow continue. It never creates a workspace default implicitly. Use `binding_scope=workspace_default` only after a separate user request and confirmation that future Sessions in this directory should enter that project automatically. If a different choice was already bound in the same scope, ask separately before `rebind_confirmed=true`. For a new project, require the user's explicit project name and call `goalboard_v1_context_create_and_bind` with the same rules.

The host provides `runtime_id`, optional stable adapter identity, an optional canonical workspace, and suggestion clues. A host may also attach a Session ID to each MCP `tools/call` through `_meta.threadId`, `_meta.sessionId`, or `_meta["goalboard/sessionId"]`; ordinary tool arguments named `thread_id` or `session_id` are ignored. Tool-call metadata takes precedence for that call, so one long-lived MCP process can safely serve multiple identified Sessions. The workspace is independent: it can have several associated projects and is used to return historical candidates. Without a Session signal, GoalBoard must not turn the directory or MCP process into a fake Session. Project identity remains the user-selected `project_id`.

Once a context resolves as `bound`, Runtime calls use its fixed `board_id`. The Runtime tool schemas intentionally do not accept a database-path or Web-address override. Reuse of the same opaque Session ID resumes that Session choice. A fresh or unidentified Session returns workspace members as `suggested` and asks again, even when only one exists. The sole exception is a workspace default that the user explicitly configured.

### Project lifecycle in the current conversation

Use these only after the user asks to manage GoalBoard projects. They are all current-Runtime MCP calls; the model never supplies a different work context or a database path.

```text
context_list_projects()
  → read-only project IDs, names, board IDs, sources, current state, and any safe suggestions

context_reject_suggestion(project_id, actor_id, user_confirmed=true)
  → records “not this candidate” only for the current Session/work entry
  → returns the next safe suggestion or the explicit list/create fallback
  → never binds, deletes, or suppresses the project in another Session

context_unbind(actor_id, user_confirmed=true)
  → removes only the current Session binding by default
  → keeps the project, DB, Goal facts, and every other Runtime binding

context_unbind(actor_id, user_confirmed=true, binding_scope="workspace", project_id)
  → removes one workspace-to-project history association
  → keeps the project and its DB

project_delete(project_id, actor_id, delete_confirmed=true, idempotency_key)
  → checks for valid Claims and unfinished Runs
  → only then removes project bindings, catalog record, and managed DB
  → returns a deletion receipt without a database or staging path
```

Use `context_list_projects` to let the user name an existing project; it is not permission to bind, switch, unbind, or delete one. `context_reject_suggestion` requires a specific user rejection and only stops a repeat prompt for that exact Session. `context_unbind` requires the user to explicitly mean “stop using GoalBoard for this current work entry, but keep the project”. It clears the Runtime's in-process connection, so resolve or bind again before ordinary Goal work.

`project_delete` is a different, destructive decision. Ask the user to identify the exact project and separately confirm deletion of its GoalBoard DB; a broad “switch project”, “disable GoalBoard”, or “clean up” is insufficient. GoalBoard refuses if the project has any still-valid Claim or unended Run. The result includes an idempotent deletion receipt. Reuse its key only for the exact retry; a changed project/key combination is rejected. If its `cleanup_state` is `pending`, state that physical cleanup has not finished and retry the same request rather than reconnecting the deleted project.

## Recoverable Goal deletion in the current conversation

Goal deletion is not project deletion and not permanent erasure. It moves one Goal into the current project's recoverable trash: the same `goal_id`, Contract, Claim/Run history, Evidence, Candidate, Risk, events, and only the Relation facts that were active before deletion are retained. Web is optional and never required.

Use the following only when the user asks about a specific Goal in the current bound project:

```text
goal_trash_list(board_id)
  → read-only list of trashed Goals

goal_trash(board_id, payload{
  goal_id, actor_id, user_confirmed=true, reason, idempotency_key
})
  → setGoalTrashed(trashed=true)

goal_restore(board_id, payload{
  goal_id, actor_id, user_confirmed=true, reason, idempotency_key
})
  → setGoalTrashed(trashed=false)
```

Before either write, identify the exact Goal and make sure the user’s words mean that operation now. A direct “删除这个 Goal” or “恢复这个 Goal” is sufficient; vague wording such as “清一下”“先不要了”“以后再说” is not. Ask one short clarifying question instead of setting `user_confirmed=true` on the Runtime’s own guess. `reason` records the user’s stated intent, and a new intent needs a fresh idempotency key.

The MCP handler uses the same `setGoalTrashed` service as the future UI; it never recreates Relation, active-work, history, or transaction rules. Read its structured result before responding:

- `blocked`: show the returned valid Claim or unfinished Run IDs. Do not revoke, abandon, or force-close someone else’s work just to delete the Goal.
- `trashed`: explain that it is recoverable and report the Relation IDs that were safely stopped. Do not offer a made-up permanent-delete path.
- `restored`: the original `goal_id` is active again. If `pending_relation_ids` is non-empty, another endpoint remains in the trash; explain that those Relations stay inactive until it is restored too.
- `already_trashed` or `already_active`: report the existing state without pretending a second operation happened. Exact retries reuse the same idempotency key.

These calls use the fixed current-project connection. Never pass a database path, replace the returned `board_id`, switch projects, or use a management/CLI fallback to delete or restore a Goal.

## Four entry routes

### 1. New rough idea

```text
draft_dialogue_start(rough_idea, actor_id, idempotency_key)
  → Draft + clarifier Claim + clarifier Run
  → draft_dialogue_turn after each material answer
  → goal_tree_propose → goal_tree_read → goal_tree_check
  → user discusses and decides items in this same conversation
  → goal_tree_decide
```

`goalboard_v1_draft_dialogue_start` creates only a minimum `draft / abstract` Goal; Runtime inferences are not canonical Contract facts. Use the user's own words as `rough_idea`, use a stable current-Runtime `actor_id`, and use a fresh key. It returns the persisted dialogue, Claim, Run, and `clarifying` work state.

The first clarification checkpoint must produce readable values for the existing Goal fields, not a second summary model. `title` describes the user or project change; `outcome` describes the observable result; `why` describes the problem and value; `business_logic` describes in plain language how people use the result, who does what, and which rules shape the flow. Do not use an MCP method, database, Session Resolver, Claim, Run, adapter, class, or module name as a replacement for those values. Keep necessary technical facts in constraints, inputs, acceptance criteria, implementation notes, and evidence.

Before `goal_tree_propose`, scan every proposed parent, child, and leaf Goal for readability. “实现 MCP Session Context Resolver” is not sufficient; “让新用户安装后能在当前对话完成 GoalBoard 配置，并明确知道何时需要重启 Runtime” states the result. Likewise, `business_logic` should describe the user-visible flow rather than say only which resolver reads which environment value. Persist this in the existing Goal and dialogue records; never create a parallel business-status field.

### 2. Existing Draft

First call `goalboard_v1_contract(goal_id)`.

- If its `clarification_sessions` include an open session, call `goalboard_v1_draft_dialogue_resume(board_id, goal_id, actor_id, idempotency_key)`.
- If no session is open, call `goalboard_v1_draft_dialogue_start` with that existing `goal_id`, the current user's request to continue it, and a fresh key. It reuses the Draft, atomically creates its first clarifier Claim/Run, and does not create a duplicate Goal.

If the Draft has an active dialogue owned by another Runtime, resume reports the conflict. Do not take it over.

### 3. Continue work chosen from Available

```text
available(actor_id, capabilities, goal_mode_attestation)
  → current Runtime chooses one returned item
  → select_goal(goal_id, role returned by Available, actor_id, idempotency_key)
  → Claim + Run + current work_state in one transaction
```

`goalboard_v1_available` may return clarification, execution, review, or revalidation work. The current Runtime chooses one item according to the user's request, Contract, priority, dependencies, Risks, and capabilities. It does not ask GoalBoard to dispatch a unique next item.

Pass the returned item's `role` to `goalboard_v1_select_goal`. A successful result always includes its Claim and started Run; a denial leaves neither behind. Do not replace this normal flow with the legacy `ready → claim → run_start` sequence.

### 4. User named one Goal

Read `goalboard_v1_contract` for the named Goal.

- For a Draft, use the existing-Draft route above.
- Otherwise query Available and select it only if it is returned there.
- If it is absent, call `goalboard_v1_explain` with the work role being considered and state its actual dependency, Risk, capability, review, validity, or active-Claim blocker.

## Dialogue persistence and Goal Tree decisions

For every material answer, call `goalboard_v1_draft_dialogue_turn` with:

```text
board_id, goal_id, run_id, actor_id, user_message,
current_understanding,
known_facts[{ statement, source_kind, source_refs?, confidence?, confirmed_by_user? }],
assumptions[{ statement, source_refs?, confidence? }],
next_question XOR proposal_summary,
idempotency_key
```

Only record `user_answer`, `repository_fact`, or `document_fact` as facts. Runtime reasoning belongs in `assumptions` and requires user confirmation. Ask at most one consequential next question. When the important unknowns are resolved, write `proposal_summary` instead of inventing another question.

### Persist first, then continue the conversation

For a material user answer, keep this order:

1. classify the user's exact answer, traceable project/document facts, Runtime assumptions, and Runtime recommendations separately;
2. call `draft_dialogue_turn` with the updated understanding and either one `next_question` or one `proposal_summary`;
3. translate the returned state into plain language; and
4. ask the saved question or present the saved proposal checkpoint.

When presenting a saved checkpoint, lead with the Goal's business problem/value, expected result, current derived `work_state`, next owner/action, and blockers or dependencies. Technical Contract fields, IDs, tool names, and test or implementation details are supporting information. They do not replace the business summary and normally remain omitted until they help the current decision.

Do not ask a new question and postpone persistence until a later turn. If the call fails, say that the progress was not saved and stop rather than continuing from private chat memory.

On resume, read the persisted turns and present only the latest useful checkpoint: confirmed facts, unresolved assumptions, and the saved next question. Do not make the user repeat an answer that already appears as a confirmed `user_answer`, and do not print the entire event history.

When a question benefits from choices, choices are user-facing guidance only. The chosen answer is persisted as `user_answer`; the alternatives do not become facts. A recommendation remains a Runtime recommendation until the user accepts it. Tool names, actor/claim/run/binding IDs, idempotency keys, and raw JSON stay out of normal user-visible prose.

Use one `goalboard_v1_goal_tree_propose` for the complete proposed change set. Each item needs source references, a reason, confidence, and its affected objects. The tree can include a compound parent, a family of children, and children split more finely again. When the user is confirming that a parent’s decomposition is complete, the same proposal must include that parent’s Goal/Contract update to `definition_state="accepted"` and `decomposition_state="closed_compound"`; confirming only child Goals and `part_of` relations intentionally preserves a Draft parent for further clarification. Split on independently deliverable and reviewable business outcomes, not on code files or a fixed hierarchy depth.

Read and check the proposal before asking for a decision. Explain it in plain language in the current conversation. Then call `goalboard_v1_goal_tree_decide` with:

```text
board_id, proposal_id, runtime_actor_id,
decisions[{ item_id, decision: confirm | reject | revise, reason?, revised_item? }],
user_confirmed=true, confirmation_summary,
whole_confirmation_prompted?, reason?, idempotency_key
```

Only set `user_confirmed=true` after explicit user words in the current conversation. `confirmation_summary` records what the user actually approved, rejected, or revised; it must not turn a Runtime inference into a user fact. GoalBoard derives the conversation reference from host Session metadata (or the resolved work entry) and creates a deterministic attestation reference, so the Runtime never supplies user identity or message IDs. This is auditable local provenance, not a cryptographic trust boundary. `confirm_all_pending=true` is allowed only if the immediately preceding Runtime message asked the user to confirm exactly one whole proposal and `whole_confirmation_prompted=true`; otherwise send named item decisions or ask what the user means.

The immediately preceding proposal message must be decision-complete without exposing raw payloads. It names the intended outcome and non-goals, shows the proposed Goal tree, summarizes changed relations/dependencies, leaf acceptance, Risks/Policy, unresolved assumptions, and the post-confirmation work state. The final question distinguishes whole-proposal confirmation from a revision to named items. A vague “可以”“继续” is whole confirmation only when that exact whole proposal was the single explicit choice in the prior message; the Runtime then records that fact with `whole_confirmation_prompted=true`.

A proposed item is not canonical before the user decision. A confirmed safe item materializes atomically; a rejected item remains historical; a revised item creates a new pending version; stale, dangling, or cyclic items remain conflicts without discarding unrelated confirmed items. Re-read the affected state after each decision.

## Derived work state

GoalBoard has one derived work state, not a second “clarification complete” flag.

| Condition | State and Runtime response |
|---|---|
| Draft or open decomposition | `clarification_pending` / `clarifying`: continue the current dialogue. |
| Confirmed compound Goal with active children | `waiting_children`: do not execute the parent; select an eligible child from Available. |
| Confirmed executable leaf | `execution_pending` / `executing`: implement and validate the Contract. |
| Completed work awaiting permitted Review | `review_pending` / `reviewing`: review only with the allowed Runtime role. |
| Invalidated leaf requiring evidence check | `revalidation_pending` / `revalidating`: call revalidate from an active revalidator Run. |
| Any `*_blocked` state | Read `explain`, report the concrete cause, and choose other work or wait for the right user decision. |

The Web UI renders this same derived state. In particular, a confirmed parent with child Goals must show “已澄清，等待子 Goal”, not “待澄清”.

## Work completion and recovery

For an executor Run:

```text
run_report(state=completed | blocked | failed)
  → evidence_submit mapped to acceptance criterion IDs
  → review_submit for every Runtime-permitted required review
  → complete
  → release
```

An executor works only within an accepted leaf Contract. New scope becomes `goalboard_v1_candidate_submit`; a changed relation becomes `goalboard_v1_dependency_propose`. Neither changes canonical facts or active relations until the user decides through the appropriate trusted path.

For review, inspect the Contract and evidence rather than repeating an executor report. For revalidation, use `goalboard_v1_revalidate` only from an active revalidator Run and with non-empty evidence. These actions do not permit changing an accepted Contract or pretending to be the required human approver.

If a Draft conversation is interrupted, use `draft_dialogue_resume`. If an atomic selection is denied or a Goal becomes blocked, do not retry unchanged input: use `available` or `explain`, then take a different eligible Goal or ask for the missing user decision. Claims are leases; release a Claim when the current Runtime stops. A repeated exact request may reuse its idempotency key, but a changed request needs a new one.

Web can be used when the user asks to inspect it, but it is never a required recovery or decision surface. If the MCP connection itself is unavailable, report that fact; do not create another Board, change configuration, swap databases, or use a CLI fallback.

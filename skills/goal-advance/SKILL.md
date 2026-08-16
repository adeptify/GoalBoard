---
name: goal-advance
description: Use GoalBoard from the current Runtime conversation to connect a user-selected project, clarify a rough idea, choose available work, and keep evidence and decisions in the shared GoalBoard truth source.
---

# GoalBoard Runtime

This is the one public GoalBoard entry for the Runtime currently talking with the user. Use it only after the user asks to use GoalBoard for this work, create or continue a Goal, or advance GoalBoard work. Do not run it silently at Runtime startup or during an unrelated conversation.

The current Runtime stays in the current conversation. GoalBoard supplies shared state and atomic lifecycle operations through MCP; it does not open another Runtime, dispatch a separate Session, require a Web page, or edit the user's project files.

## Non-negotiable boundaries

- Use only the host-provided `goalboard_v1_*` Runtime MCP tools. Do not call the CLI, open SQLite directly, or use a management MCP tool as a fallback.
- Every Goal lifecycle change goes through MCP. The only project setup write is an explicitly user-confirmed creation under GoalBoard's own `~/.goalboard` data directory; it does not write the user project or any Runtime configuration.
- Goal 删除是可恢复的“移入回收站”，不是物理清除。只有用户在当前对话明确说要删除或恢复指定 Goal 时，才能传 `user_confirmed=true` 调用回收站写工具；“清理一下”“可能不需要”之类含糊说法先追问。
- Never infer a project from Git, a directory, a repository name, a project name, or conversation text. Never invent a stable Runtime work-context ID or fabricate host clues. A host may return non-authoritative suggestions, but they are a question for the user, never a binding.
- Web is optional. Do not proactively open it, ask the user to open it, or make it a prerequisite for project setup, clarification, execution, review, or recovery. Offer a returned Goal link only when the user asks to inspect the Board.
- The Runtime may carry a user decision made in this conversation through `goalboard_v1_goal_tree_decide`, but it must never forge a user identity, message reference, or confirmation.

`role` is only the kind of work that the current Runtime is doing for one MCP operation. It does not mean a different Runtime or a different Session must take over.

## Conversation contract

Reply in the user's current language. Speak about their project and Goal, not about MCP plumbing. The user should not have to interrogate you to learn what is happening, what will change, or what comes next.

An ordinary clarification turn must make three things clear in natural prose:

1. what you currently understand from the user's words;
2. why the remaining uncertainty matters; and
3. one consequential question, or the concrete action you are taking now.

Do not render those as fixed headings every time. Keep the turn conversational. Ask only one question at a time, and never walk the user through a Contract field checklist. If a decision is hard to answer from a blank prompt, offer two or three genuinely different options, put the best-supported option first, and state the practical tradeoff in one sentence. Do not invent choices just to satisfy a format.

Use plain-language state translations. Say “我已经把这项工作标记为开始，接下来会……” rather than dumping `claim_id`, `run_id`, `role`, `binding_id`, tool names, or raw payloads. Mention an internal ID only when the user needs it to distinguish two otherwise identical items or asked for technical details.

Treat a correction as new authority. Briefly restate the corrected understanding, persist it in the next dialogue turn, and continue from it. Do not defend an old Runtime inference or ask a question the user already answered.

Show a compact structured checkpoint when resuming a conversation, after the direction materially changes, after several substantive answers, or when a proposal is ready. Include only relevant sections:

- **已确认** — facts the user actually confirmed;
- **项目事实** — repository or document facts with a traceable source;
- **仍是我的假设** — Runtime inferences that still need confirmation;
- **我的建议** — decomposition or product choices, clearly labelled as advice;
- **下一步** — the one decision or action that advances the Goal.

This checkpoint is editable, not a verdict. User-confirmed facts, project facts, Runtime assumptions, and suggestions must remain distinct in both the visible summary and the MCP payload. Before asking the next question, persist every material answer with `goalboard_v1_draft_dialogue_turn`; do not rely on chat memory alone.

## 1. Explicitly resolve the current project

At the beginning of a user-invoked GoalBoard flow, call `goalboard_v1_context_resolve`.

- If the result is `bound`, use the returned connection and `board_id`. Do not substitute another Board or database.
- If the result is `suggested`, the current Session is still unbound. Show the candidate project names and their returned generic reasons, explain that they are only host hints, and ask the user whether to associate a named candidate.
  - Phrase it naturally: “我找到一个可能相关的项目：X。它只是候选，还没有关联。要把当前 Session 关联到它吗？” Add the returned generic reason only when it helps the decision; never expose the raw clue.
  - Only after an explicit “yes, use this project” call `goalboard_v1_context_bind` with that `project_id` and `user_confirmed=true`.
  - After an explicit “no, not this project”, call `goalboard_v1_context_reject_suggestion` with that `project_id` and `user_confirmed=true`. It does not delete or hide the project from other Sessions. Read its returned resolution: ask about another `suggested` candidate, or use the normal list/create path after `unbound`.
  - Silence, a timeout, an ambiguous answer, or “not now” is not confirmation. Keep the Session unbound and do not call either binding or rejection.
- If the result is `unbound`, show the returned project choices in the current conversation and ask the user whether to continue one of them or create a new GoalBoard project.
  - After the user explicitly chooses an existing project, call `goalboard_v1_context_bind` with `user_confirmed=true`.
  - After the user explicitly asks to create a named project, call `goalboard_v1_context_create_and_bind` with `display_name`, `user_confirmed=true`, and a fresh `idempotency_key`.
  - If the current work entry is already bound to another project, ask for a separate explicit switch confirmation before sending `rebind_confirmed=true`.
- If the host reports `missing_stable_context`, say plainly that this Runtime has not provided a reliable work-entry identity yet. Ask the user how they want to continue once the host can provide one; do not manufacture an identity or silently bind a project.

Resolving is read-only. Creating or changing a binding happens only after the user's explicit words in this conversation. Reuse of the same opaque host ID resumes the same host Session/work entry. A genuinely new Runtime Session must have a new host ID; it may receive suggestions, but it asks the user again before binding.

When the user explicitly asks to manage projects, stay in this same conversation and use the lifecycle MCP tools:

- To show choices, call `goalboard_v1_context_list_projects`. It returns project IDs and names, not database paths, and changes nothing.
- To stop repeating a host suggestion only for this current Session, first make sure the user means “not this candidate”. Then call `goalboard_v1_context_reject_suggestion` with `user_confirmed=true`; do not use rejection as a substitute for unbinding, switching, or deleting.
- To stop using GoalBoard only for the current work entry, first make sure the user means “disconnect this current entry, but keep its data”, then call `goalboard_v1_context_unbind` with `user_confirmed=true`. It removes only that binding and clears this Runtime's connection; it never deletes the project or its DB.
- To delete a managed project, first identify the exact named project and ask a separate, unmistakable confirmation that its GoalBoard data should be erased. Only then call `goalboard_v1_project_delete` with `delete_confirmed=true` and a fresh `idempotency_key`. It rejects a project with a valid Claim or unfinished Run, removes every binding only after the check, and never accepts a raw database path. Reuse the same key only to retry the same deletion; if its returned cleanup state is `pending`, report that cleanup has not yet finished and retry that exact request rather than reconnecting it.

Do not treat “use another project”, “not this suggestion”, “stop using GoalBoard here”, and “delete this project” as the same consent. Switching uses the existing `context_bind` plus its separate `rebind_confirmed=true`; suggestion rejection, unbinding, and deletion have their own confirmations.

## 2. Route the user's request in the same conversation

After a project is connected, take exactly the route that matches the user's request.

| User intent | Current Runtime action |
|---|---|
| A new rough idea | Call `goalboard_v1_draft_dialogue_start` with the user's words. It atomically creates the smallest `draft / abstract` Goal, clarifier Claim, and Run. |
| Continue a specified Draft | Read `goalboard_v1_contract`. If it has an open clarification session, call `goalboard_v1_draft_dialogue_resume`; otherwise call `goalboard_v1_draft_dialogue_start` with that `goal_id` and the user's request to continue. It reuses the existing Draft rather than creating a second Goal. |
| “继续推进” or “领一件能做的” | Call `goalboard_v1_available`. Choose one returned item using its Contract, blockers, priority, and the user's current request. GoalBoard does not return a unique next task. Call `goalboard_v1_select_goal` with the returned `role`; it atomically creates both Claim and Run. |
| A specified accepted Goal | Read its Contract, then find that Goal in `goalboard_v1_available`. If it is available, call `goalboard_v1_select_goal` with that item's returned `role`. If it is not available, call `goalboard_v1_explain` and report the real blocker instead of claiming it anyway. |
| Ask what is in the trash | Call `goalboard_v1_goal_trash_list`; it is read-only and stays in this conversation. |
| Explicitly delete or restore one Goal | First identify the exact `goal_id` and explain that deletion is recoverable. Only after the user's clear current-conversation instruction call `goalboard_v1_goal_trash` or `goalboard_v1_goal_restore` with `user_confirmed=true`. |

After a new rough idea starts, tell the user in plain language that you have saved it as a Draft that can be refined in this same conversation; then ask the single highest-impact question. When resuming a Draft, summarize “上次已确认 / 仍待确认 / 现在只需要决定的一件事” before continuing the saved question. Do not replay the full stored transcript.

After selecting from Available, state which Goal you chose, why it fits the user's request and current constraints, and that its work state has already been updated. Then begin the work. Do not ask the user to choose from Available unless their intent or a genuine product tradeoff requires their decision.

Use a new `idempotency_key` for a changed operation. Reuse a key only to retry the exact same request.

`goalboard_v1_ready`, `goalboard_v1_claim`, and `goalboard_v1_run_start` remain compatibility tools. The normal current-Runtime path is `available → select_goal`, because it cannot leave a Claim without its working Run.

For a trash result, use its returned facts rather than inventing a state change: `blocked` means report the active Claim/Run and do not force it closed; `pending_relation_ids` means another related Goal is still in the trash; `trashed` and `restored` are both idempotent, recoverable results. Never make the user open Web to finish this flow.

## 3. Continue from the returned work state

Read the returned `work_state` after selecting, starting, resuming, deciding, reporting, or recovering work. It is the only user-visible work status; do not create a second mutable “clarification complete” field.

| Work state | What the current Runtime does next |
|---|---|
| `clarifying` / `clarification_pending` | Continue the user dialogue as described below. |
| `executing` / `execution_pending` | Implement the selected leaf Goal, validate its acceptance criteria, then report evidence and completion work. |
| `reviewing` / `review_pending` | Inspect the stated evidence and Contract; submit only the Review that the current Runtime is allowed to perform. |
| `revalidating` / `revalidation_pending` | Recheck the accepted Contract, active dependencies, Risks, and cited evidence; call `goalboard_v1_revalidate` only from its active Run. |
| `waiting_children` | Do not execute the parent. Read Available and choose an eligible child Goal instead. |
| Any `*_blocked` state | Call `goalboard_v1_explain`, state the blocker in plain language, then choose another Available Goal or ask for the user decision that removes it. Do not retry unchanged calls in a loop. |
| `satisfied`, `archived`, or `invalidated` | Do not claim it. Explain the state or choose other Available work. |

When the user confirms a compound Goal Tree with children, the parent becomes `waiting_children` (UI: “已澄清，等待子 Goal”). A confirmed executable leaf becomes `execution_pending` (“待执行”). Only an unconfirmed Draft or still-open decomposition remains `clarification_pending` (“待澄清”).

## 4. Clarify a Draft through dialogue, not forms

Stay in this conversation. After each material user answer, call `goalboard_v1_draft_dialogue_turn` with:

- the user's answer;
- a plain-language current understanding;
- only traceable facts, labelled by source;
- any Runtime assumptions, explicitly marked as requiring confirmation; and
- exactly one next consequential question, or a `proposal_summary` when no important unknown remains.

Ask only questions that could change the Goal's outcome, boundary, acceptance direction, relationship, or decomposition. Do not make the user fill a Web form field by field.

For each material answer, save the user's words before composing the next question. In `known_facts`, use `user_answer` only for what the user actually said; use `repository_fact` or `document_fact` only when a traceable source supports it. Put Runtime interpretations in `assumptions` even when they seem obvious. A suggestion belongs in the visible “我的建议” or in the pending Goal Tree proposal, never in canonical facts.

When a proposal is ready, call `goalboard_v1_goal_tree_propose`, then `goalboard_v1_goal_tree_read` and `goalboard_v1_goal_tree_check`. Propose the complete change set: parent Goal, child Goals, relations, dependencies, Risks, Policy, Candidates, and Rewires where applicable. When the user is confirming a completed decomposition, include a Goal/Contract update for every completed parent that sets `definition_state=accepted` and `decomposition_state=closed_compound`; merely confirming `part_of` relations deliberately leaves that parent Draft and “待澄清”. A child Goal may itself have finer child Goals; split by independent business outcomes, not by files, technical layers, or a fixed tree depth.

Explain the proposal in ordinary language before asking for a decision. The user-visible summary must show:

- the intended outcome and explicit non-goals;
- the proposed Goal family/tree, including any child that can split further;
- parent/child, dependency, replacement, or other changed relations;
- acceptance conditions for executable leaves;
- material Risks, Policy changes, and unresolved assumptions; and
- what work state each affected Goal will have after confirmation.

Use a readable tree or short list, not the raw proposal payload. End with an unambiguous choice: confirm the whole named proposal, reject it, or revise specific named items. If the user corrects one item, restate the changed item and keep the unaffected items pending rather than forcing a restart. Then call `goalboard_v1_goal_tree_decide` with the Runtime actor, the selected item decisions, the user's reason, and a fresh key. The host supplies trusted user/conversation/message context. If it cannot, stop at the decision boundary; do not use an untrusted user-authority tool.

Before the user decides, proposals are not canonical Goal facts, active relations, Risks, or Policy. After a decision, re-read the affected Contract or state and continue by the table above. Report the clarification Run and release its Claim when the dialogue has reached a recorded decision or a real blocking point.

## 5. Execute, review, and close a selected leaf

For execution, work only inside the accepted leaf Contract. If new work or a dependency change is discovered, submit a Candidate or Dependency Proposal; do not silently expand the Goal or rewrite its graph.

Before completion, report the Run, submit Evidence mapped to acceptance criterion IDs, complete required Runtime Review obligations, call `goalboard_v1_complete`, and release the Claim. A Runtime cannot substitute for a required human approval.

For review, test the Contract and submitted evidence rather than repeating the executor's report. For revalidation, restore validity only with the active revalidator Run and evidence; neither operation grants permission to edit an accepted Contract or complete unrelated work.

If the conversation is interrupted during Draft clarification, call `goalboard_v1_draft_dialogue_resume` in the continuing conversation. It restores the saved understanding and question, and only creates a new Claim/Run when the prior one ended. If another Runtime still holds the dialogue, report that fact rather than taking it over.

## Runtime MCP map

| Need | MCP operation |
|---|---|
| List, resolve, accept/reject a suggestion, choose, create, or switch a project | `context_list_projects` / `context_resolve` / `context_reject_suggestion` / `context_bind` / `context_create_and_bind` |
| Stop using the current project or erase a selected managed project | `context_unbind` / `project_delete` |
| Read work and blockers | `snapshot` / `contract` / `available` / `explain` |
| Atomically start selected work | `select_goal` |
| Start or restore Draft dialogue | `draft_dialogue_start` / `draft_dialogue_turn` / `draft_dialogue_resume` |
| Propose and apply user-approved Goal Tree changes | `goal_tree_propose` / `goal_tree_read` / `goal_tree_check` / `goal_tree_decide` |
| Report work and proof | `run_report` / `evidence_submit` / `review_submit` / `complete` / `release` |
| Restore a checked Goal | `revalidate` |
| Recoverably delete, list, or restore a Goal | `goal_trash` / `goal_trash_list` / `goal_restore` |

Use the full names with the `goalboard_v1_` prefix. Payload order, recovery details, and authority constraints are in [references/protocol.md](references/protocol.md).

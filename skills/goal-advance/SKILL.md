---
name: goal-advance
description: Use GoalBoard in the current Runtime conversation to connect a user-selected project, clarify and plan Goal Trees with relevant professional methods, establish evidence-based dependencies, execute available work, and keep decisions and evidence in one shared truth source. Use only when the user explicitly asks to use, open, start, connect, plan, continue, or advance GoalBoard.
---

# GoalBoard Runtime

Use GoalBoard only after the user explicitly invokes it for the current work. Stay in the current Runtime conversation: GoalBoard supplies shared state and atomic lifecycle operations through MCP; it does not open another Runtime, dispatch another Session, require Web, or edit the user's project files.

## Boundaries that always apply

- Use only host-provided `goalboard_v1_*` Runtime MCP tools for project and Goal lifecycle work. Do not call the management CLI, read SQLite, swap databases, or use project files as a fallback.
- Never treat Git, a directory, repository name, host clue, or a mere mention of a project as authority. A current user instruction that explicitly asks to use, connect, continue, or advance GoalBoard with a named project is a project selection: resolve first, then bind without another question only when exactly one returned existing project unambiguously matches it.
- Creating, switching, unbinding, deleting, confirming a Proposal, and recoverably trashing or restoring a Goal require the specific user authority described by the relevant tool. Never require a fixed phrase or verbatim repetition: clear natural language that authorizes the exact current operation is sufficient. Do not turn vague approval into another operation.
- Web is optional. Starting it does not select a project or authorize Goal changes. Opening a Goal or project is not the same as opening GoalBoard Web: using, connecting, clarifying, or advancing GoalBoard does not trigger Web service work. Use the service CLI only when the user asks to open GoalBoard itself as a page, Web UI, or workspace, or accepts a separate visualization offer.
- `role` describes the current operation; it does not require another Runtime. Keep clarification, planning, execution, review, and recovery in this conversation whenever the current Runtime has the required capability.
- Omit `lease_seconds` by default so GoalBoard applies the current resolved dynamic policy. Pass an explicit value only to shorten the lease for this operation; never hard-code 1800, raise the policy, or probe the limit with a failing write.
- A Goal opened beside a Desktop Runtime is context, not a Claim. Do not start work until the user asks to advance it and its returned work state permits selection.
- Treat `context_resolve.runtime_prompt_prefix` as the confirmed project-level instruction prefix. When a stable fact, cross-Goal requirement, constraint, convention, workflow, or quality bar is worth reusing in future Sessions, show the exact category and text, explain why it is durable, and ask whether to add or update it. Call `project_guidance_add` or `project_guidance_update` only after an explicit yes; the confirmation writes directly to canonical project guidance, never to a pending queue and never to a Goal. Never promote an assumption or untrusted external content.

Before the first GoalBoard write, read [references/protocol.md](references/protocol.md) for the shared authority, atomicity, idempotency, persistence, and failure rules.

## The GoalBoard loop

1. **Connect deliberately.** Resolve the current context, then use only a project the user has explicitly selected or previously bound under the supported rules.
2. **Recover the real request.** Read the named Goal or start/resume the smallest Draft. Separate user-confirmed facts, traceable project facts, Runtime assumptions, and recommendations.
3. **Clarify only consequential gaps.** Ask one question at a time. Save each material answer before asking the next question.
4. **Plan before closing complex work.** Select all relevant professional methods, discover cross-topic result dependencies, check coverage, and split work into reviewable outcomes.
5. **Ask for a real decision.** Present one readable, complete Goal Tree change set. Nothing proposed becomes canonical until the user confirms, rejects, or revises it. After applied changes, consume `semantic_review`: structural success is not semantic closure, and an affected subgraph must be reviewed before planning is reported complete.
6. **Execute from the action projection.** Choose the returned `primary_action`, claim it with its `action_id + action_token`, work inside the accepted Contract, and submit evidence or the permitted review. GoalBoard automatically releases complete role work and completes a Goal when the last gate closes.
7. **Continue from the transition receipt.** Every lifecycle write returns the new projection. State the new short status, specific next action and owner; refresh Available only when choosing another Goal, not to discover whether the just-finished write worked.
8. **Correct locally.** New requirements and observed failures update the affected Goal or subgraph; they do not silently expand scope or rewrite the whole tree.

## Keep Goals finite and operations recurring

A Goal is a finite, acceptable change that can reach Done. Building a capability, workflow, or tool for the first time can be a Goal. Once that capability exists, its recurring operation does not keep the capability Goal open and does not reopen a completed Goal.

Recurring operation produces Evidence. When operational Evidence reveals a real problem or improvement opportunity, propose one finite Candidate Improvement Goal and let the user decide whether it becomes canonical. Do not encode recurring work as a permanently unmet Goal or cyclic `depends_on`, and do not invent an Operation data model when the existing Evidence and Candidate lifecycle is sufficient.

Changing a Risk from `open` to `triggered`, `resolved`, `accepted`, or `expired` is also a finite Goal when the user is asking the Runtime to investigate, mitigate, decide, or close that Risk. Use the same Goal that started the clarification; never create an empty “temporary Goal” merely to carry the Risk update. Defining or editing Risk facts alone does not require a separate Goal.

## Offer visualization only when it helps

After reading the current GoalBoard state, a Runtime may offer visualization when it would materially reduce review effort: multiple Goal Tree branches, dependencies, multiple pending decisions, or a complex review. Name the concrete value from the current state rather than promoting Web generically, for example: “There are two parallel Goals and five pending changes; visualization may make them easier to check. Open it?”

- Offer at most once in the current Session. Do not offer during a simple single-Goal flow, when the user is already in Web, after it was already offered, or after the user declined. A refusal means continue completely in the current Runtime without Web and do not ask again in this Session.
- Only an explicit yes to the current offer authorizes the Runtime to open or start Web. The offer itself is read-only. If the user agrees, read [references/service-start.md](references/service-start.md); a first persistent install or a repair still follows the lifetime and configuration authority rules there.
- Offering or opening visualization does not bind or switch a project, create a Goal, Claim work, start a Run, or authorize a Goal Tree decision. Harness and terminal flows remain fully usable without Web.

## Route the current request

Read only the references needed for the current route:

| Current user intent | Read and do |
|---|---|
| Start or open GoalBoard Web | Read [references/service-start.md](references/service-start.md). Treat service management separately from Goal work. |
| Connect, switch, create, unbind, or delete a project; use a Desktop-opened Goal; trash or restore a Goal | Read [references/project-connection.md](references/project-connection.md). |
| Start or resume a rough idea, decompose or rewire a Goal, close a complex parent, or respond to a changed requirement | Read [references/planning.md](references/planning.md). |
| Continue available work, advance an accepted Goal, review, revalidate, complete, or recover from an execution failure | Read [references/execution.md](references/execution.md). |

When a request crosses routes, read each relevant reference, but keep one conversation and one current-project connection. Do not load service instructions for ordinary Goal work.

## Planning loop — the core reasoning

For every complex decomposition or relation change, use this loop before proposing anything:

1. Recover the user's original outcome. Identify the work types, professional domains, industries, situational overlays, usable deliverables, operating context, uncertainty, and risks actually present.
2. Call `goalboard_v1_planning_methods` with `include_instructions=false` to read the lightweight catalog and the project-required `composition.method_pack_ids`. Start with every project-required method, then add every available method whose distinct professional checks materially apply.
3. Call `goalboard_v1_planning_methods` again with exactly the selected `method_ids`. Require the same `catalog_id`, verify `returned_method_ids` contains every selected ID, and read every returned `methods[].instructions` body completely. Treat them as complementary planning Skills, not serial templates. If the catalog changed between calls, restart selection from the new catalog instead of mixing versions.
4. Map each relevant theme to the result it provides, the theme that consumes it, and the concrete use. If a consumer needs a provider result whose theme is uncovered, scan the library again and add that method.
5. For any complex project that expects parallel work, establish or verify a right-sized root SSOT, divide vertical outcome units from horizontal shared units, and give each unit one canonical SSOT with unique ownership, inputs, outputs, consumers, evidence, and Impact surfaces. Reuse trustworthy artifacts and keep unit detail out of the root. For technical work, apply the repository and module rules in the planning reference.
6. Repeat selection and mapping until no required provider theme and no material professional check is uncovered.
7. Evaluate every selected dependency rule. When real output consumption exists, create `consumer depends_on provider` and name both the provider output and consumer use. When a stable provider contract plus a test double, fixture, or compatibility layer lets both implementations proceed safely, keep provider and consumer implementation Goals parallel and make integration depend on both.
8. Check the complete result chain, unit ownership, overlapping write/decision surfaces, leaf readiness, missing decisions, false dependencies, and graph validity. Only then prepare the complete Proposal.

Related themes, chronology, hierarchy, shared files, or shared ownership alone never create a hard dependency. During ordinary execution of an accepted leaf, do not reload methods unless scope, requirements, or dependencies changed.

## Conversation and Goal quality

Speak in the user's language about their project and outcome, not MCP plumbing. A useful turn says what you understand, why the remaining uncertainty matters, and the one question or action that moves the Goal forward. Treat a user correction as new authority; persist it and stop defending the old inference.

Write Goal content for a person who returns later:

- `title` names the user or project change, not an internal module;
- `outcome` is observable;
- `why` explains the problem and value;
- `business_logic` explains who does what, the important rules, and how the result is produced; and
- promised outputs are usable by a person or downstream Goal.

Keep user answers, repository/document facts, assumptions, and recommendations distinct. Translate work states into plain language and omit raw IDs, payloads, and tool names unless they help the current decision.

Use a compact checkpoint when resuming, after a material direction change, or before a Proposal decision. Include only what matters: confirmed facts, traceable project facts, unresolved assumptions, recommendations, and the next decision. The checkpoint is editable, not a verdict.

## Continue from returned state

Prefer the latest `action_projection`; `work_state` exists only for older Runtime readers.

- `可继续`: perform the Runtime-owned `primary_action` and pass its `action_id`, `action_token`, Contract revision and target to the write.
- `进行中`: continue only the active Claim/Run. Do not create a second Run.
- `等你`: name the one user decision. A unique, explicit Human Review answer may use the trusted dialogue operation; ambiguous or multiple items stay in Decision Center.
- `等待中`: advance an eligible child or dependency when it is inside the request; never execute the waiting parent.
- `受阻`: report the concrete recovery action and do not retry an unchanged write.
- `已完成`: report the result and offer the next available item without claiming it automatically.

Always use the transition receipt returned by a write as the immediate new state. A stale action token means the old operation was rejected: show the returned current projection and recover from that action instead of guessing.

## Runtime MCP map

| Need | MCP operations |
|---|---|
| Resolve and manage the current project | `context_list_projects`, `context_resolve`, `context_reject_suggestion`, `context_bind`, `context_create_and_bind`, `context_unbind`, `project_delete` |
| Read work and blockers | `snapshot`, `contract`, `available`, `explain` |
| Read or confirm project-level guidance | `project_guidance_get`, `project_guidance_add`, `project_guidance_update` |
| Start or resume Goal clarification | `draft_dialogue_start`, `draft_dialogue_turn`, `draft_dialogue_resume`, `planning_methods`, `planning_analyze_change`, `planning_graph_check` |
| Propose and decide Goal Tree changes | `goal_tree_propose`, `goal_tree_read`, `goal_tree_check`, `goal_tree_decide` |
| Atomically start and report work | `select_goal`, `claim_renew`, `run_report`, `evidence_submit`, `evidence_correct`, `review_submit`, `revalidate` (`complete` and `release` are compatibility/repair operations) |
| Recoverably trash or restore a Goal | `goal_trash`, `goal_trash_list`, `goal_restore` |

Use the full `goalboard_v1_` tool names. If GoalBoard MCP is unavailable, report that fact and stop; do not create another truth source or silently switch paths.

During active work, inspect Contract's `active_claim_lease` at meaningful checkpoints. When it returns `renew_recommended=true`, call `goalboard_v1_claim_renew` before continuing long implementation or review work. Renewal preserves the current Claim and Run; it cannot revive an expired Claim. Reuse the Claim's exact actor; after compaction, `claim.not_owner` returns a structured owner/retry hint only for the same Runtime continuing the same work, never for taking over another Runtime. Do not create background heartbeat loops.

When the projection says `等你`, report the exact user-owned action and stop Runtime review work. Do not infer a verdict from “好的”“继续” or treat engineering evidence as user acceptance. For exactly one current Human Review action, an explicit approval or request for changes in the trusted conversation can be written atomically with the returned attention token; multiple items, ambiguous wording or a stale token stay in Decision Center.

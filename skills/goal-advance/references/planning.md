# Clarification and professional Goal planning

Read this reference when starting or resuming a rough idea, decomposing or rewiring complex work, closing a compound parent, or applying a changed requirement. Its outcome is a user-readable, professionally grounded Goal Tree Proposal—not a mechanical checklist.

## Start or resume the same Goal clarification

For a new rough idea, call `goalboard_v1_draft_dialogue_start` with the user's words. It creates only the smallest `draft / abstract` Goal plus the clarifier Claim and Run. Runtime interpretations are not canonical facts.

For a named existing Goal returned by Available with `role=clarifier`, read `goalboard_v1_contract`. This includes a Draft and an accepted Goal whose decomposition is still `abstract` or `frontier_open`:

- resume an open clarification session with `goalboard_v1_draft_dialogue_resume`;
- otherwise start clarification on that same `goal_id` with `draft_dialogue_start` rather than creating a duplicate; after `available → select_goal`, start reuses that same Runtime's active clarifier Run;
- if another Runtime owns an active dialogue, report the conflict instead of taking it over.

Starting or resuming clarification never downgrades an accepted Contract to Draft. For an accepted open frontier, dialogue facts support a Goal Tree Proposal that adds or closes decomposition; they do not rewrite the accepted Contract directly.

Tell the user that the idea was saved and ask the single question most likely to change the outcome, boundary, acceptance direction, relationship, or decomposition.

## Persist before asking the next question

For every material answer, first separate:

- the user's exact confirmed answer;
- traceable `repository_fact` or `document_fact` with sources;
- Runtime assumptions that still require confirmation; and
- Runtime recommendations, which remain advice until accepted.

Then call `goalboard_v1_draft_dialogue_turn` with the saved understanding and exactly one `next_question` or a `proposal_summary`. If persistence fails, say it was not saved and stop rather than continuing from chat memory.

Both `draft_dialogue_turn` and `draft_dialogue_resume` return a compact checkpoint by default: `latest_turn`, `turn_count`, dialogue, Claim/Run, work state, and cursor. Do not request the whole history on every write. When older wording is genuinely needed, set `include_history=true` with a bounded `history_limit`; follow `history.next_before_turn_index` through `history_before_turn_index` for earlier pages.

Clarify in two natural passes, not a form interview:

1. obtain enough user language for `title`, `outcome`, `why`, and `business_logic`;
2. resolve scope, non-goals, constraints, relationships, decomposition, acceptance, and required evidence.

On resume, show only the latest useful checkpoint: what was confirmed, what remains an assumption, and the one saved decision now needed.

## The planning loop

Use the loop for a new compound Goal, a Goal with several independently reviewable outputs, any relation change, or a requirement change that can affect more than one Goal. Do not use it for ordinary execution of an unchanged accepted leaf.

### Keep the change finite; keep the operation recurring

A Goal is a finite, acceptable change that can reach Done. The initial ability to run a workflow can be a Goal; later recurring operation is ongoing use of that completed ability, not another reason to keep it unmet.

Recurring operation produces Evidence. When that Evidence exposes a concrete issue, propose a finite Candidate Improvement Goal and let the user decide whether to make it canonical. Never model the loop as a permanently unmet Goal or cyclic `depends_on`. `depends_on` still means one finite result is consumed by another; it does not mean “after every run, start the earlier Goal again.” Reuse existing Evidence and Candidate semantics instead of adding an Operation state model unless a separately confirmed product need requires one.

### 1. Recover the planning problem

Return to the user's original outcome instead of the most recently discussed topic. Identify:

- kinds of work being performed;
- work types, professional domains, industries, and situational overlays involved;
- usable deliverables and their consumers;
- operating context and real usage flow;
- uncertainty, risks, evidence standards, and delivery obligations.

### 2. Select methods without a preset bundle

Call `goalboard_v1_planning_methods` with `include_instructions=false` first. This returns the lightweight selection catalog, its `catalog_id`, and the project floor in `composition.method_pack_ids` without expanding every method body.

- Every `composition.method_pack_ids` entry is a user-configured project floor and must be included.
- Add every other method whose distinct professional check materially applies to the current task.
- Use method kinds as orthogonal lenses: a work type describes the shape of work, a domain supplies professional practice, an industry supplies industry objects and lifecycle, and an overlay adds a cross-industry risk or operating constraint. Select only the layers that materially change the plan.
- If the composition is empty, select all methods justified by the task; there may be one or many.
- Compare selected coverage with all available method summaries. An unselected method that contributes a material uncovered check must be added.
- If no domain method fits, use `meta-domain-pack-builder` to research domain objects, lifecycle, professional artifacts, evidence, dependencies, and failures. Save a user-confirmed project method before using it to split the real Goal.

After selection, call `goalboard_v1_planning_methods` with exactly those `method_ids`. Verify the response has the same `catalog_id` and that `returned_method_ids` contains every selected ID, then read every returned `methods[].instructions` body completely. If the catalog changed, restart selection from the new lightweight catalog. Treat bodies as complementary planning Skills, not serial phases and not one Goal per method. The legacy no-argument call still returns the whole library for compatibility, but do not use it for normal planning because large catalogs can exceed the tool output budget.

### 3. Recall connected themes through their outputs

Build a cross-topic output map:

| Theme | Provider result | Consumer theme | Concrete use | Can the consumer start or finish correctly without it? |
|---|---|---|---|---|

If a consumer needs a provider result owned by an uncovered theme, scan the method library again and include the provider method. Then rebuild the map. Stop only when no required provider theme and no material professional check remains uncovered.

Examples are recall cues, not a fixed product/software/data bundle:

- market evidence can support product positioning;
- product outcomes and user flows can constrain technical design;
- technical contracts and foundations can be consumed by feature implementation;
- data quality and evaluation baselines can support AI capability work;
- research evidence can support content claims;
- roles and permissions can support operational workflows;
- a validated playable loop can support game systems and content production.

### 4. Establish right-sized SSOTs and orthogonal work units

Use this section whenever a complex project expects multiple people, Runtimes, vendors, or Work Items to proceed concurrently. The SSOT is the smallest canonical artifact that lets every unit make compatible decisions without copying the whole project. It can be a project brief, research protocol, campaign charter, content bible, service playbook, financial model, architecture contract, or another artifact appropriate to the work—not necessarily a repository file.

First establish or verify one root SSOT containing only shared facts: intended outcome, non-goals, global constraints, authoritative decisions and evidence, unit index, cross-unit contracts, convergence rules, and open decisions. Keep detailed unit facts in their unit SSOTs. Reuse a trustworthy current artifact instead of creating a duplicate truth source.

Build the work map on two axes:

- a **vertical outcome unit** owns one independently usable, reviewable result for a real consumer;
- a **horizontal shared unit** owns one method, asset, dataset, policy, standard, platform, or service consumed by at least two vertical units.

Examples: a growth launch may use vertical channel outcomes with horizontal positioning and measurement; a research program may use vertical research questions with horizontal sample, source, and analysis rules; a content operation may use vertical stories or formats with horizontal editorial standards and asset production; a service operation may use vertical service journeys with horizontal permissions, training, and measurement. These are prompts for discovering ownership, not templates to copy.

After shared constraints and the unit map are stable, unit SSOT Goals may proceed in parallel. Each unit SSOT names its outcome and consumer, responsibilities and non-responsibilities, unique decisions and assets, inputs and outputs, shared contracts, evidence, exceptions, convergence point, and read/write/decide/exclusive Impact surfaces.

Reject or rework the map when two units author the same fact, own the same decision or mutable asset, need bidirectional internal knowledge, form a dependency cycle, or plan overlapping write/decide/exclusive surfaces. Separate documents do not prove orthogonality. A horizontal unit with only one consumer is usually supporting work inside that vertical unit.

Derive execution so that SSOT work creates concurrency rather than a project-wide document gate:

- the root SSOT or verified delta precedes decisions that change shared boundaries;
- unit SSOTs proceed in parallel after the map is stable;
- execution depends on its own unit SSOT and only the provider outputs it truly consumes;
- independent units remain parallel and converge in an integration, synthesis, launch, approval, or operating checkpoint that consumes their results;
- a local, already-bounded task reuses current SSOTs and updates only the affected unit.

Record SSOT artifacts as promised outputs and required inputs of their Goals. A document is complete only when it has a readable reference and the intended consumer can use it; writing the file does not complete the downstream project result.

### 5. Apply the technical SSOT specialization

Use this section for a new or materially changed technical project, multi-module migration or refactor, or any plan that expects several Runtimes or Work Items to execute concurrently. For a local repair inside one already-defined module, reuse current trustworthy documents and only verify the affected contract. If the repair reveals a cross-module contract or ownership change, return to the full section.

First establish or verify a repository project SSOT. It is the canonical project/architecture contract, not a second GoalBoard:

- GoalBoard remains canonical for Goals, Relations, decisions, work state, Evidence, and Review;
- the repository project and module SSOTs own product, architecture, boundary, and public-contract facts;
- code, tests, migrations, and runtime evidence prove implemented behavior.

The project SSOT names the outcome, non-goals, global invariants, authoritative state and decision locations, module index, cross-module contracts, delivery/recovery rules, and verification sources. Keep module-specific facts in their module SSOTs instead of copying them into the root document. If current documents already do this, cite and reuse them; do not create a parallel document for appearance's sake.

Build the module map on two axes:

- a **vertical module** owns one observable end-to-end user or caller outcome and can be accepted through a real path;
- a **horizontal module** provides a stable shared capability or contract used by multiple vertical modules.

UI, API, database, frontend/backend folders, files, or team assignments are not modules by themselves. A horizontal module without real multiple consumers is usually an implementation detail of a vertical result. Every important state, mutable dataset, public contract, and decision surface has one authoritative module; another module may consume it only through the named contract.

After the global invariants and module map are stable, module SSOT Goals may proceed in parallel. Each module SSOT states:

- its outcome, consumers, responsibilities, and explicit non-responsibilities;
- the state, data, decisions, and public contracts it alone owns;
- inputs, outputs, APIs/events, compatibility promises, and provider/consumer use;
- read, write, decide, and exclusive Impact surfaces;
- primary path, errors, migration, recovery, tests, acceptance, sources, and open decisions.

Before deriving implementation Goals, perform an orthogonality review. Reject or rework the map when two modules author the same fact, own the same state or contract, require bidirectional internal knowledge, form a dependency cycle, or plan overlapping write/decide/exclusive surfaces. Separate files do not prove orthogonality; unique authority, stable contracts, one-way consumption, and non-conflicting writes do.

Derive execution so that documentation creates concurrency instead of a project-wide serial gate:

- project SSOT or its verified delta precedes module-boundary decisions;
- module SSOTs can run in parallel after the module map is stable;
- a module implementation depends on its own module SSOT and only the provider contracts it consumes;
- after a provider contract is stable, provider and consumer implementations remain parallel when a test double, fixture, or compatibility layer gives the consumer an independent verification path;
- integration and end-to-end acceptance depend on both runnable implementations;
- when a consumer truly cannot start or finish without the provider's actual result, keep that implementation dependency and explain it.

Record module SSOTs as promised outputs and required inputs of their Goals. Include declared Impact surfaces in a Contract or Candidate proposal when that workflow supports them. Otherwise explain the surfaces to the user and require confirmation through GoalBoard's existing Web/management entry before treating the Goals as safely parallel; the Runtime must not bypass its tool boundary or claim the unregistered work concurrently. A project or module SSOT is complete only with a readable artifact reference and verification evidence; writing documentation does not complete the software result.

### 6. Turn only real consumption into dependency

Evaluate every dependency rule in every selected method.

- When the stated consumer genuinely uses a provider output and cannot correctly start or finish without it, create `consumer_goal depends_on provider_goal`.
- The Relation reason names the provider output, the consumer use, and why the reverse direction is wrong.
- When the consumption is absent, keep the Goals parallel and be able to state what is absent.
- Related themes, chronology, hierarchy, shared files, shared ownership, or a general desire to “do A first” are not dependencies.

Planning direction and execution order are different views of the same relation: product decisions may inform technical planning, while feature implementation waits for the technical result it consumes.

### 7. Check the complete result, not a topic checklist

Every complex result accounts for the parts that materially apply:

- final outcome and who uses it;
- real operating or usage flow;
- core capabilities that produce the result;
- foundations or infrastructure those capabilities consume;
- quality, delivery, recovery, and continued operation.

Also apply selected domain checks. Examples:

- game: gameplay, systems/content, player journey, interaction/UI, audiovisual experience;
- app/product: core function, end-to-end journey, interaction/UI, information/content;
- AI/data: sources and quality, evaluation, runtime/cost, safety/governance;
- content/research: provenance, method or production flow, review/approval, distribution;
- operations: roles, permissions, workflow/tools, exceptions, measurement.

One well-scoped child may own several areas. Do not generate one Goal per label. Every applicable area must point to an existing/proposed descendant or have a concrete `not_applicable` reason.

Record the planning audit in the parent:

```text
decomposition_review: {
  status: complete | paused,
  method_pack_ids: [...],
  task_context: game | app | ai_data | content_research | operations | other,
  coverage: [{
    area,
    disposition: goal | owned | not_applicable,
    goal_ids: [...],
    reason
  }],
  open_goal_ids: [...],
  next_step
}
```

Use `complete` and `closed_compound` only when every selected check is accounted for and no descendant remains `abstract` or `frontier_open`. A staged pause stays open, lists `open_goal_ids`, and records one next clarification action.

### 8. Prove each leaf is one executable result

Every proposed `accepted / closed_leaf` includes:

```text
leaf_readiness: {
  verdict: ready | split_required,
  primary_deliverable,
  output_coverage: [{ promised_output, role: primary | supporting | independent, reason }],
  split_candidates: [{
    work_item,
    separately_deliverable,
    separately_acceptable,
    independently_reworkable,
    decision: keep | split,
    reason
  }],
  rationale,
  unresolved_decisions: [...],
  independent_deliverables: [...],
  acceptance_criterion_ids: [...]
}
```

Exactly one output is primary. Supporting outputs are required for the same acceptance; independently valuable outputs belong in another Goal. If at least two of “separately deliverable,” “separately acceptable,” and “independently reworkable” are true, split it and use `split_required`.

`split_candidates[].decision` is deliberately binary: use only `keep` or `split`. Do not write `defer`. Work that is explicitly outside the current Goal and not yet ready to become another Goal belongs in the Goal's `out_of_scope` or the Proposal narrative's deferred/non-goal explanation, not in `split_candidates`. Work that has an independently useful result uses `split` and becomes its own Goal.

A ready leaf has no unresolved decision or independent deliverable, covers every promised output and acceptance criterion exactly, and states scope, non-goals, required inputs, outputs, and evidence. Otherwise keep it open for clarification rather than submitting a pseudo-leaf.

### 9. Propose, check, explain, and decide

Use one `goalboard_v1_goal_tree_propose` for the complete change set, then `goalboard_v1_goal_tree_read` and `goalboard_v1_goal_tree_check`. Include parent and child Goal/Contract changes, `part_of`, `depends_on`, Risks, Policy, Candidates, and Rewires where applicable.

The Proposal must reference this Runtime's currently active clarifier Run. If `goal_tree_propose` reports that its Run is missing, inactive, released, or expired, call `goalboard_v1_draft_dialogue_resume` for the same Draft Goal and retry the unchanged Proposal with the returned new `run_id`. Do not create a duplicate Draft or keep retrying the rejected Run id.

`goal_tree_read` is also the recovery view for historical Contract Proposals, Candidates, and Rewires. When it returns a `legacy-contract-proposal:*`, `legacy-candidate:*`, or `legacy-rewire:*` proposal, pass that exact `proposal_id` and its exact `item_id` to `goal_tree_decide`; do not guess a dedicated legacy decision tool or create a duplicate native Proposal. These legacy handles support one confirm/reject decision. If an exactly equivalent pure-relation native Proposal has already landed, re-read first: the legacy Rewire should be marked applied and identify the superseding native Proposal rather than asking the user again.

For a Proposal with five or more change items, add a formal user-facing `narrative` instead of relying on a short summary or an explanation outside GoalBoard:

- `why_now`: why this decision is needed now;
- `problem`: what no longer works in the current Goal Tree;
- `main_path`: the post-confirmation result chain in dependency order, written in business language;
- `expected_effect`: what becomes different for the user or downstream work; and
- `non_goals`: what this change set intentionally does not change.

Every item in that larger Proposal also needs `explanation`: `problem`, `expected_effect`, `non_goals`, and `depends_on_item_ids`. Use the item’s stable `item_id` for semantic dependencies. For `part_of` and `depends_on`, explain the provider/consumer or parent/child consequence in business language; do not merely repeat the relation type or internal IDs. Small Proposals may omit these structured fields, but their required `summary` and item `reason` must still be understandable to the user.

Treat `goalboard_v1_goal_tree_check` as the required preflight before asking the user to decide: it checks semantic baselines and dry-runs the same materialization invariants without changing the canonical tree. If it returns any conflict or planning issue, explain and revise first. `confirm_all_pending` is all-or-nothing: one stale or invalid item leaves every pending item untouched. Use explicit per-item decisions only when the user intentionally wants independent safe items to land separately; do not turn a failed whole change set into an implicit partial application.

For a Risk item, keep treatment strategy and lifecycle state separate. `treatment` is one of `accept | mitigate | avoid | defer`; optional `state` is one of `open | triggered | resolved | accepted | expired`. There is no `state=mitigated`: after mitigation work is actually complete, propose `state=resolved`. New Risks start `open`. After a confirmed Risk update, re-read the canonical Contract and verify its state before claiming that a completion blocker is cleared.

When the user's requested result is to investigate, mitigate, accept, resolve, or expire an existing Risk, that result is the outcome of the current formal Goal—not a side effect and not a temporary context Goal. Keep the Goal Tree Proposal rooted at the Goal owned by the active clarifier Run. If that Goal is still Draft and the Risk result is already supported by completed work and evidence, the same Proposal must include both:

- one complete `kind=contract`, `operation=update` item that accepts this same Goal as `closed_leaf`, with an observable Risk-handling outcome, boundaries, promised output, and acceptance evidence; and
- the `kind=risk` lifecycle item that records the confirmed canonical Risk state.

Ask the user to decide these dependent items together. Do not confirm the Risk item alone, substitute an unrelated Goal as the Proposal root, or finish the clarifier Run while its Goal remains an empty Draft. Creating a new open Risk or correcting its descriptive facts is not a lifecycle transition and does not mechanically require a new Goal.

If mitigation or investigation still has to be executed, the clarifier Proposal accepts only the Goal Contract and leaves the Risk state unchanged. During the active executor Run for that same accepted leaf, complete the work and submit its Evidence first; the executor may then submit a same-root Proposal containing only the resulting Risk lifecycle item. It may not use executor authority to change Contracts, relations, other Goals, or ordinary Risk facts.

To promote an existing pending Candidate, do not create a second Candidate or call a separate decision path. Add one `kind=candidate`, `operation=update` item to the unified Proposal:

- `payload.candidate_id` names the existing Candidate;
- `payload.proposed_goal` is the final, possibly revised Contract and keeps the same stable `goal_id` when the Candidate already supplied one;
- `payload.proposed_relations` contains the final relations to materialize with the Goal;
- `affected_objects` includes at least the Candidate and target Goal so concurrent decisions or Goal creation become conflicts; and
- after confirmation, re-read the Candidate, Goal, and relations and verify there is no duplicate pending Candidate.

Only the one bootstrap case that created the same Goal before this capability existed may reconcile instead of creating another Goal. It must also provide matching `formal_goal_id` and `materialized_by_proposal_id`; GoalBoard accepts it only when an applied Goal-create item on the same Board both recorded the Candidate baseline and materialized that exact Goal, and the final Contract still matches. Never use title similarity or an arbitrary existing Goal as reconciliation evidence.

When closing a decomposed parent, include its update to `definition_state=accepted` and `decomposition_state=closed_compound`; confirming children alone intentionally leaves the parent open. Child Goals may split again. Split by independently usable and reviewable outcomes, not files, technical layers, or fixed tree depth.

Before asking for a decision, explain:

- intended outcome and non-goals;
- selected planning themes and why they apply;
- proposed Goal family;
- provider/consumer dependencies and other changed relations;
- executable-leaf acceptance;
- material Risks, Policy changes, and unresolved assumptions;
- the work state each affected Goal will have after confirmation.

End with one unambiguous choice: confirm the whole named Proposal, reject it, or revise named items. Call `goalboard_v1_goal_tree_decide` with `user_confirmed=true` only after the user's explicit current-conversation answer and record a faithful `confirmation_summary`. A short “可以” is whole confirmation only when the immediately preceding message explicitly named the same complete `proposal_id` as the decision and set `whole_confirmation_prompted=true`; unrelated pending Proposals elsewhere on the Board do not make that exact prompt ambiguous.

Nothing in a Proposal is canonical before the decision. Re-read affected state afterward and run `goalboard_v1_planning_graph_check` after confirmed graph changes.

## Requirement changes: replan the affected subgraph

When the user adds or changes a requirement:

1. identify the directly affected Goal IDs;
2. call `goalboard_v1_planning_analyze_change`;
3. inspect returned ancestors and downstream consumers in order;
4. reuse compatible unfinished Goals and preserve unaffected Goals;
5. rerun the planning loop for affected themes and dependencies;
6. propose only changed Contracts and Relations.

Impact analysis is not permission to rewrite the tree automatically. If a changed requirement creates a new independently valuable result, propose it. If it only changes an existing Draft owner, update that Goal instead of creating a duplicate. An accepted Goal keeps its original Contract immutable even while it is unmet: submit the intended update to `goal_tree_check`, then use the returned `successor_outline` and `relation_migration_candidates` to prepare one replacement Proposal with new Goal and criterion IDs, a `replaces` relation, and reviewed relation migrations. Do not guess or silently migrate relations, and do not treat the outline as user confirmation or canonical state.

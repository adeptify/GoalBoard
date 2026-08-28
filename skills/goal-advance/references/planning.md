# Clarification and professional Goal planning

Read this reference when starting or resuming a rough idea, decomposing or rewiring complex work, closing a compound parent, or applying a changed requirement. Its outcome is a user-readable, professionally grounded Goal Tree Proposal—not a mechanical checklist.

## Start or resume the same Draft

For a new rough idea, call `goalboard_v1_draft_dialogue_start` with the user's words. It creates only the smallest `draft / abstract` Goal plus the clarifier Claim and Run. Runtime interpretations are not canonical facts.

For a named existing Draft, read `goalboard_v1_contract`:

- resume an open clarification session with `goalboard_v1_draft_dialogue_resume`;
- otherwise start clarification on that same `goal_id` with `draft_dialogue_start` rather than creating a duplicate;
- if another Runtime owns an active dialogue, report the conflict instead of taking it over.

Tell the user that the idea was saved and ask the single question most likely to change the outcome, boundary, acceptance direction, relationship, or decomposition.

## Persist before asking the next question

For every material answer, first separate:

- the user's exact confirmed answer;
- traceable `repository_fact` or `document_fact` with sources;
- Runtime assumptions that still require confirmation; and
- Runtime recommendations, which remain advice until accepted.

Then call `goalboard_v1_draft_dialogue_turn` with the saved understanding and exactly one `next_question` or a `proposal_summary`. If persistence fails, say it was not saved and stop rather than continuing from chat memory.

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
- professional domains and themes involved;
- usable deliverables and their consumers;
- operating context and real usage flow;
- uncertainty, risks, evidence standards, and delivery obligations.

### 2. Select methods without a preset bundle

Call `goalboard_v1_planning_methods`.

- Every `composition.method_pack_ids` entry is a user-configured project floor and must be included.
- Add every other method whose distinct professional check materially applies to the current task.
- If the composition is empty, select all methods justified by the task; there may be one or many.
- Compare selected coverage with all available method summaries. An unselected method that contributes a material uncovered check must be added.
- If no domain method fits, use `meta-domain-pack-builder` to research domain objects, lifecycle, professional artifacts, evidence, dependencies, and failures. Save a user-confirmed project method before using it to split the real Goal.

Read every selected `methods[].instructions` body completely. `composition.method_paths` repeats only project-floor bodies; methods added from task inspection still come from the full `methods[]` library. Treat bodies as complementary planning Skills, not serial phases and not one Goal per method.

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

### 4. Turn only real consumption into dependency

Evaluate every dependency rule in every selected method.

- When the stated consumer genuinely uses a provider output and cannot correctly start or finish without it, create `consumer_goal depends_on provider_goal`.
- The Relation reason names the provider output, the consumer use, and why the reverse direction is wrong.
- When the consumption is absent, keep the Goals parallel and be able to state what is absent.
- Related themes, chronology, hierarchy, shared files, shared ownership, or a general desire to “do A first” are not dependencies.

Planning direction and execution order are different views of the same relation: product decisions may inform technical planning, while feature implementation waits for the technical result it consumes.

### 5. Check the complete result, not a topic checklist

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

### 6. Prove each leaf is one executable result

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

A ready leaf has no unresolved decision or independent deliverable, covers every promised output and acceptance criterion exactly, and states scope, non-goals, required inputs, outputs, and evidence. Otherwise keep it open for clarification rather than submitting a pseudo-leaf.

### 7. Propose, check, explain, and decide

Use one `goalboard_v1_goal_tree_propose` for the complete change set, then `goalboard_v1_goal_tree_read` and `goalboard_v1_goal_tree_check`. Include parent and child Goal/Contract changes, `part_of`, `depends_on`, Risks, Policy, Candidates, and Rewires where applicable.

When closing a decomposed parent, include its update to `definition_state=accepted` and `decomposition_state=closed_compound`; confirming children alone intentionally leaves the parent open. Child Goals may split again. Split by independently usable and reviewable outcomes, not files, technical layers, or fixed tree depth.

Before asking for a decision, explain:

- intended outcome and non-goals;
- selected planning themes and why they apply;
- proposed Goal family;
- provider/consumer dependencies and other changed relations;
- executable-leaf acceptance;
- material Risks, Policy changes, and unresolved assumptions;
- the work state each affected Goal will have after confirmation.

End with one unambiguous choice: confirm the whole named Proposal, reject it, or revise named items. Call `goalboard_v1_goal_tree_decide` with `user_confirmed=true` only after the user's explicit current-conversation answer and record a faithful `confirmation_summary`. A vague “可以” is whole confirmation only when the immediately preceding message made that one complete Proposal the sole decision and set `whole_confirmation_prompted=true`.

Nothing in a Proposal is canonical before the decision. Re-read affected state afterward and run `goalboard_v1_planning_graph_check` after confirmed graph changes.

## Requirement changes: replan the affected subgraph

When the user adds or changes a requirement:

1. identify the directly affected Goal IDs;
2. call `goalboard_v1_planning_analyze_change`;
3. inspect returned ancestors and downstream consumers in order;
4. reuse compatible unfinished Goals and preserve unaffected Goals;
5. rerun the planning loop for affected themes and dependencies;
6. propose only changed Contracts and Relations.

Impact analysis is not permission to rewrite the tree automatically. If a changed requirement creates a new independently valuable result, propose it; if it only changes an existing owner, update that Goal instead of creating a duplicate.

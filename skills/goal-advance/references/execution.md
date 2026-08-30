# Execute, review, complete, and recover Goal work

Read this reference when the user asks to continue available work, advance an accepted Goal, review or revalidate evidence, complete work, or recover from an execution failure.

## Choose work through Available

For an ordinary “继续推进” or “领一件能做的” request:

1. call `goalboard_v1_available` with the current Runtime's real capabilities; its default `detail_level=summary` returns the whole comparable menu without expanding every Contract;
2. if the user named a Goal, use it only if it is returned there;
3. otherwise prioritize an item with `requires_parent_confirmation=true`, then choose according to the user's request, Contract, blockers, priority, dependencies, and planning rationale;
4. when `next_action=complete`, call `goalboard_v1_complete` directly; it intentionally has `role=null` and must not create another Claim or Run;
5. for every other action, call `goalboard_v1_select_goal` with the item's returned `role` so Claim and Run start atomically.

After choosing a Goal, call `goalboard_v1_contract` for that one Goal before acting. Do not request `detail_level=full` merely to choose the next item: full exists only for a deliberate one-call diagnostic or a compatibility consumer that truly needs every candidate Contract, Policy, and Impact at once. The summary still preserves every candidate, blocked reason, priority, dependency/Risk summary, planning rationale, required capabilities, and `parallel_suggestion`.

GoalBoard does not dispatch one mandatory next task. The Runtime chooses among eligible work and explains which Goal it chose, why it fits now, and what state changed. Do not make the user choose unless there is a genuine intent or product tradeoff.

At meaningful implementation and review checkpoints, read Contract's `active_claim_lease`. If `renew_recommended=true` and the same Runtime is still actively working, call `goalboard_v1_claim_renew` before continuing. This extends the current Claim without creating a second Run. Reuse the exact `actor_id` that created the Claim. If compaction preserved `claim_id` but lost that actor string, a `claim.not_owner` response returns `owner_actor_id` and `retry_claim_renew_as_owner`; use it only when this is the same Runtime continuing the same work, never as authority to take over another Runtime's Claim. An expired Claim is never renewable: follow the returned recovery action and select again. Do not poll or create a background heartbeat.

When Available returns a non-null `parallel_suggestion`, proactively explain the concrete value of splitting those assignments across the returned abstract Runtime slots and ask whether the user wants that split. The suggestion is advisory only: do not start another Runtime, select or Claim any assignment, or imply that GoalBoard has dispatched work. After the user agrees, every participating Runtime must re-read Available with its real capabilities and individually call `goalboard_v1_select_goal` for its assigned Goal. If the suggestion is null, an Impact is unconfirmed, or the fresh read shows a conflict, do not claim that parallel execution is safe.

`available` and `explain(role=executor)` answer whether the current action can proceed; they do not certify that `complete` will pass before finished work reaches the completion phase. A Risk with `blocking_mode=completion` deliberately allows initial execution. Read `risk_summary` and the canonical Contract, and after any confirmed Risk update verify the canonical state before retrying completion.

If the selected Goal's promised result is a Risk lifecycle change, treat the confirmed Risk state as one required output, not as completion of the Goal by itself. When the Risk was not already resolved during clarification, complete the mitigation and submit Evidence from the active executor Run, then use that same Run to propose only the same-root Risk lifecycle result for user confirmation. After canonical Risk verification, continue the same Goal through `run_report`, Evidence, required Review, `complete`, and `release`. Never complete or release a clarifier Run merely because a Risk item materialized while its Goal is still Draft.

For a named Goal absent from `available`, first inspect the same response's `blocked` list. A `completion_blocked` item has already finished execution and reviews: report its Risk or decision reason and remediation without starting duplicate executor work. If new traceable counter-evidence proves that one or more previously covered acceptance criteria are no longer met, use `goalboard_v1_rework_request` with those criterion IDs, the counter-evidence references, and a concrete reason. This preserves the old Run/Evidence/Review, makes only those criteria require fresh Evidence, reopens Review, and returns the same unmet Goal to executor work; it does not resolve a completion Risk. For other absent Goals, call `goalboard_v1_explain` and report the actual dependency, Risk, capability, review, validity, or active-Claim blocker. Never bypass a blocker with legacy `ready → claim → run_start`; the normal claiming path is `available → select_goal`.

If `GOALBOARD_GOAL_ID` is set, prefer that Desktop-opened Goal for “继续推进.” Opening the panel itself is not permission to select it.

## Follow the derived work state

| Returned state | Runtime action |
|---|---|
| `clarifying` / `clarification_pending` | Read the planning reference and continue the saved dialogue. If `requires_parent_confirmation=true`, summarize completed children and ask whether they cover the original parent outcome. |
| `waiting_children` | Do not execute the parent. Choose an eligible child from Available. |
| `executing` / `execution_pending` | Work only inside the selected accepted leaf Contract. |
| `completion_pending` | Execution, Evidence, and required Reviews are already done. Call `goalboard_v1_complete` directly; do not select, Claim, or rerun the Goal. |
| `completion_blocked` | Do not select duplicate executor work. Resolve the returned canonical gate and then call `complete`; if fresh counter-evidence instead disproves an earlier completion premise, call `goalboard_v1_rework_request`, re-read Available, and continue the same Goal with fresh Evidence and Review. |
| `reviewing` / `review_pending` | Inspect the Contract and submitted evidence; perform only the Review this Runtime may provide. |
| `waiting_for_human` | Runtime-checkable Review is finished. Report the returned human criteria and user action; do not select another Runtime Review or impersonate the user's decision. |
| `revalidating` / `revalidation_pending` | Recheck the Contract, active dependencies, Risks, and cited evidence; use `goalboard_v1_revalidate` only from the active revalidator Run. |
| Any other `*_blocked` | Call `goalboard_v1_explain`, report the concrete blocker, then choose other eligible work or ask for the missing decision. |
| `satisfied`, `archived`, `invalidated` | Do not claim it. Explain the state or choose other work. |

A parent whose current children are complete is not silently done. If they cover the whole original result, use the planning flow to propose `accepted / closed_compound`; otherwise clarify and propose missing children.

## Execute inside the accepted leaf

- Treat the accepted Contract as the boundary. Do not silently add scope, alter acceptance, or rewire dependencies.
- Lead progress reports with the business result, current stage, next action/owner, and blocker. Engineering facts support the explanation; they do not replace it.
- Map every claimed completion result to its acceptance criterion and traceable evidence.
- Read the returned `locator_status` for every submitted Evidence. `verified` means GoalBoard completed a bounded, read-only project-file preflight. A project file may be submitted as a relative path, a `repo:` relative input such as `repo:docs/review.md#checks`, a `project://` reference, or an absolute path inside the current canonical workspace. GoalBoard normalizes safe `repo:` and absolute inputs to `project://`, realpath-checks containment, and rejects project-external paths and symlink escapes. A project file over 512 KiB may still be registered after its path and ordinary-file boundary are confirmed, but it remains `unverified`, cannot be previewed in Web, and any caller-supplied digest is recorded rather than independently checked; submit a small sidecar summary when reviewers need readable context. For an artifact in another local repository, an explicit `file:///absolute/path` may be registered as machine-local `unverified` Evidence: GoalBoard preserves the locator and digest but never reads the file, confirms existence, verifies the digest, or opens it from Web. To upgrade it to `verified`, work from that repository as the current controlled workspace and submit a project locator; do not invent a GitHub URL for unpushed work. Other `unverified` locators are explicit boundaries, not failures and not proof that an external or opaque locator exists; reviewers must judge them accordingly. A known-missing project file or a missing Markdown anchor in a file small enough to inspect is rejected before it can become Evidence.
- Evidence is immutable. If a submitted record is wrong, submit the corrected Evidence first and then use `goalboard_v1_evidence_correct` to supersede it, or retract it when there is no replacement. Never hide the old locator in free text or treat a corrected historical record as current proof.
- A Runtime may correct only Evidence produced by the same actor. If another producer's Evidence is wrong, report the problem and let that producer or a trusted user-facing workflow resolve it.
- A required human approval cannot be replaced by a Runtime review.
- During execution, a repeated project-wide rule may be proposed as project guidance, but it is not part of Goal completion and must follow the protocol's exact-text user confirmation flow. Do not interrupt work for one-off implementation detail or save it automatically.

Normal completion order:

```text
run_report(state=completed | blocked | failed)
  → evidence_submit mapped to acceptance criterion IDs
  → evidence_correct when an immutable Evidence record must be superseded or retracted
  → rework_request only when later counter-evidence invalidates an earlier completion premise
  → review_submit for each Runtime-permitted required review
  → complete
  → release
```

## Close every Run with a cycle handoff

A successful `goalboard_v1_release` closes ownership of one Run; it is not the endpoint of an ongoing “继续推进” request. Unless the user explicitly asked to stop or limited the request to this one Run, immediately follow the returned `handoff` and call `goalboard_v1_available` with `detail_level=summary` and the current Runtime's real capabilities. This read needs no repeated user confirmation, but it does not authorize unrelated work.

Every cycle checkpoint has this shape:

- **This cycle**: the business result and its evidence/acceptance boundary;
- **Next**: the chosen Goal's complete title and returned `next_action`;
- **Why now**: the returned planning rationale, dependency or blocker reason that makes this the right next move;
- **Continuation**: either “continuing now” because the action is safe and inside the current user authority, or the exact human decision, permission or input that is missing; when another authorized Available item can proceed safely, name it and switch to it instead of waiting.

When the chosen next action is safe and already authorized, read that Goal's Contract and continue through the normal Available path. Do not end the turn merely because a Claim was released or because a checkpoint was reported. Stop only for an explicit user stop, exhausted current authority, a required human decision/input, or no authorized Available work. GoalBoard still does not dispatch a mandatory next task: the Runtime remains responsible for choosing among the returned items and explaining the choice.

For review, test the Contract and evidence rather than repeating the executor report. For revalidation, supply non-empty evidence from the active revalidator Run. Neither role may edit an accepted Contract or complete unrelated work.

## Put unexpected results back into the lifecycle

An observed mismatch is Goal information when it can make a completion claim false: a code Bug, unusable design, incorrect content, broken operating process, weak research evidence, or another task-specific failure.

A recurring operation uses an already established capability; it does not reopen that completed capability Goal. Preserve operational Evidence from the run. When the Evidence shows an independently deliverable improvement, submit a finite Candidate Improvement Goal; the user still decides whether it becomes a canonical Goal. Do not create a backward `depends_on` from the completed capability to its recurring use.

Read the affected Contract and current Goal Tree, then choose the smallest truthful action:

- If an acceptance criterion is not met, do not submit passing Evidence or call `complete`. Submit failed/inconclusive Evidence when a traceable check exists.
- Mark the Run blocked only when work genuinely cannot continue; otherwise keep working on the same Goal.
- Reuse an existing unfinished Goal that already owns the correction.
- If correction is independently deliverable, independently verifiable, or separately schedulable, use a Candidate or Goal Tree Proposal. Use `part_of` for missing scope and `depends_on` only when another Goal consumes the correction result.
- If an unfinished Goal has already reached a completion gate but new traceable counter-evidence disproves an earlier acceptance premise, call `goalboard_v1_rework_request` for the affected criteria. Then re-read Available, execute the same Goal, submit fresh Evidence, and repeat required Reviews. Do not resolve an unrelated completion Risk or create a duplicate Goal merely to regain an executor entry.
- If a completed Goal is now shown wrong, preserve its history and propose corrective work or supported revalidation. Do not silently rewrite it.
- A failure that has already happened is not merely a future Risk.

Do not continue unrelated work while a completion-blocking problem lacks a visible owner and next action.

## New scope and changed relations

- New independently valuable scope becomes `goalboard_v1_candidate_submit` or a Goal Tree Proposal.
- A changed dependency becomes `goalboard_v1_dependency_propose` or a Goal Tree rewire.
- Neither changes canonical Goal facts until the supported user decision path completes.
- If a new requirement affects several Goals, stop ordinary execution and use the planning reference's affected-subgraph flow.

## Recovery and stopping conditions

- Interrupted Draft: resume with `goalboard_v1_draft_dialogue_resume`; do not reconstruct state from private chat memory.
- Denied selection or newly blocked Goal: use Available or Explain, then choose a different eligible Goal or ask for the missing decision. Do not retry unchanged input.
- Claims are leases. Release the current Runtime's Claim when it stops working.
- Reuse an idempotency key only for an exact retry. A changed request needs a fresh key.
- If another Runtime owns an active dialogue or Claim, report that fact instead of taking it over.
- If MCP is unavailable, report the connection failure and stop. Do not open Web, call CLI, or read SQLite as a lifecycle fallback.

# Execute, review, complete, and recover Goal work

Read this reference when the user asks to continue available work, advance an accepted Goal, review or revalidate evidence, complete work, or recover from an execution failure.

## Choose work through Available

For an ordinary “继续推进” or “领一件能做的” request:

1. call `goalboard_v1_available` with the current Runtime's real capabilities; its default `detail_level=summary` returns the whole comparable menu without expanding every Contract;
2. if the user named a Goal, use it only when its action projection permits the relevant action;
3. otherwise tentatively choose according to the user's request, blockers, priority, dependencies, and planning rationale;
4. read the chosen Goal's Contract and compare the request with `in_scope`, `out_of_scope`, promised outputs, and constraints;
5. when the `primary_action` belongs to the Runtime and the scope check passes, call `goalboard_v1_select_goal` with its `action_id`, `action_token`, action target and returned role so Claim and Run start atomically;
6. when the primary action belongs to the user, explain that one decision and do not Claim it;
7. when there is no action because the Goal is complete, report completion; do not call `complete` or start another Run.

If the current request hits `out_of_scope`, contradicts the Contract, or has no canonical owner among the Available candidates, do not call `goalboard_v1_select_goal`: no Claim or Run should be created merely to discover scope. Explain the mismatch and use the existing planning path when the work is an independently valuable missing Goal or relation change. Do not force a handoff action into the nearest eligible Goal.

Do not request `detail_level=full` merely to choose the next item: full exists only for a deliberate one-call diagnostic or a compatibility consumer that truly needs every candidate Contract, Policy, and Impact at once. The summary still preserves every candidate, blocked reason, priority, dependency/Risk summary, planning rationale, required capabilities, and `parallel_suggestion`.

GoalBoard does not dispatch one mandatory next task. The Runtime chooses among eligible work and explains which Goal it chose, why it fits now, and what state changed. Do not make the user choose unless there is a genuine intent or product tradeoff.

At meaningful implementation and review checkpoints, read Contract's `active_claim_lease`. If `renew_recommended=true` and the same Runtime is still actively working, call `goalboard_v1_claim_renew` before continuing. This extends the current Claim without creating a second Run. Reuse the exact `actor_id` that created the Claim. If compaction preserved `claim_id` but lost that actor string, a `claim.not_owner` response returns `owner_actor_id` and `retry_claim_renew_as_owner`; use it only when this is the same Runtime continuing the same work, never as authority to take over another Runtime's Claim. An expired Claim is never renewable: follow the returned recovery action and select again. Do not poll or create a background heartbeat.

When Available returns a non-null `parallel_suggestion`, proactively explain the concrete value of splitting those assignments across the returned abstract Runtime slots and ask whether the user wants that split. The suggestion is advisory only: do not start another Runtime, select or Claim any assignment, or imply that GoalBoard has dispatched work. After the user agrees, every participating Runtime must re-read Available with its real capabilities, read its assigned Goal's Contract, verify the scope match, and only then call `goalboard_v1_select_goal`. If the suggestion is null, an Impact is unconfirmed, the Contract does not own the assigned work, or the fresh read shows a conflict, do not claim that parallel execution is safe.

`available` and `explain(role=executor)` answer whether the current action can proceed; they do not certify that `complete` will pass before finished work reaches the completion phase. A Risk with `blocking_mode=completion` deliberately allows initial execution. Read `risk_summary` and the canonical Contract, and after any confirmed Risk update verify the canonical state before retrying completion.

If the selected Goal's promised result is a Risk lifecycle change, treat the confirmed Risk state as one required output, not as completion of the Goal by itself. When the Risk was not already resolved during clarification, complete the mitigation and submit Evidence from the scoped active executor Run, then report the same-root Risk result. GoalBoard releases and completes automatically when the canonical Risk and all other gates close. Never end a clarifier Run merely because a Risk item materialized while its Goal is still Draft.

For a named Goal absent from `available`, inspect the same response's `blocked` and compact `blocked_overview` before considering any adjacent Goal. `blocked_overview.next_action=explain` means the Goal still exists but an ordinary dependency, Review, validity, or phase blocker keeps it out of the actionable menu; call `goalboard_v1_explain` and report that canonical reason instead of claiming the nearest eligible Goal. A `completion_blocked` item has already finished execution and reviews: report its Risk or decision reason and remediation without starting duplicate executor work. If new traceable counter-evidence proves that one or more previously covered acceptance criteria are no longer met, use `goalboard_v1_rework_request` with those criterion IDs, the counter-evidence references, and a concrete reason. This preserves the old Run/Evidence/Review, makes only those criteria require fresh Evidence, reopens Review, and returns the same unmet Goal to executor work; it does not resolve a completion Risk. Never bypass a blocker with legacy `ready → claim → run_start`; the normal claiming path is `available → contract → select_goal`.

If `GOALBOARD_GOAL_ID` is set, prefer that Desktop-opened Goal for “继续推进.” Opening the panel itself is not permission to select it.

## Follow the action projection

| Short state | Runtime action |
|---|---|
| `可继续` | Perform the Runtime-owned primary action. “继续修改” keeps old Runs and Evidence visible; it is not a first execution. |
| `进行中` | Continue the active Claim/Run, renew at a meaningful checkpoint when recommended, and avoid duplicate selection. |
| `等你` | Explain the one user-owned revision, Human Review or Risk decision. Use trusted dialogue only for one exact, current Human Review target. |
| `等待中` | Advance an eligible child/dependency when authorized; do not execute the waiting parent. |
| `受阻` | Report the projection's recovery action. Do not retry an unchanged call or invent a new gate. |
| `已完成` | Report the trusted result and optionally show the next available Goals without auto-claiming one. |

Every lifecycle write returns a transition receipt. Continue from `receipt.projection`; do not poll to guess whether the write released a Claim, opened Review or completed the Goal. A stale token rejects the old write and returns the new projection.

A parent whose current children are complete is not silently done. If they cover the whole original result, use the planning flow to propose `accepted / closed_compound`; otherwise clarify and propose missing children.

## Execute inside the accepted leaf

- Treat the accepted Contract as the boundary. Do not silently add scope, alter acceptance, or rewire dependencies.
- Lead progress reports with the business result, current stage, next action/owner, and blocker. Engineering facts support the explanation; they do not replace it.
- Map every claimed completion result to its acceptance criterion and traceable evidence.
- Read the returned `locator_status` for every submitted Evidence. `verified` means GoalBoard completed a bounded, read-only project-file preflight. A project file may be submitted as a relative path, a `repo:` relative input such as `repo:docs/review.md#checks`, a `project://` reference, or an absolute path inside the current canonical workspace. An absolute path inside a Git worktree that the current canonical repository itself formally lists is also eligible: GoalBoard records the actual worktree root, realpath-checks containment, and does not treat an arbitrary `.git` file as authorization. GoalBoard normalizes safe `repo:` and absolute inputs to `project://`, and rejects different repositories, unregistered directories, stale worktrees, project-external paths, and symlink escapes. A project file over 512 KiB may still be registered after its path and ordinary-file boundary are confirmed, but it remains `unverified`, cannot be previewed in Web, and any caller-supplied digest is recorded rather than independently checked; submit a small sidecar summary when reviewers need readable context. For an artifact in another local repository, an explicit `file:///absolute/path` may be registered as machine-local `unverified` Evidence: GoalBoard preserves the locator and digest but never reads the file, confirms existence, verifies the digest, or opens it from Web. To upgrade it to `verified`, work from that repository as the current controlled workspace and submit a project locator; do not invent a GitHub URL for unpushed work. Other `unverified` locators are explicit boundaries, not failures and not proof that an external or opaque locator exists; reviewers must judge them accordingly. A known-missing project file or a missing Markdown anchor in a file small enough to inspect is rejected before it can become Evidence.
- Evidence is immutable. If a submitted record is wrong, submit the corrected Evidence first and then use `goalboard_v1_evidence_correct` to supersede it, or retract it when there is no replacement. Never hide the old locator in free text or treat a corrected historical record as current proof.
- A Runtime may correct only Evidence produced by the same actor. If another producer's Evidence is wrong, report the problem and let that producer or a trusted user-facing workflow resolve it.
- A required human approval cannot be replaced by a Runtime review.
- A Human Review can be recorded from conversation only by a host-provided trusted dialogue operation that derives the user, Session and message source itself. Use it only when the projection identifies exactly one current human obligation and the user explicitly approves it or asks for changes. Pass the exact quote, target and attention token; the operation atomically writes Human Evidence and Review. If that trusted host operation is unavailable, or there are multiple items, ambiguous wording or a stale token, open Decision Center. Do not separately submit `human_verdict` Evidence through Runtime MCP and do not turn “好的”“继续” into approval.
- During execution, a repeated project-wide rule may be proposed as project guidance, but it is not part of Goal completion and must follow the protocol's exact-text user confirmation flow. Do not interrupt work for one-off implementation detail or save it automatically.

Normal executor-to-review order:

```text
run_report(state=completed | blocked | failed)
  → evidence_submit mapped to acceptance criterion IDs
  → evidence_correct when an immutable Evidence record must be superseded or retracted
  → GoalBoard auto-releases the executor when the completed Run and required Runtime Evidence are both present
  → select the pending independent reviewer action
  → rework_request only when later counter-evidence invalidates an earlier completion premise
  → review_submit for each Runtime-permitted required review
  → GoalBoard ends the reviewer Run and releases its Claim in the same Review transaction
  → GoalBoard auto-completes the Goal when the last Review/Risk gate closes
```

If the executor reports `completed` before all required Runtime Evidence exists, the Claim stays active and the primary action becomes “补齐完成依据.” The last required Evidence submission releases it atomically. `blocked` Runs stay owned; `failed` or `abandoned` Runs retain history and release automatically. Explicit `release` remains only for handoff, abandonment and old Runtime recovery.

## Continue from each atomic receipt

A successful lifecycle write returns the exact resulting projection. It is not the endpoint of an ongoing “继续推进” request: continue the same Goal when the next action is safe and in scope. Read Available only when selecting among other Goals. Never auto-claim an unrelated Goal.

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

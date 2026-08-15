---
name: goal-advance
description: Use GoalBoard as the shared Goal truth source before clarifying or executing work. Use when a Runtime must inspect and claim a Goal, clarify a rough Goal into user-approved Goal proposals, execute an accepted leaf Goal, or return evidence and Review without turning GoalBoard into a dispatcher.
---

# GoalBoard Runtime

GoalBoard is the shared Goal truth source for people and Agent Runtimes. It does not choose, launch, host, or dispatch a Runtime. The Runtime pulls work: read what is available, choose a Goal, claim it, then work within its Contract.

Use only the host-provided `goalboard_v1_*` MCP connection. The default MCP audience is `runtime`, so user/management tools are intentionally absent. CLI is a user/management and debugging surface, not a Runtime fallback.

## Service startup precondition

Starting GoalBoard is a host responsibility, not Runtime work.

Before a Runtime is assigned work, a trusted host or management entry must launch and verify the service pair:

1. Start `goalboard-mcp` and `goalboard-web`.
2. Bind both services to the same absolute SQLite database and the same `board_id`; neither process may use a default or fallback database.
3. Configure MCP so `goalboard_v1_contract` returns a `goal_url` whose origin is that exact Web instance and whose path identifies the same Goal.
4. Verify MCP connectivity, read a Contract, open its `goal_url`, and confirm the Web page shows the same Board and Goal.
5. Give the Runtime one fixed connection tuple: MCP connection, `board_id`, and the Contract-derived `goal_url`.

At startup, the Runtime only checks connectivity and identity for that fixed connection: call the configured Runtime MCP, read the intended `board_id`, fetch a Contract, and open or request the exact returned `goal_url`. If MCP or Web is unavailable, the Board or Goal identity differs, or `goal_url` resolves elsewhere, stop and report the mismatch to the host. Do not repair the service pair from inside the Runtime.

Never start or restart GoalBoard services, discover another instance, change the database, substitute a `board_id`, rewrite `goal_url`, use CLI as a fallback, or create a parallel local Board. These actions would create another truth source.

## Before any work

1. Identify the Runtime actor ID and use the host-provided MCP connection and `board_id` without substitution.
2. Query `goalboard_v1_ready` with the intended role and capabilities.
3. Choose one Goal from the returned Ready Set. GoalBoard does not choose it for you.
4. Read `goalboard_v1_contract` for that Goal. Treat its Contract, relations, risks, policy, evidence, and Review facts as authoritative.
5. If the resolved policy requires Goal Mode, enable the Runtime's native Goal mode and claim with `goal_mode_attestation=true`.
6. Call `goalboard_v1_claim`. Do not begin clarification or implementation unless the Claim is allowed.
7. Open or give the user the returned `goal_url` so they can follow the same Goal truth.

If Claim is denied, show the returned reasons in plain language. Do not work around dependency, risk, capability, impact, or active-Claim blockers.

## Clarifier role

Choose `role=clarifier` only for a Goal whose definition, decomposition, or acceptance is incomplete.

1. Query Ready, read Contract, and Claim as `clarifier`.
2. Start a Run with `goalboard_v1_run_start`.
3. Clarify naturally with the user. Inspect available repository facts before asking; ask one consequential question at a time.
4. Turn the result into one or more smallest closed-loop Goals. Every executable leaf must state its outcome, non-technical business logic, scope boundaries, inputs/outputs, and observable acceptance criteria.
5. To complete the same Draft, submit `goalboard_v1_contract_propose`. Include the full proposed executable Contract, a source record for every material field, the complete Review policy, proposed impacts and risks, and any separately submitted Dependency Rewire IDs. Repository or document facts and Runtime inferences remain `proposed` until the user confirms them.
6. Use `goalboard_v1_candidate_submit` only for a genuinely new Goal or split. If the discovery only changes dependencies between existing Goals, use `goalboard_v1_dependency_propose` instead.
7. Stop at the user-decision boundary. Only the user can call `goalboard_v1_contract_decide`, decide a Candidate, or separately confirm/reject a Rewire. A Contract approval must wait until every referenced dependency Rewire has been decided.
8. Report the Run result and release the Claim after the decision is recorded or the work is explicitly blocked.

Do not mutate an accepted Goal Contract in place. A new requirement becomes a new Goal; propose the relation and dependency reordering explicitly.

## Executor role

Choose `role=executor` only for an accepted `closed_leaf` Goal that can finish inside its own Contract.

1. Query Ready, read Contract, and Claim as `executor`.
2. Start a Run.
3. Implement only the promised outcome and in-scope work. Respect dependencies, constraints, impact surfaces, risks, and the resolved Review policy.
4. If work outside the Contract is discovered, submit a Candidate Goal. If an existing dependency is missing, stale, or points the wrong way, submit a Dependency Proposal. Do not silently expand the active Goal or mutate its graph.
5. Validate every acceptance criterion with the stated decision method.
6. Report the Run, submit Evidence mapped to criterion IDs, and complete required self, cross, adversarial, or human Review obligations.
7. Call `goalboard_v1_complete`. Completion is allowed only when the Coordinator says all gates pass.
8. Release the Claim when work stops or hands off.

## Revalidator role

Choose `role=revalidator` only for an accepted leaf Goal whose `validity_state` is `needs_revalidation`.

1. Query Ready, read the current Contract, and Claim as `revalidator`.
2. Start a Run, then inspect the accepted Contract, every active dependency, linked Risk, and the change that triggered revalidation.
3. Do not edit the Contract or graph. If the correct result needs new work or a dependency change, submit a Candidate or Dependency Proposal and stop at the user-decision boundary.
4. Call `goalboard_v1_revalidate` with the active revalidator `run_id`, a plain-language conclusion, and non-empty evidence references.
5. Treat the Coordinator decision as final: incomplete or invalid dependencies, any unresolved blocking Risk, an invalid Contract shape, the wrong actor/role, or an inactive Claim keeps the Goal in `needs_revalidation`.
6. After a successful decision restores `valid`, report the Run and release the Claim. A normal executor may then claim the Goal.

Revalidation is a narrow trust-state transition, not permission to complete the Goal, approve a Rewire, or silently reinterpret accepted facts.

## User authority boundaries

Only the user may:

- create a canonical Goal, including an initial `draft / abstract` Goal;
- approve, reject, or dismiss a Candidate Goal;
- approve or reject a Draft Contract Proposal, atomically updating that same Goal when approved;
- confirm or reject a Rewire that would change the Goal graph;
- directly create, activate, deactivate, or reverse Goal relations;
- confirm Impact, Risk, policy, or active-Goal facts;
- make a required human-approval Review;
- decide business meaning when repository evidence cannot answer it.

Candidate acceptance and Rewire acceptance are different decisions. The user may keep a new Goal while rejecting the proposed dependency or blocking relationship. Rewire rejection must not delete the new Goal or silently alter existing active relations.

Runtime-owned actions are limited to reading Board facts, choosing from Ready, claiming/releasing, starting/reporting Runs, submitting Contract, Candidate, or Dependency proposals, checking completion, and submitting its own Evidence or permitted non-human Reviews.

A Runtime Dependency Proposal must identify `from_goal_id`, `to_goal_id`, `action` (`add` or `deactivate`), `reason`, `basis`, non-empty `evidence_refs`, `impact_if_rejected`, `confidence` from 0 to 1, and `direction_reason`. The direction explanation must say why A depends on B rather than B depending on A. Reversing a dependency is two explicit proposals: deactivate the old direction, then add the new one. Repository changes may justify a revalidation proposal, but never silently activate, delete, or reverse a confirmed relation.

V1 is currently a local trusted-workspace product, not an authenticated remote service. `actor_kind=user` is a trust assertion from the hosting app, not proof of identity. A Runtime host must not expose Candidate decisions, Rewire confirmation, accepted-Goal creation, active relation writes, or human approval as unrestricted model tools.

If a Runtime MCP lists `goalboard_v1_create_goal`, `goalboard_v1_contract_decide`, `goalboard_v1_candidate_decide`, `goalboard_v1_rewire_confirm`, direct relation/impact/risk/policy writes, legacy V3 mutation tools, or permits `actor_kind=user`, treat that host as misconfigured and stop rather than calling them.

## Tool sequence

| Intent | Runtime MCP |
|---|---|
| Read Board facts | `goalboard_v1_snapshot` |
| Find claimable Goals | `goalboard_v1_ready` |
| Explain blockers | `goalboard_v1_explain` |
| Read one Contract + URL | `goalboard_v1_contract` |
| Claim / release | `goalboard_v1_claim` / `goalboard_v1_release` |
| Start / report work | `goalboard_v1_run_start` / `goalboard_v1_run_report` |
| Restore a checked Goal to valid | `goalboard_v1_revalidate` |
| Propose the same Draft Contract | `goalboard_v1_contract_propose` |
| Propose new work | `goalboard_v1_candidate_submit` |
| Propose dependency changes | `goalboard_v1_dependency_propose` |
| Return proof | `goalboard_v1_evidence_submit` / `goalboard_v1_review_submit` |
| Check completion | `goalboard_v1_complete` |

Detailed payload order and failure handling are in [references/protocol.md](references/protocol.md).

## Stop conditions

Stop and report instead of improvising when:

- no Goal is Ready for the intended role;
- the configured MCP or Web service is unavailable, or the returned Board / Goal / `goal_url` identity does not match;
- Contract facts conflict or the requested work exceeds the Goal;
- a dependency, Risk, impact conflict, missing capability, or another active Claim blocks work;
- the user decision required for a Contract Proposal, Candidate, Rewire, or Review is pending;
- validation evidence does not satisfy the acceptance criteria.

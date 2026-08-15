# GoalBoard V1 Runtime protocol

## Connection

Configure the MCP server with a shared SQLite database:

```toml
[mcp_servers.goalboard]
command = "node"
args = ["/absolute/path/to/goalboard/dist/mcp/server.js"]
env = { GOALBOARD_DATABASE = "/absolute/path/to/goalboard.db", GOALBOARD_BOARD_ID = "my-board", GOALBOARD_WEB_URL = "http://127.0.0.1:4173", GOALBOARD_MCP_AUDIENCE = "runtime" }
```

The host or management entry starts both services before handing work to a Runtime:

```bash
goalboard-web --db /absolute/path/to/goalboard.db --board-id my-board --port 4173
GOALBOARD_DATABASE=/absolute/path/to/goalboard.db \
GOALBOARD_BOARD_ID=my-board \
GOALBOARD_WEB_URL=http://127.0.0.1:4173 \
GOALBOARD_MCP_AUDIENCE=runtime \
goalboard-mcp
```

The host must launch and verify one identity chain before assignment: the MCP can answer, the configured `board_id` exists in that SQLite database, `goalboard_v1_contract` returns the expected Goal and `goal_url`, and an HTTP request to that exact URL opens the same Board and Goal in `goalboard-web`. The MCP process and Web process must use the same absolute SQLite path and `board_id`; the MCP-configured Web origin plus the Contract path must equal the returned `goal_url`. Defaults and fallback databases are not valid substitutes.

The host supplies the Runtime with one fixed MCP connection and `board_id`. The Runtime tool schema omits `database_path` and `web_base_url`; direct override attempts are rejected. Management tools retain explicit overrides for trusted setup and diagnostics.

The MCP server defaults to `GOALBOARD_MCP_AUDIENCE=runtime`. This surface exposes only Board reads, Ready/Claim/Run, Candidate submission, Evidence, permitted Runtime Review, completion checks, and release. It does not list legacy V3 mutation tools or user-authority V1 tools.

Use `GOALBOARD_MCP_AUDIENCE=management` only in a user-controlled management host. That audience exposes initialization, canonical Goal creation, direct coordination writes, Candidate decisions, Rewire decisions, V3 import, and legacy compatibility tools. Do not attach a management MCP host to an autonomous Runtime.

This local V1 protocol assumes the hosting app is trusted. `actor_id` and `actor_kind` are audit and authority assertions, not remote authentication. Do not expose user-authority tools to an untrusted Runtime; multi-user authentication belongs to a later server deployment.

CLI is a local management/debug surface only. If the configured MCP or Web endpoint is unavailable, a Runtime stops and reports the failed check to the host. It must not start or restart either service, launch a new instance, switch SQLite files, substitute another `board_id`, rewrite `goal_url`, use CLI as a fallback, or create a parallel Board.

## Runtime connection preflight

Before querying Ready:

1. Call the configured Runtime MCP and confirm it answers.
2. Call `goalboard_v1_contract` with the host-provided `board_id` and intended Goal when known; otherwise call `goalboard_v1_ready`, choose a Goal, then read its Contract.
3. Check the returned Contract still names the intended `board_id` and Goal.
4. Request or open the exact returned `goal_url` and confirm the Web page represents that same Board and Goal. The Runtime checks this identity; it does not choose a different URL or database when the check fails.
5. Continue to Claim only after every check passes. On any unavailable service or identity mismatch, stop and return the connection facts to the host or user.

## Common pull sequence

```text
ready(role, capabilities, goal_mode_attestation)
  -> choose one returned Goal
  -> contract(goal_id)
  -> claim(goal_id, role, capabilities, goal_mode_attestation, lease_seconds)
  -> run_start(claim_id)
  -> role-specific work
  -> run_report(run_id)
  -> release(claim_id)
```

`ready`, `explain`, `contract`, and `claim` use top-level fields. Most later MCP write tools use `{ board_id, payload: {...} }`; the payload contains actor IDs, object IDs, state, evidence, and an `idempotency_key`.

## Clarifier sequence

```text
ready(role="clarifier")
  -> contract
  -> claim(role="clarifier")
  -> run_start
  -> contract_propose(discovered_in_run_id, proposed_goal, field_sources,
                      review_policy, proposed_impacts, proposed_risks,
                      dependency_rewire_ids)
  -> user contract_decide(approved | rejected)
  -> run_report(state="completed" | "blocked" | "failed")
  -> release
```

A user may create a title-only draft/abstract Goal because clarification is still pending. The clarifier completes that same Goal through `goalboard_v1_contract_propose`; it does not submit a Candidate merely to replace the Draft. The Proposal must produce an `accepted/closed_leaf` Contract with outcome, why, non-technical business logic, scope, explicit priority, at least one measurable or inspectable acceptance criterion, full Review policy, and source records for every material field.

Each `field_source` records the field name, `source_kind` (`user_answer`, `repository_fact`, `document_fact`, or `runtime_inference`), non-empty `source_refs`, confidence from 0 to 1, rationale, `status="proposed"`, and `requires_user_confirmation=true`. Repository and document observations are objective evidence, not permission to decide business meaning. Inference, priority, boundaries, acceptance, risk acceptance, and Review policy remain unconfirmed until the user decides.

Only the user/management surface calls `goalboard_v1_contract_decide`. Rejection leaves the canonical Draft unchanged and allows a revised Proposal. Approval validates every referenced Dependency Rewire has already been applied or rejected, then atomically updates the same Goal ID, its acceptance criteria, Review policy, confirmed impacts, and open risks. Accepted Contracts are not edited in place later; a new requirement becomes a new Candidate Goal and explicit Rewire.

Candidate submission remains the path for a genuinely new Goal or split. Candidate decision and Rewire decision are separate user operations. The user may accept a Candidate Goal and then reject its proposed Rewire. In that case the new Goal remains in the Board as an independent Goal, the proposed relations/impacts/risks are not applied, and existing active relations remain unchanged. If a Contract, Candidate, or Rewire decision is pending, return its stable GoalBoard link to the user and stop at that boundary.

## Dependency Proposal

Use `goalboard_v1_dependency_propose` when a clarifier or executor discovers that existing Goals need an added or deactivated dependency. GoalBoard does not infer this from imports or code references. The Runtime must reason from the Contract and cite concrete code, document, test, business-sequence, impact-conflict, or risk-policy evidence.

Each proposed relation requires:

- `from_goal_id` and `to_goal_id`;
- `type="depends_on"` and `action="add" | "deactivate"`;
- a plain-language `reason`;
- `basis`: `contract_output`, `code_reference`, `test_dependency`, `business_sequence`, `impact_conflict`, or `risk_policy`;
- one or more `evidence_refs`;
- `impact_if_rejected`;
- `confidence` from 0 to 1;
- `direction_reason` explaining why `from_goal_id → to_goal_id`, not the reverse.

The submission creates a pending Rewire; it does not change active relations. Only a user confirmation applies it. User rejection leaves the current graph untouched. Reverse direction requires two separately reviewable changes: deactivate A → B, then add B → A. A code change that makes a confirmed dependency look stale triggers revalidation and a new proposal, never silent removal. A current-Run proposal may block completion only when its `from_goal_id` is the Goal being executed.

## Executor sequence

```text
ready(role="executor")
  -> contract
  -> claim(role="executor")
  -> run_start
  -> run_report(state="completed", output_refs=[...])
  -> evidence_submit(criterion_ids=[...], run_id, result="passed", locator=...)
  -> review_submit for every required obligation
  -> complete(goal_id)
  -> release
```

Evidence must name the criterion IDs it proves. A successful command with no criterion mapping is not completion evidence. Reviews must satisfy the resolved independence rules; an executor cannot impersonate an independent reviewer. The Runtime MCP accepts only `actor_kind=runtime`; a required human approval must be completed through a user/management entry.

## Revalidator sequence

```text
ready(role="revalidator")
  -> contract
  -> claim(role="revalidator")
  -> run_start
  -> inspect accepted Contract + active dependencies + linked Risks + trigger evidence
  -> revalidate(goal_id, run_id, reason, evidence_refs)
  -> run_report(state="completed" | "blocked" | "failed")
  -> release
```

Only a started Run owned by the active `revalidator` Claim may call `goalboard_v1_revalidate`. The operation is atomic and idempotent. It restores `validity_state=valid` only when the Goal is still an accepted `closed_leaf` with acceptance criteria, every active `depends_on` Goal is both `satisfied` and `valid`, and no linked open or triggered Risk with a blocking mode remains. Otherwise it returns readable reasons and leaves the Goal in `needs_revalidation`.

An executor remains unable to claim a Goal in `needs_revalidation`. A revalidator cannot use this operation to modify an accepted Contract, activate or remove a dependency, accept a Risk, complete the Goal, or approve its own Candidate/Rewire. If verification shows that canonical facts or the graph must change, submit the corresponding Proposal and wait for the user decision.

## Stable user link

`goalboard_v1_contract` returns:

- `goal_path`: encoded `/goals/:goal_id` path;
- `goal_url`: absolute URL derived from the host-fixed `GOALBOARD_WEB_URL` on the Runtime MCP;
- only the selected Goal's Contract and connected facts.

Give this URL to the user when asking for clarification, Candidate/Rewire decisions, or Review.

## Denial handling

Use `goalboard_v1_explain` when Claim is denied. Treat reason codes as Coordinator decisions:

- `goal.*`: definition, leaf, validity, fulfillment, or acceptance state is wrong for the role;
- `dependency.*`: an upstream Goal is not satisfied or valid;
- `risk.*`: a linked Risk blocks Claim;
- `policy.*`: Goal Mode or capability attestation is missing;
- `impact.*`: another active writer conflicts on the same surface;
- `claim.*`: another Runtime already holds the competing role.

Do not retry unchanged input in a loop. Change the real blocking condition, choose another Ready Goal, or ask the user for the decision that only they can make.

## Idempotency and leases

- Reuse an `idempotency_key` only for the exact same request.
- Use a new key when the request body changes.
- A Claim is a lease, not ownership. Release it when stopping; expired leases cease to block another Runtime.
- Runs remain historical facts after a Claim is released.

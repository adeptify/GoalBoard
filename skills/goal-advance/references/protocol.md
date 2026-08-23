# Shared GoalBoard Runtime protocol

Read this reference before the first GoalBoard write in a flow. It contains only invariants shared by project connection, planning, execution, and recovery. Read the route-specific reference for the actual workflow.

## One Runtime connection and truth source

- Goal lifecycle uses only host-provided `goalboard_v1_*` Runtime MCP tools.
- `context_resolve` is read-only. Once it returns `bound`, use its fixed `board_id` and connection for every later call.
- Runtime schemas intentionally do not accept a database-path or Web-address override. Never open SQLite, call the management CLI, construct another Board, or alter Runtime configuration as a fallback.
- Host Session metadata may resume a connection. A workspace, repository, directory, title, or conversation text is only a clue and never project identity.
- Web is optional and not a decision, recovery, or lifecycle prerequisite.

## Authority stays specific

- Set `user_confirmed=true`, `delete_confirmed=true`, or `rebind_confirmed=true` only after the user explicitly authorizes that exact operation in the current conversation.
- Confirmation for selecting a project does not authorize a workspace default, switch, unbind, project deletion, Goal trash, Proposal decision, human Review, or another write.
- Do not invent user identity, Session ID, message reference, actor provenance, host clues, or confirmation text.
- A Runtime may carry the user's current-conversation Goal Tree decision through the supported decision tool; it may not substitute itself for a required human approver.

## Preserve facts, assumptions, and history

- Only exact user answers and traceable repository/document facts become facts. Runtime reasoning remains an assumption until the user confirms it.
- Persist each material clarification answer before asking the next question. If the write fails, say the progress was not saved and stop.
- Accepted Contracts and completed history are immutable through ordinary execution. New scope, changed relations, and corrective work use Candidates, Rewires, or Goal Tree Proposals.
- A Proposal is historical pending work, not canonical Goal, Relation, Risk, Policy, or state. Only a supported user decision can materialize it.
- Re-read affected state after every decision or lifecycle write; do not assume the requested transition succeeded.

## Atomicity and idempotency

- Use `available → select_goal` for normal work selection; selection atomically creates both Claim and Run or neither.
- Use one Goal Tree Proposal for one complete reviewable change set, then read and check it before asking for a decision.
- Use a fresh `idempotency_key` for every changed operation. Reuse a key only for the exact same retry.
- Read structured results such as `blocked`, `pending`, conflicts, and idempotent “already” states literally. Do not report a stronger result than GoalBoard returned.

## Failure and recovery boundaries

- Do not retry unchanged denied or blocked writes in a loop. Use `goalboard_v1_explain`, choose other eligible work, or ask for the missing user decision.
- Do not take over another Runtime's live Claim, Run, clarification dialogue, or review authority.
- Release the current Runtime's Claim when it stops working.
- If MCP is unavailable, report the failure. Do not start Web, swap projects, change configuration, or use CLI/SQLite to keep working invisibly.

## Reference router

- Project connection, Desktop context, project lifecycle, Goal trash: [project-connection.md](project-connection.md)
- Draft clarification, method recall, dependencies, Goal Tree Proposals, requirement changes: [planning.md](planning.md)
- Available selection, execution, Evidence, Review, completion, failures, recovery: [execution.md](execution.md)
- Explicit Web service start/open requests: [service-start.md](service-start.md)

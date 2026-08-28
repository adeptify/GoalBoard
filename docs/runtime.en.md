# Runtime Protocol: Core Concepts, Goal Contract, and Workflow

## Core concepts

| Concept | One-liner |
| --- | --- |
| Goal | The smallest executable unit, at the same granularity as a Task, with observable or quantifiable acceptance criteria |
| Goal Tree | The user-confirmed goal breakdown; Plans and boards are derived views of it |
| Dependency | A confirmed prerequisite; a hard gate for claiming and completing work |
| Risk | Something that may block claiming or completion, and needs a human decision on how to handle it |
| Claim | A time-limited occupancy of a Goal by a Runtime, not a task assignment |
| Run | One execution, review, or revalidation process |
| Evidence | Proof mapped to acceptance criteria (tests, inspections, human confirmations, etc.) |
| Review | Self, cross, or adversarial review that must pass for work to count as done |
| Candidate | New work discovered during execution, which only the user can decide to accept |
| Rewire | A user-confirmed rearrangement of goal relationships |

A normal Runtime can only read, select, claim, execute, and submit proposals and evidence; it cannot rule on canonical Goals itself. Inferences and suggestions are not authoritative facts until the user confirms them.

## Goal Contract

A user can raise a rough idea in the current Runtime; the GoalBoard Skill uses MCP to create a title-only `draft / abstract` Goal. The clarifier Runtime reads project facts and progressively proposes completions for Outcome, Why, non-technical business logic, scope, inputs and outputs, acceptance, dependencies, risks, and Review Policy; these suggestions become an accepted Contract only after the user confirms them.

The smallest executable Goal is at the same granularity as a Task: results close within the Goal and have observable or quantifiable acceptance criteria. For example, "design the user Domain and provide testable CRUD methods" can be a leaf Goal; "make the account system good" still needs further breakdown.

An accepted Contract is never versioned in place. Later requirements create new Candidate Goals, and the user decides separately whether to accept each new Goal and whether to confirm the Rewire.

## Runtime workflow

After the unified GoalBoard Skill is invoked, it first resolves the optional Session ID and the current workspace: if the same Session is already bound, the connection is restored; otherwise, projects explicitly used in this directory before become candidates. A directory or candidate never authorizes an automatic connection, even when there is only one. However, if the current user message already explicitly asks to use GoalBoard with a named project and exactly one returned existing project unambiguously matches it, the Skill calls `context-bind` directly instead of asking the user to repeat the selection. It asks in every other case. With a Session ID the choice is saved for this Session; without one only the workspace history is recorded and the current MCP call flow continues. Setting a project as the directory default is a separate explicit decision: only when `binding_scope=workspace_default` is passed do new Sessions restore it automatically. Creating, rejecting a candidate, switching, unbinding a Session, unlinking a workspace, and deleting a project each have their own confirmations. Project deletion still protects valid Claims and unfinished Runs. This resolution never happens in the background at Runtime startup or during unrelated conversations.

Normal Skill replies first explain, in the user's current language, "what I understand, why this still needs confirmation, and what I'm asking or doing next" — never dumping MCP tool names or internal IDs. New ideas, resuming an existing Draft, and direction changes show an editable structured checkpoint that clearly separates user-confirmed facts, traceable project facts, Runtime assumptions, and suggestions; every material answer is written to a dialogue turn before the next question. When a proposal is ready, a readable Goal Tree summarizes the outcome, non-goals, relations and dependencies, leaf acceptance, risks, and post-confirmation states, and the user can decide as a whole or revise named items.

Once the project connection is clear, the current Runtime reads `available` and the selected Goal's Contract and decides on its own whether to pick an item. GoalBoard never returns "the one and only next task"; a Claim is a time-limited occupancy, not a task assignment.

```text
new rough idea:
  draft-dialogue-start → the current Runtime clarifies in natural language
  → draft-dialogue-turn on each material answer → proposal_summary
  → goal-tree-propose / read / check → the Runtime and user decide items in conversation → goal-tree-decide

existing Draft:
  contract → draft-dialogue-resume if a saved clarification session exists
  → otherwise draft-dialogue-start(goal_id) reusing the Draft and clarifying in this conversation
  → proposal / user confirmation → run-report → release

executor:
  available(next_action=execute) → contract → select-goal → implement and verify
  → run-report → evidence-submit → review-submit → complete → release

reviewer:
  available(next_action=review) → contract → select-goal
  → review-submit → run-report → release

revalidator:
  available(next_action=revalidate) → contract → select-goal
  → check Contract, active dependencies, Risks, and evidence
  → revalidate → run-report → release

direct completion:
  available(next_action=complete, role=null) → complete
  → do not select the Goal or create another Claim, Run, or duplicate Evidence

completion blocker:
  available.blocked(work_state=completion_blocked) → report the concrete completion gate and recovery condition
  → after that gate is canonically resolved, read Available again and call complete directly
```

`select-goal` creates the Claim and Run in the same SQLite transaction; a failure never leaves a fake "in progress" state with a Claim but no Run. Normal Runtime workflows use `available` and `select-goal`; `next_action=complete` is the no-Claim exception and calls `complete` directly. A Goal whose execution is finished but whose completion gate remains unresolved appears under `available.blocked` instead of being mislabeled as `execute`. `ready`, `claim`, and `run-start` exist only for low-level management or tests.

For a new idea, the Runtime doesn't require the user to open Web first or fill in a Contract field by field: `draft-dialogue-start` atomically creates a minimal `draft / abstract` Goal, a clarifier Claim, and a Run in one transaction; every material clarification step in the conversation then calls `draft-dialogue-turn` to save the user's answer, current understanding, sourced facts, assumptions, and the one next question; after an interruption, `draft-dialogue-resume` restores the session. When clarification completes, the current Runtime submits the whole confirmable breakdown/change plan once via `goal-tree-propose`, and can restore and check it across Sessions with `goal-tree-read` and `goal-tree-check`; inferences and suggestions are not canonical Goals, relations, Risks, or Policy before user confirmation. The user then confirms, rejects, or requests changes item by item in the current Runtime conversation; after the user's explicit answer, the Runtime calls `goal-tree-decide` with `user_confirmed=true`, a confirmation summary, and the concrete decisions, and GoalBoard records the audit source together with host Session metadata. This is a local conversational provenance record, not a fake cryptographic identity. Only confirmed safe items are materialized; expired, dangling, or cyclic items stay conflicted without affecting other confirmed items.

Materialization adds no second "is clarification done" state: a confirmed compound parent with children shows "clarified, waiting for children"; a confirmed minimal leaf shows "ready to execute"; only Drafts or still-open breakdowns show "needs clarification".

A normal Runtime cannot create canonical Goals, modify accepted Contracts, activate dependencies, or decide Candidates/Rewires on the user's behalf. New work discovered during execution can only be submitted as a Candidate; dependency changes can only be submitted as a Dependency Proposal with direction, basis, evidence, impact-if-rejected, and confidence.

import type { ExecutionRunRecord as RunRecord } from "@adeptify/goalboard-contracts/modules/execution";
import type { GoalRecord } from "@adeptify/goalboard-contracts/modules/goals";

import type { ExecutionValidationSnapshot as BoardSnapshot } from "./execution-validation-contract.js";

export interface ActionProjectionIndex {
  goals_by_id: Map<string, GoalRecord>;
  relations_by_goal: Map<string, BoardSnapshot["relations"]>;
  child_ids_by_parent: Map<string, string[]>;
  dependency_ids_by_goal: Map<string, string[]>;
  replacement_by_target: Map<string, BoardSnapshot["relations"][number]>;
  claims_by_goal: Map<string, BoardSnapshot["claims"]>;
  runs_by_goal: Map<string, BoardSnapshot["runs"]>;
  runs_by_claim: Map<string, BoardSnapshot["runs"]>;
  runs_by_id: Map<string, RunRecord>;
  evidence_by_goal: Map<string, BoardSnapshot["evidence"]>;
  obligations_by_goal: Map<string, BoardSnapshot["review_obligations"]>;
  reviews_by_goal: Map<string, BoardSnapshot["reviews"]>;
  risk_ids_by_goal: Map<string, Set<string>>;
  risks_by_id: Map<string, BoardSnapshot["risks"][number]>;
  started_seq_by_run: Map<string, number>;
  completed_seq_by_run: Map<string, number>;
  review_seq_by_review: Map<string, number>;
  rework_events_by_goal: Map<string, BoardSnapshot["lifecycle_events"]>;
  coverage_by_parent: Map<string, BoardSnapshot["coverage_contract_revisions"]>;
}

const projectionIndexes = new WeakMap<BoardSnapshot, ActionProjectionIndex>();

function addGrouped<T>(target: Map<string, T[]>, key: string, value: T): void {
  const current = target.get(key);
  if (current) current.push(value);
  else target.set(key, [value]);
}

export function projectionIndex(snapshot: BoardSnapshot): ActionProjectionIndex {
  const cached = projectionIndexes.get(snapshot);
  if (cached) return cached;
  const relationsByGoal = new Map<string, BoardSnapshot["relations"]>();
  const childIdsByParent = new Map<string, string[]>();
  const dependencyIdsByGoal = new Map<string, string[]>();
  const replacementByTarget = new Map<string, BoardSnapshot["relations"][number]>();
  for (const relation of snapshot.relations) {
    addGrouped(relationsByGoal, relation.from_goal_id, relation);
    if (relation.to_goal_id !== relation.from_goal_id) addGrouped(relationsByGoal, relation.to_goal_id, relation);
    if (relation.state !== "active") continue;
    if (relation.type === "part_of") addGrouped(childIdsByParent, relation.to_goal_id, relation.from_goal_id);
    if (relation.type === "depends_on") addGrouped(dependencyIdsByGoal, relation.from_goal_id, relation.to_goal_id);
    if (relation.type === "replaces" && !replacementByTarget.has(relation.to_goal_id)) {
      replacementByTarget.set(relation.to_goal_id, relation);
    }
  }
  const claimsByGoal = new Map<string, BoardSnapshot["claims"]>();
  for (const claim of snapshot.claims) addGrouped(claimsByGoal, claim.goal_id, claim);
  const runsByGoal = new Map<string, BoardSnapshot["runs"]>();
  const runsByClaim = new Map<string, BoardSnapshot["runs"]>();
  const runsById = new Map<string, RunRecord>();
  for (const run of snapshot.runs) {
    addGrouped(runsByGoal, run.goal_id, run);
    addGrouped(runsByClaim, run.claim_id, run);
    runsById.set(run.run_id, run);
  }
  const evidenceByGoal = new Map<string, BoardSnapshot["evidence"]>();
  for (const evidence of snapshot.evidence) addGrouped(evidenceByGoal, evidence.goal_id, evidence);
  const obligationsByGoal = new Map<string, BoardSnapshot["review_obligations"]>();
  for (const obligation of snapshot.review_obligations) addGrouped(obligationsByGoal, obligation.goal_id, obligation);
  const reviewsByGoal = new Map<string, BoardSnapshot["reviews"]>();
  for (const review of snapshot.reviews) addGrouped(reviewsByGoal, review.goal_id, review);
  const riskIdsByGoal = new Map<string, Set<string>>();
  for (const link of snapshot.goal_risks) {
    const ids = riskIdsByGoal.get(link.goal_id) ?? new Set<string>();
    ids.add(link.risk_id);
    riskIdsByGoal.set(link.goal_id, ids);
  }
  const startedSeqByRun = new Map<string, number>();
  const completedSeqByRun = new Map<string, number>();
  const reviewSeqByReview = new Map<string, number>();
  const reworkEventsByGoal = new Map<string, BoardSnapshot["lifecycle_events"]>();
  for (const event of snapshot.lifecycle_events) {
    if (event.type === "run.started") startedSeqByRun.set(event.object_id, event.seq);
    else if (event.type === "run.completed") completedSeqByRun.set(event.object_id, event.seq);
    else if (event.type === "review.submitted") reviewSeqByReview.set(event.object_id, event.seq);
    else if (event.type === "goal.rework_requested") addGrouped(reworkEventsByGoal, event.object_id, event);
  }
  const coverageByParent = new Map<string, BoardSnapshot["coverage_contract_revisions"]>();
  for (const coverage of snapshot.coverage_contract_revisions) {
    addGrouped(coverageByParent, coverage.parent_goal_id, coverage);
  }
  const index: ActionProjectionIndex = {
    goals_by_id: new Map(snapshot.goals.map((goal) => [goal.goal_id, goal])),
    relations_by_goal: relationsByGoal,
    child_ids_by_parent: childIdsByParent,
    dependency_ids_by_goal: dependencyIdsByGoal,
    replacement_by_target: replacementByTarget,
    claims_by_goal: claimsByGoal,
    runs_by_goal: runsByGoal,
    runs_by_claim: runsByClaim,
    runs_by_id: runsById,
    evidence_by_goal: evidenceByGoal,
    obligations_by_goal: obligationsByGoal,
    reviews_by_goal: reviewsByGoal,
    risk_ids_by_goal: riskIdsByGoal,
    risks_by_id: new Map(snapshot.risks.map((risk) => [risk.risk_id, risk])),
    started_seq_by_run: startedSeqByRun,
    completed_seq_by_run: completedSeqByRun,
    review_seq_by_review: reviewSeqByReview,
    rework_events_by_goal: reworkEventsByGoal,
    coverage_by_parent: coverageByParent,
  };
  projectionIndexes.set(snapshot, index);
  return index;
}


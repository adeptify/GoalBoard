import {
  currentRevisionCriteriaPassed,
  currentRevisionRuntimeCriteriaPassed,
  deriveGoalActionProjection,
} from "./action-projection.js";
import { recordedContractCoverageBlocksClosure } from "./goal-decomposition-validation.js";
import { compatibleContractRevisions } from "./contract-revisions.js";
import type { BoardSnapshot, ClaimRecord, GoalRecord, RunRecord } from "./types.js";

export interface LifecycleReconciliationPlan {
  release_claim: ClaimRecord | null;
  release_reason: string | null;
  satisfy_goal: boolean;
  reopen_goal: boolean;
  reopen_reason: string | null;
}

function latestRun(snapshot: BoardSnapshot, claimId: string): RunRecord | null {
  return snapshot.runs
    .filter((run) => run.claim_id === claimId)
    .sort((left, right) => left.started_at.localeCompare(right.started_at) || left.run_id.localeCompare(right.run_id))
    .at(-1) ?? null;
}

function activeClaim(goal: GoalRecord, snapshot: BoardSnapshot, now: string): ClaimRecord | null {
  return snapshot.claims
    .filter((claim) => claim.goal_id === goal.goal_id && claim.state === "active" && claim.expires_at > now)
    .sort((left, right) => left.claimed_at.localeCompare(right.claimed_at) || left.claim_id.localeCompare(right.claim_id))
    .at(-1) ?? null;
}

function roleReleaseReason(claim: ClaimRecord): string {
  if (claim.role === "executor") return "执行结果与当前 Contract revision 的必要 Evidence 已齐全，自动释放 Claim";
  if (claim.role === "revalidator") return "重新验证结果已记录，自动释放 Claim";
  if (claim.role === "clarifier") return "完整 Proposal 已提交，自动释放 Claim";
  return "Review 已提交，自动释放 Reviewer Claim";
}

function shouldReleaseClaim(goal: GoalRecord, snapshot: BoardSnapshot, claim: ClaimRecord): boolean {
  const run = latestRun(snapshot, claim.claim_id);
  if (!run) return false;
  if (run.state === "failed" || run.state === "abandoned") return true;
  if (run.state !== "completed") return false;
  if (!compatibleContractRevisions(goal, snapshot).has(claim.contract_revision)) return true;
  if (claim.role === "executor") return currentRevisionRuntimeCriteriaPassed(goal, snapshot);
  if (claim.role === "revalidator") return goal.validity_state === "valid";
  if (claim.role === "clarifier") {
    return snapshot.goal_tree_proposals.some((proposal) =>
      proposal.discovered_in_run_id === run.run_id && proposal.items.length > 0
    ) || snapshot.contract_proposals.some((proposal) => proposal.discovered_in_run_id === run.run_id);
  }
  return snapshot.reviews.some((review) =>
    review.goal_id === goal.goal_id && review.claim_id === claim.claim_id
  );
}

function currentHumanVerdictFailed(goal: GoalRecord, snapshot: BoardSnapshot): boolean {
  const compatibleRevisions = compatibleContractRevisions(goal, snapshot);
  const humanCriteria = goal.acceptance_criteria
    .filter((criterion) => criterion.decision_method === "human_decision")
    .map((criterion) => criterion.criterion_id);
  return humanCriteria.some((criterionId) => snapshot.evidence
    .filter((evidence) =>
      evidence.goal_id === goal.goal_id &&
      compatibleRevisions.has(evidence.contract_revision) &&
      evidence.kind === "human_verdict" &&
      evidence.lifecycle_state === "effective" &&
      evidence.criterion_ids.includes(criterionId)
    )
    .sort((left, right) => left.captured_at.localeCompare(right.captured_at) || left.evidence_id.localeCompare(right.evidence_id))
    .at(-1)?.result === "failed");
}

function compoundCanComplete(goal: GoalRecord, snapshot: BoardSnapshot): boolean {
  if (goal.decomposition_state !== "closed_compound") return false;
  if (recordedContractCoverageBlocksClosure(goal, snapshot)) return false;
  const byId = new Map(snapshot.goals.map((candidate) => [candidate.goal_id, candidate]));
  const childIds = snapshot.relations
    .filter((relation) => relation.state === "active" && relation.type === "part_of" && relation.to_goal_id === goal.goal_id)
    .map((relation) => relation.from_goal_id);
  if (childIds.length === 0) return false;
  const parentRevisions = compatibleContractRevisions(goal, snapshot);
  return childIds.every((childId) => {
    const child = byId.get(childId);
    if (!child || child.fulfillment_state !== "satisfied" || child.validity_state !== "valid") return false;
    const childRevisions = compatibleContractRevisions(child, snapshot);
    return snapshot.coverage_contract_revisions.some((coverage) =>
      coverage.parent_goal_id === goal.goal_id &&
      coverage.child_goal_id === childId &&
      parentRevisions.has(coverage.parent_contract_revision) &&
      childRevisions.has(coverage.child_contract_revision)
    );
  });
}

function compoundMustReopen(goal: GoalRecord, snapshot: BoardSnapshot): boolean {
  if (goal.decomposition_state !== "closed_compound" || goal.fulfillment_state !== "satisfied") return false;
  return !compoundCanComplete(goal, snapshot);
}

export function planGoalLifecycleReconciliation(
  goal: GoalRecord,
  snapshot: BoardSnapshot,
  now = new Date().toISOString(),
): LifecycleReconciliationPlan {
  const claim = activeClaim(goal, snapshot, now);
  const releaseClaim = claim && shouldReleaseClaim(goal, snapshot, claim) ? claim : null;
  const projection = deriveGoalActionProjection(goal, snapshot, now);
  const compatibleRevisions = compatibleContractRevisions(goal, snapshot);
  const onlyCompletionRepairRemains = projection.actions.every((item) =>
    item.kind === "repair" &&
    item.reasons.some((reason) => reason.code === "action.completion_reconciliation_required")
  );
  const canSatisfyLeaf =
    goal.definition_state === "accepted" &&
    goal.decomposition_state === "closed_leaf" &&
    goal.validity_state === "valid" &&
    currentRevisionCriteriaPassed(goal, snapshot) &&
    snapshot.review_obligations
      .filter((obligation) =>
        obligation.goal_id === goal.goal_id && compatibleRevisions.has(obligation.contract_revision)
      )
      .every((obligation) => obligation.state === "satisfied" || obligation.state === "waived") &&
    onlyCompletionRepairRemains;
  const canSatisfyCompound = compoundCanComplete(goal, snapshot) && projection.actions.length === 0;
  const reopenForHuman = goal.fulfillment_state === "satisfied" && currentHumanVerdictFailed(goal, snapshot);
  const reopenForCompound = compoundMustReopen(goal, snapshot);
  const reopenForBlockingRisk = goal.fulfillment_state === "satisfied" && projection.actions.some((item) =>
    item.kind === "accept_risk" || item.kind === "mitigate_risk"
  );
  return {
    release_claim: releaseClaim,
    release_reason: releaseClaim ? roleReleaseReason(releaseClaim) : null,
    satisfy_goal:
      goal.fulfillment_state !== "satisfied" &&
      !claim &&
      (canSatisfyLeaf || canSatisfyCompound),
    reopen_goal: reopenForHuman || reopenForCompound || reopenForBlockingRisk,
    reopen_reason: reopenForHuman
      ? "新的用户验收推翻了先前结果"
      : reopenForCompound
        ? "子 Goal 或 Contract coverage 已变化，父 Goal 需要重新确认"
        : reopenForBlockingRisk
          ? "新的阻塞风险需要先处理，旧完成结论暂时重新打开"
        : null,
  };
}

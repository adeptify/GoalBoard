import { recordedContractCoverageBlocksClosure } from "@adeptify/goalboard-module-goals";
import { humanReviewAttentionToken } from "./human-review.js";
import {
  criterionHasPassingResult,
  currentEffectiveEvidence,
} from "@adeptify/goalboard-module-evidence-verification";
import {
  actionContractRevision,
  compatibleContractRevisions,
} from "./contract-revisions.js";
import type { GoalRecord } from "@adeptify/goalboard-contracts/modules/goals";
import type { ExecutionRunRecord as RunRecord } from "@adeptify/goalboard-contracts/modules/execution";
import type { ReviewObligationRecord } from "@adeptify/goalboard-contracts/modules/governance-collaboration";
import type {
  ExecutionValidationSnapshot as BoardSnapshot,
  CompactGoalActionProjection,
  GoalAction,
  GoalActionProjection,
  GoalDisplayStatus,
} from "./execution-validation-contract.js";
import { projectionIndex } from "./action-projection-index.js";
import {
  actionProjectionDigest as digest,
  actionProjectionReason as decisionReason,
  compareGoalActions as compareActions,
  createGoalAction as action,
} from "./action-projection-factory.js";

function structuralRepairActions(goal: GoalRecord, snapshot: BoardSnapshot): GoalAction[] {
  const childIds = [...(projectionIndex(snapshot).child_ids_by_parent.get(goal.goal_id) ?? [])].sort();
  if (goal.decomposition_state === "closed_leaf" && childIds.length > 0) {
    return [action(
      goal,
      "runtime",
      "repair",
      "blocked",
      "goal",
      goal.goal_id,
      [decisionReason(
        "action.leaf_has_children",
        "goal",
        goal.goal_id,
        "这个 Goal 被标记为叶子，但仍挂着生效的子 Goal",
        "先修复 Goal Tree 结构；系统不会把它误当作普通执行任务。",
        { child_goal_ids: childIds },
      )],
    )];
  }
  if (goal.decomposition_state === "closed_compound" && childIds.length === 0) {
    return [action(
      goal,
      "runtime",
      "repair",
      "blocked",
      "goal",
      goal.goal_id,
      [decisionReason(
        "action.compound_children_missing",
        "goal",
        goal.goal_id,
        "这个 Goal 被标记为复合目标，但没有生效的子 Goal",
        "补充子 Goal，或把 Contract 修订为叶子 Goal。",
      )],
    )];
  }
  return [];
}

function activeClaimFor(goal: GoalRecord, snapshot: BoardSnapshot, now: string) {
  return (projectionIndex(snapshot).claims_by_goal.get(goal.goal_id) ?? [])
    .filter((claim) =>
      claim.goal_id === goal.goal_id && claim.state === "active" && claim.expires_at > now
    )
    .sort((left, right) => left.claimed_at.localeCompare(right.claimed_at) || left.claim_id.localeCompare(right.claim_id))
    .at(-1) ?? null;
}

function latestRunForClaim(snapshot: BoardSnapshot, claimId: string): RunRecord | null {
  return (projectionIndex(snapshot).runs_by_claim.get(claimId) ?? [])
    .sort((left, right) => left.started_at.localeCompare(right.started_at) || left.run_id.localeCompare(right.run_id))
    .at(-1) ?? null;
}

function workRunFor(goal: GoalRecord, snapshot: BoardSnapshot): RunRecord | null {
  const index = projectionIndex(snapshot);
  const compatibleRevisions = compatibleContractRevisions(goal, snapshot);
  const currentClaimIds = new Set((index.claims_by_goal.get(goal.goal_id) ?? [])
    .filter((claim) =>
      compatibleRevisions.has(claim.contract_revision)
    )
    .map((claim) => claim.claim_id));
  return (index.runs_by_goal.get(goal.goal_id) ?? [])
    .filter((run) =>
      currentClaimIds.has(run.claim_id) &&
      (run.role === "executor" || run.role === "revalidator")
    )
    .sort((left, right) =>
      (index.started_seq_by_run.get(left.run_id) ?? 0) - (index.started_seq_by_run.get(right.run_id) ?? 0) ||
      left.started_at.localeCompare(right.started_at) ||
      left.run_id.localeCompare(right.run_id)
    )
    .at(-1) ?? null;
}

function currentEvidence(goal: GoalRecord, snapshot: BoardSnapshot) {
  return currentEffectiveEvidence({
    goal_id: goal.goal_id,
    compatible_contract_revisions: [...compatibleContractRevisions(goal, snapshot)],
    evidence: projectionIndex(snapshot).evidence_by_goal.get(goal.goal_id) ?? [],
  });
}

function criterionPassed(goal: GoalRecord, snapshot: BoardSnapshot, criterionId: string): boolean {
  const criterion = goal.acceptance_criteria.find((item) => item.criterion_id === criterionId);
  return criterionHasPassingResult({
    criterion_id: criterionId,
    decision_method: criterion?.decision_method ?? "automated_check",
    evidence: currentEvidence(goal, snapshot),
  });
}

export function currentRevisionCriteriaPassed(goal: GoalRecord, snapshot: BoardSnapshot): boolean {
  return goal.acceptance_criteria.length > 0 &&
    goal.acceptance_criteria.every((criterion) => criterionPassed(goal, snapshot, criterion.criterion_id));
}

export function currentRevisionRuntimeCriteriaPassed(goal: GoalRecord, snapshot: BoardSnapshot): boolean {
  return goal.acceptance_criteria
    .filter((criterion) => criterion.decision_method !== "human_decision")
    .every((criterion) => criterionPassed(goal, snapshot, criterion.criterion_id));
}

function pendingObligations(goal: GoalRecord, snapshot: BoardSnapshot): ReviewObligationRecord[] {
  const compatibleRevisions = compatibleContractRevisions(goal, snapshot);
  return (projectionIndex(snapshot).obligations_by_goal.get(goal.goal_id) ?? []).filter((obligation) =>
    compatibleRevisions.has(obligation.contract_revision) &&
    obligation.state === "pending"
  );
}

function reworkRequested(goal: GoalRecord, snapshot: BoardSnapshot): boolean {
  const index = projectionIndex(snapshot);
  const latestWork = workRunFor(goal, snapshot);
  if (!latestWork) return false;
  const latestChangeRequest = (index.reviews_by_goal.get(goal.goal_id) ?? [])
    .filter((review) => review.verdict === "needs_changes")
    .sort((left, right) => left.submitted_at.localeCompare(right.submitted_at) || left.review_id.localeCompare(right.review_id))
    .at(-1);
  const latestExplicit = (index.rework_events_by_goal.get(goal.goal_id) ?? [])
    .at(-1);
  const latestReviewEvent = latestChangeRequest == null
    ? null
    : index.review_seq_by_review.get(latestChangeRequest.review_id) ?? null;
  const workCompletedSeq = index.completed_seq_by_run.get(latestWork.run_id) ?? null;
  const requestedSeq = Math.max(latestExplicit?.seq ?? 0, latestReviewEvent ?? 0);
  if (requestedSeq > 0 && workCompletedSeq != null) return requestedSeq > workCompletedSeq;
  const requestedAt = [latestChangeRequest?.submitted_at, latestExplicit?.at]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  if (!requestedAt) return false;
  return !latestWork.ended_at || requestedAt > latestWork.ended_at;
}

function pendingContractActions(goal: GoalRecord, snapshot: BoardSnapshot): GoalAction[] {
  return snapshot.goal_tree_proposals.flatMap((proposal) =>
    proposal.items
      .filter((item) =>
        item.kind === "contract" &&
        item.operation === "update" &&
        (item.state === "pending" || item.state === "conflict") &&
        (
          item.affected_objects.some((affected) => affected.object_type === "goal" && affected.object_id === goal.goal_id) ||
          String(item.payload.goal_id ?? "") === goal.goal_id ||
          String((item.payload.goal as Record<string, unknown> | undefined)?.goal_id ?? "") === goal.goal_id
        )
      )
      .map((item) => action(
        goal,
        item.state === "conflict" ? "runtime" : "user",
        item.state === "conflict" ? "clarify" : "revise",
        "ready",
        "goal_tree_proposal_item",
        item.item_id,
        item.state === "conflict"
          ? [decisionReason(
              "action.contract_revision_conflict",
              "goal_tree_proposal_item",
              item.item_id,
              "需求修订基线已经变化，需要先刷新后再确认",
              "重新打开当前修订 Proposal，按最新 Contract 调整后再确认。",
            )]
          : [],
      )),
  );
}

function pendingUserDecisionActions(goal: GoalRecord, snapshot: BoardSnapshot): GoalAction[] {
  const index = projectionIndex(snapshot);
  const runGoal = (runId: string | null | undefined): string | null =>
    runId ? index.runs_by_id.get(runId)?.goal_id ?? null : null;
  const actions: GoalAction[] = [];

  for (const proposal of snapshot.goal_tree_proposals.filter((item) =>
    item.origin === "native" && item.items.some((proposalItem) =>
      proposalItem.state === "pending" || proposalItem.state === "conflict"
    )
  )) {
    const relevantItems = proposal.items.filter((item) =>
      (item.state === "pending" || item.state === "conflict") &&
      (
        item.affected_objects.some((affected) => affected.object_type === "goal" && affected.object_id === goal.goal_id) ||
        String(item.payload.goal_id ?? "") === goal.goal_id ||
        String((item.payload.goal as Record<string, unknown> | undefined)?.goal_id ?? "") === goal.goal_id
      )
    );
    if (relevantItems.length === 0) continue;
    if (relevantItems.every((item) => item.kind === "contract" && item.operation === "update")) continue;
    const conflicted = relevantItems.some((item) => item.state === "conflict");
    actions.push(action(
      goal,
      conflicted ? "runtime" : "user",
      conflicted ? "clarify" : "revise",
      "ready",
      "goal_tree_proposal",
      proposal.proposal_id,
      [decisionReason(
        conflicted ? "action.goal_tree_decision_conflict" : "action.goal_tree_decision_required",
        "goal_tree_proposal",
        proposal.proposal_id,
        conflicted ? "待确认的 Goal Tree 方案已经与当前事实冲突" : "有一份会改变这条 Goal 的方案等待你的决定",
        conflicted ? "刷新方案并解决冲突后再确认。" : "在 Decision Center 采用或退回修改。",
      )],
    ));
  }

  for (const proposal of snapshot.contract_proposals.filter((item) =>
    item.goal_id === goal.goal_id && item.state === "pending"
  )) {
    actions.push(action(
      goal,
      "user",
      "revise",
      "ready",
      "contract_proposal",
      proposal.proposal_id,
      [decisionReason(
        "action.contract_decision_required",
        "contract_proposal",
        proposal.proposal_id,
        "新的目标说明等待你的确认",
        "在 Decision Center 确认或退回修改。",
      )],
    ));
  }

  for (const candidate of snapshot.candidates.filter((item) =>
    item.state === "pending" &&
    (item.proposed_goal.goal_id === goal.goal_id || runGoal(item.discovered_in_run_id) === goal.goal_id)
  )) {
    actions.push(action(
      goal,
      "user",
      "revise",
      "ready",
      "candidate",
      candidate.candidate_id,
      [decisionReason(
        "action.candidate_decision_required",
        "candidate",
        candidate.candidate_id,
        "发现了一条候选 Goal，等待你决定是否纳入",
        "在 Decision Center 采用或拒绝候选项。",
      )],
    ));
  }

  for (const rewire of snapshot.rewires.filter((item) => {
    if (item.state !== "pending") return false;
    if (rewireGoalIds(item).has(goal.goal_id)) return true;
    const candidate = item.candidate_id
      ? snapshot.candidates.find((candidateItem) => candidateItem.candidate_id === item.candidate_id)
      : null;
    if (candidate && runGoal(candidate.discovered_in_run_id) === goal.goal_id) return true;
    return runGoal(String(item.proposal.discovered_in_run_id ?? "")) === goal.goal_id;
  })) {
    actions.push(action(
      goal,
      "user",
      "revise",
      "ready",
      "rewire",
      rewire.rewire_id,
      [decisionReason(
        "action.rewire_decision_required",
        "rewire",
        rewire.rewire_id,
        "Goal 的依赖或归属关系等待你的决定",
        "在 Decision Center 确认或退回关系调整。",
      )],
    ));
  }
  return actions;
}

function rewireGoalIds(rewire: BoardSnapshot["rewires"][number]): Set<string> {
  const ids = new Set<string>();
  if (typeof rewire.proposal.formal_goal_id === "string") ids.add(rewire.proposal.formal_goal_id);
  for (const relation of rewire.proposal.relations ?? []) {
    if (typeof relation.from_goal_id === "string") ids.add(relation.from_goal_id);
    if (typeof relation.to_goal_id === "string") ids.add(relation.to_goal_id);
  }
  return ids;
}

function dependencyActions(goal: GoalRecord, snapshot: BoardSnapshot): GoalAction[] {
  const index = projectionIndex(snapshot);
  const dependencies = (index.dependency_ids_by_goal.get(goal.goal_id) ?? [])
    .map((goalId) => index.goals_by_id.get(goalId))
    .filter((candidate): candidate is GoalRecord => candidate != null)
    .filter((candidate) =>
      candidate.fulfillment_state !== "satisfied" || candidate.validity_state !== "valid"
    );
  if (dependencies.length === 0) return [];
  return [action(
    goal,
    "runtime",
    "wait",
    "blocked",
    "dependency_set",
    digest(dependencies.map((item) => [item.goal_id, item.current_contract_revision]), 20),
    dependencies.map((dependency) => decisionReason(
      "wait.dependency",
      "goal",
      dependency.goal_id,
      `等待前置 Goal「${dependency.title}」形成可信结果`,
      "先推进前置 Goal；完成后本 Goal 会自动变为可继续。",
    )),
  )];
}

function compoundActions(goal: GoalRecord, snapshot: BoardSnapshot): GoalAction[] {
  if (goal.decomposition_state !== "closed_compound") return [];
  const index = projectionIndex(snapshot);
  const childIds = [...(index.child_ids_by_parent.get(goal.goal_id) ?? [])].sort();
  if (childIds.length === 0 || recordedContractCoverageBlocksClosure(goal, snapshot)) {
    return [action(
      goal,
      "runtime",
      "clarify",
      "blocked",
      "goal",
      goal.goal_id,
      [decisionReason(
        "action.compound_coverage_missing",
        "goal",
        goal.goal_id,
        "父 Goal 的子目标覆盖记录还不完整",
        "补齐子 Goal 或 Contract coverage 后继续。",
      )],
    )];
  }
  const parentRevisions = compatibleContractRevisions(goal, snapshot);
  const coverage = index.coverage_by_parent.get(goal.goal_id) ?? [];
  const staleCoverage = childIds.filter((childId) => {
    const child = index.goals_by_id.get(childId);
    if (!child) return true;
    const childRevisions = compatibleContractRevisions(child, snapshot);
    return !coverage.some((item) =>
      item.child_goal_id === childId &&
      parentRevisions.has(item.parent_contract_revision) &&
      childRevisions.has(item.child_contract_revision)
    );
  });
  if (staleCoverage.length > 0) {
    return [action(
      goal,
      "runtime",
      "clarify",
      "ready",
      "coverage",
      digest(staleCoverage, 20),
      [decisionReason(
        "action.coverage_revision_stale",
        "goal",
        goal.goal_id,
        "子 Goal 的要求已经更新，需要重新核对父子覆盖",
        "只核对受影响的 coverage，并通过正式 Contract revision Proposal 提交；不要重做未受影响的工作。",
        { child_goal_ids: staleCoverage },
      )],
    )];
  }
  const unfinished = childIds
    .map((childId) => index.goals_by_id.get(childId))
    .filter((child): child is GoalRecord =>
      child != null && (child.fulfillment_state !== "satisfied" || child.validity_state !== "valid")
    );
  if (unfinished.length === 0) return [];
  return [action(
    goal,
    "runtime",
    "wait",
    "blocked",
    "child_goal_set",
    digest(unfinished.map((item) => [item.goal_id, item.current_contract_revision]), 20),
    unfinished.map((child) => decisionReason(
      "wait.child_goal",
      "goal",
      child.goal_id,
      `等待子 Goal「${child.title}」形成可信结果`,
      "先推进子 Goal；完成后父 Goal 会自动重新计算。",
    )),
  )];
}

function riskActions(goal: GoalRecord, snapshot: BoardSnapshot): GoalAction[] {
  const index = projectionIndex(snapshot);
  return [...(index.risk_ids_by_goal.get(goal.goal_id) ?? [])]
    .map((riskId) => index.risks_by_id.get(riskId))
    .filter((risk): risk is BoardSnapshot["risks"][number] =>
      risk != null &&
      (risk.state === "open" || risk.state === "triggered") &&
      risk.blocking_mode !== "none" &&
      risk.treatment !== "defer"
    )
    .map((risk) => {
      if (risk.treatment === "accept") {
        return action(
          goal,
          "user",
          "accept_risk",
          "ready",
          "risk",
          risk.risk_id,
          [decisionReason(
            "action.risk_acceptance_required",
            "risk",
            risk.risk_id,
            risk.description,
            "只有用户可以接受残余风险；也可以拒绝并改为缓解或避免。",
          )],
        );
      }
      return action(
        goal,
        "runtime",
        "mitigate_risk",
        "ready",
        "risk",
        risk.risk_id,
        [decisionReason(
          "action.risk_mitigation_required",
          "risk",
          risk.risk_id,
          risk.description,
          risk.treatment_plan || risk.revisit_condition,
        )],
      );
    });
}

function reviewActions(goal: GoalRecord, snapshot: BoardSnapshot, obligations: ReviewObligationRecord[]): GoalAction[] {
  return obligations.map((obligation) => action(
    goal,
    obligation.role === "human_approver" ? "user" : "runtime",
    "review",
    "ready",
    "review_obligation",
    obligation.obligation_id,
    obligation.role === "human_approver"
      ? [decisionReason(
          "action.human_review_required",
          "review_obligation",
          obligation.obligation_id,
          "工程检查已经完成，现在只等你的验收",
          "在当前可信对话中明确通过或要求修改；唯一且有效时会一次完成记录。",
          {
            criterion_ids: obligation.criterion_scope,
            attention_token: humanReviewAttentionToken(goal, obligation, snapshot),
          },
        )]
      : [],
  ));
}

function missingHumanCriteriaAction(goal: GoalRecord, snapshot: BoardSnapshot): GoalAction | null {
  const missing = goal.acceptance_criteria
    .filter((criterion) => criterion.decision_method === "human_decision")
    .filter((criterion) => !criterionPassed(goal, snapshot, criterion.criterion_id))
    .map((criterion) => criterion.criterion_id)
    .sort();
  if (missing.length === 0) return null;
  return action(
    goal,
    "runtime",
    "repair",
    "blocked",
    "goal",
    goal.goal_id,
    [decisionReason(
      "action.human_obligation_missing",
      "goal",
      goal.goal_id,
      "这条旧数据缺少可提交的用户验收事项",
      "先补建当前 Contract revision 的 Human Review obligation；不要让用户面对一个无法提交的按钮。",
      { criterion_ids: missing },
    )],
  );
}

function displayStatus(goal: GoalRecord, primary: GoalAction | null): GoalDisplayStatus {
  if (primary?.actor === "user" && primary.status !== "blocked") return "waiting_user";
  if (primary?.status === "active") return "in_progress";
  if (primary?.status === "blocked") {
    return primary.kind === "wait" ? "waiting" : "blocked";
  }
  if (primary?.actor === "runtime") return primary.kind === "wait" ? "waiting" : "continue";
  if (goal.fulfillment_state === "satisfied" && goal.validity_state === "valid") return "completed";
  if (goal.archived_at || goal.trashed_at) return "completed";
  return "blocked";
}

function canonicalActionFacts(goal: GoalRecord, snapshot: BoardSnapshot, actions: GoalAction[], now: string) {
  const index = projectionIndex(snapshot);
  const claim = activeClaimFor(goal, snapshot, now);
  const compatibleRevisions = compatibleContractRevisions(goal, snapshot);
  const riskIds = index.risk_ids_by_goal.get(goal.goal_id) ?? new Set<string>();
  const actionRelations = (index.relations_by_goal.get(goal.goal_id) ?? []).filter((relation) =>
    relation.state === "active" &&
      (relation.type === "part_of" || relation.type === "depends_on" || relation.type === "replaces"));
  const relatedGoalIds = new Set(actionRelations
    .flatMap((relation) => [relation.from_goal_id, relation.to_goal_id]));
  const currentObligationIds = new Set((index.obligations_by_goal.get(goal.goal_id) ?? [])
    .filter((item) => compatibleRevisions.has(item.contract_revision))
    .map((item) => item.obligation_id));
  return {
    goal: {
      goal_id: goal.goal_id,
      action_contract_revision: actionContractRevision(goal, snapshot),
      definition_state: goal.definition_state,
      decomposition_state: goal.decomposition_state,
      validity_state: goal.validity_state,
      fulfillment_state: goal.fulfillment_state,
      trashed_at: goal.trashed_at,
      archived_at: goal.archived_at,
    },
    actions: actions.map(({ action_id, actor, kind, status, target_type, target_id }) => ({
      action_id,
      actor,
      kind,
      status,
      target_type,
      target_id,
    })),
    claim: claim ? {
      claim_id: claim.claim_id,
      state: claim.state,
      expires_at: claim.expires_at,
      action_contract_revision: actionContractRevision(goal, snapshot),
      action_kind: claim.action_kind,
      action_target_id: claim.action_target_id,
      run: latestRunForClaim(snapshot, claim.claim_id),
    } : null,
    evidence: currentEvidence(goal, snapshot).map((item) => [
      item.evidence_id,
      item.criterion_ids,
      item.kind,
      item.result,
      item.lifecycle_state,
    ]),
    obligations: (index.obligations_by_goal.get(goal.goal_id) ?? [])
      .filter((item) => compatibleRevisions.has(item.contract_revision))
      .map((item) => [item.obligation_id, item.role, item.state, item.criterion_scope]),
    reviews: (index.reviews_by_goal.get(goal.goal_id) ?? [])
      .filter((item) => currentObligationIds.has(item.obligation_id))
      .map((item) => [item.review_id, item.obligation_id, item.verdict, item.submitted_at]),
    risks: [...riskIds]
      .map((riskId) => index.risks_by_id.get(riskId))
      .filter((item): item is BoardSnapshot["risks"][number] =>
        item != null &&
        (item.state === "open" || item.state === "triggered") &&
        item.blocking_mode !== "none" &&
        item.treatment !== "defer"
      )
      .map((item) => [
        item.risk_id,
        item.treatment,
        item.blocking_mode,
        item.state,
        item.description,
        item.treatment_plan,
        item.revisit_condition,
      ]),
    relations: actionRelations.map((item) => [
      item.relation_id,
      item.type,
      item.from_goal_id,
      item.to_goal_id,
      item.state,
    ]),
    related_goals: [...relatedGoalIds]
      .map((goalId) => index.goals_by_id.get(goalId))
      .filter((item): item is GoalRecord => item != null)
      .map((item) => [item.goal_id, actionContractRevision(item, snapshot), item.validity_state, item.fulfillment_state]),
    pending_contract_items: pendingContractActions(goal, snapshot).map((item) => item.action_id),
  };
}

export function deriveGoalActionProjection(
  goal: GoalRecord,
  snapshot: BoardSnapshot,
  now = new Date().toISOString(),
): GoalActionProjection {
  const actions: GoalAction[] = [];
  const pendingContract = pendingContractActions(goal, snapshot);
  actions.push(...pendingContract);
  actions.push(...pendingUserDecisionActions(goal, snapshot));

  const replacement = projectionIndex(snapshot).replacement_by_target.get(goal.goal_id);
  if (goal.trashed_at || goal.archived_at || replacement) {
    // Disposition is separate from work. Historical pending items remain in
    // the audit log, but an archived, trashed or replaced Goal never exposes
    // a ghost work action.
    const ordered: GoalAction[] = [];
    return {
      goal_id: goal.goal_id,
      contract_revision: goal.current_contract_revision,
      progress: goal.fulfillment_state === "satisfied" ? "verified" : "work_recorded",
      primary_action: ordered[0] ?? null,
      actions: ordered,
      action_token: digest(canonicalActionFacts(goal, snapshot, ordered, now)),
      display_status: "completed",
    };
  }
  if (goal.validity_state === "invalidated") {
    actions.push(action(
      goal,
      "user",
      "repair",
      "blocked",
      "goal",
      goal.goal_id,
      [decisionReason(
        "action.goal_invalidated",
        "goal",
        goal.goal_id,
        "Goal 已失效，不能继续使用旧 Contract",
        "重新澄清或确认修订后恢复。",
      )],
    ));
  }
  actions.push(...structuralRepairActions(goal, snapshot));
  // Risk is an independent capability. Keep it in the action array even when
  // execution or review remains the stable primary action, so Decision Center
  // never has to rediscover Risk gates by scanning raw records.
  actions.push(...riskActions(goal, snapshot));

  const claim = activeClaimFor(goal, snapshot, now);
  if (claim) {
    const run = latestRunForClaim(snapshot, claim.claim_id);
    const kind = claim.action_kind ?? (
      claim.role === "clarifier" ? "clarify"
        : claim.role === "revalidator" ? "revalidate"
        : claim.role === "executor" ? "execute"
        : "review"
    );
    if (!run) {
      actions.push(action(
        goal,
        "runtime",
        "repair",
        "blocked",
        "claim",
        claim.claim_id,
        [decisionReason(
          "action.run_missing",
          "claim",
          claim.claim_id,
          "工作已经被领取，但 Run 没有成功开始",
          "继续启动当前工作，或显式释放后交接。",
        )],
      ));
    } else if (run.state === "started" || run.state === "blocked") {
      actions.push(action(
        goal,
        "runtime",
        kind,
        run.state === "blocked" ? "blocked" : "active",
        claim.action_target_id ? "action_target" : "run",
        claim.action_target_id ?? run.run_id,
        run.state === "blocked"
          ? [decisionReason(
              "action.run_blocked",
              "run",
              run.run_id,
              run.block_reason ?? "当前工作受阻",
              "解决卡点后继续；需要交接时可显式释放。",
            )]
          : [],
      ));
      const remainingSeconds = Math.max(0, Math.ceil((Date.parse(claim.expires_at) - Date.parse(now)) / 1000));
      const leaseSeconds = Math.max(1, Math.ceil((Date.parse(claim.expires_at) - Date.parse(claim.renewed_at ?? claim.claimed_at)) / 1000));
      if (remainingSeconds <= Math.min(300, Math.ceil(leaseSeconds / 3))) {
        actions.push(action(goal, "runtime", "renew", "ready", "claim", claim.claim_id));
      }
    } else if (run.state === "completed") {
      if (claim.role === "executor" && !currentRevisionRuntimeCriteriaPassed(goal, snapshot)) {
        actions.push(action(
          goal,
          "runtime",
          "submit_evidence",
          "active",
          "run",
          run.run_id,
          [decisionReason(
            "action.evidence_incomplete",
            "run",
            run.run_id,
            "执行已经完成，还需要补齐完成依据",
            "提交当前 Contract revision 所需的最后一条 Evidence 后会自动释放工作。",
          )],
        ));
      } else {
        actions.push(action(
          goal,
          "runtime",
          "release",
          "ready",
          "claim",
          claim.claim_id,
          [decisionReason(
            "action.auto_release_repair",
            "claim",
            claim.claim_id,
            "本阶段产物已齐全，系统应自动释放工作",
            "这是兼容修复动作；正常新写入会在同一事务自动完成。",
          )],
        ));
      }
    }
  }

  if (
    !claim &&
    pendingContract.length === 0 &&
    actions.every((item) => item.kind !== "repair")
  ) {
    if (goal.definition_state !== "accepted" || goal.decomposition_state === "abstract" || goal.decomposition_state === "frontier_open" || goal.acceptance_criteria.length === 0) {
      actions.push(action(goal, "runtime", "clarify", "ready", "goal", goal.goal_id));
    } else if (goal.validity_state === "needs_revalidation") {
      actions.push(action(goal, "runtime", "revalidate", "ready", "goal", goal.goal_id));
    } else {
      const compound = compoundActions(goal, snapshot);
      const dependencies = dependencyActions(goal, snapshot);
      actions.push(...compound, ...dependencies);
      if (compound.length === 0 && dependencies.length === 0 && goal.decomposition_state !== "closed_compound") {
        const latestWork = workRunFor(goal, snapshot);
        if (reworkRequested(goal, snapshot)) {
          actions.push(action(
            goal,
            "runtime",
            "execute",
            "ready",
            "goal",
            goal.goal_id,
            [decisionReason(
              "action.rework_requested",
              "goal",
              goal.goal_id,
              "上次执行已完成，评审要求调整",
              "保留原 Run、Evidence 和 Review，按反馈继续修改。",
            )],
          ));
        } else if (latestWork?.state === "completed") {
          if (!currentRevisionRuntimeCriteriaPassed(goal, snapshot)) {
            actions.push(action(
              goal,
              "runtime",
              "submit_evidence",
              "ready",
              "goal",
              goal.goal_id,
              [decisionReason(
                "action.evidence_incomplete",
                "goal",
                goal.goal_id,
                "执行已经完成，还需要补齐完成依据",
                "领取这项受限工作并补齐当前 Contract revision 的必要 Evidence；依据齐全后才会进入 Review。",
              )],
            ));
          } else {
            const obligations = pendingObligations(goal, snapshot);
            const runtimeObligations = obligations.filter((item) => item.role !== "human_approver");
            const humanObligations = obligations.filter((item) => item.role === "human_approver");
            if (runtimeObligations.length > 0) actions.push(...reviewActions(goal, snapshot, runtimeObligations));
            else if (humanObligations.length > 0) actions.push(...reviewActions(goal, snapshot, humanObligations));
            else {
              const humanCriteria = missingHumanCriteriaAction(goal, snapshot);
              if (humanCriteria) actions.push(humanCriteria);
              else actions.push(...riskActions(goal, snapshot));
            }
          }
        } else if (goal.fulfillment_state !== "satisfied") {
          const revision = snapshot.goal_contract_revisions.find((item) =>
            item.goal_id === goal.goal_id && item.revision === goal.current_contract_revision
          );
          actions.push(action(
            goal,
            "runtime",
            "execute",
            "ready",
            "goal",
            goal.goal_id,
            revision?.effect === "rework" && revision.revision > 1
              ? [decisionReason(
                  "action.contract_rework_required",
                  "goal",
                  goal.goal_id,
                  "需求已更新，需要按新要求修改",
                  "旧 Run、Evidence 和 Review 保留为历史；本次只补新 revision 所需工作。",
                )]
              : [],
          ));
        }
      }
    }
  }

  if (
    actions.length === 0 &&
    goal.fulfillment_state !== "satisfied" &&
    goal.definition_state === "accepted" &&
    goal.decomposition_state === "closed_leaf" &&
    goal.validity_state === "valid" &&
    currentRevisionCriteriaPassed(goal, snapshot) &&
    pendingObligations(goal, snapshot).length === 0
  ) {
    actions.push(action(
      goal,
      "runtime",
      "repair",
      "ready",
      "goal",
      goal.goal_id,
      [decisionReason(
        "action.completion_reconciliation_required",
        "goal",
        goal.goal_id,
        "完成条件已经满足，但旧数据尚未写入完成结果",
        "使用兼容完成入口触发一次状态修复；新流程会在原写入事务里自动完成。",
      )],
    ));
  }

  const ordered = actions
    .filter((item, index, items) => items.findIndex((candidate) => candidate.action_id === item.action_id) === index)
    .sort(compareActions);
  const workRun = workRunFor(goal, snapshot);
  const criteriaPassed = currentRevisionCriteriaPassed(goal, snapshot);
  const progress = goal.fulfillment_state === "satisfied" && goal.validity_state === "valid"
    ? "verified"
    : criteriaPassed && pendingObligations(goal, snapshot).length === 0
      ? "verified"
      : workRun?.state === "completed" || currentEvidence(goal, snapshot).length > 0
        ? "work_recorded"
        : claim
          ? "in_progress"
          : "not_started";
  const primary = ordered[0] ?? null;
  return {
    goal_id: goal.goal_id,
    contract_revision: goal.current_contract_revision,
    progress,
    primary_action: primary,
    actions: ordered,
    action_token: digest(canonicalActionFacts(goal, snapshot, ordered, now)),
    display_status: displayStatus(goal, primary),
  };
}

export function deriveGoalActionProjections(
  snapshot: BoardSnapshot,
  now = new Date().toISOString(),
): GoalActionProjection[] {
  return snapshot.goals
    .map((goal) => deriveGoalActionProjection(goal, snapshot, now))
    .sort((left, right) => left.goal_id.localeCompare(right.goal_id));
}

export function compactGoalActionProjection(
  projection: GoalActionProjection,
): CompactGoalActionProjection {
  return {
    goal_id: projection.goal_id,
    contract_revision: projection.contract_revision,
    progress: projection.progress,
    primary_action: projection.primary_action,
    action_token: projection.action_token,
    display_status: projection.display_status,
  };
}

import type {
  CandidateGoalRecord,
  ContractProposalRecord,
  GoalTreeProposalDecisionRecord,
  GoalTreeProposalItemRecord,
  GoalTreeProposalRecord,
  GovernanceSnapshot,
  ReviewObligationRecord,
  ReviewRecord,
  RewireRecord,
} from "@adeptify/goalboard-contracts/modules/governance-collaboration";

import {
  json,
  mapCandidate,
  mapContractProposal,
  mapGoalTreeProposal,
  mapGoalTreeProposalDecision,
  mapGoalTreeProposalItem,
  mapReview,
  mapReviewObligation,
  mapRewire,
  text,
  type GovernanceRow,
} from "./mappers.js";
export { GOVERNANCE_SCHEMA_SQL, createGovernanceSchema } from "./schema.js";

export interface GovernanceSqliteStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid?: number | bigint };
}

export interface GovernanceSqliteDatabase {
  prepare(sql: string): GovernanceSqliteStatement;
  exec(sql: string): unknown;
  transaction<T>(operation: () => T): (() => T) & { immediate(): T };
  pragma(source: string): unknown;
}

export interface StoredReviewInput extends ReviewRecord {}
export interface StoredReviewObligationInput extends ReviewObligationRecord {}

export class GovernanceRepository {
  constructor(private readonly db: GovernanceSqliteDatabase) {}

  immediate<T>(operation: () => T): T {
    return this.db.transaction(operation).immediate();
  }

  eventCursor(boardId: string): number {
    const row = this.db.prepare("SELECT COALESCE(MAX(seq), 0) AS cursor FROM events WHERE board_id = ?")
      .get(boardId) as GovernanceRow | undefined;
    return Number(row?.cursor ?? 0);
  }

  snapshot(boardId: string): GovernanceSnapshot {
    return {
      review_obligations: this.listReviewObligations(boardId),
      reviews: this.listReviews(boardId),
      candidates: this.listCandidates(boardId),
      contract_proposals: this.listContractProposals(boardId),
      rewires: this.listRewires(boardId),
      goal_tree_proposals: this.listGoalTreeProposals(boardId),
    };
  }

  getReviewObligation(boardId: string, obligationId: string): ReviewObligationRecord | null {
    const row = this.db.prepare(
      "SELECT * FROM review_obligations WHERE board_id = ? AND obligation_id = ?",
    ).get(boardId, obligationId) as GovernanceRow | undefined;
    return row ? mapReviewObligation(row) : null;
  }

  listReviewObligations(boardId: string, goalId?: string): ReviewObligationRecord[] {
    const rows = goalId
      ? this.db.prepare("SELECT * FROM review_obligations WHERE board_id = ? AND goal_id = ? ORDER BY created_at, obligation_id").all(boardId, goalId)
      : this.db.prepare("SELECT * FROM review_obligations WHERE board_id = ? ORDER BY created_at, obligation_id").all(boardId);
    return (rows as GovernanceRow[]).map(mapReviewObligation);
  }

  listReviews(boardId: string, goalId?: string): ReviewRecord[] {
    const rows = goalId
      ? this.db.prepare("SELECT * FROM reviews WHERE board_id = ? AND goal_id = ? ORDER BY submitted_at, review_id").all(boardId, goalId)
      : this.db.prepare("SELECT * FROM reviews WHERE board_id = ? ORDER BY submitted_at, review_id").all(boardId);
    return (rows as GovernanceRow[]).map(mapReview);
  }

  getCandidate(boardId: string, candidateId: string): CandidateGoalRecord | null {
    const row = this.db.prepare("SELECT * FROM candidates WHERE board_id = ? AND candidate_id = ?")
      .get(boardId, candidateId) as GovernanceRow | undefined;
    return row ? mapCandidate(row) : null;
  }

  listCandidates(boardId: string): CandidateGoalRecord[] {
    return (this.db.prepare("SELECT * FROM candidates WHERE board_id = ? ORDER BY created_at DESC, candidate_id")
      .all(boardId) as GovernanceRow[]).map(mapCandidate);
  }

  getContractProposal(boardId: string, proposalId: string): ContractProposalRecord | null {
    const row = this.db.prepare("SELECT * FROM contract_proposals WHERE board_id = ? AND proposal_id = ?")
      .get(boardId, proposalId) as GovernanceRow | undefined;
    return row ? mapContractProposal(row) : null;
  }

  listContractProposals(boardId: string): ContractProposalRecord[] {
    return (this.db.prepare("SELECT * FROM contract_proposals WHERE board_id = ? ORDER BY created_at DESC, proposal_id")
      .all(boardId) as GovernanceRow[]).map(mapContractProposal);
  }

  getRewire(boardId: string, rewireId: string): RewireRecord | null {
    const row = this.db.prepare("SELECT * FROM rewires WHERE board_id = ? AND rewire_id = ?")
      .get(boardId, rewireId) as GovernanceRow | undefined;
    return row ? mapRewire(row) : null;
  }

  listRewires(boardId: string): RewireRecord[] {
    return (this.db.prepare("SELECT * FROM rewires WHERE board_id = ? ORDER BY created_at DESC, rewire_id")
      .all(boardId) as GovernanceRow[]).map(mapRewire);
  }

  getGoalTreeProposal(boardId: string, proposalId: string): GoalTreeProposalRecord | null {
    return this.listGoalTreeProposals(boardId).find((item) => item.proposal_id === proposalId) ?? null;
  }

  listGoalTreeProposals(boardId: string): GoalTreeProposalRecord[] {
    const decisionsByProposal = new Map<string, GoalTreeProposalDecisionRecord[]>();
    const latestDecisionByItem = new Map<string, GoalTreeProposalDecisionRecord>();
    for (const row of this.db.prepare(`
      SELECT * FROM goal_tree_proposal_decisions WHERE board_id = ?
      ORDER BY proposal_id, item_id, created_at, decision_id
    `).all(boardId) as GovernanceRow[]) {
      const decision = mapGoalTreeProposalDecision(row);
      decisionsByProposal.set(decision.proposal_id, [
        ...(decisionsByProposal.get(decision.proposal_id) ?? []), decision,
      ]);
      latestDecisionByItem.set(decision.item_id, decision);
    }
    const itemsByProposal = new Map<string, GoalTreeProposalItemRecord[]>();
    for (const row of this.db.prepare(
      "SELECT * FROM goal_tree_proposal_items WHERE board_id = ? ORDER BY proposal_id, ordinal, item_id",
    ).all(boardId) as GovernanceRow[]) {
      const item = mapGoalTreeProposalItem(row, latestDecisionByItem.get(text(row.item_id)) ?? null);
      itemsByProposal.set(item.proposal_id, [...(itemsByProposal.get(item.proposal_id) ?? []), item]);
    }
    return (this.db.prepare(
      "SELECT * FROM goal_tree_proposals WHERE board_id = ? ORDER BY created_at DESC, proposal_id",
    ).all(boardId) as GovernanceRow[]).map((row) => mapGoalTreeProposal(
      row,
      itemsByProposal.get(text(row.proposal_id)) ?? [],
      decisionsByProposal.get(text(row.proposal_id)) ?? [],
    ));
  }

  insertReview(review: StoredReviewInput): void {
    this.db.prepare(`INSERT INTO reviews (
      review_id, board_id, goal_id, obligation_id, claim_id, actor_id,
      verdict, evidence_refs_json, reasoning, submitted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(review.review_id, review.board_id, review.goal_id, review.obligation_id,
        review.claim_id, review.actor_id, review.verdict, json(review.evidence_refs),
        review.reasoning, review.submitted_at);
  }

  insertReviewObligation(obligation: StoredReviewObligationInput): void {
    this.db.prepare(`INSERT INTO review_obligations (
      obligation_id, board_id, goal_id, contract_revision, role, required_count,
      independence_rule, criterion_scope_json, state, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(obligation.obligation_id, obligation.board_id, obligation.goal_id,
        obligation.contract_revision, obligation.role, obligation.required_count,
        obligation.independence_rule, json(obligation.criterion_scope),
        obligation.state, obligation.created_at);
  }

  updateReviewObligation(
    obligationId: string,
    update: { state?: ReviewObligationRecord["state"]; criterion_scope?: string[] },
  ): void {
    if (update.state !== undefined) {
      this.db.prepare("UPDATE review_obligations SET state = ? WHERE obligation_id = ?")
        .run(update.state, obligationId);
    }
    if (update.criterion_scope !== undefined) {
      this.db.prepare("UPDATE review_obligations SET criterion_scope_json = ? WHERE obligation_id = ?")
        .run(json(update.criterion_scope), obligationId);
    }
  }

  latestCompletedWorkRunEventSeq(boardId: string, goalId: string): number {
    const row = this.db.prepare(`SELECT COALESCE(MAX(event.seq), 0) AS seq
      FROM events event JOIN runs run ON run.run_id = event.object_id
      WHERE event.board_id = ? AND event.type = 'run.completed'
        AND run.goal_id = ? AND run.role IN ('executor', 'revalidator')`)
      .get(boardId, goalId) as GovernanceRow | undefined;
    return Number(row?.seq ?? 0);
  }

  latestNeedsChangesReviewEventSeq(boardId: string, goalId: string): number {
    const row = this.db.prepare(`SELECT COALESCE(MAX(event.seq), 0) AS seq
      FROM events event JOIN reviews review ON review.review_id = event.object_id
      WHERE event.board_id = ? AND event.type = 'review.submitted'
        AND review.goal_id = ? AND review.verdict = 'needs_changes'`)
      .get(boardId, goalId) as GovernanceRow | undefined;
    return Number(row?.seq ?? 0);
  }

  waivePendingObligationsForRevision(goalId: string, contractRevision: number): void {
    this.db.prepare(`UPDATE review_obligations SET state = 'waived'
      WHERE goal_id = ? AND contract_revision = ? AND state = 'pending'`)
      .run(goalId, contractRevision);
  }

  passingReviewActorCountAfterEventSeq(obligationId: string, eventSeq: number): number {
    const row = this.db.prepare(`SELECT COUNT(DISTINCT review.actor_id) AS count
      FROM reviews review
      JOIN events event ON event.object_id = review.review_id AND event.type = 'review.submitted'
      WHERE review.obligation_id = ? AND review.verdict = 'pass' AND event.seq > ?`)
      .get(obligationId, eventSeq);
    return Number((row as GovernanceRow | undefined)?.count ?? 0);
  }

  appendEvent(input: {
    event_id: string; board_id: string; actor_id: string; type: string;
    object_type: string; object_id: string; reason: string; payload: unknown; at: string;
  }): void {
    this.db.prepare(`INSERT INTO events (
      event_id, board_id, actor_id, type, object_type, object_id, reason, payload_json, at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(input.event_id, input.board_id, input.actor_id, input.type, input.object_type,
        input.object_id, input.reason, json(input.payload), input.at);
  }
}

import type {
  CandidateGoalRecord,
  ContractProposalRecord,
  GoalTreeProposalDecisionRecord,
  GoalTreeProposalItemRecord,
  GoalTreeProposalRecord,
  GoalTreeItemOwner,
  GovernanceRecordsApi,
  NewNativeGoalTreeProposal,
  NewNativeGoalTreeProposalItem,
  RewireRecord,
} from "@adeptify/goalboard-contracts/modules/governance-collaboration";

import { json, text, type GovernanceRow } from "./mappers.js";
import type { GovernanceSqliteDatabase } from "./repository.js";
import { assertGovernanceTransition } from "./state-machine.js";

export class GovernanceRecordStore implements GovernanceRecordsApi {
  constructor(private readonly db: GovernanceSqliteDatabase) {}

  findGoalTreeItemOwner(itemId: string): GoalTreeItemOwner | null {
    const row = this.db.prepare(
      "SELECT proposal_id, board_id FROM goal_tree_proposal_items WHERE item_id = ?",
    ).get(itemId) as GovernanceRow | undefined;
    return row ? { proposal_id: text(row.proposal_id), board_id: text(row.board_id) } : null;
  }

  insertGoalTreeProposal(proposal: NewNativeGoalTreeProposal): void {
    this.db.prepare(`INSERT INTO goal_tree_proposals (
      proposal_id, board_id, root_goal_id, submitted_by, discovered_in_run_id,
      state, version, supersedes_proposal_id, supersedes_legacy_proposal_id,
      base_event_cursor, summary, narrative_json, decision_json,
      created_at, updated_at, decided_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL)`)
      .run(
        proposal.proposal_id, proposal.board_id, proposal.root_goal_id,
        proposal.submitted_by, proposal.discovered_in_run_id, proposal.state,
        proposal.version, proposal.supersedes_proposal_id,
        proposal.supersedes_legacy_proposal_id ?? null, proposal.base_event_cursor,
        proposal.summary, proposal.narrative == null ? null : json(proposal.narrative),
        proposal.created_at, proposal.updated_at,
      );
  }

  insertGoalTreeProposalItem(item: NewNativeGoalTreeProposalItem): void {
    this.db.prepare(`INSERT INTO goal_tree_proposal_items (
      item_id, proposal_id, board_id, ordinal, kind, operation, payload_json,
      source_refs_json, reason, explanation_json, confidence, affected_objects_json,
      baseline_versions_json, requires_user_confirmation, state, conflict_json,
      materialized_objects_json, revision_proposal_id, supersedes_item_id,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, '[]', NULL, ?, ?, ?)`)
      .run(
        item.item_id, item.proposal_id, item.board_id, item.ordinal, item.kind,
        item.operation, json(item.payload), json(item.source_refs), item.reason,
        item.explanation == null ? null : json(item.explanation), item.confidence,
        json(item.affected_objects), json(item.baseline_versions),
        item.requires_user_confirmation ? 1 : 0, item.state,
        item.supersedes_item_id, item.created_at, item.updated_at,
      );
  }

  supersedeGoalTreeProposal(proposalId: string, at: string): void {
    this.db.prepare("UPDATE goal_tree_proposals SET state = 'superseded', updated_at = ? WHERE proposal_id = ?")
      .run(at, proposalId);
    this.db.prepare(`UPDATE goal_tree_proposal_items SET state = 'superseded', updated_at = ?
      WHERE proposal_id = ? AND state IN ('pending', 'conflict')`).run(at, proposalId);
  }

  setGoalTreeItemCheck(
    proposalId: string,
    itemId: string,
    state: "pending" | "conflict",
    conflict: Record<string, unknown> | null,
    at: string,
  ): void {
    this.db.prepare(`UPDATE goal_tree_proposal_items
      SET state = ?, conflict_json = ?, updated_at = ? WHERE item_id = ? AND proposal_id = ?`)
      .run(state, conflict ? json(conflict) : null, at, itemId, proposalId);
  }

  transitionGoalTreeProposal(
    proposalId: string,
    state: GoalTreeProposalRecord["state"],
    decision: Record<string, unknown> | null,
    at: string,
    decidedAt: string | null = at,
  ): void {
    const current = this.db.prepare("SELECT state FROM goal_tree_proposals WHERE proposal_id = ?")
      .get(proposalId) as GovernanceRow | undefined;
    if (current) {
      assertGovernanceTransition("goal_tree_proposal", text(current.state) as GoalTreeProposalRecord["state"], state);
    }
    this.db.prepare(`UPDATE goal_tree_proposals
      SET state = ?, decision_json = ?, updated_at = ?, decided_at = ? WHERE proposal_id = ?`)
      .run(state, decision == null ? null : json(decision), at, decidedAt, proposalId);
  }

  transitionGoalTreeItem(input: {
    proposal_id: string;
    item_id: string;
    state: GoalTreeProposalItemRecord["state"];
    conflict?: Record<string, unknown> | null;
    materialized_objects?: GoalTreeProposalItemRecord["materialized_objects"];
    revision_proposal_id?: string | null;
    updated_at: string;
  }): void {
    const current = this.db.prepare(
      "SELECT state FROM goal_tree_proposal_items WHERE proposal_id = ? AND item_id = ?",
    ).get(input.proposal_id, input.item_id) as GovernanceRow | undefined;
    if (current) {
      assertGovernanceTransition("goal_tree_item", text(current.state) as GoalTreeProposalItemRecord["state"], input.state);
    }
    this.db.prepare(`UPDATE goal_tree_proposal_items SET state = ?, conflict_json = ?,
      materialized_objects_json = ?, revision_proposal_id = ?, updated_at = ?
      WHERE proposal_id = ? AND item_id = ?`)
      .run(
        input.state, input.conflict ? json(input.conflict) : null,
        json(input.materialized_objects ?? []), input.revision_proposal_id ?? null,
        input.updated_at, input.proposal_id, input.item_id,
      );
  }

  insertGoalTreeDecision(decision: GoalTreeProposalDecisionRecord): void {
    this.db.prepare(`INSERT INTO goal_tree_proposal_decisions (
      decision_id, board_id, proposal_id, item_id, decision, actor_id,
      authority_source, runtime_actor_id, conversation_ref, message_ref,
      reason, revision_proposal_id, materialized_objects_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        decision.decision_id, decision.board_id, decision.proposal_id,
        decision.item_id, decision.decision, decision.actor_id,
        decision.authority_source, decision.runtime_actor_id,
        decision.conversation_ref, decision.message_ref, decision.reason,
        decision.revision_proposal_id, json(decision.materialized_objects),
        decision.created_at,
      );
  }

  supersedePendingContractProposals(
    boardId: string,
    goalId: string,
    at: string,
    decision: Record<string, unknown>,
  ): void {
    this.db.prepare(`UPDATE contract_proposals SET state = 'superseded', decided_at = ?, decision_json = ?
      WHERE board_id = ? AND goal_id = ? AND state = 'pending'`)
      .run(at, json(decision), boardId, goalId);
  }

  transitionContractProposal(
    boardId: string,
    proposalId: string,
    state: ContractProposalRecord["state"],
    decision: Record<string, unknown>,
    at: string,
  ): void {
    const current = this.db.prepare("SELECT state FROM contract_proposals WHERE board_id = ? AND proposal_id = ?")
      .get(boardId, proposalId) as GovernanceRow | undefined;
    if (current) {
      assertGovernanceTransition("contract_proposal", text(current.state) as ContractProposalRecord["state"], state);
    }
    this.db.prepare(`UPDATE contract_proposals SET state = ?, decision_json = ?, decided_at = ?
      WHERE board_id = ? AND proposal_id = ?`).run(state, json(decision), at, boardId, proposalId);
  }

  insertContractProposal(proposal: ContractProposalRecord): void {
    this.db.prepare(`INSERT INTO contract_proposals (
      proposal_id, board_id, goal_id, submitted_by, discovered_in_run_id,
      proposed_goal_json, field_sources_json, review_policy_json,
      proposed_impacts_json, proposed_risks_json, dependency_rewire_ids_json,
      state, decision_json, created_at, decided_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        proposal.proposal_id, proposal.board_id, proposal.goal_id, proposal.submitted_by,
        proposal.discovered_in_run_id, json(proposal.proposed_goal), json(proposal.field_sources),
        json(proposal.review_policy), json(proposal.proposed_impacts), json(proposal.proposed_risks),
        json(proposal.dependency_rewire_ids), proposal.state,
        proposal.decision == null ? null : json(proposal.decision), proposal.created_at,
        proposal.decided_at,
      );
  }

  insertCandidate(candidate: CandidateGoalRecord): void {
    this.db.prepare(`INSERT INTO candidates (
      candidate_id, board_id, submitted_by, discovered_in_run_id, proposed_goal_json,
      proposed_relations_json, proposed_impacts_json, proposed_risks_json,
      blocking_mode, state, decision_json, created_at, decided_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        candidate.candidate_id, candidate.board_id, candidate.submitted_by,
        candidate.discovered_in_run_id, json(candidate.proposed_goal),
        json(candidate.proposed_relations), json(candidate.proposed_impacts),
        json(candidate.proposed_risks), candidate.blocking_mode, candidate.state,
        candidate.decision == null ? null : json(candidate.decision), candidate.created_at,
        candidate.decided_at,
      );
  }

  transitionCandidate(
    boardId: string,
    candidateId: string,
    state: CandidateGoalRecord["state"],
    decision: Record<string, unknown> | null,
    at: string | null,
  ): boolean {
    const current = this.db.prepare("SELECT state FROM candidates WHERE board_id = ? AND candidate_id = ?")
      .get(boardId, candidateId) as GovernanceRow | undefined;
    if (current) {
      assertGovernanceTransition("candidate", text(current.state) as CandidateGoalRecord["state"], state);
    }
    const result = this.db.prepare(`UPDATE candidates SET state = ?, decision_json = ?, decided_at = ?
      WHERE board_id = ? AND candidate_id = ?`)
      .run(state, decision == null ? null : json(decision), at, boardId, candidateId);
    return Number(result.changes) === 1;
  }

  insertRewire(rewire: RewireRecord): void {
    this.db.prepare(`INSERT INTO rewires (
      rewire_id, board_id, candidate_id, proposal_json, impact_json, state, created_at, decided_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(rewire.rewire_id, rewire.board_id, rewire.candidate_id, json(rewire.proposal),
        json(rewire.impact), rewire.state, rewire.created_at, rewire.decided_at);
  }

  transitionRewire(
    boardId: string,
    rewireId: string,
    state: RewireRecord["state"],
    update: { impact?: Record<string, unknown>; proposal?: RewireRecord["proposal"] },
    at: string | null,
  ): boolean {
    const current = this.db.prepare("SELECT proposal_json, impact_json FROM rewires WHERE board_id = ? AND rewire_id = ?")
      .get(boardId, rewireId) as GovernanceRow | undefined;
    if (!current) return false;
    const currentState = this.db.prepare("SELECT state FROM rewires WHERE board_id = ? AND rewire_id = ?")
      .get(boardId, rewireId) as GovernanceRow | undefined;
    if (currentState) {
      assertGovernanceTransition("rewire", text(currentState.state) as RewireRecord["state"], state);
    }
    const result = this.db.prepare(`UPDATE rewires SET proposal_json = ?, impact_json = ?, state = ?, decided_at = ?
      WHERE board_id = ? AND rewire_id = ?`)
      .run(
        update.proposal ? json(update.proposal) : text(current.proposal_json),
        update.impact ? json(update.impact) : text(current.impact_json),
        state, at, boardId, rewireId,
      );
    return Number(result.changes) === 1;
  }

  getRewireStateAndProposal(boardId: string, rewireId: string): {
    state: RewireRecord["state"];
    proposal: RewireRecord["proposal"];
  } | null {
    const row = this.db.prepare("SELECT state, proposal_json FROM rewires WHERE board_id = ? AND rewire_id = ?")
      .get(boardId, rewireId) as GovernanceRow | undefined;
    if (!row) return null;
    return { state: text(row.state) as RewireRecord["state"], proposal: JSON.parse(text(row.proposal_json)) };
  }
}

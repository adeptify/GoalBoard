import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { PlanningMethodPack } from "../planning/method-packs.js";
import type {
  AcceptanceCriterion,
  BoardSnapshot,
  CandidateGoalRecord,
  ClaimRecord,
  ClarificationSessionRecord,
  ClarificationTurnRecord,
  ContractProposalRecord,
  EvidenceCorrectionRecord,
  EvidenceRecord,
  GoalTreeProposalDecisionRecord,
  GoalTreeProposalItemRecord,
  GoalTreeProposalRecord,
  GoalPolicy,
  GoalRecord,
  GoalRelationRecord,
  ImpactBindingRecord,
  ReviewObligationRecord,
  ReviewRecord,
  RewireRecord,
  RiskRecord,
  RunRecord,
} from "./types.js";

type Row = Record<string, unknown>;

function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function optionalText(value: unknown): string | null {
  return value == null ? null : String(value);
}

function number(value: unknown): number {
  return Number(value ?? 0);
}

function bool(value: unknown): boolean {
  return Number(value ?? 0) === 1;
}

export class SqliteGoalBoardStore {
  readonly db: Database.Database;

  constructor(readonly path: string) {
    this.db = new Database(path, { timeout: 5000 });
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = FULL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  immediate<T>(fn: () => T): T {
    return this.db.transaction(fn).immediate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        migration_id INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);
    const applied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 1")
      .get();
    if (!applied) {
      this.immediate(() => {
      this.db.exec(`
        CREATE TABLE boards (
          board_id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          active_goal_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE goals (
          goal_id TEXT PRIMARY KEY,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          outcome TEXT NOT NULL,
          why TEXT NOT NULL,
          business_logic TEXT NOT NULL,
          in_scope_json TEXT NOT NULL DEFAULT '[]',
          out_of_scope_json TEXT NOT NULL DEFAULT '[]',
          constraints_json TEXT NOT NULL DEFAULT '[]',
          required_inputs_json TEXT NOT NULL DEFAULT '[]',
          promised_outputs_json TEXT NOT NULL DEFAULT '[]',
          definition_state TEXT NOT NULL CHECK (definition_state IN ('draft', 'accepted')),
          decomposition_state TEXT NOT NULL CHECK (decomposition_state IN ('abstract', 'frontier_open', 'closed_leaf', 'closed_compound')),
          validity_state TEXT NOT NULL CHECK (validity_state IN ('valid', 'needs_revalidation', 'invalidated')),
          fulfillment_state TEXT NOT NULL CHECK (fulfillment_state IN ('unmet', 'satisfied')),
          trashed_at TEXT,
          trashed_by TEXT,
          archived_at TEXT,
          archived_by TEXT,
          priority INTEGER NOT NULL DEFAULT 0,
          accepted_by TEXT,
          accepted_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX goals_board_idx ON goals(board_id);
        CREATE INDEX goals_ready_idx ON goals(board_id, definition_state, decomposition_state, validity_state, fulfillment_state);
        CREATE INDEX goals_trash_idx ON goals(board_id, trashed_at);
        CREATE INDEX goals_archive_idx ON goals(board_id, archived_at);

        CREATE TABLE acceptance_criteria (
          criterion_id TEXT PRIMARY KEY,
          goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
          statement TEXT NOT NULL,
          decision_method TEXT NOT NULL,
          pass_condition TEXT NOT NULL,
          target_json TEXT,
          required_evidence_json TEXT NOT NULL DEFAULT '[]'
        );
        CREATE INDEX acceptance_goal_idx ON acceptance_criteria(goal_id);

        CREATE TABLE coverage_items (
          requirement_id TEXT PRIMARY KEY,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          statement TEXT NOT NULL,
          disposition TEXT NOT NULL CHECK (disposition IN ('covered', 'deferred', 'out', 'unresolved')),
          owner_goal_id TEXT REFERENCES goals(goal_id),
          reason TEXT,
          revisit_condition TEXT,
          blocking INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE goal_relations (
          relation_id TEXT PRIMARY KEY,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          from_goal_id TEXT NOT NULL REFERENCES goals(goal_id),
          to_goal_id TEXT NOT NULL REFERENCES goals(goal_id),
          type TEXT NOT NULL,
          state TEXT NOT NULL CHECK (state IN ('proposed', 'active', 'inactive')),
          reason TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          deactivated_at TEXT
        );
        CREATE INDEX relations_from_idx ON goal_relations(board_id, from_goal_id, state);
        CREATE INDEX relations_to_idx ON goal_relations(board_id, to_goal_id, state);

        CREATE TABLE goal_trash_records (
          trash_record_id TEXT PRIMARY KEY,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
          trashed_at TEXT NOT NULL,
          trashed_by TEXT NOT NULL,
          trash_reason TEXT NOT NULL,
          restored_at TEXT,
          restored_by TEXT,
          restore_reason TEXT
        );
        CREATE UNIQUE INDEX goal_trash_one_open_per_goal
          ON goal_trash_records(board_id, goal_id)
          WHERE restored_at IS NULL;
        CREATE INDEX goal_trash_records_goal_idx
          ON goal_trash_records(board_id, goal_id, restored_at, trashed_at);

        CREATE TABLE goal_trash_relation_records (
          trash_record_id TEXT NOT NULL REFERENCES goal_trash_records(trash_record_id) ON DELETE CASCADE,
          relation_id TEXT NOT NULL REFERENCES goal_relations(relation_id) ON DELETE CASCADE,
          prior_state TEXT NOT NULL CHECK (prior_state = 'active'),
          deactivated_at TEXT NOT NULL,
          restored_at TEXT,
          PRIMARY KEY (trash_record_id, relation_id)
        );
        CREATE INDEX goal_trash_relation_records_relation_idx
          ON goal_trash_relation_records(relation_id, restored_at);

        CREATE TABLE input_bindings (
          binding_id TEXT PRIMARY KEY,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          goal_id TEXT NOT NULL REFERENCES goals(goal_id),
          input_name TEXT NOT NULL,
          source_type TEXT NOT NULL,
          source_ref TEXT NOT NULL,
          snapshot_digest TEXT,
          state TEXT NOT NULL CHECK (state IN ('proposed', 'confirmed', 'inactive')),
          reason TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE impact_bindings (
          binding_id TEXT PRIMARY KEY,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          goal_id TEXT NOT NULL REFERENCES goals(goal_id),
          surface TEXT NOT NULL,
          access TEXT NOT NULL CHECK (access IN ('read', 'write', 'decide', 'exclusive')),
          input_snapshot TEXT,
          state TEXT NOT NULL CHECK (state IN ('proposed', 'confirmed', 'inactive')),
          reason TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deactivated_at TEXT,
          deactivation_reason TEXT
        );
        CREATE INDEX impacts_goal_idx ON impact_bindings(board_id, goal_id, state);
        CREATE INDEX impacts_surface_idx ON impact_bindings(board_id, surface, state);

        CREATE TABLE risks (
          risk_id TEXT PRIMARY KEY,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          description TEXT NOT NULL,
          probability TEXT NOT NULL,
          impact TEXT NOT NULL,
          affected_surfaces_json TEXT NOT NULL DEFAULT '[]',
          trigger TEXT NOT NULL,
          treatment TEXT NOT NULL,
          treatment_plan TEXT NOT NULL DEFAULT '',
          blocking_mode TEXT NOT NULL CHECK (blocking_mode IN ('none', 'claim', 'completion', 'invalidate_on_trigger')),
          revisit_condition TEXT NOT NULL,
          owner TEXT NOT NULL,
          state TEXT NOT NULL CHECK (state IN ('open', 'triggered', 'resolved', 'accepted', 'expired')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE goal_risks (
          goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
          risk_id TEXT NOT NULL REFERENCES risks(risk_id) ON DELETE CASCADE,
          PRIMARY KEY (goal_id, risk_id)
        );

        CREATE TABLE policy_bindings (
          policy_binding_id TEXT PRIMARY KEY,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          goal_id TEXT REFERENCES goals(goal_id),
          scope TEXT NOT NULL CHECK (scope IN ('project_default', 'ancestor_minimum', 'goal')),
          policy_json TEXT NOT NULL,
          state TEXT NOT NULL CHECK (state IN ('active', 'replaced', 'withdrawn')),
          created_by TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX policies_scope_idx ON policy_bindings(board_id, goal_id, state);

        CREATE TABLE claims (
          claim_id TEXT PRIMARY KEY,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          goal_id TEXT NOT NULL REFERENCES goals(goal_id),
          actor_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('clarifier', 'executor', 'self_verifier', 'cross_reviewer', 'adversarial_reviewer', 'revalidator')),
          state TEXT NOT NULL CHECK (state IN ('active', 'released', 'expired', 'revoked')),
          capabilities_json TEXT NOT NULL DEFAULT '[]',
          goal_mode_attestation INTEGER NOT NULL DEFAULT 0,
          resolved_policy_json TEXT NOT NULL,
          claimed_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          renewed_at TEXT,
          released_at TEXT,
          release_reason TEXT
        );
        CREATE INDEX claims_board_state_idx ON claims(board_id, state, expires_at);
        CREATE INDEX claims_goal_idx ON claims(goal_id, state);
        CREATE UNIQUE INDEX claims_one_active_per_goal
          ON claims(goal_id)
          WHERE state = 'active';

        CREATE TABLE runs (
          run_id TEXT PRIMARY KEY,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          goal_id TEXT NOT NULL REFERENCES goals(goal_id),
          claim_id TEXT NOT NULL REFERENCES claims(claim_id),
          actor_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('clarifier', 'executor', 'self_verifier', 'cross_reviewer', 'adversarial_reviewer', 'revalidator')),
          state TEXT NOT NULL CHECK (state IN ('started', 'blocked', 'completed', 'failed', 'abandoned')),
          block_reason TEXT,
          output_refs_json TEXT NOT NULL DEFAULT '[]',
          discovery_refs_json TEXT NOT NULL DEFAULT '[]',
          started_at TEXT NOT NULL,
          ended_at TEXT
        );
        CREATE UNIQUE INDEX runs_one_nonterminal_per_claim
          ON runs(claim_id)
          WHERE state IN ('started', 'blocked');

        CREATE TABLE evidence (
          evidence_id TEXT PRIMARY KEY,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          goal_id TEXT NOT NULL REFERENCES goals(goal_id),
          criterion_ids_json TEXT NOT NULL,
          producer_actor_id TEXT NOT NULL,
          run_id TEXT REFERENCES runs(run_id),
          review_id TEXT,
          kind TEXT NOT NULL,
          locator TEXT NOT NULL,
          locator_status TEXT NOT NULL DEFAULT 'unverified' CHECK (locator_status IN ('verified', 'unverified')),
          locator_validation_reason TEXT NOT NULL DEFAULT '历史 Evidence 未进行 locator 预检',
          locator_checked_at TEXT,
          locator_workspace_id TEXT,
          locator_workspace_root TEXT,
          digest TEXT,
          captured_at TEXT NOT NULL,
          result TEXT NOT NULL CHECK (result IN ('passed', 'failed', 'inconclusive'))
        );
        CREATE INDEX evidence_goal_idx ON evidence(goal_id, result);

        CREATE TABLE evidence_corrections (
          correction_id TEXT PRIMARY KEY,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
          target_evidence_id TEXT NOT NULL UNIQUE REFERENCES evidence(evidence_id),
          action TEXT NOT NULL CHECK (action IN ('supersede', 'retract')),
          replacement_evidence_id TEXT REFERENCES evidence(evidence_id),
          actor_id TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_at TEXT NOT NULL,
          CHECK (
            (action = 'supersede' AND replacement_evidence_id IS NOT NULL) OR
            (action = 'retract' AND replacement_evidence_id IS NULL)
          )
        );
        CREATE INDEX evidence_corrections_goal_idx
          ON evidence_corrections(board_id, goal_id, created_at, correction_id);

        CREATE TABLE review_obligations (
          obligation_id TEXT PRIMARY KEY,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          goal_id TEXT NOT NULL REFERENCES goals(goal_id),
          role TEXT NOT NULL CHECK (role IN ('self_verifier', 'cross_reviewer', 'adversarial_reviewer', 'human_approver')),
          required_count INTEGER NOT NULL,
          independence_rule TEXT NOT NULL,
          criterion_scope_json TEXT NOT NULL DEFAULT '[]',
          state TEXT NOT NULL CHECK (state IN ('pending', 'satisfied', 'waived')),
          created_at TEXT NOT NULL
        );

        CREATE TABLE reviews (
          review_id TEXT PRIMARY KEY,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          goal_id TEXT NOT NULL REFERENCES goals(goal_id),
          obligation_id TEXT NOT NULL REFERENCES review_obligations(obligation_id),
          claim_id TEXT REFERENCES claims(claim_id),
          actor_id TEXT NOT NULL,
          verdict TEXT NOT NULL CHECK (verdict IN ('pass', 'fail', 'needs_changes', 'inconclusive')),
          evidence_refs_json TEXT NOT NULL DEFAULT '[]',
          reasoning TEXT NOT NULL,
          submitted_at TEXT NOT NULL
        );
        CREATE INDEX reviews_obligation_idx ON reviews(obligation_id, verdict);

        CREATE TABLE candidates (
          candidate_id TEXT PRIMARY KEY,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          submitted_by TEXT NOT NULL,
          discovered_in_run_id TEXT REFERENCES runs(run_id),
          proposed_goal_json TEXT NOT NULL,
          proposed_relations_json TEXT NOT NULL DEFAULT '[]',
          proposed_impacts_json TEXT NOT NULL DEFAULT '[]',
          proposed_risks_json TEXT NOT NULL DEFAULT '[]',
          blocking_mode TEXT NOT NULL CHECK (blocking_mode IN ('none', 'current_run', 'dependent_claims')),
          state TEXT NOT NULL CHECK (state IN ('pending', 'approved', 'rejected', 'dismissed', 'superseded')),
          decision_json TEXT,
          created_at TEXT NOT NULL,
          decided_at TEXT
        );

        CREATE TABLE rewires (
          rewire_id TEXT PRIMARY KEY,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          candidate_id TEXT REFERENCES candidates(candidate_id),
          proposal_json TEXT NOT NULL,
          impact_json TEXT NOT NULL,
          state TEXT NOT NULL CHECK (state IN ('pending', 'confirmed', 'rejected', 'applied')),
          created_at TEXT NOT NULL,
          decided_at TEXT
        );

        CREATE TABLE contract_proposals (
          proposal_id TEXT PRIMARY KEY,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
          submitted_by TEXT NOT NULL,
          discovered_in_run_id TEXT NOT NULL REFERENCES runs(run_id),
          proposed_goal_json TEXT NOT NULL,
          field_sources_json TEXT NOT NULL,
          review_policy_json TEXT NOT NULL,
          proposed_impacts_json TEXT NOT NULL DEFAULT '[]',
          proposed_risks_json TEXT NOT NULL DEFAULT '[]',
          dependency_rewire_ids_json TEXT NOT NULL DEFAULT '[]',
          state TEXT NOT NULL CHECK (state IN ('pending', 'approved', 'rejected', 'superseded')),
          decision_json TEXT,
          created_at TEXT NOT NULL,
          decided_at TEXT
        );
        CREATE INDEX contract_proposals_goal_idx
          ON contract_proposals(board_id, goal_id, state, created_at);

        CREATE TABLE clarification_sessions (
          session_id TEXT PRIMARY KEY,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
          claim_id TEXT REFERENCES claims(claim_id),
          run_id TEXT REFERENCES runs(run_id),
          rough_idea TEXT NOT NULL,
          state TEXT NOT NULL CHECK (state IN ('clarifying', 'proposal_ready', 'closed')),
          current_understanding TEXT,
          next_question TEXT,
          proposal_summary TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          closed_at TEXT
        );
        CREATE UNIQUE INDEX clarification_one_open_session_per_goal
          ON clarification_sessions(goal_id)
          WHERE state != 'closed';
        CREATE INDEX clarification_sessions_goal_idx
          ON clarification_sessions(board_id, goal_id, updated_at DESC, session_id);

        CREATE TABLE clarification_turns (
          turn_id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES clarification_sessions(session_id) ON DELETE CASCADE,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
          run_id TEXT REFERENCES runs(run_id),
          actor_id TEXT NOT NULL,
          turn_index INTEGER NOT NULL,
          turn_kind TEXT NOT NULL CHECK (turn_kind IN ('rough_idea', 'user_answer')),
          user_message TEXT NOT NULL,
          current_understanding TEXT,
          known_facts_json TEXT NOT NULL DEFAULT '[]',
          assumptions_json TEXT NOT NULL DEFAULT '[]',
          next_question TEXT,
          proposal_summary TEXT,
          created_at TEXT NOT NULL,
          UNIQUE(session_id, turn_index)
        );
        CREATE INDEX clarification_turns_session_idx
          ON clarification_turns(session_id, turn_index, turn_id);

        CREATE TABLE goal_tree_proposals (
          proposal_id TEXT PRIMARY KEY,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          root_goal_id TEXT REFERENCES goals(goal_id) ON DELETE SET NULL,
          submitted_by TEXT NOT NULL,
          discovered_in_run_id TEXT REFERENCES runs(run_id) ON DELETE SET NULL,
          state TEXT NOT NULL CHECK (state IN ('pending', 'superseded', 'approved', 'partially_applied', 'rejected', 'dismissed', 'closed')),
          version INTEGER NOT NULL,
          supersedes_proposal_id TEXT REFERENCES goal_tree_proposals(proposal_id),
          base_event_cursor INTEGER NOT NULL,
          summary TEXT NOT NULL,
          decision_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          decided_at TEXT
        );
        CREATE INDEX goal_tree_proposals_board_idx
          ON goal_tree_proposals(board_id, root_goal_id, state, created_at DESC, proposal_id);
        CREATE INDEX goal_tree_proposals_supersedes_idx
          ON goal_tree_proposals(supersedes_proposal_id);

        CREATE TABLE goal_tree_proposal_items (
          item_id TEXT PRIMARY KEY,
          proposal_id TEXT NOT NULL REFERENCES goal_tree_proposals(proposal_id) ON DELETE CASCADE,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          ordinal INTEGER NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('goal', 'contract', 'relation', 'dependency', 'risk', 'policy', 'candidate', 'rewire')),
          operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'deactivate')),
          payload_json TEXT NOT NULL,
          source_refs_json TEXT NOT NULL,
          reason TEXT NOT NULL,
          confidence REAL NOT NULL,
          affected_objects_json TEXT NOT NULL,
          baseline_versions_json TEXT NOT NULL,
          requires_user_confirmation INTEGER NOT NULL DEFAULT 1,
          state TEXT NOT NULL CHECK (state IN ('pending', 'conflict', 'superseded', 'approved', 'applied', 'rejected', 'dismissed')),
          conflict_json TEXT,
          materialized_objects_json TEXT NOT NULL DEFAULT '[]',
          revision_proposal_id TEXT REFERENCES goal_tree_proposals(proposal_id),
          supersedes_item_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(proposal_id, ordinal)
        );
        CREATE INDEX goal_tree_proposal_items_proposal_idx
          ON goal_tree_proposal_items(proposal_id, ordinal, item_id);
        CREATE INDEX goal_tree_proposal_items_board_idx
          ON goal_tree_proposal_items(board_id, state, item_id);

        CREATE TABLE goal_tree_proposal_decisions (
          decision_id TEXT PRIMARY KEY,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          proposal_id TEXT NOT NULL REFERENCES goal_tree_proposals(proposal_id) ON DELETE CASCADE,
          item_id TEXT NOT NULL REFERENCES goal_tree_proposal_items(item_id) ON DELETE CASCADE,
          decision TEXT NOT NULL CHECK (decision IN ('confirmed', 'rejected', 'revised', 'conflict')),
          actor_id TEXT NOT NULL,
          authority_source TEXT NOT NULL CHECK (authority_source IN ('runtime_dialogue', 'web', 'management')),
          runtime_actor_id TEXT,
          conversation_ref TEXT NOT NULL,
          message_ref TEXT NOT NULL,
          reason TEXT NOT NULL,
          revision_proposal_id TEXT REFERENCES goal_tree_proposals(proposal_id),
          materialized_objects_json TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL
        );
        CREATE INDEX goal_tree_proposal_decisions_item_idx
          ON goal_tree_proposal_decisions(proposal_id, item_id, created_at, decision_id);

        CREATE TABLE idempotency_records (
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          actor_id TEXT NOT NULL,
          operation TEXT NOT NULL,
          idempotency_key TEXT NOT NULL,
          request_hash TEXT NOT NULL,
          outcome_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (board_id, actor_id, operation, idempotency_key)
        );

        CREATE TABLE planning_method_packs (
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          method_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
          pack_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (board_id, method_id)
        );

        CREATE TABLE events (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          event_id TEXT NOT NULL UNIQUE,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          actor_id TEXT NOT NULL,
          type TEXT NOT NULL,
          object_type TEXT NOT NULL,
          object_id TEXT NOT NULL,
          reason TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          at TEXT NOT NULL
        );
        CREATE INDEX events_board_idx ON events(board_id, seq);
      `);
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (1, ?)")
        .run(new Date().toISOString());
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (2, ?)")
        .run(new Date().toISOString());
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (3, ?)")
        .run(new Date().toISOString());
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (4, ?)")
        .run(new Date().toISOString());
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (5, ?)")
        .run(new Date().toISOString());
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (6, ?)")
        .run(new Date().toISOString());
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (7, ?)")
        .run(new Date().toISOString());
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (8, ?)")
        .run(new Date().toISOString());
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (9, ?)")
        .run(new Date().toISOString());
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (10, ?)")
        .run(new Date().toISOString());
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (11, ?)")
        .run(new Date().toISOString());
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (12, ?)")
        .run(new Date().toISOString());
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (13, ?)")
        .run(new Date().toISOString());
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (14, ?)")
        .run(new Date().toISOString());
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (15, ?)")
        .run(new Date().toISOString());
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (16, ?)")
        .run(new Date().toISOString());
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (17, ?)")
        .run(new Date().toISOString());
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (18, ?)")
        .run(new Date().toISOString());
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (19, ?)")
        .run(new Date().toISOString());
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (20, ?)")
        .run(new Date().toISOString());
      });
      return;
    }

    const clarifierRolesApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 2")
      .get();
    if (!clarifierRolesApplied) this.migrateClarifierRoles();
    const contractProposalsApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 3")
      .get();
    if (!contractProposalsApplied) this.migrateContractProposals();
    const goalArchiveApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 4")
      .get();
    if (!goalArchiveApplied) this.migrateGoalArchive();
    const impactHistoryApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 5")
      .get();
    if (!impactHistoryApplied) this.migrateImpactHistory();
    const reviewerRunRolesApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 6")
      .get();
    if (!reviewerRunRolesApplied) this.migrateReviewerRunRoles();
    const unifiedClaimRolesApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 7")
      .get();
    if (!unifiedClaimRolesApplied) this.migrateUnifiedClaimRolesAndExclusivity();
    const clarificationDialogueApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 8")
      .get();
    if (!clarificationDialogueApplied) this.migrateClarificationDialogue();
    const goalTreeProposalsApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 9")
      .get();
    if (!goalTreeProposalsApplied) this.migrateGoalTreeProposals();
    const goalTreeProposalDecisionsApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 10")
      .get();
    if (!goalTreeProposalDecisionsApplied) this.migrateGoalTreeProposalDecisions();
    const goalTrashApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 11")
      .get();
    if (!goalTrashApplied) this.migrateGoalTrash();
    const lifecycleReconciliationApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 12")
      .get();
    if (!lifecycleReconciliationApplied) this.migrateLifecycleState();
    const activeGoalLifecycleApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 13")
      .get();
    if (!activeGoalLifecycleApplied) this.migrateActiveGoalLifecycle();
    const runtimeDialogueAuthorityApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 14")
      .get();
    if (!runtimeDialogueAuthorityApplied) this.migrateRuntimeDialogueAuthority();
    const riskTreatmentPlanApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 15")
      .get();
    if (!riskTreatmentPlanApplied) this.migrateRiskTreatmentPlan();
    const planningMethodPacksApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 16")
      .get();
    if (!planningMethodPacksApplied) this.migratePlanningMethodPacks();
    const evidenceCorrectionsApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 17")
      .get();
    if (!evidenceCorrectionsApplied) this.migrateEvidenceCorrections();
    const evidenceLocatorValidationApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 18")
      .get();
    if (!evidenceLocatorValidationApplied) this.migrateEvidenceLocatorValidation();
    const evidenceLocatorWorkspaceApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 19")
      .get();
    if (!evidenceLocatorWorkspaceApplied) this.migrateEvidenceLocatorWorkspace();
    const evidenceLocatorSourceApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 20")
      .get();
    if (!evidenceLocatorSourceApplied) this.migrateEvidenceLocatorSource();
  }

  private migrateClarifierRoles(): void {
    this.db.pragma("foreign_keys = OFF");
    try {
      this.immediate(() => {
        this.db.exec(`
          CREATE TABLE claims_v2 (
            claim_id TEXT PRIMARY KEY,
            board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
            goal_id TEXT NOT NULL REFERENCES goals(goal_id),
            actor_id TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('clarifier', 'executor', 'cross_reviewer', 'adversarial_reviewer', 'revalidator')),
            state TEXT NOT NULL CHECK (state IN ('active', 'released', 'expired', 'revoked')),
            capabilities_json TEXT NOT NULL DEFAULT '[]',
            goal_mode_attestation INTEGER NOT NULL DEFAULT 0,
            resolved_policy_json TEXT NOT NULL,
            claimed_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            renewed_at TEXT,
            released_at TEXT,
            release_reason TEXT
          );
          INSERT INTO claims_v2 SELECT * FROM claims;

          CREATE TABLE runs_v2 (
            run_id TEXT PRIMARY KEY,
            board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
            goal_id TEXT NOT NULL REFERENCES goals(goal_id),
            claim_id TEXT NOT NULL REFERENCES claims(claim_id),
            actor_id TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('clarifier', 'executor', 'revalidator')),
            state TEXT NOT NULL CHECK (state IN ('started', 'blocked', 'completed', 'failed', 'abandoned')),
            block_reason TEXT,
            output_refs_json TEXT NOT NULL DEFAULT '[]',
            discovery_refs_json TEXT NOT NULL DEFAULT '[]',
            started_at TEXT NOT NULL,
            ended_at TEXT
          );
          INSERT INTO runs_v2 SELECT * FROM runs;

          DROP TABLE runs;
          DROP TABLE claims;
          ALTER TABLE claims_v2 RENAME TO claims;
          ALTER TABLE runs_v2 RENAME TO runs;

          CREATE INDEX claims_board_state_idx ON claims(board_id, state, expires_at);
          CREATE INDEX claims_goal_idx ON claims(goal_id, state);
          CREATE UNIQUE INDEX claims_one_active_executor
            ON claims(goal_id)
            WHERE state = 'active' AND role IN ('executor', 'revalidator');
          CREATE UNIQUE INDEX claims_one_active_clarifier
            ON claims(goal_id)
            WHERE state = 'active' AND role = 'clarifier';
          CREATE UNIQUE INDEX runs_one_nonterminal_per_claim
            ON runs(claim_id)
            WHERE state IN ('started', 'blocked');
        `);
        this.db
          .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (2, ?)")
          .run(new Date().toISOString());
      });
    } finally {
      this.db.pragma("foreign_keys = ON");
    }
    const violations = this.db.pragma("foreign_key_check") as unknown[];
    if (violations.length > 0) {
      throw new Error(`GoalBoard migration 2 foreign key check failed: ${JSON.stringify(violations)}`);
    }
  }

  private migrateContractProposals(): void {
    this.immediate(() => {
      this.db.exec(`
        CREATE TABLE contract_proposals (
          proposal_id TEXT PRIMARY KEY,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
          submitted_by TEXT NOT NULL,
          discovered_in_run_id TEXT NOT NULL REFERENCES runs(run_id),
          proposed_goal_json TEXT NOT NULL,
          field_sources_json TEXT NOT NULL,
          review_policy_json TEXT NOT NULL,
          proposed_impacts_json TEXT NOT NULL DEFAULT '[]',
          proposed_risks_json TEXT NOT NULL DEFAULT '[]',
          dependency_rewire_ids_json TEXT NOT NULL DEFAULT '[]',
          state TEXT NOT NULL CHECK (state IN ('pending', 'approved', 'rejected', 'superseded')),
          decision_json TEXT,
          created_at TEXT NOT NULL,
          decided_at TEXT
        );
        CREATE INDEX contract_proposals_goal_idx
          ON contract_proposals(board_id, goal_id, state, created_at);
      `);
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (3, ?)")
        .run(new Date().toISOString());
    });
  }

  private migrateGoalArchive(): void {
    this.immediate(() => {
      this.db.exec(`
        ALTER TABLE goals ADD COLUMN archived_at TEXT;
        ALTER TABLE goals ADD COLUMN archived_by TEXT;
        CREATE INDEX goals_archive_idx ON goals(board_id, archived_at);
      `);
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (4, ?)")
        .run(new Date().toISOString());
    });
  }

  private migrateImpactHistory(): void {
    this.immediate(() => {
      this.db.exec(`
        ALTER TABLE impact_bindings ADD COLUMN updated_at TEXT;
        ALTER TABLE impact_bindings ADD COLUMN deactivated_at TEXT;
        ALTER TABLE impact_bindings ADD COLUMN deactivation_reason TEXT;
        UPDATE impact_bindings SET updated_at = created_at WHERE updated_at IS NULL;
      `);
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (5, ?)")
        .run(new Date().toISOString());
    });
  }

  private migrateReviewerRunRoles(): void {
    this.db.pragma("foreign_keys = OFF");
    try {
      this.immediate(() => {
        this.db.exec(`
          CREATE TABLE runs_v3 (
            run_id TEXT PRIMARY KEY,
            board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
            goal_id TEXT NOT NULL REFERENCES goals(goal_id),
            claim_id TEXT NOT NULL REFERENCES claims(claim_id),
            actor_id TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('clarifier', 'executor', 'cross_reviewer', 'adversarial_reviewer', 'revalidator')),
            state TEXT NOT NULL CHECK (state IN ('started', 'blocked', 'completed', 'failed', 'abandoned')),
            block_reason TEXT,
            output_refs_json TEXT NOT NULL DEFAULT '[]',
            discovery_refs_json TEXT NOT NULL DEFAULT '[]',
            started_at TEXT NOT NULL,
            ended_at TEXT
          );
          INSERT INTO runs_v3 SELECT * FROM runs;
          DROP TABLE runs;
          ALTER TABLE runs_v3 RENAME TO runs;
          CREATE UNIQUE INDEX runs_one_nonterminal_per_claim
            ON runs(claim_id)
            WHERE state IN ('started', 'blocked');
        `);
        this.db
          .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (6, ?)")
          .run(new Date().toISOString());
      });
    } finally {
      this.db.pragma("foreign_keys = ON");
    }
    const violations = this.db.pragma("foreign_key_check") as unknown[];
    if (violations.length > 0) {
      throw new Error(`GoalBoard migration 6 foreign key check failed: ${JSON.stringify(violations)}`);
    }
  }

  private migrateUnifiedClaimRolesAndExclusivity(): void {
    this.db.pragma("foreign_keys = OFF");
    try {
      this.immediate(() => {
        this.db.exec(`
          CREATE TABLE claims_v4 (
            claim_id TEXT PRIMARY KEY,
            board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
            goal_id TEXT NOT NULL REFERENCES goals(goal_id),
            actor_id TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('clarifier', 'executor', 'self_verifier', 'cross_reviewer', 'adversarial_reviewer', 'revalidator')),
            state TEXT NOT NULL CHECK (state IN ('active', 'released', 'expired', 'revoked')),
            capabilities_json TEXT NOT NULL DEFAULT '[]',
            goal_mode_attestation INTEGER NOT NULL DEFAULT 0,
            resolved_policy_json TEXT NOT NULL,
            claimed_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            renewed_at TEXT,
            released_at TEXT,
            release_reason TEXT
          );
          INSERT INTO claims_v4 SELECT * FROM claims;

          CREATE TABLE runs_v4 (
            run_id TEXT PRIMARY KEY,
            board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
            goal_id TEXT NOT NULL REFERENCES goals(goal_id),
            claim_id TEXT NOT NULL REFERENCES claims(claim_id),
            actor_id TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('clarifier', 'executor', 'self_verifier', 'cross_reviewer', 'adversarial_reviewer', 'revalidator')),
            state TEXT NOT NULL CHECK (state IN ('started', 'blocked', 'completed', 'failed', 'abandoned')),
            block_reason TEXT,
            output_refs_json TEXT NOT NULL DEFAULT '[]',
            discovery_refs_json TEXT NOT NULL DEFAULT '[]',
            started_at TEXT NOT NULL,
            ended_at TEXT
          );
          INSERT INTO runs_v4 SELECT * FROM runs;

          DROP TABLE runs;
          DROP TABLE claims;
          ALTER TABLE claims_v4 RENAME TO claims;
          ALTER TABLE runs_v4 RENAME TO runs;

          CREATE INDEX claims_board_state_idx ON claims(board_id, state, expires_at);
          CREATE INDEX claims_goal_idx ON claims(goal_id, state);
          CREATE UNIQUE INDEX claims_one_active_per_goal
            ON claims(goal_id)
            WHERE state = 'active';
          CREATE UNIQUE INDEX runs_one_nonterminal_per_claim
            ON runs(claim_id)
            WHERE state IN ('started', 'blocked');
        `);
        this.db
          .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (7, ?)")
          .run(new Date().toISOString());
      });
    } finally {
      this.db.pragma("foreign_keys = ON");
    }
    const violations = this.db.pragma("foreign_key_check") as unknown[];
    if (violations.length > 0) {
      throw new Error(`GoalBoard migration 7 foreign key check failed: ${JSON.stringify(violations)}`);
    }
  }

  private migrateClarificationDialogue(): void {
    this.immediate(() => {
      this.db.exec(`
        CREATE TABLE clarification_sessions (
          session_id TEXT PRIMARY KEY,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
          claim_id TEXT REFERENCES claims(claim_id),
          run_id TEXT REFERENCES runs(run_id),
          rough_idea TEXT NOT NULL,
          state TEXT NOT NULL CHECK (state IN ('clarifying', 'proposal_ready', 'closed')),
          current_understanding TEXT,
          next_question TEXT,
          proposal_summary TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          closed_at TEXT
        );
        CREATE UNIQUE INDEX clarification_one_open_session_per_goal
          ON clarification_sessions(goal_id)
          WHERE state != 'closed';
        CREATE INDEX clarification_sessions_goal_idx
          ON clarification_sessions(board_id, goal_id, updated_at DESC, session_id);

        CREATE TABLE clarification_turns (
          turn_id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES clarification_sessions(session_id) ON DELETE CASCADE,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
          run_id TEXT REFERENCES runs(run_id),
          actor_id TEXT NOT NULL,
          turn_index INTEGER NOT NULL,
          turn_kind TEXT NOT NULL CHECK (turn_kind IN ('rough_idea', 'user_answer')),
          user_message TEXT NOT NULL,
          current_understanding TEXT,
          known_facts_json TEXT NOT NULL DEFAULT '[]',
          assumptions_json TEXT NOT NULL DEFAULT '[]',
          next_question TEXT,
          proposal_summary TEXT,
          created_at TEXT NOT NULL,
          UNIQUE(session_id, turn_index)
        );
        CREATE INDEX clarification_turns_session_idx
          ON clarification_turns(session_id, turn_index, turn_id);
      `);
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (8, ?)")
        .run(new Date().toISOString());
      });
  }

  private migrateGoalTreeProposals(): void {
    this.immediate(() => {
      this.db.exec(`
        CREATE TABLE goal_tree_proposals (
          proposal_id TEXT PRIMARY KEY,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          root_goal_id TEXT REFERENCES goals(goal_id) ON DELETE SET NULL,
          submitted_by TEXT NOT NULL,
          discovered_in_run_id TEXT REFERENCES runs(run_id) ON DELETE SET NULL,
          state TEXT NOT NULL CHECK (state IN ('pending', 'superseded', 'approved', 'partially_applied', 'rejected', 'dismissed', 'closed')),
          version INTEGER NOT NULL,
          supersedes_proposal_id TEXT REFERENCES goal_tree_proposals(proposal_id),
          base_event_cursor INTEGER NOT NULL,
          summary TEXT NOT NULL,
          decision_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          decided_at TEXT
        );
        CREATE INDEX goal_tree_proposals_board_idx
          ON goal_tree_proposals(board_id, root_goal_id, state, created_at DESC, proposal_id);
        CREATE INDEX goal_tree_proposals_supersedes_idx
          ON goal_tree_proposals(supersedes_proposal_id);

        CREATE TABLE goal_tree_proposal_items (
          item_id TEXT PRIMARY KEY,
          proposal_id TEXT NOT NULL REFERENCES goal_tree_proposals(proposal_id) ON DELETE CASCADE,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          ordinal INTEGER NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('goal', 'contract', 'relation', 'dependency', 'risk', 'policy', 'candidate', 'rewire')),
          operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'deactivate')),
          payload_json TEXT NOT NULL,
          source_refs_json TEXT NOT NULL,
          reason TEXT NOT NULL,
          confidence REAL NOT NULL,
          affected_objects_json TEXT NOT NULL,
          baseline_versions_json TEXT NOT NULL,
          requires_user_confirmation INTEGER NOT NULL DEFAULT 1,
          state TEXT NOT NULL CHECK (state IN ('pending', 'conflict', 'superseded', 'approved', 'applied', 'rejected', 'dismissed')),
          conflict_json TEXT,
          supersedes_item_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(proposal_id, ordinal)
        );
        CREATE INDEX goal_tree_proposal_items_proposal_idx
          ON goal_tree_proposal_items(proposal_id, ordinal, item_id);
        CREATE INDEX goal_tree_proposal_items_board_idx
          ON goal_tree_proposal_items(board_id, state, item_id);
      `);
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (9, ?)")
        .run(new Date().toISOString());
    });
  }

  private migrateGoalTreeProposalDecisions(): void {
    this.immediate(() => {
      const itemColumns = this.db.pragma("table_info(goal_tree_proposal_items)") as Array<{ name: string }>;
      const existing = new Set(itemColumns.map((column) => column.name));
      if (!existing.has("materialized_objects_json")) {
        this.db.exec("ALTER TABLE goal_tree_proposal_items ADD COLUMN materialized_objects_json TEXT NOT NULL DEFAULT '[]'");
      }
      if (!existing.has("revision_proposal_id")) {
        this.db.exec("ALTER TABLE goal_tree_proposal_items ADD COLUMN revision_proposal_id TEXT REFERENCES goal_tree_proposals(proposal_id)");
      }
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS goal_tree_proposal_decisions (
          decision_id TEXT PRIMARY KEY,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          proposal_id TEXT NOT NULL REFERENCES goal_tree_proposals(proposal_id) ON DELETE CASCADE,
          item_id TEXT NOT NULL REFERENCES goal_tree_proposal_items(item_id) ON DELETE CASCADE,
          decision TEXT NOT NULL CHECK (decision IN ('confirmed', 'rejected', 'revised', 'conflict')),
          actor_id TEXT NOT NULL,
          authority_source TEXT NOT NULL CHECK (authority_source IN ('runtime_dialogue', 'web', 'management')),
          runtime_actor_id TEXT,
          conversation_ref TEXT NOT NULL,
          message_ref TEXT NOT NULL,
          reason TEXT NOT NULL,
          revision_proposal_id TEXT REFERENCES goal_tree_proposals(proposal_id),
          materialized_objects_json TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS goal_tree_proposal_decisions_item_idx
          ON goal_tree_proposal_decisions(proposal_id, item_id, created_at, decision_id);
      `);
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (10, ?)")
        .run(new Date().toISOString());
    });
  }

  private migrateGoalTrash(): void {
    this.immediate(() => {
      const goalColumns = this.db.pragma("table_info(goals)") as Array<{ name: string }>;
      const existingColumns = new Set(goalColumns.map((column) => column.name));
      if (!existingColumns.has("trashed_at")) {
        this.db.exec("ALTER TABLE goals ADD COLUMN trashed_at TEXT");
      }
      if (!existingColumns.has("trashed_by")) {
        this.db.exec("ALTER TABLE goals ADD COLUMN trashed_by TEXT");
      }
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS goals_trash_idx ON goals(board_id, trashed_at);

        CREATE TABLE IF NOT EXISTS goal_trash_records (
          trash_record_id TEXT PRIMARY KEY,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
          trashed_at TEXT NOT NULL,
          trashed_by TEXT NOT NULL,
          trash_reason TEXT NOT NULL,
          restored_at TEXT,
          restored_by TEXT,
          restore_reason TEXT
        );
        CREATE UNIQUE INDEX IF NOT EXISTS goal_trash_one_open_per_goal
          ON goal_trash_records(board_id, goal_id)
          WHERE restored_at IS NULL;
        CREATE INDEX IF NOT EXISTS goal_trash_records_goal_idx
          ON goal_trash_records(board_id, goal_id, restored_at, trashed_at);

        CREATE TABLE IF NOT EXISTS goal_trash_relation_records (
          trash_record_id TEXT NOT NULL REFERENCES goal_trash_records(trash_record_id) ON DELETE CASCADE,
          relation_id TEXT NOT NULL REFERENCES goal_relations(relation_id) ON DELETE CASCADE,
          prior_state TEXT NOT NULL CHECK (prior_state = 'active'),
          deactivated_at TEXT NOT NULL,
          restored_at TEXT,
          PRIMARY KEY (trash_record_id, relation_id)
        );
        CREATE INDEX IF NOT EXISTS goal_trash_relation_records_relation_idx
          ON goal_trash_relation_records(relation_id, restored_at);
      `);
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (11, ?)")
        .run(new Date().toISOString());
    });
  }

  private migrateLifecycleState(): void {
    this.immediate(() => {
      const migratedAt = new Date().toISOString();
      const migrationActor = "goalboard:migration-12";
      const staleRuns = this.db
        .prepare(`
          SELECT
            r.run_id,
            r.board_id,
            r.goal_id,
            r.claim_id,
            r.state AS run_state,
            c.state AS claim_state,
            c.released_at
          FROM runs r
          JOIN claims c ON c.claim_id = r.claim_id
          WHERE r.state IN ('started', 'blocked') AND c.state != 'active'
          ORDER BY r.run_id
        `)
        .all() as Row[];
      for (const row of staleRuns) {
        const claimState = text(row.claim_state);
        const reason = `关联 Claim 已是 ${claimState}，迁移时关闭历史遗留 Run`;
        const endedAt = optionalText(row.released_at) ?? migratedAt;
        this.db
          .prepare(`
            UPDATE runs
            SET state = 'abandoned', block_reason = ?, ended_at = ?
            WHERE run_id = ? AND state IN ('started', 'blocked')
          `)
          .run(reason, endedAt, text(row.run_id));
        this.appendEvent({
          eventId: randomUUID(),
          boardId: text(row.board_id),
          actorId: migrationActor,
          type: "run.abandoned",
          objectType: "run",
          objectId: text(row.run_id),
          reason,
          payload: {
            claim_id: text(row.claim_id),
            claim_state: claimState,
            goal_id: text(row.goal_id),
            previous_state: text(row.run_state),
            recovery: true,
            migration_id: 12,
          },
          at: migratedAt,
        });
      }

      const staleClarifications = this.db
        .prepare(`
          SELECT
            cs.session_id,
            cs.board_id,
            cs.goal_id,
            cs.state AS session_state,
            g.definition_state,
            g.accepted_at
          FROM clarification_sessions cs
          JOIN goals g ON g.board_id = cs.board_id AND g.goal_id = cs.goal_id
          WHERE cs.state != 'closed' AND g.definition_state != 'draft'
          ORDER BY cs.session_id
        `)
        .all() as Row[];
      for (const row of staleClarifications) {
        const closedAt = optionalText(row.accepted_at) ?? migratedAt;
        const reason = "Goal 已结束 Draft 澄清，迁移时关闭历史遗留澄清会话";
        this.db
          .prepare(`
            UPDATE clarification_sessions
            SET state = 'closed', updated_at = ?, closed_at = ?
            WHERE session_id = ? AND state != 'closed'
          `)
          .run(migratedAt, closedAt, text(row.session_id));
        this.appendEvent({
          eventId: randomUUID(),
          boardId: text(row.board_id),
          actorId: migrationActor,
          type: "clarification.closed",
          objectType: "clarification_session",
          objectId: text(row.session_id),
          reason,
          payload: {
            goal_id: text(row.goal_id),
            definition_state: text(row.definition_state),
            previous_state: text(row.session_state),
            recovery: true,
            migration_id: 12,
          },
          at: migratedAt,
        });
      }

      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (12, ?)")
        .run(migratedAt);
    });
  }

  private migrateActiveGoalLifecycle(): void {
    this.immediate(() => {
      const migratedAt = new Date().toISOString();
      const migrationActor = "goalboard:migration-13";
      const staleActiveGoals = this.db
        .prepare(`
          SELECT
            b.board_id,
            b.active_goal_id,
            g.goal_id,
            g.fulfillment_state,
            g.archived_at,
            g.trashed_at
          FROM boards b
          LEFT JOIN goals g
            ON g.board_id = b.board_id AND g.goal_id = b.active_goal_id
          WHERE b.active_goal_id IS NOT NULL
            AND (
              g.goal_id IS NULL
              OR g.fulfillment_state = 'satisfied'
              OR g.archived_at IS NOT NULL
              OR g.trashed_at IS NOT NULL
            )
          ORDER BY b.board_id
        `)
        .all() as Row[];
      for (const row of staleActiveGoals) {
        const boardId = text(row.board_id);
        const goalId = text(row.active_goal_id);
        const reason = row.goal_id == null
          ? "Active Goal 已不存在，迁移时清空历史指针"
          : row.trashed_at != null
            ? "Active Goal 已在回收站，迁移时清空历史指针"
            : row.archived_at != null
              ? "Active Goal 已归档，迁移时清空历史指针"
              : "Active Goal 已完成，迁移时清空历史指针";
        this.db
          .prepare("UPDATE boards SET active_goal_id = NULL, updated_at = ? WHERE board_id = ? AND active_goal_id = ?")
          .run(migratedAt, boardId, goalId);
        this.appendEvent({
          eventId: randomUUID(),
          boardId,
          actorId: migrationActor,
          type: "board.active_goal_cleared",
          objectType: "goal",
          objectId: goalId,
          reason,
          payload: {
            previous_active_goal_id: goalId,
            fulfillment_state: optionalText(row.fulfillment_state),
            recovery: true,
            migration_id: 13,
          },
          at: migratedAt,
        });
      }

      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (13, ?)")
        .run(migratedAt);
    });
  }

  private migrateRuntimeDialogueAuthority(): void {
    this.db.pragma("foreign_keys = OFF");
    try {
      this.immediate(() => {
        this.db.exec(`
          CREATE TABLE goal_tree_proposal_decisions_v14 (
            decision_id TEXT PRIMARY KEY,
            board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
            proposal_id TEXT NOT NULL REFERENCES goal_tree_proposals(proposal_id) ON DELETE CASCADE,
            item_id TEXT NOT NULL REFERENCES goal_tree_proposal_items(item_id) ON DELETE CASCADE,
            decision TEXT NOT NULL CHECK (decision IN ('confirmed', 'rejected', 'revised', 'conflict')),
            actor_id TEXT NOT NULL,
            authority_source TEXT NOT NULL CHECK (authority_source IN ('runtime_dialogue', 'web', 'management')),
            runtime_actor_id TEXT,
            conversation_ref TEXT NOT NULL,
            message_ref TEXT NOT NULL,
            reason TEXT NOT NULL,
            revision_proposal_id TEXT REFERENCES goal_tree_proposals(proposal_id),
            materialized_objects_json TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL
          );
          INSERT INTO goal_tree_proposal_decisions_v14 (
            decision_id, board_id, proposal_id, item_id, decision, actor_id,
            authority_source, runtime_actor_id, conversation_ref, message_ref,
            reason, revision_proposal_id, materialized_objects_json, created_at
          )
          SELECT
            decision_id, board_id, proposal_id, item_id, decision, actor_id,
            CASE authority_source
              WHEN 'runtime_trusted_host' THEN 'runtime_dialogue'
              ELSE authority_source
            END, runtime_actor_id, conversation_ref, message_ref,
            reason, revision_proposal_id, materialized_objects_json, created_at
          FROM goal_tree_proposal_decisions;
          DROP TABLE goal_tree_proposal_decisions;
          ALTER TABLE goal_tree_proposal_decisions_v14 RENAME TO goal_tree_proposal_decisions;
          CREATE INDEX goal_tree_proposal_decisions_item_idx
            ON goal_tree_proposal_decisions(proposal_id, item_id, created_at, decision_id);
        `);
        this.db
          .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (14, ?)")
          .run(new Date().toISOString());
      });
    } finally {
      this.db.pragma("foreign_keys = ON");
    }
  }

  private migrateRiskTreatmentPlan(): void {
    this.immediate(() => {
      const columns = this.db.pragma("table_info(risks)") as Array<{ name: string }>;
      if (!columns.some((column) => column.name === "treatment_plan")) {
        this.db.exec("ALTER TABLE risks ADD COLUMN treatment_plan TEXT NOT NULL DEFAULT ''");
      }
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (15, ?)")
        .run(new Date().toISOString());
    });
  }

  private migratePlanningMethodPacks(): void {
    this.immediate(() => {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS planning_method_packs (
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          method_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
          pack_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (board_id, method_id)
        );
      `);
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (16, ?)")
        .run(new Date().toISOString());
    });
  }

  private migrateEvidenceCorrections(): void {
    this.immediate(() => {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS evidence_corrections (
          correction_id TEXT PRIMARY KEY,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
          target_evidence_id TEXT NOT NULL UNIQUE REFERENCES evidence(evidence_id),
          action TEXT NOT NULL CHECK (action IN ('supersede', 'retract')),
          replacement_evidence_id TEXT REFERENCES evidence(evidence_id),
          actor_id TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_at TEXT NOT NULL,
          CHECK (
            (action = 'supersede' AND replacement_evidence_id IS NOT NULL) OR
            (action = 'retract' AND replacement_evidence_id IS NULL)
          )
        );
        CREATE INDEX IF NOT EXISTS evidence_corrections_goal_idx
          ON evidence_corrections(board_id, goal_id, created_at, correction_id);
      `);
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (17, ?)")
        .run(new Date().toISOString());
    });
  }

  private migrateEvidenceLocatorValidation(): void {
    this.immediate(() => {
      const columns = this.db.pragma("table_info(evidence)") as Array<{ name: string }>;
      if (!columns.some((column) => column.name === "locator_status")) {
        this.db.exec("ALTER TABLE evidence ADD COLUMN locator_status TEXT NOT NULL DEFAULT 'unverified' CHECK (locator_status IN ('verified', 'unverified'))");
      }
      if (!columns.some((column) => column.name === "locator_validation_reason")) {
        this.db.exec("ALTER TABLE evidence ADD COLUMN locator_validation_reason TEXT NOT NULL DEFAULT '历史 Evidence 未进行 locator 预检'");
      }
      if (!columns.some((column) => column.name === "locator_checked_at")) {
        this.db.exec("ALTER TABLE evidence ADD COLUMN locator_checked_at TEXT");
      }
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (18, ?)")
        .run(new Date().toISOString());
    });
  }

  private migrateEvidenceLocatorWorkspace(): void {
    this.immediate(() => {
      const columns = this.db.pragma("table_info(evidence)") as Array<{ name: string }>;
      if (!columns.some((column) => column.name === "locator_workspace_id")) {
        this.db.exec("ALTER TABLE evidence ADD COLUMN locator_workspace_id TEXT");
      }
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (19, ?)")
        .run(new Date().toISOString());
    });
  }

  private migrateEvidenceLocatorSource(): void {
    this.immediate(() => {
      const columns = this.db.pragma("table_info(evidence)") as Array<{ name: string }>;
      if (!columns.some((column) => column.name === "locator_workspace_root")) {
        this.db.exec("ALTER TABLE evidence ADD COLUMN locator_workspace_root TEXT");
      }
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (20, ?)")
        .run(new Date().toISOString());
    });
  }

  eventCursor(boardId: string): number {
    const row = this.db
      .prepare("SELECT COALESCE(MAX(seq), 0) AS cursor FROM events WHERE board_id = ?")
      .get(boardId) as Row;
    return number(row.cursor);
  }

  appendEvent(input: {
    eventId: string;
    boardId: string;
    actorId: string;
    type: string;
    objectType: string;
    objectId: string;
    reason: string;
    payload: unknown;
    at: string;
  }): number {
    const result = this.db
      .prepare(`
        INSERT INTO events (
          event_id, board_id, actor_id, type, object_type, object_id, reason, payload_json, at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        input.eventId,
        input.boardId,
        input.actorId,
        input.type,
        input.objectType,
        input.objectId,
        input.reason,
        json(input.payload),
        input.at,
      );
    return Number(result.lastInsertRowid);
  }

  getIdempotency(
    boardId: string,
    actorId: string,
    operation: string,
    key: string,
  ): { request_hash: string; outcome: unknown } | null {
    const row = this.db
      .prepare(`
        SELECT request_hash, outcome_json FROM idempotency_records
        WHERE board_id = ? AND actor_id = ? AND operation = ? AND idempotency_key = ?
      `)
      .get(boardId, actorId, operation, key) as Row | undefined;
    if (!row) return null;
    return {
      request_hash: text(row.request_hash),
      outcome: parseJson(row.outcome_json, null),
    };
  }

  putIdempotency(input: {
    boardId: string;
    actorId: string;
    operation: string;
    key: string;
    requestHash: string;
    outcome: unknown;
    at: string;
  }): void {
    this.db
      .prepare(`
        INSERT INTO idempotency_records (
          board_id, actor_id, operation, idempotency_key, request_hash, outcome_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        input.boardId,
        input.actorId,
        input.operation,
        input.key,
        input.requestHash,
        json(input.outcome),
        input.at,
      );
  }

  getGoal(goalId: string): GoalRecord | null {
    const row = this.db.prepare("SELECT * FROM goals WHERE goal_id = ?").get(goalId) as
      | Row
      | undefined;
    if (!row) return null;
    const criteria = this.db
      .prepare("SELECT * FROM acceptance_criteria WHERE goal_id = ? ORDER BY criterion_id")
      .all(goalId) as Row[];
    return this.mapGoal(row, criteria);
  }

  listGoals(boardId: string): GoalRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM goals WHERE board_id = ? ORDER BY priority DESC, created_at, goal_id")
      .all(boardId) as Row[];
    const criteriaRows = this.db
      .prepare(`
        SELECT ac.* FROM acceptance_criteria ac
        JOIN goals g ON g.goal_id = ac.goal_id
        WHERE g.board_id = ? ORDER BY ac.criterion_id
      `)
      .all(boardId) as Row[];
    const byGoal = new Map<string, Row[]>();
    for (const criterion of criteriaRows) {
      const goalId = text(criterion.goal_id);
      byGoal.set(goalId, [...(byGoal.get(goalId) ?? []), criterion]);
    }
    return rows.map((row) => this.mapGoal(row, byGoal.get(text(row.goal_id)) ?? []));
  }

  listTrashedGoals(boardId: string): GoalRecord[] {
    return this.listGoals(boardId).filter((goal) => goal.trashed_at !== null);
  }

  listPlanningMethodPacks(boardId: string): PlanningMethodPack[] {
    return (this.db
      .prepare("SELECT pack_json FROM planning_method_packs WHERE board_id = ? ORDER BY method_id")
      .all(boardId) as Row[])
      .map((row) => parseJson<PlanningMethodPack | null>(row.pack_json, null))
      .filter((pack): pack is PlanningMethodPack => pack != null);
  }

  putPlanningMethodPack(boardId: string, pack: PlanningMethodPack): void {
    this.db
      .prepare(`
        INSERT INTO planning_method_packs (
          board_id, method_id, version, enabled, pack_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(board_id, method_id) DO UPDATE SET
          version = excluded.version,
          enabled = excluded.enabled,
          pack_json = excluded.pack_json,
          updated_at = excluded.updated_at
      `)
      .run(
        boardId,
        pack.method_id,
        pack.version,
        pack.enabled ? 1 : 0,
        json(pack),
        pack.created_at,
        pack.updated_at,
      );
  }

  snapshot(boardId: string): BoardSnapshot {
    const board = this.db.prepare("SELECT * FROM boards WHERE board_id = ?").get(boardId) as
      | Row
      | undefined;
    if (!board) throw new Error(`Board 不存在: ${boardId}`);
    const evidenceCorrections = (this.db
      .prepare("SELECT * FROM evidence_corrections WHERE board_id = ? ORDER BY created_at, correction_id")
      .all(boardId) as Row[]).map(mapEvidenceCorrection);
    const evidenceCorrectionByTarget = new Map(
      evidenceCorrections.map((correction) => [correction.target_evidence_id, correction]),
    );
    return {
      board: {
        board_id: text(board.board_id),
        title: text(board.title),
        active_goal_id: optionalText(board.active_goal_id),
        created_at: text(board.created_at),
        updated_at: text(board.updated_at),
      },
      cursor: this.eventCursor(boardId),
      goals: this.listGoals(boardId),
      relations: (this.db
        .prepare("SELECT * FROM goal_relations WHERE board_id = ? ORDER BY created_at, relation_id")
        .all(boardId) as Row[]).map(mapRelation),
      impacts: (this.db
        .prepare("SELECT * FROM impact_bindings WHERE board_id = ? ORDER BY surface, binding_id")
        .all(boardId) as Row[]).map(mapImpact),
      risks: (this.db
        .prepare("SELECT * FROM risks WHERE board_id = ? ORDER BY created_at, risk_id")
        .all(boardId) as Row[]).map(mapRisk),
      claims: (this.db
        .prepare("SELECT * FROM claims WHERE board_id = ? ORDER BY claimed_at DESC, claim_id")
        .all(boardId) as Row[]).map(mapClaim),
      runs: (this.db
        .prepare("SELECT * FROM runs WHERE board_id = ? ORDER BY started_at DESC, run_id")
        .all(boardId) as Row[]).map(mapRun),
      evidence: (this.db
        .prepare("SELECT * FROM evidence WHERE board_id = ? ORDER BY captured_at DESC, evidence_id")
        .all(boardId) as Row[]).map((row) => mapEvidence(row, evidenceCorrectionByTarget.get(text(row.evidence_id)) ?? null)),
      evidence_corrections: evidenceCorrections,
      review_obligations: (this.db
        .prepare("SELECT * FROM review_obligations WHERE board_id = ? ORDER BY created_at, obligation_id")
        .all(boardId) as Row[]).map(mapReviewObligation),
      reviews: (this.db
        .prepare("SELECT * FROM reviews WHERE board_id = ? ORDER BY submitted_at, review_id")
        .all(boardId) as Row[]).map(mapReview),
      candidates: (this.db
        .prepare("SELECT * FROM candidates WHERE board_id = ? ORDER BY created_at DESC, candidate_id")
        .all(boardId) as Row[]).map(mapCandidate),
      contract_proposals: (this.db
        .prepare("SELECT * FROM contract_proposals WHERE board_id = ? ORDER BY created_at DESC, proposal_id")
        .all(boardId) as Row[]).map(mapContractProposal),
      rewires: (this.db
        .prepare("SELECT * FROM rewires WHERE board_id = ? ORDER BY created_at DESC, rewire_id")
        .all(boardId) as Row[]).map(mapRewire),
      clarification_sessions: (this.db
        .prepare("SELECT * FROM clarification_sessions WHERE board_id = ? ORDER BY updated_at DESC, session_id")
        .all(boardId) as Row[]).map(mapClarificationSession),
      clarification_turns: (this.db
        .prepare("SELECT * FROM clarification_turns WHERE board_id = ? ORDER BY session_id, turn_index, turn_id")
        .all(boardId) as Row[]).map(mapClarificationTurn),
      goal_tree_proposals: this.readGoalTreeProposals(boardId),
      planning_method_packs: this.listPlanningMethodPacks(boardId),
    };
  }

  private readGoalTreeProposals(boardId: string): GoalTreeProposalRecord[] {
    const decisionsByProposal = new Map<string, GoalTreeProposalDecisionRecord[]>();
    const latestDecisionByItem = new Map<string, GoalTreeProposalDecisionRecord>();
    for (const row of this.db
      .prepare(`
        SELECT * FROM goal_tree_proposal_decisions
        WHERE board_id = ?
        ORDER BY proposal_id, item_id, created_at, decision_id
      `)
      .all(boardId) as Row[]) {
      const decision = mapGoalTreeProposalDecision(row);
      decisionsByProposal.set(
        decision.proposal_id,
        [...(decisionsByProposal.get(decision.proposal_id) ?? []), decision],
      );
      latestDecisionByItem.set(decision.item_id, decision);
    }
    const itemsByProposal = new Map<string, GoalTreeProposalItemRecord[]>();
    for (const row of this.db
      .prepare("SELECT * FROM goal_tree_proposal_items WHERE board_id = ? ORDER BY proposal_id, ordinal, item_id")
      .all(boardId) as Row[]) {
      const item = mapGoalTreeProposalItem(row, latestDecisionByItem.get(text(row.item_id)) ?? null);
      itemsByProposal.set(item.proposal_id, [...(itemsByProposal.get(item.proposal_id) ?? []), item]);
    }
    return (this.db
      .prepare("SELECT * FROM goal_tree_proposals WHERE board_id = ? ORDER BY created_at DESC, proposal_id")
      .all(boardId) as Row[]).map((row) =>
      mapGoalTreeProposal(
        row,
        itemsByProposal.get(text(row.proposal_id)) ?? [],
        decisionsByProposal.get(text(row.proposal_id)) ?? [],
      ),
    );
  }

  activePolicyRows(boardId: string, goalId: string): Array<{
    scope: string;
    goal_id: string | null;
    policy: Partial<GoalPolicy>;
  }> {
    return (this.db
      .prepare(`
        SELECT scope, goal_id, policy_json FROM policy_bindings
        WHERE board_id = ? AND state = 'active' AND (goal_id IS NULL OR goal_id = ?)
        ORDER BY CASE scope WHEN 'project_default' THEN 0 WHEN 'ancestor_minimum' THEN 1 ELSE 2 END,
                 created_at
      `)
      .all(boardId, goalId) as Row[]).map((row) => ({
      scope: text(row.scope),
      goal_id: optionalText(row.goal_id),
      policy: parseJson<Partial<GoalPolicy>>(row.policy_json, {}),
    }));
  }

  private mapGoal(row: Row, criteria: Row[]): GoalRecord {
    return {
      goal_id: text(row.goal_id),
      board_id: text(row.board_id),
      title: text(row.title),
      outcome: text(row.outcome),
      why: text(row.why),
      business_logic: text(row.business_logic),
      in_scope: parseJson<string[]>(row.in_scope_json, []),
      out_of_scope: parseJson<string[]>(row.out_of_scope_json, []),
      constraints: parseJson<string[]>(row.constraints_json, []),
      required_inputs: parseJson<string[]>(row.required_inputs_json, []),
      promised_outputs: parseJson<string[]>(row.promised_outputs_json, []),
      definition_state: text(row.definition_state) as GoalRecord["definition_state"],
      decomposition_state: text(row.decomposition_state) as GoalRecord["decomposition_state"],
      validity_state: text(row.validity_state) as GoalRecord["validity_state"],
      fulfillment_state: text(row.fulfillment_state) as GoalRecord["fulfillment_state"],
      trashed_at: optionalText(row.trashed_at),
      trashed_by: optionalText(row.trashed_by),
      archived_at: optionalText(row.archived_at),
      archived_by: optionalText(row.archived_by),
      priority: number(row.priority),
      accepted_by: optionalText(row.accepted_by),
      accepted_at: optionalText(row.accepted_at),
      created_at: text(row.created_at),
      updated_at: text(row.updated_at),
      acceptance_criteria: criteria.map(mapCriterion),
    };
  }
}

function mapCriterion(row: Row): AcceptanceCriterion {
  return {
    criterion_id: text(row.criterion_id),
    goal_id: text(row.goal_id),
    statement: text(row.statement),
    decision_method: text(row.decision_method) as AcceptanceCriterion["decision_method"],
    pass_condition: text(row.pass_condition),
    target: parseJson<Record<string, unknown> | null>(row.target_json, null),
    required_evidence: parseJson<string[]>(row.required_evidence_json, []),
  };
}

function mapRelation(row: Row): GoalRelationRecord {
  return {
    relation_id: text(row.relation_id),
    board_id: text(row.board_id),
    from_goal_id: text(row.from_goal_id),
    to_goal_id: text(row.to_goal_id),
    type: text(row.type) as GoalRelationRecord["type"],
    state: text(row.state) as GoalRelationRecord["state"],
    reason: text(row.reason),
    created_by: text(row.created_by),
    created_at: text(row.created_at),
    deactivated_at: optionalText(row.deactivated_at),
  };
}

function mapImpact(row: Row): ImpactBindingRecord {
  return {
    binding_id: text(row.binding_id),
    board_id: text(row.board_id),
    goal_id: text(row.goal_id),
    surface: text(row.surface),
    access: text(row.access) as ImpactBindingRecord["access"],
    input_snapshot: optionalText(row.input_snapshot),
    state: text(row.state) as ImpactBindingRecord["state"],
    reason: text(row.reason),
    created_by: text(row.created_by),
    created_at: text(row.created_at),
    updated_at: text(row.updated_at) || text(row.created_at),
    deactivated_at: optionalText(row.deactivated_at),
    deactivation_reason: optionalText(row.deactivation_reason),
  };
}

function mapRisk(row: Row): RiskRecord {
  return {
    risk_id: text(row.risk_id),
    board_id: text(row.board_id),
    description: text(row.description),
    probability: text(row.probability),
    impact: text(row.impact),
    affected_surfaces: parseJson<string[]>(row.affected_surfaces_json, []),
    trigger: text(row.trigger),
    treatment: text(row.treatment) as RiskRecord["treatment"],
    treatment_plan: text(row.treatment_plan),
    blocking_mode: text(row.blocking_mode) as RiskRecord["blocking_mode"],
    revisit_condition: text(row.revisit_condition),
    owner: text(row.owner),
    state: text(row.state) as RiskRecord["state"],
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
  };
}

function mapClaim(row: Row): ClaimRecord {
  return {
    claim_id: text(row.claim_id),
    board_id: text(row.board_id),
    goal_id: text(row.goal_id),
    actor_id: text(row.actor_id),
    role: text(row.role) as ClaimRecord["role"],
    state: text(row.state) as ClaimRecord["state"],
    capabilities: parseJson<string[]>(row.capabilities_json, []),
    goal_mode_attestation: bool(row.goal_mode_attestation),
    resolved_policy: parseJson<GoalPolicy>(row.resolved_policy_json, {} as GoalPolicy),
    claimed_at: text(row.claimed_at),
    expires_at: text(row.expires_at),
    renewed_at: optionalText(row.renewed_at),
    released_at: optionalText(row.released_at),
    release_reason: optionalText(row.release_reason),
  };
}

function mapRun(row: Row): RunRecord {
  return {
    run_id: text(row.run_id),
    board_id: text(row.board_id),
    goal_id: text(row.goal_id),
    claim_id: text(row.claim_id),
    actor_id: text(row.actor_id),
    role: text(row.role) as RunRecord["role"],
    state: text(row.state) as RunRecord["state"],
    block_reason: optionalText(row.block_reason),
    output_refs: parseJson<string[]>(row.output_refs_json, []),
    discovery_refs: parseJson<string[]>(row.discovery_refs_json, []),
    started_at: text(row.started_at),
    ended_at: optionalText(row.ended_at),
  };
}

function mapEvidenceCorrection(row: Row): EvidenceCorrectionRecord {
  return {
    correction_id: text(row.correction_id),
    board_id: text(row.board_id),
    goal_id: text(row.goal_id),
    target_evidence_id: text(row.target_evidence_id),
    action: text(row.action) as EvidenceCorrectionRecord["action"],
    replacement_evidence_id: optionalText(row.replacement_evidence_id),
    actor_id: text(row.actor_id),
    reason: text(row.reason),
    created_at: text(row.created_at),
  };
}

function mapEvidence(row: Row, correction: EvidenceCorrectionRecord | null = null): EvidenceRecord {
  return {
    evidence_id: text(row.evidence_id),
    board_id: text(row.board_id),
    goal_id: text(row.goal_id),
    criterion_ids: parseJson<string[]>(row.criterion_ids_json, []),
    producer_actor_id: text(row.producer_actor_id),
    run_id: optionalText(row.run_id),
    review_id: optionalText(row.review_id),
    kind: text(row.kind) as EvidenceRecord["kind"],
    locator: text(row.locator),
    locator_status: (text(row.locator_status) || "unverified") as EvidenceRecord["locator_status"],
    locator_validation_reason: text(row.locator_validation_reason) || "历史 Evidence 未进行 locator 预检",
    locator_checked_at: optionalText(row.locator_checked_at),
    locator_workspace_id: optionalText(row.locator_workspace_id),
    digest: optionalText(row.digest),
    captured_at: text(row.captured_at),
    result: text(row.result) as EvidenceRecord["result"],
    lifecycle_state: correction?.action === "supersede"
      ? "superseded"
      : correction?.action === "retract"
        ? "retracted"
        : "effective",
    correction,
  };
}

function mapReviewObligation(row: Row): ReviewObligationRecord {
  return {
    obligation_id: text(row.obligation_id),
    board_id: text(row.board_id),
    goal_id: text(row.goal_id),
    role: text(row.role) as ReviewObligationRecord["role"],
    required_count: number(row.required_count),
    independence_rule: text(row.independence_rule),
    criterion_scope: parseJson<string[]>(row.criterion_scope_json, []),
    state: text(row.state) as ReviewObligationRecord["state"],
    created_at: text(row.created_at),
  };
}

function mapReview(row: Row): ReviewRecord {
  return {
    review_id: text(row.review_id),
    board_id: text(row.board_id),
    goal_id: text(row.goal_id),
    obligation_id: text(row.obligation_id),
    claim_id: optionalText(row.claim_id),
    actor_id: text(row.actor_id),
    verdict: text(row.verdict) as ReviewRecord["verdict"],
    evidence_refs: parseJson<string[]>(row.evidence_refs_json, []),
    reasoning: text(row.reasoning),
    submitted_at: text(row.submitted_at),
  };
}

function mapCandidate(row: Row): CandidateGoalRecord {
  return {
    candidate_id: text(row.candidate_id),
    board_id: text(row.board_id),
    submitted_by: text(row.submitted_by),
    discovered_in_run_id: optionalText(row.discovered_in_run_id),
    proposed_goal: parseJson(row.proposed_goal_json, {} as CandidateGoalRecord["proposed_goal"]),
    proposed_relations: parseJson<Array<Record<string, unknown>>>(row.proposed_relations_json, []),
    proposed_impacts: parseJson<Array<Record<string, unknown>>>(row.proposed_impacts_json, []),
    proposed_risks: parseJson<Array<Record<string, unknown>>>(row.proposed_risks_json, []),
    blocking_mode: text(row.blocking_mode) as CandidateGoalRecord["blocking_mode"],
    state: text(row.state) as CandidateGoalRecord["state"],
    decision: parseJson<Record<string, unknown> | null>(row.decision_json, null),
    created_at: text(row.created_at),
    decided_at: optionalText(row.decided_at),
  };
}

function mapContractProposal(row: Row): ContractProposalRecord {
  return {
    proposal_id: text(row.proposal_id),
    board_id: text(row.board_id),
    goal_id: text(row.goal_id),
    submitted_by: text(row.submitted_by),
    discovered_in_run_id: text(row.discovered_in_run_id),
    proposed_goal: parseJson(row.proposed_goal_json, {} as ContractProposalRecord["proposed_goal"]),
    field_sources: parseJson(row.field_sources_json, [] as ContractProposalRecord["field_sources"]),
    review_policy: parseJson(row.review_policy_json, {} as ContractProposalRecord["review_policy"]),
    proposed_impacts: parseJson(row.proposed_impacts_json, [] as ContractProposalRecord["proposed_impacts"]),
    proposed_risks: parseJson(row.proposed_risks_json, [] as ContractProposalRecord["proposed_risks"]),
    dependency_rewire_ids: parseJson<string[]>(row.dependency_rewire_ids_json, []),
    state: text(row.state) as ContractProposalRecord["state"],
    decision: parseJson<Record<string, unknown> | null>(row.decision_json, null),
    created_at: text(row.created_at),
    decided_at: optionalText(row.decided_at),
  };
}

function mapClarificationSession(row: Row): ClarificationSessionRecord {
  return {
    session_id: text(row.session_id),
    board_id: text(row.board_id),
    goal_id: text(row.goal_id),
    claim_id: optionalText(row.claim_id),
    run_id: optionalText(row.run_id),
    rough_idea: text(row.rough_idea),
    state: text(row.state) as ClarificationSessionRecord["state"],
    current_understanding: optionalText(row.current_understanding),
    next_question: optionalText(row.next_question),
    proposal_summary: optionalText(row.proposal_summary),
    created_by: text(row.created_by),
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
    closed_at: optionalText(row.closed_at),
  };
}

function mapClarificationTurn(row: Row): ClarificationTurnRecord {
  return {
    turn_id: text(row.turn_id),
    session_id: text(row.session_id),
    board_id: text(row.board_id),
    goal_id: text(row.goal_id),
    run_id: optionalText(row.run_id),
    actor_id: text(row.actor_id),
    turn_index: number(row.turn_index),
    turn_kind: text(row.turn_kind) as ClarificationTurnRecord["turn_kind"],
    user_message: text(row.user_message),
    current_understanding: optionalText(row.current_understanding),
    known_facts: parseJson(row.known_facts_json, [] as ClarificationTurnRecord["known_facts"]),
    assumptions: parseJson(row.assumptions_json, [] as ClarificationTurnRecord["assumptions"]),
    next_question: optionalText(row.next_question),
    proposal_summary: optionalText(row.proposal_summary),
    created_at: text(row.created_at),
  };
}

function mapGoalTreeProposalDecision(row: Row): GoalTreeProposalDecisionRecord {
  return {
    decision_id: text(row.decision_id),
    board_id: text(row.board_id),
    proposal_id: text(row.proposal_id),
    item_id: text(row.item_id),
    decision: text(row.decision) as GoalTreeProposalDecisionRecord["decision"],
    actor_id: text(row.actor_id),
    authority_source: text(row.authority_source) as GoalTreeProposalDecisionRecord["authority_source"],
    runtime_actor_id: optionalText(row.runtime_actor_id),
    conversation_ref: text(row.conversation_ref),
    message_ref: text(row.message_ref),
    reason: text(row.reason),
    revision_proposal_id: optionalText(row.revision_proposal_id),
    materialized_objects: parseJson<GoalTreeProposalDecisionRecord["materialized_objects"]>(
      row.materialized_objects_json,
      [],
    ),
    created_at: text(row.created_at),
  };
}

function mapGoalTreeProposalItem(
  row: Row,
  decision: GoalTreeProposalDecisionRecord | null,
): GoalTreeProposalItemRecord {
  return {
    item_id: text(row.item_id),
    proposal_id: text(row.proposal_id),
    board_id: text(row.board_id),
    ordinal: number(row.ordinal),
    kind: text(row.kind) as GoalTreeProposalItemRecord["kind"],
    operation: text(row.operation) as GoalTreeProposalItemRecord["operation"],
    payload: parseJson<Record<string, unknown>>(row.payload_json, {}),
    source_refs: parseJson<string[]>(row.source_refs_json, []),
    reason: text(row.reason),
    confidence: number(row.confidence),
    affected_objects: parseJson<GoalTreeProposalItemRecord["affected_objects"]>(
      row.affected_objects_json,
      [],
    ),
    baseline_versions: parseJson<GoalTreeProposalItemRecord["baseline_versions"]>(
      row.baseline_versions_json,
      [],
    ),
    requires_user_confirmation: bool(row.requires_user_confirmation),
    state: text(row.state) as GoalTreeProposalItemRecord["state"],
    conflict: parseJson<Record<string, unknown> | null>(row.conflict_json, null),
    decision,
    materialized_objects: parseJson<GoalTreeProposalItemRecord["materialized_objects"]>(
      row.materialized_objects_json,
      [],
    ),
    revision_proposal_id: optionalText(row.revision_proposal_id),
    supersedes_item_id: optionalText(row.supersedes_item_id),
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
  };
}

function mapGoalTreeProposal(
  row: Row,
  items: GoalTreeProposalItemRecord[],
  decisions: GoalTreeProposalDecisionRecord[],
): GoalTreeProposalRecord {
  return {
    proposal_id: text(row.proposal_id),
    board_id: text(row.board_id),
    origin: "native",
    root_goal_id: optionalText(row.root_goal_id),
    submitted_by: text(row.submitted_by),
    discovered_in_run_id: optionalText(row.discovered_in_run_id),
    state: text(row.state) as GoalTreeProposalRecord["state"],
    version: number(row.version),
    supersedes_proposal_id: optionalText(row.supersedes_proposal_id),
    base_event_cursor: number(row.base_event_cursor),
    summary: text(row.summary),
    decision: parseJson<Record<string, unknown> | null>(row.decision_json, null),
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
    decided_at: optionalText(row.decided_at),
    items,
    decisions,
  };
}

function mapRewire(row: Row): RewireRecord {
  return {
    rewire_id: text(row.rewire_id),
    board_id: text(row.board_id),
    candidate_id: optionalText(row.candidate_id),
    proposal: parseJson<RewireRecord["proposal"]>(row.proposal_json, {}),
    impact: parseJson<Record<string, unknown>>(row.impact_json, {}),
    state: text(row.state) as RewireRecord["state"],
    created_at: text(row.created_at),
    decided_at: optionalText(row.decided_at),
  };
}

export const sqliteJson = json;
export const mapSqliteClaim = mapClaim;

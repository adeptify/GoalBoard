import Database from "better-sqlite3";
import {
  ARTIFACTS_SCHEMA_SQL,
  migrateArtifactsSchema,
  type ArtifactsSqliteDatabase,
} from "@adeptify/goalboard-module-artifacts";
import {
  EVIDENCE_SCHEMA_SQL,
  EvidenceRepository,
  evidenceCorrectionsMigrationRequired,
  migrateEvidenceContractRevisionColumns,
  migrateEvidenceCorrections,
  migrateEvidenceLocatorSource,
  migrateEvidenceLocatorValidation,
  migrateEvidenceLocatorWorkspace,
  type EvidenceMigrationDatabase,
  type EvidenceSqliteDatabase,
} from "@adeptify/goalboard-module-evidence-verification";
import {
  EXECUTION_SCHEMA_SQL,
  ExecutionRepository,
  migrateClarifierRoles,
  migrateExecutionActionColumns,
  migrateReviewerRunRoles,
  migrateUnifiedClaimRolesAndExclusivity,
  type ExecutionMigrationDatabase,
  type ExecutionSqliteDatabase,
} from "@adeptify/goalboard-module-execution";
import {
  GOVERNANCE_SCHEMA_SQL,
  GovernanceRepository,
  governanceLegacySupersessionMigrationRequired,
  governanceNarrativeMigrationRequired,
  migrateContractProposals,
  migrateGoalTreeLegacySupersession,
  migrateGoalTreeProposalDecisions,
  migrateGoalTreeProposalNarrative,
  migrateGoalTreeProposals,
  migrateReviewContractRevisionColumn,
  migrateRuntimeDialogueAuthority,
  type GovernanceSqliteDatabase,
} from "@adeptify/goalboard-module-governance-collaboration";
import {
  migrateActiveGoalLifecycle,
  migrateGoalArchiveSchema,
  migrateGoalContractCoverageSchema,
  migrateGoalLifecycleState,
  migratePlanningMethodPacksSchema,
  migrateGoalTrashSchema,
  GoalsRepository,
  GoalsQueryService,
  type GoalLifecycleMigrationDatabase,
} from "@adeptify/goalboard-module-goals";
import { migrateFeedTables, migrateInfoflowContractV2 } from "../feed/store.js";
import type { PlanningMethodPack } from "@adeptify/goalboard-contracts/modules/goals";
import type {
  AcceptanceCriterion,
  BoardSnapshot,
  ClarificationSessionRecord,
  ClarificationTurnRecord,
  CoverageContractRevisionRecord,
  GoalContractRevisionRecord,
  GoalLifecycleEventRecord,
  GoalPolicy,
  GoalRecord,
  ImpactBindingRecord,
  ProjectGuidanceEntryRecord,
  ProjectGuidanceRevisionRecord,
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
          decomposition_review_json TEXT,
          definition_state TEXT NOT NULL CHECK (definition_state IN ('draft', 'accepted')),
          decomposition_state TEXT NOT NULL CHECK (decomposition_state IN ('abstract', 'frontier_open', 'closed_leaf', 'closed_compound')),
          validity_state TEXT NOT NULL CHECK (validity_state IN ('valid', 'needs_revalidation', 'invalidated')),
          fulfillment_state TEXT NOT NULL CHECK (fulfillment_state IN ('unmet', 'satisfied')),
          current_contract_revision INTEGER NOT NULL DEFAULT 1,
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

        CREATE TABLE goal_contract_revisions (
          goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          revision INTEGER NOT NULL,
          contract_json TEXT NOT NULL,
          effect TEXT NOT NULL CHECK (effect IN ('metadata', 'revalidate', 'rework')),
          source_proposal_id TEXT,
          changed_by TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (goal_id, revision)
        );
        CREATE INDEX goal_contract_revisions_board_idx
          ON goal_contract_revisions(board_id, goal_id, revision DESC);

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
          resolution_basis_json TEXT,
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

        ${EXECUTION_SCHEMA_SQL}

        ${EVIDENCE_SCHEMA_SQL}

        ${GOVERNANCE_SCHEMA_SQL}

        ${ARTIFACTS_SCHEMA_SQL}

        CREATE TABLE coverage_contract_revisions (
          parent_goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
          child_goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
          parent_contract_revision INTEGER NOT NULL,
          child_contract_revision INTEGER NOT NULL,
          recorded_at TEXT NOT NULL,
          PRIMARY KEY (parent_goal_id, child_goal_id, parent_contract_revision)
        );
        CREATE INDEX coverage_contract_revisions_child_idx
          ON coverage_contract_revisions(child_goal_id, child_contract_revision);

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

        CREATE TABLE project_guidance_entries (
          guidance_id TEXT PRIMARY KEY,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          position INTEGER NOT NULL,
          revision INTEGER NOT NULL DEFAULT 1,
          active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
          kind TEXT NOT NULL CHECK (kind IN ('context', 'requirement', 'constraint', 'convention', 'workflow', 'quality_bar')),
          content TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          source_refs_json TEXT NOT NULL DEFAULT '[]',
          created_by TEXT NOT NULL,
          confirmation_summary TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_by TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(board_id, position),
          UNIQUE(board_id, kind, content_hash)
        );
        CREATE INDEX project_guidance_board_idx
          ON project_guidance_entries(board_id, position, guidance_id);

        CREATE TABLE project_guidance_revisions (
          revision_id TEXT PRIMARY KEY,
          guidance_id TEXT NOT NULL REFERENCES project_guidance_entries(guidance_id) ON DELETE CASCADE,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          revision INTEGER NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('context', 'requirement', 'constraint', 'convention', 'workflow', 'quality_bar')),
          content TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          source_refs_json TEXT NOT NULL DEFAULT '[]',
          active INTEGER NOT NULL CHECK (active IN (0, 1)),
          changed_by TEXT NOT NULL,
          change_kind TEXT NOT NULL CHECK (change_kind IN ('created', 'edited', 'deactivated', 'restored')),
          confirmation_summary TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE(guidance_id, revision)
        );
        CREATE INDEX project_guidance_revisions_board_idx
          ON project_guidance_revisions(board_id, guidance_id, revision DESC);

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
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (21, ?)")
        .run(new Date().toISOString());
      migrateFeedTables(this.db);
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (22, ?)")
        .run(new Date().toISOString());
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (23, ?)")
        .run(new Date().toISOString());
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (24, ?)")
        .run(new Date().toISOString());
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (25, ?)")
        .run(new Date().toISOString());
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (26, ?)")
        .run(new Date().toISOString());
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (27, ?)")
        .run(new Date().toISOString());
      migrateInfoflowContractV2(this.db);
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (28, ?)")
        .run(new Date().toISOString());
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (29, ?)")
        .run(new Date().toISOString());
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (30, ?)")
        .run(new Date().toISOString());
      this.db
        .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (31, ?)")
        .run(new Date().toISOString());
      });
      return;
    }

    const clarifierRolesApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 2")
      .get();
    if (!clarifierRolesApplied) {
      migrateClarifierRoles(this.db as unknown as ExecutionMigrationDatabase);
    }
    const contractProposalsApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 3")
      .get();
    if (!contractProposalsApplied) {
      migrateContractProposals(this.db as unknown as GovernanceSqliteDatabase);
    }
    const goalArchiveApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 4")
      .get();
    if (!goalArchiveApplied) {
      migrateGoalArchiveSchema(this.db as unknown as GoalLifecycleMigrationDatabase);
    }
    const impactHistoryApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 5")
      .get();
    if (!impactHistoryApplied) this.migrateImpactHistory();
    const reviewerRunRolesApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 6")
      .get();
    if (!reviewerRunRolesApplied) {
      migrateReviewerRunRoles(this.db as unknown as ExecutionMigrationDatabase);
    }
    const unifiedClaimRolesApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 7")
      .get();
    if (!unifiedClaimRolesApplied) {
      migrateUnifiedClaimRolesAndExclusivity(this.db as unknown as ExecutionMigrationDatabase);
    }
    const clarificationDialogueApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 8")
      .get();
    if (!clarificationDialogueApplied) this.migrateClarificationDialogue();
    const goalTreeProposalsApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 9")
      .get();
    if (!goalTreeProposalsApplied) {
      migrateGoalTreeProposals(this.db as unknown as GovernanceSqliteDatabase);
    }
    const goalTreeProposalDecisionsApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 10")
      .get();
    if (!goalTreeProposalDecisionsApplied) {
      migrateGoalTreeProposalDecisions(this.db as unknown as GovernanceSqliteDatabase);
    }
    const goalTrashApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 11")
      .get();
    if (!goalTrashApplied) {
      migrateGoalTrashSchema(this.db as unknown as GoalLifecycleMigrationDatabase);
    }
    const lifecycleReconciliationApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 12")
      .get();
    if (!lifecycleReconciliationApplied) {
      migrateGoalLifecycleState(this.db as unknown as GoalLifecycleMigrationDatabase);
    }
    const activeGoalLifecycleApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 13")
      .get();
    if (!activeGoalLifecycleApplied) {
      migrateActiveGoalLifecycle(this.db as unknown as GoalLifecycleMigrationDatabase);
    }
    const runtimeDialogueAuthorityApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 14")
      .get();
    if (!runtimeDialogueAuthorityApplied) {
      migrateRuntimeDialogueAuthority(this.db as unknown as GovernanceSqliteDatabase);
    }
    const riskTreatmentPlanApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 15")
      .get();
    if (!riskTreatmentPlanApplied) this.migrateRiskTreatmentPlan();
    const planningMethodPacksApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 16")
      .get();
    if (!planningMethodPacksApplied) {
      migratePlanningMethodPacksSchema(this.db as unknown as GoalLifecycleMigrationDatabase);
    }
    if (evidenceCorrectionsMigrationRequired(this.db as unknown as EvidenceMigrationDatabase)) {
      migrateEvidenceCorrections(this.db as unknown as EvidenceMigrationDatabase);
    }
    const evidenceLocatorValidationApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 18")
      .get();
    if (!evidenceLocatorValidationApplied) {
      migrateEvidenceLocatorValidation(this.db as unknown as EvidenceMigrationDatabase);
    }
    const evidenceLocatorWorkspaceApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 19")
      .get();
    if (!evidenceLocatorWorkspaceApplied) {
      migrateEvidenceLocatorWorkspace(this.db as unknown as EvidenceMigrationDatabase);
    }
    const evidenceLocatorSourceApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 20")
      .get();
    if (!evidenceLocatorSourceApplied) {
      migrateEvidenceLocatorSource(this.db as unknown as EvidenceMigrationDatabase);
    }
    const contractCoverageApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 21")
      .get();
    const goalColumns = this.db.pragma("table_info(goals)") as Array<{ name: string }>;
    const riskColumns = this.db.pragma("table_info(risks)") as Array<{ name: string }>;
    if (
      !contractCoverageApplied ||
      !goalColumns.some((column) => column.name === "decomposition_review_json") ||
      !riskColumns.some((column) => column.name === "resolution_basis_json")
    ) {
      migrateGoalContractCoverageSchema(this.db as unknown as GoalLifecycleMigrationDatabase);
    }
    const feedWorkbenchApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 22")
      .get();
    if (!feedWorkbenchApplied) {
      this.immediate(() => {
        migrateFeedTables(this.db);
        this.db
          .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (22, ?)")
          .run(new Date().toISOString());
      });
    }
    const feedSourcesApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 23")
      .get();
    if (!feedSourcesApplied) {
      this.immediate(() => {
        migrateFeedTables(this.db);
        this.db
          .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (23, ?)")
          .run(new Date().toISOString());
      });
    }
    const feedReadStateApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 24")
      .get();
    if (!feedReadStateApplied) {
      this.immediate(() => {
        migrateFeedTables(this.db);
        this.db
          .prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (24, ?)")
          .run(new Date().toISOString());
      });
    }
    const projectGuidanceApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 25")
      .get();
    const projectGuidanceTable = this.db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'project_guidance_entries'")
      .get();
    if (!projectGuidanceApplied || !projectGuidanceTable) this.migrateProjectGuidance();
    const projectGuidanceRevisionsApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 26")
      .get();
    const projectGuidanceRevisionsTable = this.db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'project_guidance_revisions'")
      .get();
    if (!projectGuidanceRevisionsApplied || !projectGuidanceRevisionsTable) {
      this.migrateProjectGuidanceRevisions();
    }
    const goalTreeProposalNarrativeApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 27")
      .get();
    if (
      !goalTreeProposalNarrativeApplied ||
      governanceNarrativeMigrationRequired(this.db as unknown as GovernanceSqliteDatabase)
    ) migrateGoalTreeProposalNarrative(this.db as unknown as GovernanceSqliteDatabase);
    const goalTreeLegacySupersessionApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 28")
      .get();
    if (
      !goalTreeLegacySupersessionApplied ||
      governanceLegacySupersessionMigrationRequired(this.db as unknown as GovernanceSqliteDatabase)
    ) migrateGoalTreeLegacySupersession(this.db as unknown as GovernanceSqliteDatabase);
    const infoflowContractApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 29")
      .get();
    const inboxEntriesTable = this.db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'inbox_entries'")
      .get();
    const sourceColumns = this.db.pragma("table_info(feed_sources)") as Array<{ name: string }>;
    if (
      !infoflowContractApplied
      || !inboxEntriesTable
      || !sourceColumns.some((column) => column.name === "schedule_json")
    ) this.migrateInfoflowContract();
    const continuousActionModelApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 30")
      .get();
    const currentGoalColumns = this.db.pragma("table_info(goals)") as Array<{ name: string }>;
    if (
      !continuousActionModelApplied ||
      !currentGoalColumns.some((column) => column.name === "current_contract_revision")
    ) this.migrateContinuousActionModel();
    const artifactsApplied = this.db
      .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 31")
      .get();
    const artifactsTable = this.db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'artifacts'")
      .get();
    const artifactVersionsTable = this.db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'artifact_versions'")
      .get();
    if (!artifactsApplied || !artifactsTable || !artifactVersionsTable) {
      migrateArtifactsSchema(this.db as unknown as ArtifactsSqliteDatabase);
    }
  }

  private migrateContinuousActionModel(): void {
    this.immediate(() => {
      const addColumn = (table: string, column: string, definition: string): void => {
        const columns = this.db.pragma(`table_info(${table})`) as Array<{ name: string }>;
        if (!columns.some((item) => item.name === column)) {
          this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        }
      };
      addColumn("goals", "current_contract_revision", "INTEGER NOT NULL DEFAULT 1");
      migrateExecutionActionColumns(this.db as unknown as ExecutionMigrationDatabase);
      migrateEvidenceContractRevisionColumns(this.db as unknown as EvidenceMigrationDatabase);
      migrateReviewContractRevisionColumn(this.db as unknown as GovernanceSqliteDatabase);
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS goal_contract_revisions (
          goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          revision INTEGER NOT NULL,
          contract_json TEXT NOT NULL,
          effect TEXT NOT NULL CHECK (effect IN ('metadata', 'revalidate', 'rework')),
          source_proposal_id TEXT,
          changed_by TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (goal_id, revision)
        );
        CREATE INDEX IF NOT EXISTS goal_contract_revisions_board_idx
          ON goal_contract_revisions(board_id, goal_id, revision DESC);
        CREATE TABLE IF NOT EXISTS coverage_contract_revisions (
          parent_goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
          child_goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
          parent_contract_revision INTEGER NOT NULL,
          child_contract_revision INTEGER NOT NULL,
          recorded_at TEXT NOT NULL,
          PRIMARY KEY (parent_goal_id, child_goal_id, parent_contract_revision)
        );
        CREATE INDEX IF NOT EXISTS coverage_contract_revisions_child_idx
          ON coverage_contract_revisions(child_goal_id, child_contract_revision);
      `);
      const insertRevision = this.db.prepare(`
        INSERT OR IGNORE INTO goal_contract_revisions (
          goal_id, board_id, revision, contract_json, effect, source_proposal_id,
          changed_by, reason, created_at
        ) VALUES (?, ?, 1, ?, 'metadata', NULL, ?, ?, ?)
      `);
      for (const goal of this.db.prepare("SELECT * FROM goals ORDER BY goal_id").all() as Row[]) {
        const goalId = text(goal.goal_id);
        const criteria = (this.db
          .prepare("SELECT * FROM acceptance_criteria WHERE goal_id = ? ORDER BY criterion_id")
          .all(goalId) as Row[]).map(mapCriterion);
        insertRevision.run(
          goalId,
          text(goal.board_id),
          json({
            title: text(goal.title),
            outcome: text(goal.outcome),
            why: text(goal.why),
            business_logic: text(goal.business_logic),
            in_scope: parseJson<string[]>(goal.in_scope_json, []),
            out_of_scope: parseJson<string[]>(goal.out_of_scope_json, []),
            constraints: parseJson<string[]>(goal.constraints_json, []),
            required_inputs: parseJson<string[]>(goal.required_inputs_json, []),
            promised_outputs: parseJson<string[]>(goal.promised_outputs_json, []),
            decomposition_review: parseJson(goal.decomposition_review_json, null),
            definition_state: text(goal.definition_state),
            decomposition_state: text(goal.decomposition_state),
            priority: number(goal.priority),
            acceptance_criteria: criteria.map(({ criterion_id: _criterionId, goal_id: _goalId, ...criterion }) => criterion),
          }),
          optionalText(goal.accepted_by) ?? "migration",
          "现有 Goal 迁移为 Contract revision 1",
          optionalText(goal.accepted_at) ?? text(goal.created_at),
        );
      }
      this.db.exec(`
        INSERT OR IGNORE INTO coverage_contract_revisions (
          parent_goal_id, child_goal_id, parent_contract_revision, child_contract_revision, recorded_at
        )
        SELECT relation.to_goal_id, relation.from_goal_id,
               parent.current_contract_revision, child.current_contract_revision, relation.created_at
        FROM goal_relations relation
        JOIN goals parent ON parent.goal_id = relation.to_goal_id
        JOIN goals child ON child.goal_id = relation.from_goal_id
        WHERE relation.type = 'part_of' AND relation.state = 'active';
      `);
      this.db
        .prepare("INSERT OR IGNORE INTO schema_migrations (migration_id, applied_at) VALUES (30, ?)")
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

  private migrateProjectGuidance(): void {
    this.immediate(() => {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS project_guidance_entries (
          guidance_id TEXT PRIMARY KEY,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          position INTEGER NOT NULL,
          revision INTEGER NOT NULL DEFAULT 1,
          active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
          kind TEXT NOT NULL CHECK (kind IN ('context', 'requirement', 'constraint', 'convention', 'workflow', 'quality_bar')),
          content TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          source_refs_json TEXT NOT NULL DEFAULT '[]',
          created_by TEXT NOT NULL,
          confirmation_summary TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_by TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(board_id, position),
          UNIQUE(board_id, kind, content_hash)
        );
        CREATE INDEX IF NOT EXISTS project_guidance_board_idx
          ON project_guidance_entries(board_id, position, guidance_id);
      `);
      this.db
        .prepare("INSERT OR IGNORE INTO schema_migrations (migration_id, applied_at) VALUES (25, ?)")
        .run(new Date().toISOString());
    });
  }

  private migrateProjectGuidanceRevisions(): void {
    this.immediate(() => {
      const columns = this.db.pragma("table_info(project_guidance_entries)") as Array<{ name: string }>;
      const names = new Set(columns.map((column) => column.name));
      if (!names.has("revision")) {
        this.db.exec("ALTER TABLE project_guidance_entries ADD COLUMN revision INTEGER NOT NULL DEFAULT 1");
      }
      if (!names.has("active")) {
        this.db.exec("ALTER TABLE project_guidance_entries ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))");
      }
      if (!names.has("updated_by")) {
        this.db.exec("ALTER TABLE project_guidance_entries ADD COLUMN updated_by TEXT");
      }
      if (!names.has("updated_at")) {
        this.db.exec("ALTER TABLE project_guidance_entries ADD COLUMN updated_at TEXT");
      }
      this.db.exec(`
        UPDATE project_guidance_entries
        SET updated_by = COALESCE(updated_by, created_by),
            updated_at = COALESCE(updated_at, created_at);

        CREATE TABLE IF NOT EXISTS project_guidance_revisions (
          revision_id TEXT PRIMARY KEY,
          guidance_id TEXT NOT NULL REFERENCES project_guidance_entries(guidance_id) ON DELETE CASCADE,
          board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          revision INTEGER NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('context', 'requirement', 'constraint', 'convention', 'workflow', 'quality_bar')),
          content TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          source_refs_json TEXT NOT NULL DEFAULT '[]',
          active INTEGER NOT NULL CHECK (active IN (0, 1)),
          changed_by TEXT NOT NULL,
          change_kind TEXT NOT NULL CHECK (change_kind IN ('created', 'edited', 'deactivated', 'restored')),
          confirmation_summary TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE(guidance_id, revision)
        );
        CREATE INDEX IF NOT EXISTS project_guidance_revisions_board_idx
          ON project_guidance_revisions(board_id, guidance_id, revision DESC);

        INSERT OR IGNORE INTO project_guidance_revisions (
          revision_id, guidance_id, board_id, revision, kind, content, content_hash,
          source_refs_json, active, changed_by, change_kind, confirmation_summary, reason, created_at
        )
        SELECT 'migration:' || guidance_id || ':1', guidance_id, board_id, 1, kind, content,
          content_hash, source_refs_json, 1, created_by, 'created', confirmation_summary, reason, created_at
        FROM project_guidance_entries;
      `);
      this.db
        .prepare("INSERT OR IGNORE INTO schema_migrations (migration_id, applied_at) VALUES (26, ?)")
        .run(new Date().toISOString());
    });
  }

  private migrateInfoflowContract(): void {
    this.immediate(() => {
      migrateInfoflowContractV2(this.db);
      this.db
        .prepare("INSERT OR IGNORE INTO schema_migrations (migration_id, applied_at) VALUES (29, ?)")
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
    return new GoalsRepository(this.db as unknown as GoalLifecycleMigrationDatabase).getGoal(goalId);
  }

  listGoals(boardId: string): GoalRecord[] {
    return this.goalsQuery().listGoals(boardId);
  }

  listTrashedGoals(boardId: string): GoalRecord[] {
    return this.goalsQuery().listTrashedGoals(boardId);
  }

  listPlanningMethodPacks(boardId: string): PlanningMethodPack[] {
    return new GoalsRepository(this.db as unknown as GoalLifecycleMigrationDatabase)
      .listPlanningMethodPacks(boardId);
  }

  listProjectGuidanceEntries(boardId: string, includeInactive = false): ProjectGuidanceEntryRecord[] {
    return new GoalsRepository(this.db as unknown as GoalLifecycleMigrationDatabase)
      .listProjectGuidanceEntries(boardId, includeInactive);
  }

  listProjectGuidanceRevisions(boardId: string): ProjectGuidanceRevisionRecord[] {
    return new GoalsRepository(this.db as unknown as GoalLifecycleMigrationDatabase)
      .listProjectGuidanceRevisions(boardId);
  }

  snapshot(boardId: string): BoardSnapshot {
    const goals = this.goalsQuery().snapshot(boardId);
    const execution = new ExecutionRepository(this.db as unknown as ExecutionSqliteDatabase);
    const evidence = new EvidenceRepository(this.db as unknown as EvidenceSqliteDatabase);
    const governance = new GovernanceRepository(this.db as unknown as GovernanceSqliteDatabase)
      .snapshot(boardId);
    return {
      board: goals.board,
      cursor: goals.observed_event_cursor,
      goals: goals.goals,
      relations: goals.relations,
      impacts: (this.db
        .prepare("SELECT * FROM impact_bindings WHERE board_id = ? ORDER BY surface, binding_id")
        .all(boardId) as Row[]).map(mapImpact),
      risks: goals.risks,
      goal_risks: goals.goal_risks,
      claims: execution.listClaims(boardId),
      runs: execution.listRuns(boardId),
      evidence: evidence.listEvidence(boardId),
      evidence_corrections: evidence.listCorrections(boardId),
      review_obligations: governance.review_obligations,
      reviews: governance.reviews,
      goal_contract_revisions: (this.db
        .prepare(`
          SELECT * FROM goal_contract_revisions
          WHERE board_id = ? ORDER BY goal_id, revision
        `)
        .all(boardId) as Row[]).map(mapGoalContractRevision),
      coverage_contract_revisions: (this.db
        .prepare(`
          SELECT coverage.* FROM coverage_contract_revisions coverage
          JOIN goals parent ON parent.goal_id = coverage.parent_goal_id
          WHERE parent.board_id = ?
          ORDER BY coverage.parent_goal_id, coverage.child_goal_id, coverage.parent_contract_revision
        `)
        .all(boardId) as Row[]).map((row): CoverageContractRevisionRecord => ({
          parent_goal_id: text(row.parent_goal_id),
          child_goal_id: text(row.child_goal_id),
          parent_contract_revision: Math.max(1, number(row.parent_contract_revision) || 1),
          child_contract_revision: Math.max(1, number(row.child_contract_revision) || 1),
          recorded_at: text(row.recorded_at),
        })),
      lifecycle_events: (this.db
        .prepare(`
          SELECT seq, type, object_type, object_id, payload_json, at
          FROM events
          WHERE board_id = ?
            AND type IN (
              'goal.rework_requested', 'goal.reopened', 'goal.satisfied', 'goal.auto_satisfied',
              'run.started', 'run.completed', 'review.submitted', 'evidence.submitted',
              'risk.created', 'risk.updated', 'risk.resolved', 'risk.accepted',
              'contract.revision_applied'
            )
          ORDER BY seq
        `)
        .all(boardId) as Row[]).map((row): GoalLifecycleEventRecord => ({
          seq: number(row.seq),
          type: text(row.type),
          object_type: text(row.object_type),
          object_id: text(row.object_id),
          payload: parseJson<Record<string, unknown>>(row.payload_json, {}),
          at: text(row.at),
        })),
      candidates: governance.candidates,
      contract_proposals: governance.contract_proposals,
      rewires: governance.rewires,
      clarification_sessions: (this.db
        .prepare("SELECT * FROM clarification_sessions WHERE board_id = ? ORDER BY updated_at DESC, session_id")
        .all(boardId) as Row[]).map(mapClarificationSession),
      clarification_turns: (this.db
        .prepare("SELECT * FROM clarification_turns WHERE board_id = ? ORDER BY session_id, turn_index, turn_id")
        .all(boardId) as Row[]).map(mapClarificationTurn),
      goal_tree_proposals: governance.goal_tree_proposals,
      planning_method_packs: goals.planning_method_packs,
      project_guidance: goals.project_guidance,
    };
  }

  activePolicyRows(boardId: string, goalId: string): Array<{
    scope: string;
    goal_id: string | null;
    policy: Partial<GoalPolicy>;
  }> {
    return new GoalsRepository(this.db as unknown as GoalLifecycleMigrationDatabase)
      .listActivePolicyBindings(boardId, goalId);
  }

  /** Load active policy inputs once for board-wide projections such as Available. */
  activePolicyRowsForBoard(boardId: string): Array<{
    scope: string;
    goal_id: string | null;
    policy: Partial<GoalPolicy>;
  }> {
    return new GoalsRepository(this.db as unknown as GoalLifecycleMigrationDatabase)
      .listActivePolicyBindings(boardId);
  }

  private goalsQuery(): GoalsQueryService {
    return new GoalsQueryService(
      new GoalsRepository(this.db as unknown as GoalLifecycleMigrationDatabase),
    );
  }
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

function mapGoalContractRevision(row: Row): GoalContractRevisionRecord {
  return {
    goal_id: text(row.goal_id),
    board_id: text(row.board_id),
    revision: Math.max(1, number(row.revision) || 1),
    contract: parseJson<GoalContractRevisionRecord["contract"]>(row.contract_json, {} as GoalContractRevisionRecord["contract"]),
    effect: text(row.effect) as GoalContractRevisionRecord["effect"],
    source_proposal_id: optionalText(row.source_proposal_id),
    changed_by: text(row.changed_by),
    reason: text(row.reason),
    created_at: text(row.created_at),
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

export const sqliteJson = json;

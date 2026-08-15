import Database from "better-sqlite3";
import type {
  AcceptanceCriterion,
  BoardSnapshot,
  CandidateGoalRecord,
  ClaimRecord,
  ContractProposalRecord,
  EvidenceRecord,
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
          priority INTEGER NOT NULL DEFAULT 0,
          accepted_by TEXT,
          accepted_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX goals_board_idx ON goals(board_id);
        CREATE INDEX goals_ready_idx ON goals(board_id, definition_state, decomposition_state, validity_state, fulfillment_state);

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
          created_at TEXT NOT NULL
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
        CREATE INDEX claims_board_state_idx ON claims(board_id, state, expires_at);
        CREATE INDEX claims_goal_idx ON claims(goal_id, state);
        CREATE UNIQUE INDEX claims_one_active_executor
          ON claims(goal_id)
          WHERE state = 'active' AND role IN ('executor', 'revalidator');
        CREATE UNIQUE INDEX claims_one_active_clarifier
          ON claims(goal_id)
          WHERE state = 'active' AND role = 'clarifier';

        CREATE TABLE runs (
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
          digest TEXT,
          captured_at TEXT NOT NULL,
          result TEXT NOT NULL CHECK (result IN ('passed', 'failed', 'inconclusive'))
        );
        CREATE INDEX evidence_goal_idx ON evidence(goal_id, result);

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

  snapshot(boardId: string): BoardSnapshot {
    const board = this.db.prepare("SELECT * FROM boards WHERE board_id = ?").get(boardId) as
      | Row
      | undefined;
    if (!board) throw new Error(`Board 不存在: ${boardId}`);
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
        .all(boardId) as Row[]).map(mapEvidence),
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
    };
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

function mapEvidence(row: Row): EvidenceRecord {
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
    digest: optionalText(row.digest),
    captured_at: text(row.captured_at),
    result: text(row.result) as EvidenceRecord["result"],
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

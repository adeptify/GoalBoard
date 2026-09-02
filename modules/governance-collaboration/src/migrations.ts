import type { GovernanceSqliteDatabase } from "./repository.js";

function stamp(db: GovernanceSqliteDatabase, id: number): void {
  db.prepare("INSERT OR IGNORE INTO schema_migrations (migration_id, applied_at) VALUES (?, ?)")
    .run(id, new Date().toISOString());
}

function immediate(db: GovernanceSqliteDatabase, operation: () => void): void {
  db.transaction(operation).immediate();
}

export function migrateContractProposals(db: GovernanceSqliteDatabase): void {
  immediate(db, () => {
    db.exec(`CREATE TABLE contract_proposals (
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
    CREATE INDEX contract_proposals_goal_idx ON contract_proposals(board_id, goal_id, state, created_at);`);
    stamp(db, 3);
  });
}

export function migrateGoalTreeProposals(db: GovernanceSqliteDatabase): void {
  immediate(db, () => {
    db.exec(`CREATE TABLE goal_tree_proposals (
      proposal_id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      root_goal_id TEXT REFERENCES goals(goal_id) ON DELETE SET NULL,
      submitted_by TEXT NOT NULL,
      discovered_in_run_id TEXT REFERENCES runs(run_id) ON DELETE SET NULL,
      state TEXT NOT NULL CHECK (state IN ('pending', 'superseded', 'approved', 'partially_applied', 'rejected', 'dismissed', 'closed')),
      version INTEGER NOT NULL,
      supersedes_proposal_id TEXT REFERENCES goal_tree_proposals(proposal_id),
      supersedes_legacy_proposal_id TEXT,
      base_event_cursor INTEGER NOT NULL,
      summary TEXT NOT NULL,
      decision_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      decided_at TEXT
    );
    CREATE INDEX goal_tree_proposals_board_idx ON goal_tree_proposals(board_id, root_goal_id, state, created_at DESC, proposal_id);
    CREATE INDEX goal_tree_proposals_supersedes_idx ON goal_tree_proposals(supersedes_proposal_id);
    CREATE INDEX goal_tree_proposals_supersedes_legacy_idx ON goal_tree_proposals(supersedes_legacy_proposal_id);
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
    CREATE INDEX goal_tree_proposal_items_proposal_idx ON goal_tree_proposal_items(proposal_id, ordinal, item_id);
    CREATE INDEX goal_tree_proposal_items_board_idx ON goal_tree_proposal_items(board_id, state, item_id);`);
    stamp(db, 9);
  });
}

export function migrateGoalTreeProposalDecisions(db: GovernanceSqliteDatabase): void {
  immediate(db, () => {
    const columns = new Set((db.pragma("table_info(goal_tree_proposal_items)") as Array<{ name: string }>).map((item) => item.name));
    if (!columns.has("materialized_objects_json")) {
      db.exec("ALTER TABLE goal_tree_proposal_items ADD COLUMN materialized_objects_json TEXT NOT NULL DEFAULT '[]'");
    }
    if (!columns.has("revision_proposal_id")) {
      db.exec("ALTER TABLE goal_tree_proposal_items ADD COLUMN revision_proposal_id TEXT REFERENCES goal_tree_proposals(proposal_id)");
    }
    db.exec(`CREATE TABLE IF NOT EXISTS goal_tree_proposal_decisions (
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
      ON goal_tree_proposal_decisions(proposal_id, item_id, created_at, decision_id);`);
    stamp(db, 10);
  });
}

export function migrateRuntimeDialogueAuthority(db: GovernanceSqliteDatabase): void {
  db.pragma("foreign_keys = OFF");
  try {
    immediate(db, () => {
      db.exec(`CREATE TABLE goal_tree_proposal_decisions_v14 (
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
      INSERT INTO goal_tree_proposal_decisions_v14
      SELECT decision_id, board_id, proposal_id, item_id, decision, actor_id,
        CASE authority_source WHEN 'runtime_trusted_host' THEN 'runtime_dialogue' ELSE authority_source END,
        runtime_actor_id, conversation_ref, message_ref, reason, revision_proposal_id,
        materialized_objects_json, created_at FROM goal_tree_proposal_decisions;
      DROP TABLE goal_tree_proposal_decisions;
      ALTER TABLE goal_tree_proposal_decisions_v14 RENAME TO goal_tree_proposal_decisions;
      CREATE INDEX goal_tree_proposal_decisions_item_idx
        ON goal_tree_proposal_decisions(proposal_id, item_id, created_at, decision_id);`);
      stamp(db, 14);
    });
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

export function governanceNarrativeMigrationRequired(db: GovernanceSqliteDatabase): boolean {
  const proposal = db.pragma("table_info(goal_tree_proposals)") as Array<{ name: string }>;
  const items = db.pragma("table_info(goal_tree_proposal_items)") as Array<{ name: string }>;
  return !proposal.some((column) => column.name === "narrative_json")
    || !items.some((column) => column.name === "explanation_json");
}

export function migrateGoalTreeProposalNarrative(db: GovernanceSqliteDatabase): void {
  immediate(db, () => {
    if (governanceNarrativeMigrationRequired(db)) {
      const proposal = db.pragma("table_info(goal_tree_proposals)") as Array<{ name: string }>;
      if (!proposal.some((column) => column.name === "narrative_json")) {
        db.exec("ALTER TABLE goal_tree_proposals ADD COLUMN narrative_json TEXT");
      }
      const items = db.pragma("table_info(goal_tree_proposal_items)") as Array<{ name: string }>;
      if (!items.some((column) => column.name === "explanation_json")) {
        db.exec("ALTER TABLE goal_tree_proposal_items ADD COLUMN explanation_json TEXT");
      }
    }
    stamp(db, 27);
  });
}

export function governanceLegacySupersessionMigrationRequired(db: GovernanceSqliteDatabase): boolean {
  return !(db.pragma("table_info(goal_tree_proposals)") as Array<{ name: string }>)
    .some((column) => column.name === "supersedes_legacy_proposal_id");
}

export function migrateGoalTreeLegacySupersession(db: GovernanceSqliteDatabase): void {
  immediate(db, () => {
    if (governanceLegacySupersessionMigrationRequired(db)) {
      db.exec("ALTER TABLE goal_tree_proposals ADD COLUMN supersedes_legacy_proposal_id TEXT");
    }
    db.exec(`CREATE INDEX IF NOT EXISTS goal_tree_proposals_supersedes_legacy_idx
      ON goal_tree_proposals(supersedes_legacy_proposal_id);`);
    stamp(db, 28);
  });
}

export function migrateReviewContractRevisionColumn(db: GovernanceSqliteDatabase): void {
  const columns = db.pragma("table_info(review_obligations)") as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "contract_revision")) {
    db.exec("ALTER TABLE review_obligations ADD COLUMN contract_revision INTEGER NOT NULL DEFAULT 1");
  }
}

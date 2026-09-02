export interface EvidenceMigrationStatement {
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): unknown;
}

export interface EvidenceMigrationDatabase {
  prepare(sql: string): EvidenceMigrationStatement;
  exec(sql: string): unknown;
  pragma(source: string): unknown;
  transaction<T>(operation: () => T): (() => T) & { immediate(): T };
}

export function evidenceCorrectionsMigrationRequired(db: EvidenceMigrationDatabase): boolean {
  const migrationApplied = db
    .prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = 17")
    .get();
  const correctionsTable = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'evidence_corrections'")
    .get();
  return !migrationApplied || !correctionsTable;
}

export function migrateEvidenceCorrections(
  db: EvidenceMigrationDatabase,
  appliedAt = new Date().toISOString(),
): void {
  immediate(db, () => {
    db.exec(`
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
    db.prepare(
      "INSERT OR IGNORE INTO schema_migrations (migration_id, applied_at) VALUES (17, ?)",
    ).run(appliedAt);
  });
}

export function migrateEvidenceLocatorValidation(
  db: EvidenceMigrationDatabase,
  appliedAt = new Date().toISOString(),
): void {
  immediate(db, () => {
    addColumn(
      db,
      "evidence",
      "locator_status",
      "TEXT NOT NULL DEFAULT 'unverified' CHECK (locator_status IN ('verified', 'unverified'))",
    );
    addColumn(
      db,
      "evidence",
      "locator_validation_reason",
      "TEXT NOT NULL DEFAULT '历史 Evidence 未进行 locator 预检'",
    );
    addColumn(db, "evidence", "locator_checked_at", "TEXT");
    db.prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (18, ?)")
      .run(appliedAt);
  });
}

export function migrateEvidenceLocatorWorkspace(
  db: EvidenceMigrationDatabase,
  appliedAt = new Date().toISOString(),
): void {
  immediate(db, () => {
    addColumn(db, "evidence", "locator_workspace_id", "TEXT");
    db.prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (19, ?)")
      .run(appliedAt);
  });
}

export function migrateEvidenceLocatorSource(
  db: EvidenceMigrationDatabase,
  appliedAt = new Date().toISOString(),
): void {
  immediate(db, () => {
    addColumn(db, "evidence", "locator_workspace_root", "TEXT");
    db.prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (20, ?)")
      .run(appliedAt);
  });
}

export function migrateEvidenceContractRevisionColumns(db: EvidenceMigrationDatabase): void {
  addColumn(db, "evidence", "contract_revision", "INTEGER NOT NULL DEFAULT 1");
  addColumn(db, "evidence", "historical_unmapped", "INTEGER NOT NULL DEFAULT 0");
}

function addColumn(
  db: EvidenceMigrationDatabase,
  table: string,
  column: string,
  definition: string,
): void {
  const columns = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function immediate<T>(db: EvidenceMigrationDatabase, operation: () => T): T {
  return db.transaction(operation).immediate();
}

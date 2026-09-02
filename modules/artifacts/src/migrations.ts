import {
  ARTIFACTS_SCHEMA_SQL,
  type ArtifactsSqliteDatabase,
} from "./repository.js";

export const ARTIFACTS_MIGRATION_ID = 31;

export function migrateArtifactsSchema(db: ArtifactsSqliteDatabase): void {
  db.transaction(() => {
    db.exec(ARTIFACTS_SCHEMA_SQL);
    db.prepare(
      "INSERT OR IGNORE INTO schema_migrations (migration_id, applied_at) VALUES (?, ?)",
    ).run(ARTIFACTS_MIGRATION_ID, new Date().toISOString());
  }).immediate();
}

import type {
  ExecutionClaimRecord,
  ExecutionRunRecord,
  ExecutionRunState,
  ExecutionRunWithClaim,
} from "@adeptify/goalboard-contracts/modules/execution";

type Row = Record<string, unknown>;

export interface ExecutionSqliteStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid?: number | bigint };
}

export interface ExecutionSqliteDatabase {
  prepare(sql: string): ExecutionSqliteStatement;
  exec(sql: string): unknown;
  transaction<T>(operation: () => T): (() => T) & { immediate(): T };
}

export interface ExecutionEventInput {
  eventId: string;
  boardId: string;
  actorId: string;
  type: string;
  objectType: string;
  objectId: string;
  reason: string;
  payload: unknown;
  at: string;
}

export const EXECUTION_SCHEMA_SQL = `
  CREATE TABLE claims (
    claim_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id),
    actor_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('clarifier', 'executor', 'self_verifier', 'cross_reviewer', 'adversarial_reviewer', 'revalidator')),
    contract_revision INTEGER NOT NULL DEFAULT 1,
    action_kind TEXT,
    action_target_id TEXT,
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
  CREATE INDEX claims_action_idx ON claims(board_id, action_kind, action_target_id, state);
  CREATE UNIQUE INDEX claims_one_active_per_goal ON claims(goal_id) WHERE state = 'active';

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
  CREATE UNIQUE INDEX runs_one_nonterminal_per_claim ON runs(claim_id) WHERE state IN ('started', 'blocked');
`;

export function createExecutionSchema(db: ExecutionSqliteDatabase): void {
  db.exec(EXECUTION_SCHEMA_SQL);
}

export class ExecutionRepository {
  constructor(readonly db: ExecutionSqliteDatabase) {}

  immediate<T>(operation: () => T): T {
    return this.db.transaction(operation).immediate();
  }

  eventCursor(boardId: string): number {
    const row = this.db
      .prepare("SELECT COALESCE(MAX(seq), 0) AS cursor FROM events WHERE board_id = ?")
      .get(boardId) as Row | undefined;
    return number(row?.cursor);
  }

  latestCompletedWorkRunEventSeq(boardId: string, goalId: string): number {
    const row = this.db.prepare(`
      SELECT MAX(event.seq) AS seq
      FROM events event
      JOIN runs run ON run.run_id = event.object_id
      WHERE event.board_id = ? AND event.type = 'run.completed'
        AND run.goal_id = ? AND run.role IN ('executor', 'revalidator')
    `).get(boardId, goalId) as Row | undefined;
    return number(row?.seq);
  }

  getClaim(boardId: string, claimId: string): ExecutionClaimRecord | null {
    const row = this.db
      .prepare("SELECT * FROM claims WHERE board_id = ? AND claim_id = ?")
      .get(boardId, claimId) as Row | undefined;
    return row ? mapExecutionClaim(row) : null;
  }

  getClaimById(claimId: string): ExecutionClaimRecord | null {
    const row = this.db.prepare("SELECT * FROM claims WHERE claim_id = ?").get(claimId) as Row | undefined;
    return row ? mapExecutionClaim(row) : null;
  }

  listClaims(boardId: string): ExecutionClaimRecord[] {
    return (this.db
      .prepare("SELECT * FROM claims WHERE board_id = ? ORDER BY claimed_at DESC, claim_id")
      .all(boardId) as Row[]).map(mapExecutionClaim);
  }

  listClaimsForGoal(boardId: string, goalId: string): ExecutionClaimRecord[] {
    return (this.db.prepare(`
      SELECT * FROM claims WHERE board_id = ? AND goal_id = ? ORDER BY claimed_at, claim_id
    `).all(boardId, goalId) as Row[]).map(mapExecutionClaim);
  }

  getRun(boardId: string, runId: string): ExecutionRunRecord | null {
    const row = this.db
      .prepare("SELECT * FROM runs WHERE board_id = ? AND run_id = ?")
      .get(boardId, runId) as Row | undefined;
    return row ? mapExecutionRun(row) : null;
  }

  getRunById(runId: string): ExecutionRunRecord | null {
    const row = this.db.prepare("SELECT * FROM runs WHERE run_id = ?").get(runId) as Row | undefined;
    return row ? mapExecutionRun(row) : null;
  }

  getRunWithClaim(boardId: string, runId: string): ExecutionRunWithClaim | null {
    const run = this.getRun(boardId, runId);
    if (!run) return null;
    const claim = this.getClaim(boardId, run.claim_id);
    return claim ? { run, claim } : null;
  }

  listRuns(boardId: string): ExecutionRunRecord[] {
    return (this.db
      .prepare("SELECT * FROM runs WHERE board_id = ? ORDER BY started_at DESC, run_id")
      .all(boardId) as Row[]).map(mapExecutionRun);
  }

  listRunsForGoal(boardId: string, goalId: string): ExecutionRunRecord[] {
    return (this.db.prepare(`
      SELECT * FROM runs WHERE board_id = ? AND goal_id = ? ORDER BY started_at, run_id
    `).all(boardId, goalId) as Row[]).map(mapExecutionRun);
  }

  latestRunForGoal(
    boardId: string,
    goalId: string,
    roles?: readonly ExecutionRunRecord["role"][],
  ): ExecutionRunRecord | null {
    return this.listRunsForGoal(boardId, goalId)
      .filter((run) => !roles || roles.includes(run.role))
      .sort((left, right) =>
        right.started_at.localeCompare(left.started_at) || right.run_id.localeCompare(left.run_id)
      )[0] ?? null;
  }

  latestClaimForGoal(
    boardId: string,
    goalId: string,
    roles?: readonly ExecutionClaimRecord["role"][],
  ): ExecutionClaimRecord | null {
    return this.listClaimsForGoal(boardId, goalId)
      .filter((claim) => !roles || roles.includes(claim.role))
      .sort((left, right) =>
        right.claimed_at.localeCompare(left.claimed_at) || right.claim_id.localeCompare(left.claim_id)
      )[0] ?? null;
  }

  latestActiveRunForClaim(claimId: string): ExecutionRunRecord | null {
    return this.activeRunIdsForClaim(claimId)
      .map((runId) => this.getRunById(runId))
      .filter((run): run is ExecutionRunRecord => run != null)
      .sort((left, right) =>
        right.started_at.localeCompare(left.started_at) || right.run_id.localeCompare(left.run_id)
      )[0] ?? null;
  }

  listNonterminalRuns(boardId: string): ExecutionRunRecord[] {
    return this.listRuns(boardId).filter((run) => run.state === "started" || run.state === "blocked");
  }

  activeClaimCount(boardId: string, at: string): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS count FROM claims
      WHERE board_id = ? AND state = 'active' AND expires_at > ?
    `).get(boardId, at) as Row | undefined;
    return number(row?.count);
  }

  nonterminalRunCount(boardId: string): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS count FROM runs
      WHERE board_id = ? AND state IN ('started', 'blocked')
    `).get(boardId) as Row | undefined;
    return number(row?.count);
  }

  activeClaimIdsForGoal(boardId: string, goalId: string, at?: string): string[] {
    const rows = at
      ? this.db.prepare(`
          SELECT claim_id FROM claims
          WHERE board_id = ? AND goal_id = ? AND state = 'active' AND expires_at > ?
          ORDER BY claim_id
        `).all(boardId, goalId, at)
      : this.db.prepare(`
          SELECT claim_id FROM claims
          WHERE board_id = ? AND goal_id = ? AND state = 'active'
          ORDER BY claim_id
        `).all(boardId, goalId);
    return (rows as Row[]).map((row) => text(row.claim_id));
  }

  activeRunIdsForGoal(boardId: string, goalId: string): string[] {
    return (this.db.prepare(`
      SELECT run_id FROM runs
      WHERE board_id = ? AND goal_id = ? AND state IN ('started', 'blocked')
      ORDER BY run_id
    `).all(boardId, goalId) as Row[]).map((row) => text(row.run_id));
  }

  activeRunIdsForClaim(claimId: string): string[] {
    return (this.db.prepare(`
      SELECT run_id FROM runs WHERE claim_id = ? AND state IN ('started', 'blocked') ORDER BY run_id
    `).all(claimId) as Row[]).map((row) => text(row.run_id));
  }

  expiredActiveClaims(boardId: string, at: string): ExecutionClaimRecord[] {
    return (this.db.prepare(`
      SELECT * FROM claims
      WHERE board_id = ? AND state = 'active' AND expires_at <= ?
      ORDER BY expires_at, claim_id
    `).all(boardId, at) as Row[]).map(mapExecutionClaim);
  }

  insertClaim(claim: ExecutionClaimRecord): void {
    this.db.prepare(`
      INSERT INTO claims (
        claim_id, board_id, goal_id, actor_id, role, contract_revision,
        action_kind, action_target_id, state, capabilities_json, goal_mode_attestation,
        resolved_policy_json, claimed_at, expires_at, renewed_at, released_at, release_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      claim.claim_id, claim.board_id, claim.goal_id, claim.actor_id, claim.role,
      claim.contract_revision, claim.action_kind, claim.action_target_id, claim.state,
      json(claim.capabilities), claim.goal_mode_attestation ? 1 : 0,
      json(claim.resolved_policy), claim.claimed_at, claim.expires_at, claim.renewed_at,
      claim.released_at, claim.release_reason,
    );
  }

  updateClaimLease(claimId: string, expiresAt: string, renewedAt: string): void {
    this.db.prepare("UPDATE claims SET expires_at = ?, renewed_at = ? WHERE claim_id = ?")
      .run(expiresAt, renewedAt, claimId);
  }

  updateClaimState(
    claimId: string,
    state: "released" | "expired" | "revoked",
    at: string,
    reason: string,
  ): void {
    this.db.prepare(`
      UPDATE claims SET state = ?, released_at = ?, release_reason = ? WHERE claim_id = ?
    `).run(state, at, reason, claimId);
  }

  updateClaimContractRevision(claimId: string, revision: number): void {
    this.db.prepare("UPDATE claims SET contract_revision = ? WHERE claim_id = ?")
      .run(revision, claimId);
  }

  insertRun(run: ExecutionRunRecord): void {
    this.db.prepare(`
      INSERT INTO runs (
        run_id, board_id, goal_id, claim_id, actor_id, role, state, block_reason,
        output_refs_json, discovery_refs_json, started_at, ended_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      run.run_id, run.board_id, run.goal_id, run.claim_id, run.actor_id, run.role,
      run.state, run.block_reason, json(run.output_refs), json(run.discovery_refs),
      run.started_at, run.ended_at,
    );
  }

  updateRun(
    runId: string,
    state: ExecutionRunState,
    blockReason: string | null,
    outputRefs: string[],
    discoveryRefs: string[],
    endedAt: string | null,
  ): void {
    this.db.prepare(`
      UPDATE runs SET state = ?, block_reason = ?, output_refs_json = ?,
        discovery_refs_json = ?, ended_at = ? WHERE run_id = ?
    `).run(state, blockReason, json(outputRefs), json(discoveryRefs), endedAt, runId);
  }

  completeRun(runId: string, at: string): ExecutionRunRecord | null {
    const run = this.getRunById(runId);
    if (!run) return null;
    if (run.state !== "started" && run.state !== "blocked") return run;
    this.updateRun(runId, "completed", null, run.output_refs, run.discovery_refs, at);
    return this.getRunById(runId);
  }

  abandonActiveRuns(claimId: string, at: string, reason: string): string[] {
    const runIds = this.activeRunIdsForClaim(claimId);
    if (runIds.length === 0) return [];
    this.db.prepare(`
      UPDATE runs SET state = 'abandoned', block_reason = ?, ended_at = ?
      WHERE claim_id = ? AND state IN ('started', 'blocked')
    `).run(reason, at, claimId);
    return runIds;
  }
}

export function mapExecutionClaim(row: Row): ExecutionClaimRecord {
  return {
    claim_id: text(row.claim_id),
    board_id: text(row.board_id),
    goal_id: text(row.goal_id),
    actor_id: text(row.actor_id),
    role: text(row.role) as ExecutionClaimRecord["role"],
    contract_revision: Math.max(1, number(row.contract_revision) || 1),
    action_kind: nullableText(row.action_kind) as ExecutionClaimRecord["action_kind"],
    action_target_id: nullableText(row.action_target_id),
    state: text(row.state) as ExecutionClaimRecord["state"],
    capabilities: parseJson<string[]>(row.capabilities_json, []),
    goal_mode_attestation: number(row.goal_mode_attestation) === 1,
    resolved_policy: parseJson(row.resolved_policy_json, {} as ExecutionClaimRecord["resolved_policy"]),
    claimed_at: text(row.claimed_at),
    expires_at: text(row.expires_at),
    renewed_at: nullableText(row.renewed_at),
    released_at: nullableText(row.released_at),
    release_reason: nullableText(row.release_reason),
  };
}

export function mapExecutionRun(row: Row): ExecutionRunRecord {
  return {
    run_id: text(row.run_id),
    board_id: text(row.board_id),
    goal_id: text(row.goal_id),
    claim_id: text(row.claim_id),
    actor_id: text(row.actor_id),
    role: text(row.role) as ExecutionRunRecord["role"],
    state: text(row.state) as ExecutionRunRecord["state"],
    block_reason: nullableText(row.block_reason),
    output_refs: parseJson<string[]>(row.output_refs_json, []),
    discovery_refs: parseJson<string[]>(row.discovery_refs_json, []),
    started_at: text(row.started_at),
    ended_at: nullableText(row.ended_at),
  };
}

function text(value: unknown): string {
  return String(value ?? "");
}

function nullableText(value: unknown): string | null {
  return value == null ? null : String(value);
}

function number(value: unknown): number {
  return Number(value ?? 0);
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

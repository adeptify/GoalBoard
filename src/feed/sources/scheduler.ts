import type Database from "better-sqlite3";

import { toFeedPublicError } from "../contract.js";
import { FeedConnectorService } from "../connectors/service.js";
import type { FeedSourceRecord } from "../types.js";
import { FeedSourceService } from "./service.js";

export interface FeedSourceSchedulerResult {
  due: number;
  completed: number;
  failed: number;
  skipped: number;
}

export type FeedSourceSchedulerDispatch = (
  source: FeedSourceRecord,
  idempotencyKey: string,
) => Promise<unknown>;

export class FeedSourceScheduler {
  private readonly inFlight = new Set<string>();

  constructor(
    readonly db: Database.Database,
    readonly boardId: string,
    private readonly dispatch: FeedSourceSchedulerDispatch = defaultDispatch(db, boardId),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async tick(at: Date = this.now()): Promise<FeedSourceSchedulerResult> {
    const service = new FeedSourceService(this.db, this.boardId, undefined, this.now);
    const due = service.dueSources(at);
    const result: FeedSourceSchedulerResult = {
      due: due.length,
      completed: 0,
      failed: 0,
      skipped: 0,
    };
    await Promise.all(due.map(async (source) => {
      const schedule = source.schedule;
      if (schedule.mode !== "interval" || !schedule.next_pull_at) return;
      if (this.inFlight.has(source.source_id)) {
        result.skipped += 1;
        return;
      }
      this.inFlight.add(source.source_id);
      const plannedAt = schedule.next_pull_at;
      const key = `scheduled:${source.source_id}:${plannedAt}`;
      try {
        await this.dispatch(source, key);
        result.completed += 1;
      } catch (error) {
        result.failed += 1;
        this.recordActionableFault(source, error, at);
      } finally {
        this.inFlight.delete(source.source_id);
        service.advanceSchedule(source.source_id, plannedAt, at);
      }
    }));
    return result;
  }

  isRunning(sourceId: string): boolean {
    return this.inFlight.has(sourceId);
  }

  private recordActionableFault(source: FeedSourceRecord, error: unknown, at: Date): void {
    const publicError = toFeedPublicError(error);
    if (publicError.retryable || !["auth", "configuration", "stale_cursor"].includes(publicError.category)) {
      return;
    }
    const stored = new FeedSourceService(this.db, this.boardId, undefined, this.now).feed.createInboxEntry({
      boardId: this.boardId,
      subjectType: "source_fault",
      subjectId: source.source_id,
      reason: "source_fault",
      detail: {
        error_code: publicError.code,
        category: publicError.category,
        retryable: publicError.retryable,
        user_action: publicError.user_action,
        detected_at: at.toISOString(),
      },
      at: at.toISOString(),
    });
    if (stored.entry.status === "done" || stored.entry.status === "dismissed") {
      new FeedSourceService(this.db, this.boardId, undefined, this.now).feed
        .setInboxEntryStatus(this.boardId, stored.entry.entry_id, "open", stored.entry.revision);
    }
  }
}

function defaultDispatch(
  db: Database.Database,
  boardId: string,
): FeedSourceSchedulerDispatch {
  return async (source, idempotencyKey) => {
    if (source.sync_kind === "public_source") {
      return new FeedSourceService(db, boardId).sync(source.source_id, { idempotencyKey });
    }
    if (source.sync_kind === "github" || source.sync_kind === "gmail") {
      return new FeedConnectorService(db, boardId).sync(source.source_id, {
        idempotencyKey,
        mode: "normal",
      });
    }
    throw Object.assign(new Error("这个来源没有可用的 Provider 适配器"), {
      code: "feed_source_invalid_configuration",
    });
  };
}

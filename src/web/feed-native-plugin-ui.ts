import type {
  AttentionEntryRecord,
} from "@adeptify/goalboard-contracts/modules/attention-resumption";
import type {
  FeedUiEntry,
  FeedUiItem,
  FeedUiModel,
  FeedUiPrimitives,
  FeedUiSource,
  PersistedFeedDetailModel,
} from "@adeptify/goalboard-plugin-feed";
import { renderFeedContribution } from "@adeptify/goalboard-app-workbench";
import { GMAIL_SCOPE_PRESETS } from "@adeptify/goalboard-integration-gmail/scope";

import type {
  FeedItemRecord,
  FeedItemType,
  FeedSourceRecord,
  InboxEntryRecord,
} from "../feed/types.js";
import { readRssHttpState } from "../feed/sources/rss-http.js";
import { feedPlainText, renderFeedRichText } from "./feed-rich-content.js";
import { icon } from "./icons.js";
import { dateTimeLocale, L } from "./i18n.js";
import type { GoalBoardWebView } from "./render.js";

export type FeedSupplementalEntry = FeedUiEntry;

export function buildFeedNativePluginModel(
  view: GoalBoardWebView,
  preset: FeedItemType,
  supplementalEntries: readonly FeedSupplementalEntry[] = [],
  active = false,
): FeedUiModel {
  const sources = view.feed.sources.map((source) => sourceModel(source, view));
  if (view.demo) {
    const presentKinds = new Set(sources.map((source) => source.ui_kind));
    sources.push(...demoSourceModels(view.snapshot.board.board_id).filter((source) => !presentKinds.has(source.ui_kind)));
  }
  return {
    route_prefix: view.route_prefix,
    preset,
    entries: [...feedEntries(view), ...supplementalEntries],
    sources,
    relay_import: {
      available: view.relay_import.available,
      source_count: view.relay_import.source_count,
      item_count: view.relay_import.item_count,
      material_count: view.relay_import.material_count,
    },
    source_catalog: (view.feed_source_catalog ?? []).map((source) => ({
      id: source.id,
      name: source.name,
      category_label: source.category_label,
    })),
    connector_auth: {
      github: view.feed_connector_auth?.github ?? { bound: false },
      gmail: view.feed_connector_auth?.gmail ?? { bound: false },
    },
    primitives: feedUiPrimitives,
    demo: view.demo,
    active,
  };
}

export function renderFeedNativePluginSurface(
  view: GoalBoardWebView,
  surface: "directory" | "workbench" | "workbench-fragment" | "source-directory" | "source-workbench" | "overlays",
  preset: FeedItemType,
  supplementalEntries: readonly FeedSupplementalEntry[] = [],
  active = false,
): string {
  return renderFeedContribution(
    surface,
    buildFeedNativePluginModel(view, preset, supplementalEntries, active),
  );
}

export function renderFeedNativePluginPersistedDetail(
  item: FeedItemRecord,
  routePrefix = "",
  options: { entryId?: string; inboxActive?: boolean; inboxEntry?: InboxEntryRecord | null } = {},
): string {
  const model: PersistedFeedDetailModel = {
    route_prefix: routePrefix,
    entry_id: options.entryId ?? item.item_id,
    item: itemModel(item),
    inbox_entry: options.inboxEntry ? attentionModel(options.inboxEntry) : null,
    inbox_active: options.inboxActive ?? item.item_type === "inbox_message",
    primitives: feedUiPrimitives,
  };
  return renderFeedContribution("persisted-detail", model);
}

function feedEntries(view: GoalBoardWebView): FeedUiEntry[] {
  const feedItems = new Map(view.feed.feed_items.map((item) => [item.item_id, item]));
  const attentionSubjects = new Set(view.feed.inbox_entries
    .filter((entry) => entry.subject_type === "feed_item" && isActive(entry.status))
    .map((entry) => entry.subject_id));
  const feed = view.feed.feed_items.map((item): FeedUiEntry => ({
    entry_id: item.item_id,
    item_id: item.item_id,
    inbox_entry: null,
    item: itemModel({ ...item, item_type: "feed" }),
    preset: "feed",
    provider: provider(item),
    kind_label: "Feed",
    source_label: item.source_label || item.source_kind,
    disposition: item.disposition === "inbox" && !attentionSubjects.has(item.item_id) ? "feed" : item.disposition,
    title: item.title,
    summary: feedPlainText(item.summary || item.body) || L("没有附加摘要"),
    updated_at: item.source_updated_at || item.updated_at,
    read: Boolean(item.read_at),
    attention_rank: 0,
  }));
  const attention = view.feed.inbox_entries
    .filter((entry) => entry.subject_type !== "goal_decision")
    .map((entry): FeedUiEntry => {
    if (entry.subject_type === "feed_item") {
      const item = feedItems.get(entry.subject_id) ?? null;
      return {
        entry_id: `inbox:${entry.entry_id}`,
        item_id: entry.subject_id,
        inbox_entry: attentionModel(entry),
        item: item ? itemModel({ ...item, item_type: "inbox_message" }) : null,
        preset: "inbox_message",
        provider: item ? provider(item) : "other",
        kind_label: entry.reason === "manual" ? L("Inbox · 手工加入") : L("Inbox · 来源规则"),
        source_label: item?.source_label || item?.source_kind || "Feed",
        disposition: attentionDisposition(entry.status),
        title: item?.title || L("原 Feed Item 已不可用"),
        summary: feedPlainText(item?.summary || item?.body || "") || L("引用仍保留，但原消息已不可用。"),
        updated_at: entry.updated_at,
        read: Boolean(item?.read_at),
        attention_rank: isActive(entry.status) ? 2 : 1,
      };
    }
    const source = view.feed.sources.find((candidate) => candidate.source_id === entry.subject_id) ?? null;
    return {
      entry_id: `inbox:${entry.entry_id}`,
      item_id: null,
      inbox_entry: attentionModel(entry),
      item: null,
      preset: "inbox_message",
      provider: "other",
      kind_label: L("Inbox · 来源故障"),
      source_label: source?.name || L("其他来源"),
      disposition: attentionDisposition(entry.status),
      title: source ? L("来源「{source}」需要处理", { source: source.name }) : L("原来源已不可用"),
      summary: L("来源停止自动拉取；完成修复前不会推进可信游标。"),
      updated_at: entry.updated_at,
      read: true,
      attention_rank: isActive(entry.status) ? 3 : 1,
      detail_slot_html: `<article class="feed-detail feed-detail--attention inbox-reference-detail" data-feed-detail="inbox:${escapeHtml(entry.entry_id)}" data-inbox-reference-detail data-inbox-subject-type="source_fault"><header class="feed-detail-header"><div class="feed-detail-kicker"><span>${L("Inbox · 来源故障")}</span><span>${escapeHtml(source?.name || L("其他来源"))}</span><span>${entry.status === "in_progress" ? L("处理中") : L("待处理")}</span></div><h1>${escapeHtml(source?.name || L("原来源已不可用"))}</h1><p>${escapeHtml(source ? L("来源停止自动拉取；完成修复前不会推进可信游标。") : L("来源或本地历史已删除；Inbox 只保留这条故障记录。"))}</p><div class="feed-detail-actions" data-feed-actions>${source ? `<button class="button-primary" type="button" data-open-source-record="${escapeHtml(source.source_id)}">${icon("settings")}${L("查看来源")}</button>` : `<button type="button" disabled aria-disabled="true">${L("原对象不可用")}</button>`}<button type="button" data-inbox-action="done" data-inbox-entry-id="${escapeHtml(entry.entry_id)}" data-inbox-entry-revision="${entry.revision}">${icon("check")}${L("完成")}</button><button class="feed-action-subtle" type="button" data-inbox-action="dismissed" data-inbox-entry-id="${escapeHtml(entry.entry_id)}" data-inbox-entry-revision="${entry.revision}">${L("忽略")}</button></div><p class="feed-action-status" data-inbox-action-status role="status" hidden></p></header><section class="inbox-attention-context" aria-label="${L("处理上下文")}"><dl><div><dt>${L("为什么进入 Inbox")}</dt><dd>${L("来源需要人工恢复")}</dd></div><div><dt>${L("关联对象")}</dt><dd>${escapeHtml(source?.name || L("原来源已不可用"))}</dd></div><div><dt>${L("下一步")}</dt><dd>${escapeHtml(typeof entry.detail.user_action === "string" ? entry.detail.user_action : L("检查来源配置、授权或拉取范围后重新同步。"))}</dd></div></dl></section><p class="prototype-honesty-note">${icon("link")}${L("Inbox 只保存这条引用和进入原因；原对象内容没有复制到这里。")}</p></article>`,
    };
  });
  return [...feed, ...attention, ...(view.demo ? demoFeedEntries(view) : [])];
}

function demoFeedEntries(view: GoalBoardWebView): FeedUiEntry[] {
  const boardId = view.snapshot.board.board_id;
  const goalPath = `${view.route_prefix}/goals/draft-8f160677-f8f8-4f2b-935d-0881edb3aba3`;
  const createItem = (
    id: string,
    itemType: FeedItemType,
    kind: string,
    sourceId: string,
    sourceLabel: string,
    title: string,
    summary: string,
    body: string,
    updatedAt: string,
    tags: string[],
  ): FeedItemRecord => ({
    board_id: boardId,
    item_id: id,
    source_id: sourceId,
    item_type: itemType,
    kind,
    title,
    summary,
    body,
    source_kind: sourceId.includes("github") ? "github" : sourceId.includes("gmail") ? "gmail" : sourceId.includes("rss") ? "rss" : "goalboard",
    source_label: sourceLabel,
    external_id: id,
    url: null,
    origin_status: "prototype",
    priority: "normal",
    tags,
    author: sourceId.includes("gmail") ? "Mina · Product Partner" : sourceId.includes("github") ? "adeptify/goalboard" : "Latent Space",
    disposition: "inbox",
    linked_goal_id: null,
    read_at: null,
    revision: 1,
    source_created_at: updatedAt,
    source_updated_at: updatedAt,
    imported_at: updatedAt,
    updated_at: updatedAt,
    materials: [],
  });
  const examples = [
    {
      item: createItem("prototype-feed-github", "feed", "github_notification", "prototype-source-github", "GitHub · adeptify", "PR #418 请求你确认 FeedItem 与 InboxEntry 的边界", "新的 review request，涉及来源消息如何进入待处理引用。", "PR 更新了信息流对象关系：来源负责接入与拉取，Feed 保存完整消息，Inbox 只保留需要人工介入的引用。请重点检查重复入箱与处理完成后的追溯行为。", "2026-08-30T14:18:00+08:00", ["GitHub", "Review request", "演示数据"]),
      reason: "这是一条来源消息，默认只属于 Feed；只有你明确加入后才进入 Inbox。",
      nextAction: "阅读后决定加入 Inbox、保存为资料、升格 Goal 或忽略。",
      relation: "来源 GitHub · adeptify → Feed Item",
    },
    {
      item: createItem("prototype-feed-gmail", "feed", "gmail_message", "prototype-source-gmail", "Gmail · product@adeptify.ai", "设计伙伴反馈：Inbox 不应成为第二个 Feed", "邮件建议先解释进入原因，再给出下一步，不要重复完整正文。", "Mina 走完当前版本后认为 Feed 和 Inbox 的视觉很像。她建议 Inbox 只展示需要决定、回复或修复的事项，并保留回到原消息的路径。", "2026-08-30T13:42:00+08:00", ["Gmail", "用户反馈", "演示数据"]),
      reason: "这封邮件只是新消息，目前还没有明确要求你介入。",
      nextAction: "先阅读；若需要跟进，再加入 Inbox。",
      relation: "来源 Gmail · product@adeptify.ai → Feed Item",
    },
    {
      item: createItem("prototype-feed-rss", "feed", "rss_entry", "prototype-source-rss", "RSS · Latent Space", "Designing calm inboxes for agentic products", "一篇讨论 agent 产品如何区分事件流与注意力队列的文章。", "文章提出：事件流应该完整、可追溯，注意力队列则必须有进入理由、负责人和退出条件。这个模式与 GoalBoard 当前的信息流重构高度相关。", "2026-08-30T12:25:00+08:00", ["RSS", "产品设计", "演示数据"]),
      reason: "公开来源内容进入完整事实流，不自动占用你的注意力。",
      nextAction: "保存为资料，或在确认要行动时升格为 Goal。",
      relation: "来源 RSS · Latent Space → Feed Item",
    },
    {
      item: createItem("prototype-inbox-feed", "inbox_message", "feed_attention_reference", "prototype-source-github", "GitHub · adeptify", "确认 PR #418 的对象边界", "由 Feed Item 手工加入；需要在合并前给出产品判断。", "这条 Inbox Entry 引用 GitHub 的原始 Feed Item，不复制和篡改原消息。完成后会退出默认 Inbox，原消息仍保留在 Feed。", "2026-08-30T14:20:00+08:00", ["Feed 引用", "需判断", "演示数据"]),
      reason: "你在 Feed 中手工标记为需要处理。",
      nextAction: "检查对象关系并给出 review 结论。",
      relation: "Inbox Entry → 原始 Feed Item · PR #418",
    },
    {
      item: createItem("prototype-inbox-source", "inbox_message", "source_fault", "prototype-source-gmail", "Gmail · product@adeptify.ai", "Gmail 授权已失效，3 封新邮件尚未拉取", "来源故障需要人工重新授权；旧消息和游标仍然保留。", "GoalBoard 在 13:06 收到 401。系统没有把失败伪装成空结果，也没有推进 Gmail 游标。重新授权后可以安全补拉。", "2026-08-30T13:06:00+08:00", ["来源故障", "需重新授权", "演示数据"]),
      reason: "来源无法自行恢复，需要你重新连接账号。",
      nextAction: "打开来源配置并完成重新授权。",
      relation: "Inbox Entry → 来源 Gmail · product@adeptify.ai",
    },
    {
      item: { ...createItem("prototype-inbox-goal", "inbox_message", "goal_decision", "prototype-goalboard", "GoalBoard", "确认高保真是否真正分清来源、Feed 与 Inbox", "这是当前 Goal 的人工判断门禁；代码检查不能替代你的产品判断。", "请依次进入来源、Feed 和 Inbox，走完模拟同步、加入 Inbox 与完成处理，然后判断三者是否还会被理解成同一种收件箱。", "2026-08-30T12:02:00+08:00", ["Goal 决定", "人工判断", "演示数据"]), url: goalPath },
      reason: "当前 Goal 的验收标准要求一骏亲自判断对象边界。",
      nextAction: "走完原型主路径后，确认或指出仍然混淆的地方。",
      relation: "Inbox Entry → Goal 高保真原型",
    },
  ];
  return examples.map(({ item, reason, nextAction, relation }) => ({
    entry_id: item.item_id,
    item_id: item.item_id,
    inbox_entry: null,
    item: itemModel(item),
    preset: item.item_type,
    provider: provider(item),
    kind_label: item.item_type === "feed" ? "Feed Item · 演示" : "Inbox Entry · 演示",
    source_label: item.source_label,
    disposition: item.disposition,
    title: item.title,
    summary: item.summary,
    updated_at: item.source_updated_at,
    read: false,
    attention_rank: item.item_type === "feed" ? 0 : 2,
    prototype: { reason, next_action: nextAction, relation },
  }));
}

function itemModel(item: FeedItemRecord): FeedUiItem {
  return {
    project_id: item.board_id,
    item_id: item.item_id,
    source_id: item.source_id,
    signal_id: null,
    signal_revision: null,
    item_type: item.item_type,
    kind: item.kind,
    title: item.title,
    summary: item.summary,
    body: item.body,
    source_kind: item.source_kind,
    source_label: item.source_label,
    external_id: item.external_id,
    url: item.url,
    origin_status: item.origin_status,
    priority: item.priority,
    tags: item.tags,
    author: item.author,
    disposition: item.disposition,
    linked_goal_id: item.linked_goal_id,
    read_at: item.read_at,
    revision: item.revision,
    source_created_at: item.source_created_at,
    source_updated_at: item.source_updated_at,
    imported_at: item.imported_at,
    updated_at: item.updated_at,
    materials: item.materials.map((material) => ({
      ...material,
      project_id: material.board_id,
    })),
  };
}

function attentionModel(entry: InboxEntryRecord): AttentionEntryRecord {
  return { ...entry, project_id: entry.board_id };
}

function sourceModel(source: FeedSourceRecord, view: GoalBoardWebView): FeedUiSource {
  const runs = view.feed.runs.filter((run) => run.source_id === source.source_id);
  const uiKind = source.sync_kind === "github"
    ? "github"
    : source.sync_kind === "gmail"
      ? "gmail"
      : ["rss", "custom_rss"].includes(source.kind) || source.sync_kind === "public_source"
        ? "rss"
        : "other";
  const rssHttp = uiKind === "rss" ? readRssHttpState(source.cursor) : null;
  const running = runs.some((run) => run.phase === "running");
  const attention = source.status === "error" || source.status === "disconnected";
  const statusKind = running ? "syncing" : attention ? "attention" : source.status === "paused" ? "paused" : "active";
  const retryAfterAt = runs.find((run) => run.error_code === "connector_rate_limited")?.receipt?.retry_after_at;
  const catalogFeedUrl = source.kind === "rss"
    ? view.feed_source_catalog?.find((entry) => entry.id === source.definition_id)?.feed_url
    : undefined;
  const configuredEndpoint = uiKind === "gmail"
    ? "gmail.googleapis.com · gmail.readonly"
    : uiKind === "github"
      ? "api.github.com · notifications"
      : String(source.config.url ?? source.config.feed_url ?? catalogFeedUrl ?? source.config.query ?? source.account_label ?? source.kind);
  const scope = typeof source.config.scope === "string" && source.config.scope
    ? source.config.scope
    : uiKind === "github" ? L("通知、PR 与 Review 请求") : uiKind === "gmail" ? L("指定标签与未读邮件") : L("公开 Feed 更新");
  return {
    project_id: source.board_id,
    source_id: source.source_id,
    kind: source.kind,
    definition_id: source.definition_id,
    sync_kind: source.sync_kind,
    name: source.name,
    description: source.description,
    status: source.status,
    enabled: source.enabled,
    origin: source.origin,
    config: source.config,
    schedule: source.schedule,
    connection_ref: source.credential_ref,
    account_label: source.account_label,
    last_sync_at: source.last_sync_at,
    last_outcome: source.last_outcome,
    last_error_code: source.last_error_code,
    imported_at: source.imported_at,
    updated_at: source.updated_at,
    prototype: false,
    item_count: source.item_count,
    ui_kind: uiKind,
    type_label: uiKind === "github" ? "GitHub" : uiKind === "gmail" ? "Gmail" : uiKind === "rss" ? "RSS / Atom" : L("其他来源"),
    status_kind: statusKind,
    status_label: running ? L("正在拉取") : sourceStatusLabel(source.status),
    last_fetch_label: source.last_sync_at ? feedUiPrimitives.formatDate(source.last_sync_at) : L("尚未拉取"),
    next_fetch_label: !source.enabled || source.status === "paused"
      ? L("已暂停")
      : typeof retryAfterAt === "string" && Number.isFinite(Date.parse(retryAfterAt))
        ? L("限流后 {time} 可重试", { time: feedUiPrimitives.formatDate(retryAfterAt) })
        : source.schedule.mode === "interval" && source.schedule.enabled && source.schedule.next_pull_at
          ? feedUiPrimitives.formatDate(source.schedule.next_pull_at)
          : L("等待手动拉取"),
    schedule_label: source.schedule.mode === "manual"
      ? L("仅手动拉取")
      : source.schedule.enabled ? L("每 {count} 分钟", { count: source.schedule.interval_minutes }) : L("定时拉取已关闭"),
    scope_label: scope,
    scope_options: uiKind === "gmail" ? GMAIL_SCOPE_PRESETS.map((preset) => ({ value: preset.value, label: L(preset.label) })) : [],
    configured_endpoint: configuredEndpoint,
    protocol_status: rssHttp
      ? rssHttp.etag ? L("ETag 条件请求已启用") : rssHttp.last_modified ? L("Last-Modified 条件请求已启用") : rssHttp.last_success_at ? L("源站未提供条件校验；使用 Item 身份去重") : L("首次拉取后验证 Feed 并记录条件请求")
      : null,
    home_url: rssHttp?.home_url ?? null,
    editable_endpoint: source.kind === "custom_rss",
    messages: view.feed.feed_items.filter((item) => item.source_id === source.source_id).slice(0, 3).map((item) => item.title),
    runs: runs.slice(0, 8).map((run) => ({
      phase: run.phase,
      outcome: run.outcome,
      error_code: run.error_code,
      created_count: run.created_count,
      deduped_count: run.deduped_count,
      started_at: run.started_at,
      completed_at: run.completed_at,
    })),
  };
}

function demoSourceModels(projectId: string): FeedUiSource[] {
  const now = new Date().toISOString();
  const create = (
    id: string,
    kind: FeedUiSource["ui_kind"],
    name: string,
    description: string,
    accountLabel: string,
    statusKind: FeedUiSource["status_kind"],
    messages: readonly string[],
    intervalMinutes: number,
  ): FeedUiSource => ({
    project_id: projectId,
    source_id: id,
    kind: kind === "rss" ? "rss" : kind,
    definition_id: null,
    sync_kind: "manual",
    name,
    description,
    status: statusKind === "paused" ? "paused" : statusKind === "attention" ? "error" : "active",
    enabled: true,
    origin: "goalboard",
    config: { scope: kind === "gmail" ? "label:product OR label:partner" : L("新消息与更新") },
    schedule: { mode: "interval", enabled: true, interval_minutes: intervalMinutes, next_pull_at: null },
    connection_ref: null,
    account_label: accountLabel,
    last_sync_at: null,
    last_outcome: null,
    last_error_code: statusKind === "attention" ? "fixture_not_live" : null,
    imported_at: now,
    updated_at: now,
    prototype: true,
    item_count: messages.length,
    ui_kind: kind,
    type_label: kind === "github" ? "GitHub" : kind === "gmail" ? "Gmail" : "RSS / Atom",
    status_kind: statusKind,
    status_label: statusKind === "attention" ? L("需重新授权") : statusKind === "syncing" ? L("正在拉取") : L("运行正常"),
    last_fetch_label: L("演示记录"),
    next_fetch_label: L("演示计划"),
    schedule_label: L("每 {count} 分钟", { count: intervalMinutes }),
    scope_label: kind === "gmail" ? "label:product OR label:partner" : L("新消息与更新"),
    scope_options: kind === "gmail" ? GMAIL_SCOPE_PRESETS.map((preset) => ({ value: preset.value, label: L(preset.label) })) : [],
    configured_endpoint: kind === "github" ? "github.com/adeptify/*" : kind === "gmail" ? "gmail.googleapis.com · 只读" : "latent.space/feed",
    protocol_status: kind === "rss" ? L("ETag 条件请求已启用") : null,
    home_url: kind === "rss" ? "https://www.latent.space/" : null,
    editable_endpoint: false,
    messages,
    runs: [],
  });
  return [
    create("prototype-source-github", "github", "GitHub · adeptify", L("读取分配给你的 PR、Issue 与 Review 请求。"), "yijunwang · adeptify", "active", ["PR #418 请求确认 FeedItem 与 InboxEntry 的边界"], 30),
    create("prototype-source-gmail", "gmail", "Gmail · product@adeptify.ai", L("只读取需要关注的产品反馈与合作邮件。"), "product@adeptify.ai", "attention", ["设计伙伴反馈：Inbox 不应成为第二个 Feed"], 60),
    create("prototype-source-rss", "rss", "RSS · Latent Space", L("跟踪 agent 产品、模型与工具设计的新文章。"), L("公开来源"), "syncing", ["Designing calm inboxes for agentic products"], 360),
  ];
}

function sourceStatusLabel(status: FeedSourceRecord["status"]): string {
  return ({ active: L("已连接"), paused: L("已暂停"), error: L("需处理"), disconnected: L("未连接"), imported: L("仅历史数据") } as const)[status];
}

function provider(item: FeedItemRecord): FeedUiEntry["provider"] {
  const value = `${item.source_kind} ${item.kind} ${item.source_label}`.toLowerCase();
  if (value.includes("github")) return "github";
  if (value.includes("gmail") || value.includes("mail")) return "gmail";
  if (value.includes("rss") || value.includes("atom") || value.includes("feed")) return "rss";
  return "other";
}

function isActive(status: InboxEntryRecord["status"]): boolean {
  return status === "open" || status === "in_progress";
}

function attentionDisposition(status: InboxEntryRecord["status"]): string {
  return ({ open: "inbox", in_progress: "processing", done: "saved", dismissed: "archived" } as const)[status];
}

const feedUiPrimitives: FeedUiPrimitives = {
  escape: escapeHtml,
  icon,
  text: L,
  formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(dateTimeLocale(), {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  },
  richText: renderFeedRichText,
  plainText: feedPlainText,
  safeExternalHref(value) {
    if (!value) return null;
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:" ? value : null;
    } catch {
      return null;
    }
  },
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

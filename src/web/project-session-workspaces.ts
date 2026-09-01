import { icon } from "./icons.js";
import type {
  RuntimeSessionCapabilities,
  RuntimeSessionCapabilityMode,
} from "../sessions/types.js";

export interface ProjectOperationsProject {
  project_id: string;
  display_name: string;
}

export interface ProjectOperationsSlice {
  rootItems: string;
  directories: string;
  surfaces: string;
  overlays: string;
}

export interface ProjectSessionRecord {
  id: string;
  title: string;
  runtime: string;
  runtimeId: string;
  contentMode: "native" | "fallback" | "unavailable";
  resumeMode: RuntimeSessionCapabilityMode;
  state: "idle" | "archived";
  currentGoalId: string | null;
  currentGoal: string | null;
  goalHistory: string[];
  workspace: string;
  workspacePath: string | null;
  updated: string;
  updatedAt: string;
  summary: string;
}

export interface ProjectWorkspaceRecord {
  id: string;
  name: string;
  path: string;
  state: "healthy" | "missing" | "conflict";
  sessionCount: number;
  runtimes: string;
  updated: string;
  updatedAt?: string;
  projectLinked?: boolean;
  projectCount?: number;
  sessions?: readonly {
    id: string;
    title: string;
    runtime: string;
    state: string;
    updated: string;
  }[];
  summary: string;
}

export interface ProjectOperationsData {
  sessions: readonly ProjectSessionRecord[];
  workspaces: readonly ProjectWorkspaceRecord[];
  goals?: readonly { goal_id: string; title: string }[];
  projects?: readonly ProjectOperationsProject[];
  runtimes?: readonly {
    runtime_id: string;
    display_name: string;
    capabilities: RuntimeSessionCapabilities;
  }[];
}

function escapeHtml(value: string | null | undefined): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sessionStateLabel(state: ProjectSessionRecord["state"]): string {
  return { idle: "可查看", archived: "已归档" }[state];
}

function workspaceStateLabel(state: ProjectWorkspaceRecord["state"]): string {
  return { healthy: "路径正常", missing: "路径缺失", conflict: "关联冲突" }[state];
}

function contentModeLabel(mode: ProjectSessionRecord["contentMode"]): string {
  return { native: "原生内容", fallback: "GoalBoard 记录", unavailable: "不可读取" }[mode];
}

function renderSessionRow(item: ProjectSessionRecord, selected: boolean): string {
  const search = [
    item.title,
    item.id,
    item.runtime,
    item.currentGoal,
    ...item.goalHistory,
    item.workspace,
    sessionStateLabel(item.state),
    contentModeLabel(item.contentMode),
    item.updated,
  ].filter(Boolean).join(" ").toLocaleLowerCase();
  const updatedAt = Number.isFinite(Date.parse(item.updatedAt || "")) ? Date.parse(item.updatedAt!) : 0;
  return `<button class="project-record-row directory-list-row${selected ? " is-selected" : ""}" type="button" role="option" aria-selected="${selected}" tabindex="${selected ? "0" : "-1"}" data-operation-row="session" data-operation-select="${escapeHtml(item.id)}" data-record-id="${escapeHtml(item.id)}" data-record-runtime="${escapeHtml(item.runtimeId || item.runtime)}" data-record-status="${escapeHtml(item.state)}" data-record-content="${escapeHtml(item.contentMode)}" data-record-updated="${updatedAt}" data-record-search="${escapeHtml(search)}">
    <span class="project-record-select">
      <span><strong title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</strong><small>${escapeHtml(item.runtime)} / ${escapeHtml(item.id)}</small></span>
    </span>
    <span class="directory-row-state project-record-state--${escapeHtml(item.state)}">${escapeHtml(sessionStateLabel(item.state))}</span>
    <span class="project-record-meta"><span>${escapeHtml(item.currentGoal || "未选择当前 Goal")}</span><time>${escapeHtml(item.updated)}</time></span>
  </button>`;
}

function renderDirectory(
  records: readonly ProjectSessionRecord[],
  hasData: boolean,
): string {
  const rows = hasData
    ? records.map((item, index) => renderSessionRow(item, index === 0)).join("")
    : "";
  return `<section class="desktop-directory-panel project-record-directory" data-directory-panel="sessions" data-operation-directory="sessions" hidden>
    <header class="desktop-directory-heading"><button type="button" data-directory-back aria-label="返回上一级">${icon("back")}</button><span><strong>Sessions</strong><small>执行与内容</small></span><button class="directory-heading-action" type="button" data-open-session-add aria-label="新建 Session" title="新建 Session">${icon("plus")}</button></header>
    <header class="project-record-tools">
      <label class="tree-search">${icon("search")}<input type="search" data-operation-search="sessions" placeholder="搜索标题、ID、Goal" aria-label="搜索 Sessions"><kbd>⌘F</kbd></label>
      <details class="project-record-filter-menu"><summary aria-label="筛选与排序">${icon("filter")}<span>筛选</span></summary><div><label>Runtime<select data-session-runtime-filter><option value="all">全部 Runtime</option></select></label><label>状态<select data-session-status-filter><option value="all">全部状态</option><option value="idle">可查看</option><option value="archived">已归档</option></select></label><label>内容<select data-operation-filter="sessions"><option value="all">全部内容</option><option value="native">原生内容</option><option value="fallback">GoalBoard 记录</option><option value="unavailable">不可读取</option></select></label><label>排序<select data-session-sort><option value="updated-desc">最近更新</option><option value="updated-asc">最早更新</option><option value="title-asc">标题 A–Z</option></select></label></div></details><button class="project-record-add-compact" type="button" data-open-session-add aria-label="新建 Session">${icon("plus")}</button>
    </header>
    <div class="project-record-scroll" role="listbox" aria-label="Sessions 列表" data-operation-list="sessions">${rows}</div>
    <div class="project-record-empty" data-operation-empty="sessions"${hasData ? " hidden" : ""}>${icon("terminal")}<strong>${hasData ? "没有匹配结果" : "这个项目还没有 Session"}</strong><p>${hasData ? "清除搜索或更改筛选条件。" : "从这里启动新工作，或关联已有 Runtime Session。"}</p><button type="button" data-operation-clear="sessions"${hasData ? "" : " hidden"}>清除筛选</button></div>
    <footer class="tree-footer"><span>共 <strong data-operation-count="sessions">${hasData ? records.length : 0}</strong> 条</span><small>执行与内容</small></footer>
  </section>`;
}

function renderSessionContent(item: ProjectSessionRecord): string {
  if (item.contentMode === "native" || item.contentMode === "fallback") {
    const native = item.contentMode === "native";
    return `<div class="session-content-state" data-session-content-list>${icon("activity")}<div><h3>${native ? "按需读取最近执行" : "读取 GoalBoard 执行记录"}</h3><p>${native ? "GoalBoard 会分页读取原 Runtime 的最近摘要，并合并本地 TUI 记录；超大历史不会整条载入。" : "只读取 GoalBoard 已持久化并能证明的 TUI 与执行事实。"}</p><button class="document-action" type="button" data-session-content-load>读取内容</button></div></div>`;
  }
  return `<div class="session-content-state" data-session-content-list>${icon("lock")}<div><h3>这个 Runtime 不能读取 Session 内容</h3><p>GoalBoard 只显示已确认的 Session ID、项目、Goal 和工作目录，不猜测执行过程。</p></div></div>`;
}

function renderGoalHistory(item: ProjectSessionRecord): string {
  const history = item.currentGoal ? [item.currentGoal, ...item.goalHistory] : item.goalHistory;
  return history.length
    ? `<ol class="operation-history" data-goal-history>${history.map((goal, index) => `<li${index === 0 && item.currentGoal ? ' class="is-current"' : ""}>${icon(index === 0 && item.currentGoal ? "target" : "history")}<span><strong>${escapeHtml(goal)}</strong><small>${index === 0 && item.currentGoal ? "当前 Goal" : "历史关联"}</small></span></li>`).join("")}</ol>`
    : `<div class="operation-aside-empty" data-goal-history>${icon("info")}<strong>还没有 Goal 关系</strong><small>可以在关系管理中选择当前 Goal。</small></div>`;
}

function renderSessionDetail(item: ProjectSessionRecord, selected: boolean, projectName: string): string {
  const canLoad = item.resumeMode === "native";
  const canHandoff = Boolean(item.currentGoalId);
  return `<article class="goal-document project-operation-document project-session-document" data-operation-detail="session" data-detail-id="${escapeHtml(item.id)}" data-session-runtime-id="${escapeHtml(item.runtimeId)}" data-session-resume-mode="${escapeHtml(item.resumeMode)}" data-session-current-goal-id="${escapeHtml(item.currentGoalId || "")}" data-session-workspace-path="${escapeHtml(item.workspacePath || "")}" data-session-archived="${item.state === "archived"}"${selected ? "" : " hidden"}>
    <section class="goal-hero project-operation-hero" aria-labelledby="session-title-${escapeHtml(item.id)}">
      <header class="goal-header">
        <div class="goal-title-kicker"><span class="project-record-state project-record-state--${escapeHtml(item.state)}">${escapeHtml(sessionStateLabel(item.state))}</span><div class="goal-title-facts"><span>${escapeHtml(item.runtime)}</span><span>${escapeHtml(item.id)}</span><span>最近更新 ${escapeHtml(item.updated)}</span></div></div>
        <div class="goal-title-row"><div class="goal-title-copy"><h1 id="session-title-${escapeHtml(item.id)}">${escapeHtml(item.title)}</h1><p class="goal-title-outcome">${escapeHtml(item.summary)}</p></div><div class="goal-title-actions"><button class="goal-primary-action" type="button" data-session-load="${escapeHtml(item.resumeMode)}"${canLoad ? "" : ' disabled title="这个 Runtime 不能原生加载这条 Session，可使用 Handoff 创建新 Session"'}>${icon("external")}<span>加载原 Session</span></button><button class="document-action" type="button" data-open-session-handoff${canHandoff ? "" : ' disabled title="请先为 Session 选择当前 Goal"'}>${icon("switch")}<span>创建 Handoff</span></button></div></div>
        <p class="operation-action-status" data-session-load-status role="status" hidden></p>
      </header>
    </section>
    <div class="goal-focus-layout project-operation-layout">
      <div class="goal-focus-main">
        <section class="goal-focus-criteria session-execution" aria-labelledby="session-content-${escapeHtml(item.id)}">
          <header><div><h2 id="session-content-${escapeHtml(item.id)}">${item.contentMode === "fallback" ? "GoalBoard 执行记录" : "执行内容"}</h2><p>${item.contentMode === "unavailable" ? "当前适配器没有内容读取能力。" : "按时间查看最近的用户、Runtime 与工具记录。"}</p></div><div class="operation-content-controls"><label class="operation-content-search">${icon("search")}<input type="search" data-session-content-search placeholder="搜索本次执行" aria-label="搜索当前 Session 内容"${item.contentMode === "unavailable" ? " disabled" : ""}></label><label class="operation-content-filter"><span>事件</span><select data-session-content-filter aria-label="筛选执行事件"${item.contentMode === "unavailable" ? " disabled" : ""}><option value="all">全部事件</option><option value="conversation">对话</option><option value="tool">工具与审批</option><option value="status">状态</option><option value="artifact">产物</option><option value="terminal">终端</option></select></label></div></header>
          <div class="session-content-body">${renderSessionContent(item)}<p class="operation-search-empty" data-session-content-empty hidden>当前内容中没有匹配结果。</p></div>
        </section>
      </div>
      <aside class="goal-focus-aside" aria-label="Session 上下文">
        <section class="goal-focus-context operation-current-context"><header><div><h2>当前关系</h2><p>续跑使用这些已确认事实。</p></div><button type="button" data-open-session-relations>管理关系</button></header><dl><div><dt>项目</dt><dd>${escapeHtml(projectName)}</dd></div><div><dt>当前 Goal</dt><dd><span data-current-goal-value>${escapeHtml(item.currentGoal || "未选择")}</span><button type="button" data-work-surface-open="goal" data-directory-open="goals">去 Goals</button></dd></div><div><dt>工作目录</dt><dd><code>${escapeHtml(item.workspace)}</code></dd></div><div><dt>内容来源</dt><dd>${escapeHtml(contentModeLabel(item.contentMode))}</dd></div></dl></section>
        <section class="companion-runtime operation-goal-history"><header><div><small>Goal</small><h2>关联历史</h2></div><span data-goal-history-count>${item.goalHistory.length + (item.currentGoal ? 1 : 0)} 次</span></header>${renderGoalHistory(item)}</section>
        <details class="operation-identity"><summary>${icon("info")}身份与能力边界</summary><dl><div><dt>Session ID</dt><dd>${escapeHtml(item.id)}</dd></div><div><dt>Runtime</dt><dd>${escapeHtml(item.runtime)}</dd></div><div><dt>原生内容</dt><dd>${escapeHtml(contentModeLabel(item.contentMode))}</dd></div><div><dt>Panel ID</dt><dd>只负责 PTY 所有权</dd></div><div><dt>Work Context ID</dt><dd>只用于弱能力兼容</dd></div></dl></details>
        <button class="document-action operation-archive" type="button" data-session-archive="${item.state !== "archived"}">${icon(item.state === "archived" ? "refresh" : "archive")}<span>${item.state === "archived" ? "恢复记录" : "归档记录"}</span></button>
      </aside>
    </div>
  </article>`;
}

function renderSessionSurface(records: readonly ProjectSessionRecord[], hasData: boolean, projectName: string): string {
  return `<section class="desktop-work-surface project-operation-surface" data-work-surface="sessions" data-work-surface-label="Sessions" hidden>${hasData
    ? records.map((item, index) => renderSessionDetail(item, index === 0, projectName)).join("")
    : `<div class="archive-empty project-operation-surface-empty">${icon("terminal")}<h1>这个项目还没有 Session</h1><p>创建或显式关联后，执行内容和 Goal 历史会出现在这里。</p></div>`}</section>`;
}

function renderOverlays(data: ProjectOperationsData | undefined, project: ProjectOperationsProject | null): string {
  const runtimes = data?.runtimes ?? [
    { runtime_id: "codex", display_name: "Codex", capabilities: null },
    { runtime_id: "claude-code", display_name: "Claude Code", capabilities: null },
    { runtime_id: "opencode", display_name: "OpenCode", capabilities: null },
    { runtime_id: "pi-agent", display_name: "Pi Agent", capabilities: null },
    { runtime_id: "grok-build", display_name: "Grok Build", capabilities: null },
  ];
  const runtimeOptions = runtimes.map((runtime) => `<option value="${escapeHtml(runtime.runtime_id)}" data-create-mode="${escapeHtml(runtime.capabilities?.create || "registry")}" data-discover-mode="${escapeHtml(runtime.capabilities?.discover || "unsupported")}" data-handoff-mode="${escapeHtml(runtime.capabilities?.handoff || "unsupported")}">${escapeHtml(runtime.display_name)}</option>`).join("");
  const goalOptions = (data?.goals ?? []).map((goal) => `<option value="${escapeHtml(goal.goal_id)}">${escapeHtml(goal.title)}</option>`).join("");
  const projects = data?.projects ?? (project ? [project] : []);
  const projectOptions = projects.map((item) => `<option value="${escapeHtml(item.project_id)}"${item.project_id === project?.project_id ? " selected" : ""}>${escapeHtml(item.display_name)}</option>`).join("");
  const workspaces = data?.workspaces ?? [];
  const defaultWorkspace = workspaces.find((workspace) => workspace.state === "healthy") ?? null;
  const workspaceChoices = workspaces.length
    ? workspaces.map((workspace) => `<button type="button" data-session-workspace-option data-workspace-id="${escapeHtml(workspace.id)}" data-workspace-path="${escapeHtml(workspace.path)}" data-workspace-name="${escapeHtml(workspace.name)}"${workspace.state === "healthy" ? "" : " disabled"}><span>${icon("folder")}<span><strong>${escapeHtml(workspace.name)}</strong><small>${escapeHtml(workspace.path)}</small></span></span><em class="workspace-choice-state workspace-choice-state--${escapeHtml(workspace.state)}">${escapeHtml(workspaceStateLabel(workspace.state))}</em></button>`).join("")
    : `<p class="session-workspace-empty">这个项目还没有已知运行位置。</p>`;
  const workspacePathOptions = workspaces.map((workspace) => `<option value="${escapeHtml(workspace.path)}">${escapeHtml(workspace.name)}</option>`).join("");
  const workspacePicker = `<div class="session-workspace-field">
    <span class="operation-field-label">工作目录 <small>Session 的运行位置</small></span>
    <input type="hidden" data-session-add-workspace-id value="${escapeHtml(defaultWorkspace?.id || "")}">
    <input type="hidden" data-session-add-workspace value="${escapeHtml(defaultWorkspace?.path || "")}">
    <details class="session-workspace-picker" data-session-workspace-menu>
      <summary><span>${icon("folder")}<span><strong data-session-workspace-name>${escapeHtml(defaultWorkspace?.name || "不关联工作目录")}</strong><small data-session-workspace-path>${escapeHtml(defaultWorkspace?.path || "运行时不绑定本地路径")}</small></span></span>${icon("chevron-down")}</summary>
      <div class="session-workspace-options" role="listbox" aria-label="选择工作目录">${workspaceChoices}<button type="button" data-session-workspace-none><span>${icon("minus")}<span><strong>不关联工作目录</strong><small>仍可创建 Session，之后再补充关系</small></span></span></button><button type="button" data-session-workspace-custom><span>${icon("plus")}<span><strong>选择其他目录</strong><small>输入这台电脑上的绝对路径</small></span></span></button></div>
    </details>
    <label class="session-workspace-custom" data-session-workspace-custom-panel hidden>其他目录<input data-session-workspace-custom-input autocomplete="off" placeholder="/Users/name/code/project"></label>
  </div>`;
  return `<datalist id="project-workspace-path-options">${workspacePathOptions}</datalist><dialog class="project-operation-dialog session-add-dialog" data-session-add-dialog><form method="dialog" data-session-add-form><header><div class="session-add-heading"><div class="session-add-heading-row"><h2 data-session-add-dialog-title>新建 Session</h2><button type="button" data-session-add-toggle>关联已有 Session</button></div><p data-session-add-dialog-copy>从当前项目启动一条新的 Runtime Session。</p><strong data-session-add-mode hidden>创建新的 Runtime Session</strong></div><button type="button" data-dialog-close aria-label="关闭">${icon("x")}</button></header><section>
    <input type="hidden" data-session-add-action value="create">
    <div class="session-add-field-grid"><label>Runtime<select data-session-add-runtime>${runtimeOptions}</select></label><label>当前 Goal<select data-session-add-goal><option value="">暂不关联 Goal</option>${goalOptions}</select></label></div>
    <label>Session 标题<input data-session-add-title maxlength="160" placeholder="可选；留空使用 Goal 或 Runtime 标题"></label>
    <div class="session-add-native" data-session-add-native hidden><label>Runtime 原生 Session ID<input data-session-native-id list="session-discovery-options" autocomplete="off" placeholder="输入 ID，或先同步可发现记录"></label><datalist id="session-discovery-options" data-session-discovery-options></datalist><button class="document-action" type="button" data-session-discover>${icon("refresh")}<span>同步可发现记录</span></button></div>
    ${workspacePicker}
    <p class="operation-capability-note" data-session-add-capability></p>
    <label class="operation-confirm-check session-add-confirm"><input type="checkbox" data-session-add-confirm><span data-session-add-confirm-copy>确认使用以上 Goal、Runtime 和工作目录启动新 Session。</span></label>
    <p class="operation-dialog-status" data-session-add-status role="status" hidden></p>
  </section><footer><button type="button" data-dialog-close>取消</button><button class="button-primary" type="submit" data-session-add-submit disabled>启动 Session</button></footer></form></dialog>
  <dialog class="project-operation-dialog" data-session-relations-dialog data-current-project-id="${escapeHtml(project?.project_id || "")}"><form method="dialog" data-session-relations-form><header><div><h2>管理 Session 关系</h2><p>每条 Session 同时只有一个 Project 和一个当前 Goal。</p></div><button type="button" data-dialog-close aria-label="关闭">${icon("x")}</button></header><section>
    <dl class="operation-confirm-facts"><div><dt>Session</dt><dd data-session-relations-name></dd></div><div><dt>当前 Project</dt><dd>${escapeHtml(project?.display_name || "当前项目")}</dd></div></dl>
    <label>目标 Project<select data-session-relations-project>${projectOptions}<option value="">移出当前 Project</option></select></label>
    <label>当前 Goal<select data-session-relations-goal><option value="">不设置当前 Goal</option>${goalOptions}</select></label>
    <label>工作目录<input data-session-relations-workspace list="project-workspace-path-options" placeholder="留空表示解除工作目录关系"></label>
    <p class="operation-capability-note" data-session-relations-note>切换 Goal 会保留旧 Goal 历史；转移或移出 Project 会清空当前 Goal。</p>
    <label class="operation-confirm-check"><input type="checkbox" data-session-relations-confirm><span>确认只更新这条 Session 的关系。</span></label>
    <p class="operation-dialog-status" data-session-relations-status role="status" hidden></p>
  </section><footer><button type="button" data-dialog-close>取消</button><button class="button-primary" type="submit" data-session-relations-submit disabled>保存关系</button></footer></form></dialog>
  <dialog class="project-operation-dialog session-handoff-dialog" data-session-handoff-dialog data-current-project-id="${escapeHtml(project?.project_id || "")}"><form method="dialog" data-session-handoff-form><header><div><h2>创建 Goal Handoff</h2><p>先审阅交接内容，再创建一条全新的目标 Session。</p></div><button type="button" data-dialog-close aria-label="关闭">${icon("x")}</button></header><section class="session-handoff-review">
    <aside class="session-handoff-controls" aria-label="Handoff 目标">
      <dl class="operation-confirm-facts"><div><dt>来源 Session</dt><dd data-handoff-source-session></dd></div><div><dt>Project</dt><dd>${escapeHtml(project?.display_name || "当前项目")}</dd></div><div><dt>当前 Goal</dt><dd data-handoff-goal></dd></div></dl>
      <label>目标 Runtime<select data-handoff-runtime>${runtimeOptions}</select></label>
      <label>目标工作目录<input data-handoff-workspace list="project-workspace-path-options" autocomplete="off" placeholder="可选；请输入绝对路径"></label>
      <p class="operation-capability-note" data-handoff-capability></p>
      <label class="operation-confirm-check"><input type="checkbox" data-handoff-confirm><span>确认使用上面的 Runtime、Project、Goal 和工作目录创建新 Session，并发送右侧内容。</span></label>
      <p class="operation-dialog-status" data-handoff-status role="status" hidden></p>
      <button class="session-handoff-cancel" type="button" data-handoff-cancel disabled>取消这次 Handoff</button>
    </aside>
    <div class="session-handoff-editor"><header><div><h3>交接内容</h3><p>内容由当前 Goal Contract 与最小 Session 上下文生成，可以直接修改。</p></div><span data-handoff-state>草稿</span></header><textarea data-handoff-content aria-label="可编辑的 Handoff package" spellcheck="false" placeholder="正在生成 Handoff package..."></textarea></div>
  </section><footer><button type="button" data-dialog-close>稍后继续</button><button type="button" data-handoff-save disabled>保存草稿</button><button class="button-primary" type="submit" data-handoff-send disabled>创建并发送</button></footer></form></dialog>
  <dialog class="project-operation-dialog project-operation-confirm-dialog" data-session-archive-dialog><form method="dialog" data-session-archive-form><header><div><h2 data-session-archive-title>归档 Session 记录</h2><p>只整理 GoalBoard 记录，不删除或关闭 Runtime 原生内容。</p></div><button type="button" data-dialog-close aria-label="关闭">${icon("x")}</button></header><section><dl class="operation-confirm-facts"><div><dt>Session</dt><dd data-session-archive-name></dd></div><div><dt>影响</dt><dd data-session-archive-impact></dd></div></dl><label class="operation-confirm-check"><input type="checkbox" data-session-archive-confirm><span data-session-archive-confirm-copy></span></label><p class="operation-dialog-status" data-session-archive-status role="status" hidden></p></section><footer><button type="button" data-dialog-close>取消</button><button class="button-primary" type="submit" data-session-archive-submit disabled>确认</button></footer></form></dialog>`;
}

export function renderProjectOperations(
  project: ProjectOperationsProject | null,
  data?: ProjectOperationsData,
): ProjectOperationsSlice {
  const sessionRecords = data?.sessions ?? [];
  const hasSessionData = sessionRecords.length > 0;
  const projectName = project?.display_name || "当前项目";
  return {
    rootItems: `<button class="desktop-module-item" type="button" data-directory-open="sessions" data-work-surface-open="sessions">${icon("terminal")}<span><strong>Sessions</strong><small>执行内容、运行位置与续跑</small></span>${icon("chevron-right")}</button>`,
    directories: renderDirectory(sessionRecords, hasSessionData),
    surfaces: renderSessionSurface(sessionRecords, hasSessionData, projectName),
    overlays: renderOverlays(data, project),
  };
}

export const PROJECT_OPERATIONS_STYLES = `
  @media (min-width: 761px) {
    body[data-desktop-shell="true"][data-desktop-surface="sessions"] {
      --desktop-project-header-height: var(--desktop-titlebar-height);
    }
    body[data-desktop-shell="true"][data-desktop-surface="sessions"] .navigator-project {
      height: var(--desktop-titlebar-height);
      min-height: var(--desktop-titlebar-height);
      grid-template-rows: var(--desktop-titlebar-height);
    }
    body[data-desktop-shell="true"][data-desktop-surface="sessions"] .navigator-native-row { display: none; }
    body[data-desktop-shell="true"][data-desktop-surface="sessions"] .navigator-project-primary {
      height: var(--desktop-titlebar-height);
      min-height: var(--desktop-titlebar-height);
      padding-inline: var(--desktop-project-safe-inline-start) 8px;
      border-bottom: 1px solid color-mix(in srgb, var(--line) 58%, transparent);
      grid-template-columns: minmax(0, 1fr) var(--desktop-titlebar-control-height);
    }
    body[data-desktop-shell="true"][data-desktop-surface="sessions"] .navigator-project-notifications { display: none; }
  }

  .project-record-directory { min-height: 0; grid-template-rows: 72px 115px minmax(0, 1fr) 46px; }
  .project-record-directory:not([hidden]) { display: grid; }
  body[data-desktop-shell="true"] .project-record-directory .desktop-directory-heading { grid-template-columns: 24px minmax(0, 1fr) 24px; }
  .directory-heading-action { grid-column: 3; }
  .project-record-tools { min-width: 0; padding: 5px 6px 5px; display: grid; grid-template-columns: minmax(0, 1fr) 86px; align-items: center; gap: 5px; }
  .project-record-tools .tree-search input { height: 32px; padding-right: 34px; border: 0; background: var(--paper); font-size: 11px; }
  .project-record-tools .tree-search kbd { right: 6px; border: 0; background: transparent; font-size: 9px; }
  .project-record-filter select { width: 100%; height: 32px; padding: 0 5px; border: 0; border-radius: 7px; color: var(--muted); background: var(--paper); font-size: 10px; }
  .project-record-filter-menu { position: relative; min-width: 0; grid-column: 1 / -1; }
  .project-record-filter-menu > summary { min-height: 32px; padding: 0 8px; border-radius: 7px; color: var(--muted); background: var(--paper); display: flex; align-items: center; justify-content: center; gap: 5px; font-size: 10px; font-weight: 650; list-style: none; cursor: pointer; }
  .project-record-filter-menu > summary::-webkit-details-marker { display: none; }
  .project-record-filter-menu > summary svg { width: 13px; height: 13px; }
  .project-record-filter-menu[open] > summary { color: var(--blue-dark); background: var(--blue-soft); }
  .project-record-filter-menu > div { position: absolute; z-index: 30; top: 36px; right: 0; width: 218px; padding: 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--paper); box-shadow: 0 12px 30px rgba(14, 18, 24, .16); display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .project-record-filter-menu label { color: var(--muted); display: grid; gap: 4px; font-size: 9px; }
  .project-record-filter-menu select { min-width: 0; height: 32px; padding: 0 6px; border: 1px solid var(--line); border-radius: 7px; color: var(--ink); background: var(--page); font-size: 10px; }
  .project-record-add-compact { display: none; }
  .project-record-scroll { min-height: 0; overflow: auto; padding: 4px 7px 12px; scrollbar-width: none; }
  .project-record-scroll::-webkit-scrollbar { display: none; }
  .project-record-row { width: 100%; min-width: 0; min-height: 92px; padding: 12px 9px; border: 0; border-radius: 9px; color: var(--ink-soft); background: transparent; display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: minmax(42px, auto) 22px; column-gap: 9px; align-items: center; text-align: left; cursor: pointer; }
  body[data-desktop-shell="true"] .project-record-directory .project-record-row:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 5%, transparent); }
  body[data-desktop-shell="true"] .project-record-directory .project-record-row.is-selected { color: var(--ink); background: var(--paper); box-shadow: 0 1px 2px color-mix(in srgb, var(--shadow-color) 28%, transparent); }
  .project-record-select { min-width: 0; min-height: 22px; color: inherit; display: block; }
  .project-record-select > span { min-width: 0; display: grid; gap: 3px; }
  .project-record-select strong, .project-record-select small, .project-record-meta span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .project-record-select strong { color: inherit; font-size: 12px; font-weight: 640; line-height: 1.35; }
  .project-record-row.is-selected .project-record-select strong { font-weight: 690; }
  .project-record-select small { color: var(--faint); font-size: 9.5px; line-height: 1.35; }
  body[data-desktop-shell="true"] .project-record-directory .project-record-state--healthy { color: var(--green); border-color: color-mix(in srgb, var(--green) 32%, var(--line)); background: var(--green-soft); }
  body[data-desktop-shell="true"] .project-record-directory :is(.project-record-state--missing, .project-record-state--conflict) { color: var(--red); border-color: color-mix(in srgb, var(--red) 30%, var(--line)); background: var(--red-soft); }
  .project-record-meta { grid-column: 1 / -1; min-width: 0; color: var(--faint); display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; font-size: 9.5px; line-height: 1.35; }
  .project-record-meta time { font-variant-numeric: tabular-nums; white-space: nowrap; }
  body[data-desktop-shell="true"] .project-record-directory .project-record-row:focus-visible { outline: 2px solid color-mix(in srgb, var(--blue) 72%, transparent); outline-offset: -2px; box-shadow: none; }
  html[data-resolved-theme="light"] body[data-desktop-shell="true"] .project-record-directory .project-record-row.is-selected { background: color-mix(in srgb, var(--blue) 8%, transparent); box-shadow: none; }
  .project-record-empty { min-height: 0; padding: 36px 18px; color: var(--muted); display: grid; align-content: start; justify-items: center; gap: 7px; text-align: center; }
  .project-record-empty > svg { font-size: 24px; }
  .project-record-empty strong { color: var(--ink); font-size: 13px; }
  .project-record-empty p { max-width: 28ch; margin: 0; font-size: 10px; }
  .project-record-empty button { min-height: 30px; padding: 0 9px; border: 1px solid var(--line); border-radius: 7px; background: var(--paper); }
  .project-record-directory .tree-footer strong { color: var(--ink); font-variant-numeric: tabular-nums; }

  .project-operation-surface { min-height: 100%; }
  body[data-desktop-shell="true"][data-desktop-surface="sessions"] .project-operation-document { width: min(calc(100% - 8px), 1104px); margin: 0 auto 0 8px; padding: 0; box-sizing: border-box; gap: 10px; }
  .project-operation-hero { min-height: 141px; padding-bottom: 0; }
  .project-operation-hero .goal-header { padding: 24px 0 14px; }
  .project-operation-hero .goal-title-facts { flex-wrap: wrap; }
  .project-operation-hero .goal-title-actions { flex-wrap: wrap; }
  .project-operation-hero .goal-title-actions .goal-primary-action,
  .project-operation-hero .goal-title-actions .document-action { min-height: 34px; margin: 0; white-space: nowrap; }
  .project-operation-hero .goal-title-actions button:disabled { opacity: .42; cursor: not-allowed; }
  .operation-action-status { margin: 8px 0 0; color: var(--muted); font-size: 10px; }
  .operation-action-status.is-error { color: var(--red); }
  body[data-desktop-shell="true"][data-desktop-surface="sessions"] .project-operation-layout { padding-inline: 0; grid-template-columns: minmax(0, 1fr) minmax(270px, 303px); align-items: start; gap: 18px; }
  body[data-desktop-shell="true"][data-desktop-surface="sessions"] .project-operation-layout .goal-focus-aside { margin: 0; padding: 0; border: 0; display: grid; align-content: start; gap: 14px; }
  body[data-desktop-shell="true"][data-desktop-surface="sessions"] .session-execution { min-width: 0; min-height: 560px; padding: 21px 20px 28px; border: 1px solid var(--line); border-radius: 14px; background: var(--paper); box-shadow: var(--shadow-soft); }
  .session-execution > header { align-items: center; gap: 18px; }
  .session-execution > header > div:first-child { min-width: 72px; }
  .session-execution > header h2 { white-space: nowrap; }
  .operation-content-controls { min-width: min(100%, 360px); display: flex; justify-content: flex-end; gap: 7px; }
  .operation-content-search { position: relative; min-width: 184px; display: flex; align-items: center; }
  .operation-content-search svg { position: absolute; left: 9px; color: var(--muted); pointer-events: none; }
  .operation-content-search input { width: 100%; height: 34px; padding: 0 9px 0 28px; border: 1px solid var(--line); border-radius: 8px; color: var(--ink); background: var(--page); font-size: 11px; }
  .operation-content-search input:focus, .operation-content-filter select:focus { border-color: var(--blue); outline: none; }
  .operation-content-filter { position: relative; }
  .operation-content-filter > span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .operation-content-filter select { width: 112px; height: 34px; padding: 0 28px 0 9px; border: 1px solid var(--line); border-radius: 8px; color: var(--ink-soft); background: var(--page); font-size: 10.5px; }
  .session-content-body { min-width: 0; padding-top: 53px; }
  .session-transcript { width: 100%; max-width: none; min-width: 0; margin: 0; }
  .session-content-warning { margin: 0 0 18px 76px; padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--red) 24%, var(--line)); border-radius: 8px; color: var(--red); background: color-mix(in srgb, var(--red) 7%, transparent); font-size: 11px; line-height: 1.55; }
  .session-content-summary { margin: 0 0 18px 76px; padding: 9px 12px; border-radius: 8px; color: var(--ink-soft); background: color-mix(in srgb, var(--accent) 7%, var(--rail)); font-size: 11px; line-height: 1.55; }
  .session-day-group + .session-day-group { margin-top: 28px; }
  .session-day-heading { min-height: 34px; margin: 0; display: grid; grid-template-columns: 58px 26px minmax(0, 1fr); gap: 12px; align-items: center; }
  .session-day-heading::after { content: ""; grid-column: 3; grid-row: 1; width: 100%; height: 1px; background: var(--line); }
  .session-day-heading time { z-index: 1; grid-column: 3; grid-row: 1; justify-self: start; width: max-content; padding: 4px 11px; border-radius: 999px; color: var(--muted); background: var(--rail); font-size: 10.5px; font-weight: 680; letter-spacing: .01em; }
  .session-timeline-event { min-width: 0; display: grid; grid-template-columns: 58px 26px minmax(0, 1fr); gap: 12px; align-items: stretch; }
  .session-timeline-event + .session-timeline-event { margin-top: 0; }
  .session-event-time { padding-top: 17px; color: var(--faint); text-align: right; font-size: 10px; font-variant-numeric: tabular-nums; }
  .session-event-track { position: relative; display: flex; justify-content: center; }
  .session-event-track::before { content: ""; position: absolute; inset: 0 auto 0 50%; width: 1px; background: var(--line); transform: translateX(-50%); }
  .session-event-track > span { position: relative; z-index: 1; width: 22px; height: 22px; margin-top: 11px; border: 1px solid currentColor; border-radius: 50%; color: var(--muted); background: var(--paper); display: grid; place-items: center; box-shadow: 0 0 0 3px var(--paper); }
  .session-event-track > span svg { width: 12px; height: 12px; stroke-width: 2; }
  .session-event--user_message .session-event-track > span { color: var(--blue-dark); background: var(--blue-soft); }
  .session-event--runtime_message .session-event-track > span { color: color-mix(in srgb, var(--blue) 76%, var(--green)); background: color-mix(in srgb, var(--blue-soft) 68%, var(--paper)); }
  .session-event--tool .session-event-track > span, .session-event--approval .session-event-track > span { color: var(--amber); background: var(--amber-soft); }
  .session-event--artifact .session-event-track > span { color: var(--blue-dark); background: var(--blue-soft); }
  .session-event--terminal_output .session-event-track > span { color: var(--muted); background: var(--rail); }
  .session-event--status .session-event-track > span { color: var(--green); background: var(--green-soft); }
  .session-event-card { min-width: 0; padding: 13px 16px 15px; border: 1px solid transparent; border-radius: 10px; }
  .session-event-card > header { min-width: 0; display: flex; align-items: baseline; justify-content: space-between; gap: 8px 16px; }
  .session-event-identity { min-width: 0; display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 8px; }
  .session-event-identity strong { min-width: 0; color: var(--ink); overflow-wrap: anywhere; font-size: 11.5px; font-weight: 720; }
  .session-event-identity small, .session-event-meta { color: var(--faint); font-size: 9.5px; }
  .session-event-card > p { max-width: 68ch; margin: 7px 0 0; color: var(--ink-soft); white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; line-height: 1.6; }
  .session-event--user_message .session-event-card { padding: 10px 16px 12px; border-color: color-mix(in srgb, var(--blue) 17%, transparent); background: color-mix(in srgb, var(--blue-soft) 54%, transparent); }
  .session-event--runtime_message .session-event-card { padding-top: 11px; padding-bottom: 15px; }
  .session-event--runtime_message .session-event-card > p { color: var(--ink); font-size: 13.2px; line-height: 1.62; }
  .session-event-card--technical { margin: 0; padding: 0; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: transparent; }
  .session-event-card--technical details { min-width: 0; }
  .session-event-card--technical summary { min-height: 44px; padding: 5px 1px; color: var(--ink-soft); display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 9px 13px; align-items: center; list-style: none; cursor: pointer; }
  .session-event-card--technical summary::-webkit-details-marker { display: none; }
  .session-event-summary { min-width: 0; display: flex; align-items: baseline; flex-wrap: wrap; gap: 5px 10px; }
  .session-event-summary strong { color: var(--ink); overflow-wrap: anywhere; font-size: 11.5px; }
  .session-event-summary small { color: var(--faint); font-size: 9.5px; }
  .session-event-status { color: var(--green); font-size: 9.5px; font-weight: 690; white-space: nowrap; }
  .session-event-status.is-error { color: var(--red); }
  .session-event-disclosure { color: var(--blue-dark); display: inline-flex; align-items: center; gap: 4px; font-size: 9.5px; font-weight: 650; white-space: nowrap; }
  .session-event-disclosure svg { width: 11px; height: 11px; transition: transform .16s cubic-bezier(.16, 1, .3, 1); }
  .session-event-card--technical details[open] .session-event-disclosure svg { transform: rotate(180deg); }
  .session-event-card--technical pre { max-height: 420px; margin: 0 0 12px; padding: 13px 14px 16px; overflow: auto; border: 1px solid var(--line); border-radius: 8px; color: var(--ink-soft); background: var(--page); white-space: pre-wrap; overflow-wrap: anywhere; font: 10.5px/1.65 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .session-event-card--compact { margin: 0; padding: 10px 1px 12px; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; }
  .session-event-card--compact > p { margin-top: 4px; color: var(--muted); font-size: 11.5px; line-height: 1.55; }
  .session-content-state { min-height: 360px; padding: 50px 24px; color: var(--muted); display: grid; grid-template-columns: 28px minmax(0, 420px); justify-content: center; align-content: center; gap: 12px; }
  .session-content-state > svg { font-size: 24px; }
  .session-content-state > div:only-child { grid-column: 1 / -1; width: min(100%, 420px); }
  .session-content-state h3 { margin: 0; color: var(--ink); font-size: 14px; }
  .session-content-state p { margin: 5px 0 0; font-size: 11px; line-height: 1.6; }
  .session-content-state button { margin-top: 12px; }
  .operation-search-empty { margin: 30px 0; color: var(--muted); text-align: center; }
  .operation-current-context { min-height: 350px; padding: 20px 18px; border: 0; border-radius: 14px; background: var(--paper); box-shadow: var(--shadow-soft); }
  .operation-current-context dd { align-items: start; gap: 6px; }
  .operation-current-context > header p { display: none; }
  .operation-current-context > header { align-items: start; display: flex; justify-content: space-between; gap: 10px; }
  .operation-current-context > header button { min-height: 28px; padding: 0; border: 0; color: var(--blue-dark); background: transparent; font-size: 9.5px; white-space: nowrap; }
  .operation-current-context dd button { min-height: 24px; padding: 0; border: 0; color: var(--blue-dark); background: transparent; font-size: 9.5px; justify-self: start; }
  .operation-current-context code { overflow-wrap: anywhere; font: 9.5px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .operation-goal-history { min-height: 358px; margin: 0; padding: 20px 18px; border: 0; border-radius: 14px; background: var(--paper); box-shadow: var(--shadow-soft); }
  .operation-goal-history > header > span { color: var(--muted); font-size: 9.5px; }
  .operation-history { margin: 0; padding: 0; list-style: none; }
  .operation-history li { padding: 9px 0; display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 8px; }
  .operation-history li + li { border-top: 1px solid var(--line); }
  .operation-history svg { color: var(--muted); font-size: 15px; }
  .operation-history li.is-current svg { color: var(--blue-dark); }
  .operation-history span { min-width: 0; display: grid; gap: 1px; }
  .operation-history strong { color: var(--ink); font-size: 10px; line-height: 1.35; }
  .operation-history small, .operation-aside-empty small { color: var(--faint); font-size: 9px; }
  .operation-aside-empty { padding: 12px 0; color: var(--muted); display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 3px 8px; }
  .operation-aside-empty strong { color: var(--ink); font-size: 10px; }
  .operation-aside-empty small { grid-column: 2; }
  .operation-identity { padding: 13px 14px; border-radius: 12px; background: var(--paper); box-shadow: var(--shadow-soft); }
  .operation-identity summary { color: var(--ink-soft); display: flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 680; cursor: pointer; }
  .operation-identity dl { margin: 9px 0 0; }
  .operation-identity dl > div { padding: 5px 0; display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 8px; font-size: 9.5px; }
  .operation-identity dt { color: var(--muted); }
  .operation-identity dd { margin: 0; overflow-wrap: anywhere; }
  .operation-archive { width: 100%; min-height: 34px; justify-content: center; }

  .project-operation-dialog { width: min(520px, calc(100vw - 28px)); max-height: calc(100dvh - 28px); padding: 0; border: 1px solid var(--line-strong); border-radius: 12px; color: var(--ink); background: var(--paper); box-shadow: 0 22px 72px rgba(10, 15, 22, .3); }
  .project-operation-dialog::backdrop { background: rgba(12, 16, 22, .52); }
  .project-operation-dialog form > header { padding: 16px 18px 13px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; gap: 12px; }
  .project-operation-dialog h2 { margin: 0; font-size: 16px; }
  .project-operation-dialog header p { margin: 3px 0 0; color: var(--muted); font-size: 10px; }
  .project-operation-dialog header button { width: 32px; height: 32px; padding: 0; border: 0; border-radius: 7px; background: transparent; }
  .project-operation-dialog form > section { padding: 16px 18px; display: grid; gap: 12px; }
  .project-operation-dialog label:not(.operation-confirm-check) { color: var(--muted); display: grid; gap: 5px; font-size: 10px; }
  .project-operation-dialog input:not([type="checkbox"]), .project-operation-dialog select { width: 100%; height: 36px; padding: 0 9px; border: 1px solid var(--line); border-radius: 7px; color: var(--ink); background: var(--page); }
  .operation-confirm-facts { margin: 0; }
  .operation-confirm-facts > div { padding: 7px 0; display: grid; grid-template-columns: 108px minmax(0, 1fr); gap: 10px; }
  .operation-confirm-facts > div + div { border-top: 1px solid var(--line); }
  .operation-confirm-facts dt { color: var(--muted); font-size: 10px; }
  .operation-confirm-facts dd { margin: 0; font-size: 11px; overflow-wrap: anywhere; }
  .operation-confirm-check { display: grid; grid-template-columns: 17px minmax(0, 1fr); gap: 8px; font-size: 10px; }
  .operation-confirm-check input { margin: 2px 0 0; accent-color: var(--blue); }
  .project-operation-dialog footer { padding: 11px 18px; border-top: 1px solid var(--line); display: flex; justify-content: flex-end; gap: 7px; }
  .project-operation-dialog footer button { min-height: 34px; padding: 0 11px; border: 1px solid var(--line); border-radius: 7px; background: var(--paper); font-weight: 680; }
  .project-operation-dialog footer .button-primary { color: var(--paper); background: var(--ink); }
  .project-operation-dialog footer .button-primary:disabled { opacity: .42; }
  .session-handoff-dialog { width: min(980px, calc(100vw - 32px)); }
  .session-handoff-dialog form { height: min(760px, calc(100dvh - 32px)); display: grid; grid-template-rows: auto minmax(0, 1fr) auto; }
  .session-handoff-dialog form > section.session-handoff-review { min-height: 0; padding: 0; display: grid; grid-template-columns: minmax(250px, 31%) minmax(0, 1fr); gap: 0; }
  .session-handoff-controls { min-width: 0; padding: 18px; overflow: auto; border-right: 1px solid var(--line); display: grid; align-content: start; gap: 14px; }
  .session-handoff-controls .operation-confirm-facts > div { grid-template-columns: 88px minmax(0, 1fr); }
  .session-handoff-controls .operation-confirm-check { padding-top: 13px; border-top: 1px solid var(--line); }
  .session-handoff-editor { min-width: 0; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); background: var(--page); }
  .session-handoff-editor > header { padding: 14px 16px 11px; border-bottom: 1px solid var(--line); display: flex; align-items: start; justify-content: space-between; gap: 12px; }
  .session-handoff-editor h3 { margin: 0; font-size: 12px; }
  .session-handoff-editor header p { max-width: 62ch; margin: 3px 0 0; color: var(--muted); font-size: 9.5px; line-height: 1.45; }
  .session-handoff-editor header > span { flex: none; padding: 3px 7px; border-radius: 999px; color: var(--blue-dark); background: var(--blue-soft); font-size: 9px; font-weight: 700; }
  .session-handoff-editor textarea { width: 100%; min-height: 0; padding: 17px 18px 24px; resize: none; border: 0; outline: 0; color: var(--ink-soft); caret-color: var(--blue); background: transparent; font: 11px/1.62 ui-monospace, SFMono-Regular, Menlo, monospace; tab-size: 2; scrollbar-color: var(--line-strong) transparent; }
  .session-handoff-editor textarea:focus-visible { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--blue) 68%, transparent); }
  .session-handoff-editor textarea::selection { color: var(--ink); background: color-mix(in srgb, var(--blue) 24%, transparent); }
  .session-handoff-dialog[data-handoff-busy="true"] .session-handoff-editor textarea { opacity: .62; }
  .session-handoff-dialog footer [data-handoff-save]:disabled { opacity: .42; }
  .session-handoff-cancel { min-height: 30px; padding: 0; border: 0; color: var(--muted); background: transparent; justify-self: start; font-size: 9.5px; }
  .session-handoff-cancel:hover:not(:disabled) { color: var(--red); }
  .session-handoff-cancel:disabled { opacity: .42; }
  .session-add-native { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 8px; }
  .session-add-native > label { min-width: 0; }
  .session-add-native > button { min-height: 36px; margin: 0; white-space: nowrap; }
  .session-add-dialog { width: min(540px, calc(100vw - 28px)); transform: translateX(68px); }
  .session-add-dialog form > header { padding: 19px 21px 10px; border-bottom: 0; align-items: start; }
  .session-add-dialog form > header > button { width: 44px; height: 44px; border: 1px solid var(--line); border-radius: 10px; }
  .session-add-heading { min-width: 0; flex: 1; }
  .session-add-heading-row { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
  .session-add-heading-row [data-session-add-toggle] { min-height: 28px; padding: 0; border: 0; color: var(--blue-dark); background: transparent; font-size: 10px; white-space: nowrap; }
  .session-add-dialog form > section { padding: 10px 21px 14px; gap: 11px; }
  .session-add-field-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
  .operation-field-label { color: var(--muted); display: flex; align-items: baseline; justify-content: space-between; gap: 8px; font-size: 10px; }
  .operation-field-label small { color: var(--faint); font-size: 9px; }
  .session-workspace-field { min-width: 0; display: grid; gap: 5px; }
  .session-workspace-picker { position: relative; }
  .session-workspace-picker > summary { min-height: 52px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; color: var(--ink); background: var(--page); display: flex; align-items: center; justify-content: space-between; gap: 10px; list-style: none; cursor: pointer; }
  .session-workspace-picker > summary::-webkit-details-marker { display: none; }
  .session-workspace-picker > summary > span { min-width: 0; display: flex; align-items: center; gap: 9px; }
  .session-workspace-picker > summary > span > svg { flex: none; color: var(--muted); }
  .session-workspace-picker > summary > span > span { min-width: 0; display: grid; gap: 2px; }
  .session-workspace-picker > summary strong, .session-workspace-picker > summary small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .session-workspace-picker > summary strong { font-size: 11px; }
  .session-workspace-picker > summary small { color: var(--faint); font: 9.5px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .session-workspace-picker > summary > svg { flex: none; color: var(--faint); }
  .session-workspace-picker[open] > summary { border-color: color-mix(in srgb, var(--blue) 58%, var(--line)); }
  .session-workspace-options { position: static; z-index: 90; width: min(304px, 100%); max-height: min(260px, calc(100dvh - 442px)); margin-top: 5px; overflow: auto; padding: 5px; border: 1px solid var(--line-strong); border-radius: 9px; background: var(--paper); box-shadow: 0 15px 40px rgba(10, 15, 22, .2); }
  .session-workspace-options button { width: 100%; min-height: 48px; padding: 7px 8px; border: 0; border-radius: 7px; color: var(--ink-soft); background: transparent; display: flex; align-items: center; justify-content: space-between; gap: 10px; text-align: left; }
  .session-workspace-options button:hover:not(:disabled), .session-workspace-options button:focus-visible { color: var(--ink); background: color-mix(in srgb, var(--blue) 8%, transparent); }
  .session-workspace-options button:disabled { opacity: .48; cursor: not-allowed; }
  .session-workspace-options button > span { min-width: 0; display: flex; align-items: center; gap: 9px; }
  .session-workspace-options button > span > svg { flex: none; color: var(--muted); }
  .session-workspace-options button > span > span { min-width: 0; display: grid; gap: 1px; }
  .session-workspace-options strong, .session-workspace-options small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .session-workspace-options strong { font-size: 10.5px; }
  .session-workspace-options small { color: var(--faint); font: 9px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .workspace-choice-state { flex: none; color: var(--green); font-size: 9px; font-style: normal; }
  .workspace-choice-state--missing, .workspace-choice-state--conflict { color: var(--red); }
  .session-workspace-options [data-session-workspace-none], .session-workspace-options [data-session-workspace-custom] { border-top: 1px solid var(--line); border-radius: 0; }
  .session-workspace-empty { margin: 0; padding: 12px 9px; color: var(--muted); font-size: 10px; }
  .session-workspace-custom { margin-top: 2px; }
  .session-add-confirm { padding-top: 2px; }
  .operation-capability-note, .operation-dialog-status { margin: 0; color: var(--muted); font-size: 10px; line-height: 1.5; }
  .operation-dialog-status.is-error { color: var(--red); }
  .project-operation-confirm-dialog { width: min(460px, calc(100vw - 28px)); }

  @media (min-width: 761px) and (max-width: 1180px) {
    .session-execution > header { align-items: stretch; flex-direction: column; gap: 12px; }
    .operation-content-controls { width: 100%; min-width: 0; justify-content: stretch; }
    .operation-content-search { min-width: 0; flex: 1 1 auto; }
  }

  @media (max-width: 760px) {
    .project-record-directory, .project-record-scroll { width: 100%; min-width: 0; max-width: 100%; box-sizing: border-box; overflow-x: hidden; }
    .project-record-directory { grid-template-rows: 54px minmax(0, 1fr) 42px; }
    .project-record-directory .desktop-directory-heading { display: none !important; }
    .project-record-tools { padding: 5px 8px; grid-template-columns: minmax(0, 1fr) 44px 44px; }
    .project-record-tools .tree-search, .project-record-filter-menu { grid-column: auto; }
    .project-record-filter-menu > summary { width: 44px; height: 44px; padding: 0; }
    .project-record-filter-menu > summary span { display: none; }
    .project-record-filter-menu > div { position: fixed; z-index: 80; top: auto; right: 10px; bottom: 64px; left: 10px; width: auto; grid-template-columns: 1fr 1fr; }
    .project-record-add-compact { width: 44px; height: 44px; padding: 0; border: 0; border-radius: 7px; color: var(--ink); background: var(--paper); display: grid; place-items: center; }
    .project-record-tools .tree-search input, .project-record-filter select { height: 44px; }
    .project-record-row { width: 100%; min-width: 0; max-width: 100%; min-height: 64px; padding: 7px 8px; box-sizing: border-box; overflow: hidden; }
    .project-record-select, .project-record-meta { max-width: 100%; overflow: hidden; }
    .project-record-select strong { font-size: 12px; }
    .project-record-select small, .project-record-meta { font-size: 9.5px; }
    body[data-desktop-shell="true"][data-desktop-surface="sessions"] .project-operation-document { width: 100%; margin: 0; padding: 18px 14px 40px; }
    .project-operation-document, .project-operation-hero, .project-operation-layout, .project-operation-layout .goal-focus-main { max-width: 100%; box-sizing: border-box; }
    .project-operation-hero .goal-title-copy, .project-operation-hero .goal-title-copy h1, .project-operation-hero .goal-title-outcome { min-width: 0; max-width: 100%; }
    body[data-desktop-shell="true"] .project-operation-hero .goal-title-copy h1 { white-space: normal; overflow-wrap: anywhere; font-size: clamp(30px, 9vw, 38px); line-height: 1.16; }
    .project-operation-hero .goal-title-facts span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    body[data-desktop-shell="true"] .project-operation-hero .goal-title-row { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
    body[data-desktop-shell="true"] .project-operation-hero .goal-title-actions { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .project-operation-hero .goal-title-actions .goal-primary-action, .project-operation-hero .goal-title-actions .document-action { min-height: 44px; justify-content: center; }
    body[data-desktop-shell="true"][data-desktop-surface="sessions"] .project-operation-layout { grid-template-columns: minmax(0, 1fr); gap: 10px; }
    .project-operation-layout, .project-operation-layout .goal-focus-main, .session-execution, .session-content-body, .session-transcript { width: 100%; min-width: 0; max-width: 100%; }
    .project-operation-layout .goal-focus-main { order: 1; }
    .project-operation-layout .goal-focus-aside { order: 2; }
    .project-session-document .goal-focus-aside { display: contents; }
    .project-session-document .goal-focus-main { order: 1; }
    .project-session-document .operation-current-context { order: 2; }
    .project-session-document .operation-goal-history { order: 3; }
    .project-session-document .operation-identity { order: 4; }
    .project-session-document .operation-archive { order: 5; }
    body[data-desktop-shell="true"][data-desktop-surface="sessions"] .session-execution { min-height: 0; padding: 18px 14px 24px; }
    .session-execution > header { align-items: stretch; flex-direction: column; }
    .operation-content-controls { width: 100%; min-width: 0; }
    .operation-content-search { width: 100%; min-width: 0; }
    .operation-content-search input, .operation-content-filter select { min-height: 44px; }
    .operation-content-filter select { width: 108px; }
    .session-content-warning { margin-left: 0; }
    .session-content-summary { margin-left: 0; }
    .session-day-heading, .session-timeline-event { grid-template-columns: 42px 16px minmax(0, 1fr); gap: 7px; }
    .session-event-card { padding: 12px 12px 14px; }
    .session-event-card > p, .session-event--runtime_message .session-event-card > p { font-size: 13px; }
    .session-event-card--technical, .session-event-card--compact { padding: 0; }
    .session-event-card--compact { padding: 9px 10px; }
    .session-event-time { padding-top: 14px; font-size: 9px; }
    .session-content-state { min-height: 280px; padding: 34px 16px; }
    .operation-current-context dd button, .operation-archive { min-height: 44px; }
    .project-operation-dialog { width: 100vw; max-width: none; height: 100dvh; max-height: none; margin: 0; border: 0; border-radius: 0; }
    .session-add-dialog { transform: none; }
    .project-operation-dialog form > section { max-height: calc(100dvh - 132px); overflow: auto; }
    .session-handoff-dialog form { height: 100dvh; }
    .session-handoff-dialog form > section.session-handoff-review { max-height: none; overflow: auto; grid-template-columns: minmax(0, 1fr); }
    .session-handoff-controls { overflow: visible; border-right: 0; border-bottom: 1px solid var(--line); }
    .session-handoff-editor { min-height: 54dvh; }
    .session-handoff-editor textarea { min-height: 46dvh; resize: vertical; font-size: 10.5px; }
    .session-handoff-dialog footer { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .session-handoff-dialog footer .button-primary { grid-column: 1 / -1; grid-row: 1; }
    .project-operation-dialog header button, .project-operation-dialog footer button { min-width: 44px; min-height: 44px; }
    .session-add-field-grid { grid-template-columns: minmax(0, 1fr); }
    .session-add-heading-row { align-items: start; }
    .session-workspace-options { position: static; max-height: 240px; margin-top: 5px; box-shadow: none; }
    .session-add-native { grid-template-columns: minmax(0, 1fr); }
    .session-add-native > button { min-height: 44px; justify-content: center; }
  }

  @media (max-width: 320px) {
    body[data-desktop-shell="true"] .project-operation-hero .goal-title-actions { grid-template-columns: minmax(0, 1fr); }
    body[data-desktop-shell="true"] .project-session-document .goal-title-actions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .project-operation-hero .goal-title-actions .goal-primary-action,
    .project-operation-hero .goal-title-actions .document-action { width: 100%; }
  }

  @media (prefers-reduced-motion: reduce) {
    .project-record-row, .project-operation-dialog { transition: none; }
  }
`;

export const PROJECT_OPERATIONS_CLIENT_SCRIPT = `
(() => {
  const toast = document.querySelector("[data-toast]");
  const routePrefix = document.body.dataset.routePrefix || "";
  const route = (pathname) => routePrefix + pathname;
  const showToast = (message) => {
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { toast.hidden = true; }, 3200);
  };
  const sourceLabel = (source) => source === "runtime_native"
    ? "Runtime 原生"
    : source === "goalboard_tui"
      ? "GoalBoard TUI · 部分终端记录"
      : "GoalBoard 记录";
  const renderContentState = (detail, title, message, retry = false) => {
    const body = detail.querySelector(".session-content-body");
    body.replaceChildren();
    const state = document.createElement("div");
    state.className = "session-content-state";
    const copy = document.createElement("div");
    const heading = document.createElement("h3");
    heading.textContent = title;
    const paragraph = document.createElement("p");
    paragraph.textContent = message;
    copy.append(heading, paragraph);
    if (retry) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "document-action";
      button.dataset.sessionRetry = "";
      button.textContent = "重试读取";
      copy.append(button);
    }
    state.append(copy);
    body.append(state);
  };
  const eventFilterGroup = (kind) => ["user_message", "runtime_message"].includes(kind)
    ? "conversation"
    : ["tool", "approval"].includes(kind)
      ? "tool"
      : kind === "artifact"
        ? "artifact"
        : kind === "terminal_output"
        ? "terminal"
          : "status";
  const timelineIconName = (kind) => ({
    user_message: "user",
    runtime_message: "target",
    tool: "terminal",
    approval: "shield",
    status: "completed",
    artifact: "file",
    terminal_output: "code",
  }[kind] || "info");
  const createTimelineIcon = (kind) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#icon-" + timelineIconName(kind));
    svg.append(use);
    return svg;
  };
  const formatSessionDay = (date) => {
    if (Number.isNaN(date.getTime())) return { key: "unknown", label: "时间未知" };
    const key = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
    const weekday = date.toLocaleDateString("zh-CN", { weekday: "long" });
    return { key, label: (date.getMonth() + 1) + " 月 " + date.getDate() + " 日 · " + weekday };
  };
  const applySessionContentFilters = (detail) => {
    if (!detail) return;
    const query = String(detail.querySelector("[data-session-content-search]")?.value || "").trim().toLocaleLowerCase();
    const filter = String(detail.querySelector("[data-session-content-filter]")?.value || "all");
    let shown = 0;
    detail.querySelectorAll(".session-timeline-event").forEach((item) => {
      const matchesQuery = !query || String(item.dataset.eventSearch || item.textContent || "").toLocaleLowerCase().includes(query);
      const matchesFilter = filter === "all" || item.dataset.eventFilterGroup === filter;
      item.hidden = !matchesQuery || !matchesFilter;
      if (!item.hidden) shown += 1;
    });
    detail.querySelectorAll(".session-day-group").forEach((group) => {
      group.hidden = !group.querySelector(".session-timeline-event:not([hidden])");
    });
    const empty = detail.querySelector("[data-session-content-empty]");
    if (empty) empty.hidden = shown > 0;
  };
  const renderSessionTimeline = (detail, payload) => {
    const body = detail.querySelector(".session-content-body");
    body.replaceChildren();
    const events = Array.isArray(payload.events)
      ? payload.events.filter((event) => String(event.content || "").replace(/[\s\u200B-\u200D\uFEFF]/g, "") || ["tool", "artifact", "terminal_output"].includes(event.kind))
      : [];
    if (!events.length) {
      const title = payload.content_mode === "failed" ? "Runtime 内容读取失败" : "还没有可显示的执行内容";
      const message = payload.native_error?.message || (payload.content_mode === "unavailable"
        ? "这个 Runtime 没有内容读取能力，GoalBoard 也还没有持久化的 TUI 记录。"
        : "Session 身份与关系已经保留，产生执行记录后会显示在这里。");
      renderContentState(detail, title, message, payload.content_mode === "failed");
      return;
    }
    const list = document.createElement("div");
    list.className = "session-transcript";
    list.dataset.sessionContentList = "";
    if (payload.native_error?.message) {
      const warning = document.createElement("p");
      warning.className = "session-content-warning";
      warning.setAttribute("role", "status");
      warning.textContent = payload.native_error.message;
      list.append(warning);
    }
    if (payload.native_history?.mode === "summary") {
      const summary = document.createElement("p");
      summary.className = "session-content-summary";
      summary.setAttribute("role", "status");
      const count = Number(payload.native_history.turn_count || 0);
      summary.textContent = payload.native_history.has_earlier
        ? "为保证稳定性，这里显示最近 " + count + " 轮的摘要；更早记录仍保留在原 Runtime。"
        : "已安全读取这条 Session 的 " + count + " 轮摘要；大体积工具输出会由原 Runtime 收拢。";
      list.append(summary);
    }
    const dayGroups = new Map();
    events.forEach((event) => {
      const occurredAt = new Date(event.occurred_at);
      const day = formatSessionDay(occurredAt);
      let group = dayGroups.get(day.key);
      if (!group) {
        group = document.createElement("section");
        group.className = "session-day-group";
        group.dataset.sessionDay = day.key;
        const dayHeading = document.createElement("header");
        dayHeading.className = "session-day-heading";
        const dayLabel = document.createElement("time");
        dayLabel.dateTime = day.key === "unknown" ? "" : day.key;
        dayLabel.textContent = day.label;
        dayHeading.append(dayLabel);
        group.append(dayHeading);
        dayGroups.set(day.key, group);
        list.append(group);
      }
      const article = document.createElement("article");
      article.className = "session-timeline-event session-event--" + (event.kind || "status");
      article.dataset.eventKind = event.kind || "status";
      article.dataset.eventFilterGroup = eventFilterGroup(event.kind);
      article.dataset.eventSearch = [event.label, event.content, sourceLabel(event.source), event.metadata?.status].filter(Boolean).join(" ").toLocaleLowerCase();
      const timeRail = document.createElement("time");
      timeRail.className = "session-event-time";
      timeRail.dateTime = event.occurred_at || "";
      timeRail.textContent = Number.isNaN(occurredAt.getTime()) ? "—" : occurredAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
      const track = document.createElement("div");
      track.className = "session-event-track";
      const node = document.createElement("span");
      node.setAttribute("aria-hidden", "true");
      node.append(createTimelineIcon(event.kind));
      track.append(node);
      const card = document.createElement("div");
      card.className = "session-event-card";
      const eventContent = String(event.content || "");
      const metadata = event.metadata && typeof event.metadata === "object" ? event.metadata : {};
      const metaParts = [
        sourceLabel(event.source),
        metadata.duration_ms != null && Number.isFinite(Number(metadata.duration_ms)) ? Math.max(0, Math.round(Number(metadata.duration_ms))) + " ms" : "",
        metadata.exit_code != null ? "退出码 " + metadata.exit_code : "",
      ].filter(Boolean);
      const rawStatus = typeof metadata.status === "string" ? metadata.status : "";
      const statusText = rawStatus
        ? ({ completed: "已完成", failed: "失败", running: "进行中", pending: "等待中", approved: "已批准", denied: "已拒绝" }[rawStatus] || rawStatus)
        : metadata.exit_code === 0
          ? "已完成"
          : metadata.exit_code != null
            ? "已结束"
            : "";
      const technical = ["tool", "artifact", "terminal_output"].includes(event.kind);
      const compact = ["status", "approval"].includes(event.kind);
      if (technical) {
        card.classList.add("session-event-card--technical");
        const details = document.createElement("details");
        const summary = document.createElement("summary");
        const summaryCopy = document.createElement("span");
        summaryCopy.className = "session-event-summary";
        const label = document.createElement("strong");
        label.textContent = event.label || "执行事件";
        const meta = document.createElement("small");
        meta.textContent = metaParts.join(" · ");
        summaryCopy.append(label, meta);
        if (statusText) {
          const status = document.createElement("span");
          status.className = "session-event-status";
          status.textContent = statusText;
          if (["failed", "denied"].includes(rawStatus)) status.classList.add("is-error");
          summary.append(summaryCopy, status);
        } else {
          summary.append(summaryCopy);
        }
        const disclosure = document.createElement("span");
        disclosure.className = "session-event-disclosure";
        disclosure.append(document.createTextNode(event.kind === "artifact"
          ? "查看变更"
          : event.kind === "terminal_output"
            ? "展开输出"
            : "查看详情"), createTimelineIcon("disclosure"));
        disclosure.querySelector("use")?.setAttribute("href", "#icon-chevron-down");
        summary.append(disclosure);
        const content = document.createElement("pre");
        content.textContent = eventContent || "没有附加输出。";
        details.append(summary, content);
        card.append(details);
      } else {
        if (compact) card.classList.add("session-event-card--compact");
        const header = document.createElement("header");
        const identity = document.createElement("span");
        identity.className = "session-event-identity";
        const label = document.createElement("strong");
        label.textContent = event.label || (event.kind === "runtime_message" ? "Runtime" : "执行事件");
        const source = document.createElement("small");
        source.textContent = sourceLabel(event.source);
        identity.append(label, source);
        const meta = document.createElement("span");
        meta.className = "session-event-meta";
        meta.textContent = metaParts.slice(1).join(" · ");
        header.append(identity, meta);
        const content = document.createElement("p");
        content.textContent = eventContent;
        card.append(header, content);
      }
      article.append(timeRail, track, card);
      group.append(article);
    });
    const empty = document.createElement("p");
    empty.className = "operation-search-empty";
    empty.dataset.sessionContentEmpty = "";
    empty.hidden = true;
    empty.textContent = "当前内容中没有匹配结果。";
    body.append(list, empty);
    applySessionContentFilters(detail);
  };
  const loadSessionContent = async (detail, force = false) => {
    if (!detail?.dataset.detailId) return;
    if (!force && ["loading", "loaded"].includes(detail.dataset.contentState || "")) return;
    detail.dataset.contentState = "loading";
    renderContentState(detail, "正在读取执行内容", "正在联系原 Runtime，并加载 GoalBoard 已保存的 TUI 记录。", false);
    try {
      const response = await fetch(route("/api/sessions/" + encodeURIComponent(detail.dataset.detailId) + "/content"), {
        cache: "no-store",
        headers: window.goalboardControlHeaders?.() || {},
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Session 内容读取失败");
      detail.dataset.contentState = "loaded";
      renderSessionTimeline(detail, payload);
    } catch (error) {
      detail.dataset.contentState = "failed";
      renderContentState(detail, "内容读取失败", error instanceof Error ? error.message : String(error), true);
    }
  };
  const directoryFor = (kind) => document.querySelector('[data-operation-directory="' + kind + '"]');
  const surfaceFor = (kind) => document.querySelector('[data-work-surface="' + kind + '"]');
  const visibleRows = (kind) => [...(directoryFor(kind)?.querySelectorAll("[data-operation-row]") || [])].filter((row) => !row.hidden);
  const selectRecord = (kind, id, moveToDetail = false) => {
    const directory = directoryFor(kind);
    const surface = surfaceFor(kind);
    const row = directory?.querySelector('[data-record-id="' + CSS.escape(id) + '"]');
    if (!directory || !surface || !row || row.hidden) return;
    directory.querySelectorAll("[data-operation-row]").forEach((candidate) => {
      const active = candidate === row;
      candidate.classList.toggle("is-selected", active);
      candidate.setAttribute("aria-selected", String(active));
      const button = candidate.matches("[data-operation-select]") ? candidate : candidate.querySelector("[data-operation-select]");
      if (button) button.tabIndex = active ? 0 : -1;
    });
    surface.querySelectorAll("[data-operation-detail]").forEach((detail) => { detail.hidden = detail.dataset.detailId !== id; });
    if (kind === "sessions") void loadSessionContent(surface.querySelector('[data-operation-detail]:not([hidden])'));
    if (moveToDetail && matchMedia("(max-width: 760px)").matches) document.querySelector('[data-mobile-target="document"]')?.click();
  };
  const filterRecords = (kind) => {
    const directory = directoryFor(kind);
    const surface = surfaceFor(kind);
    if (!directory || !surface) return;
    const query = String(directory.querySelector("[data-operation-search]")?.value || "").trim().toLocaleLowerCase();
    const filter = String(directory.querySelector("[data-operation-filter]")?.value || "all");
    const runtime = String(directory.querySelector("[data-session-runtime-filter]")?.value || "all");
    const status = String(directory.querySelector("[data-session-status-filter]")?.value || "all");
    const sort = String(directory.querySelector("[data-session-sort]")?.value || "updated-desc");
    const rows = [...directory.querySelectorAll("[data-operation-row]")];
    const visible = rows.filter((row) => {
      const contentMatches = row.dataset.recordContent === filter;
      const shown = (!query || String(row.dataset.recordSearch || "").includes(query))
        && (filter === "all" || contentMatches)
        && (runtime === "all" || row.dataset.recordRuntime === runtime)
        && (status === "all" || row.dataset.recordStatus === status);
      row.hidden = !shown;
      return shown;
    });
    rows.sort((left, right) => sort === "title-asc"
      ? String(left.dataset.recordTitle || left.dataset.recordSearch || "").localeCompare(String(right.dataset.recordTitle || right.dataset.recordSearch || ""))
      : sort === "updated-asc"
        ? Number(left.dataset.recordUpdated || 0) - Number(right.dataset.recordUpdated || 0)
        : Number(right.dataset.recordUpdated || 0) - Number(left.dataset.recordUpdated || 0));
    const list = directory.querySelector("[data-operation-list]");
    rows.forEach((row) => list?.append(row));
    const empty = directory.querySelector("[data-operation-empty]");
    if (empty) {
      empty.hidden = visible.length > 0;
      empty.querySelector("button")?.toggleAttribute("hidden", visible.length > 0);
    }
    const count = directory.querySelector("[data-operation-count]");
    if (count) count.textContent = String(visible.length);
    if (!visible.length) surface.querySelectorAll("[data-operation-detail]").forEach((detail) => { detail.hidden = true; });
    else if (!visible.some((row) => row.classList.contains("is-selected"))) selectRecord(kind, visible[0].dataset.recordId);
  };
  document.querySelectorAll("[data-operation-directory]").forEach((directory) => {
    const kind = directory.dataset.operationDirectory;
    directory.addEventListener("click", (event) => {
      const select = event.target.closest("[data-operation-select]");
      if (select) selectRecord(kind, select.dataset.operationSelect, true);
    });
    directory.addEventListener("keydown", (event) => {
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const rows = visibleRows(kind);
      const current = rows.findIndex((row) => row.classList.contains("is-selected"));
      const next = event.key === "Home" ? rows[0] : event.key === "End" ? rows.at(-1) : rows[event.key === "ArrowDown" ? Math.min(rows.length - 1, current + 1) : Math.max(0, current - 1)];
      if (!next) return;
      event.preventDefault();
      selectRecord(kind, next.dataset.recordId);
      (next.matches("[data-operation-select]") ? next : next.querySelector("[data-operation-select]"))?.focus();
    });
    directory.querySelector("[data-operation-search]")?.addEventListener("input", () => filterRecords(kind));
    directory.querySelector("[data-operation-filter]")?.addEventListener("change", () => filterRecords(kind));
    directory.querySelector("[data-session-runtime-filter]")?.addEventListener("change", () => filterRecords(kind));
    directory.querySelector("[data-session-status-filter]")?.addEventListener("change", () => filterRecords(kind));
    directory.querySelector("[data-session-sort]")?.addEventListener("change", () => filterRecords(kind));
    directory.querySelector("[data-operation-clear]")?.addEventListener("click", () => {
      const search = directory.querySelector("[data-operation-search]");
      const filter = directory.querySelector("[data-operation-filter]");
      if (search) search.value = "";
      if (filter) filter.value = "all";
      const runtime = directory.querySelector("[data-session-runtime-filter]");
      const status = directory.querySelector("[data-session-status-filter]");
      if (runtime) runtime.value = "all";
      if (status) status.value = "all";
      filterRecords(kind);
      search?.focus();
    });
  });
  const sessionDirectory = directoryFor("sessions");
  const sessionRuntimeFilter = sessionDirectory?.querySelector("[data-session-runtime-filter]");
  if (sessionRuntimeFilter) {
    [...new Map([...sessionDirectory.querySelectorAll('[data-operation-row="session"]')].map((row) => [row.dataset.recordRuntime, row.querySelector(".project-record-select small")?.textContent?.split(" / ")[0] || row.dataset.recordRuntime])).entries()]
      .filter(([value]) => value)
      .sort((left, right) => String(left[1]).localeCompare(String(right[1])))
      .forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        sessionRuntimeFilter.append(option);
      });
  }
  document.addEventListener("keydown", (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "f") return;
    const activeDirectory = document.querySelector('[data-operation-directory]:not([hidden])');
    const search = activeDirectory?.querySelector("[data-operation-search]");
    if (!search) return;
    event.preventDefault();
    search.focus();
  });
  document.addEventListener("input", (event) => {
    if (event.target.matches("[data-session-content-search]")) applySessionContentFilters(event.target.closest("[data-operation-detail]"));
  });
  document.addEventListener("change", (event) => {
    if (event.target.matches("[data-session-content-filter]")) applySessionContentFilters(event.target.closest("[data-operation-detail]"));
  });
  document.addEventListener("click", (event) => {
    const load = event.target.closest("[data-session-content-load]");
    const retry = event.target.closest("[data-session-retry]");
    if (load || retry) void loadSessionContent(event.target.closest("[data-operation-detail]"), true);
  });
  document.querySelectorAll("[data-session-load]").forEach((button) => button.addEventListener("click", () => {
    const status = button.closest("[data-operation-detail]").querySelector("[data-session-load-status]");
    status.hidden = false;
    status.classList.remove("is-error");
    status.textContent = "正在请求原 Runtime 加载这条 Session...";
    button.disabled = true;
    const detail = button.closest("[data-operation-detail]");
    fetch(route("/api/sessions/" + encodeURIComponent(detail.dataset.detailId) + "/resume"), {
      method: "POST",
      headers: window.goalboardControlHeaders?.() || {},
      body: "{}",
    }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw Object.assign(new Error(payload.message || payload.error || "Runtime 加载失败"), { nextAction: payload.next_action });
      status.textContent = "原 Runtime 已加载这条 Session，可以继续执行。";
    }).catch((error) => {
      status.textContent = error.nextAction === "create_handoff"
        ? error.message + " 可以使用上方“创建 Handoff”交给新的目标 Session。"
        : error.message;
      status.classList.toggle("is-error", !String(error.message || "").includes("无需重复加载"));
    }).finally(() => { button.disabled = false; });
  }));
  const parseActionResponse = async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.message || "Session 操作失败，请重试");
    return payload;
  };
  const showDialogStatus = (element, message, error = false) => {
    if (!element) return;
    element.hidden = false;
    element.textContent = message;
    element.classList.toggle("is-error", error);
  };
  const sessionAddDialog = document.querySelector("[data-session-add-dialog]");
  const sessionAddForm = sessionAddDialog?.querySelector("[data-session-add-form]");
  const sessionAddAction = sessionAddForm?.querySelector("[data-session-add-action]");
  const sessionAddRuntime = sessionAddForm?.querySelector("[data-session-add-runtime]");
  const sessionAddNative = sessionAddForm?.querySelector("[data-session-add-native]");
  const sessionAddNativeInput = sessionAddForm?.querySelector("[data-session-native-id]");
  const sessionAddConfirm = sessionAddForm?.querySelector("[data-session-add-confirm]");
  const sessionAddSubmit = sessionAddForm?.querySelector("[data-session-add-submit]");
  const sessionAddStatus = sessionAddForm?.querySelector("[data-session-add-status]");
  const sessionAddWorkspaceId = sessionAddForm?.querySelector("[data-session-add-workspace-id]");
  const sessionAddWorkspace = sessionAddForm?.querySelector("[data-session-add-workspace]");
  const sessionAddWorkspaceName = sessionAddForm?.querySelector("[data-session-workspace-name]");
  const sessionAddWorkspacePath = sessionAddForm?.querySelector("[data-session-workspace-path]");
  const sessionAddWorkspaceMenu = sessionAddForm?.querySelector("[data-session-workspace-menu]");
  const sessionAddWorkspaceCustomPanel = sessionAddForm?.querySelector("[data-session-workspace-custom-panel]");
  const sessionAddWorkspaceCustomInput = sessionAddForm?.querySelector("[data-session-workspace-custom-input]");
  const initialSessionWorkspace = {
    id: sessionAddWorkspaceId?.defaultValue || "",
    path: sessionAddWorkspace?.defaultValue || "",
    name: sessionAddWorkspaceName?.textContent || "不关联工作目录",
  };
  const setSessionWorkspace = ({ id = "", path = "", name = "不关联工作目录", custom = false }) => {
    if (sessionAddWorkspaceId) sessionAddWorkspaceId.value = id;
    if (sessionAddWorkspace) sessionAddWorkspace.value = path;
    if (sessionAddWorkspaceName) sessionAddWorkspaceName.textContent = name;
    if (sessionAddWorkspacePath) sessionAddWorkspacePath.textContent = path || (custom ? "请输入这台电脑上的绝对路径" : "运行时不绑定本地路径");
    if (sessionAddWorkspaceCustomPanel) sessionAddWorkspaceCustomPanel.hidden = !custom;
    if (sessionAddWorkspaceMenu) sessionAddWorkspaceMenu.open = false;
    if (custom) queueMicrotask(() => sessionAddWorkspaceCustomInput?.focus());
  };
  const updateSessionAddForm = () => {
    const action = sessionAddAction?.value || "create";
    const option = sessionAddRuntime?.selectedOptions?.[0];
    const createMode = option?.dataset.createMode || "registry";
    const discoverMode = option?.dataset.discoverMode || "unsupported";
    if (sessionAddNative) sessionAddNative.hidden = action !== "link";
    if (sessionAddNativeInput) sessionAddNativeInput.required = action === "link";
    const dialogTitle = sessionAddForm?.querySelector("[data-session-add-dialog-title]");
    const dialogCopy = sessionAddForm?.querySelector("[data-session-add-dialog-copy]");
    const mode = sessionAddForm?.querySelector("[data-session-add-mode]");
    const toggle = sessionAddForm?.querySelector("[data-session-add-toggle]");
    const confirmCopy = sessionAddForm?.querySelector("[data-session-add-confirm-copy]");
    if (dialogTitle) dialogTitle.textContent = action === "create" ? "新建 Session" : "关联已有 Session";
    if (dialogCopy) dialogCopy.textContent = action === "create" ? "从当前项目启动一条新的 Runtime Session。" : "把一条已存在的 Runtime Session 收入当前项目。";
    if (mode) mode.textContent = action === "create" ? "创建新的 Runtime Session" : "关联已有 Runtime Session";
    if (toggle) toggle.textContent = action === "create" ? "关联已有 Session" : "改为启动新 Session";
    if (confirmCopy) confirmCopy.textContent = action === "create"
      ? "确认使用以上 Goal、Runtime 和工作目录启动新 Session。"
      : "确认只为已有 Session 写入当前 Project、Goal 和工作目录关系。";
    const capability = sessionAddForm?.querySelector("[data-session-add-capability]");
    if (capability) capability.textContent = action === "create"
      ? createMode === "native"
        ? "会请求所选 Runtime 创建一条新的原生 Session；不会自动发送消息。"
        : "这个 Runtime 没有原生创建接口，将建立 GoalBoard 托管记录，不伪装成已启动 Runtime。"
      : discoverMode === "native"
        ? "可以先同步 Runtime 元数据；只有提交后才会关联当前 Project。"
        : "这个 Runtime 不支持发现列表，请粘贴原生 Session ID；GoalBoard 不读取正文。";
    if (sessionAddSubmit) {
      sessionAddSubmit.textContent = action === "create" ? "启动 Session" : "关联 Session";
      sessionAddSubmit.disabled = !sessionAddConfirm?.checked || (action === "link" && !sessionAddNativeInput?.value.trim());
    }
  };
  document.querySelectorAll("[data-open-session-add]").forEach((button) => button.addEventListener("click", () => {
    sessionAddForm?.reset();
    if (sessionAddAction) sessionAddAction.value = "create";
    setSessionWorkspace(initialSessionWorkspace);
    if (sessionAddStatus) sessionAddStatus.hidden = true;
    updateSessionAddForm();
    sessionAddDialog?.showModal();
  }));
  sessionAddForm?.querySelector("[data-session-add-toggle]")?.addEventListener("click", () => {
    if (sessionAddAction) sessionAddAction.value = sessionAddAction.value === "create" ? "link" : "create";
    if (sessionAddConfirm) sessionAddConfirm.checked = false;
    updateSessionAddForm();
  });
  sessionAddForm?.querySelectorAll("[data-session-workspace-option]").forEach((button) => button.addEventListener("click", () => {
    setSessionWorkspace({ id: button.dataset.workspaceId || "", path: button.dataset.workspacePath || "", name: button.dataset.workspaceName || "工作目录" });
  }));
  sessionAddForm?.querySelector("[data-session-workspace-none]")?.addEventListener("click", () => setSessionWorkspace({}));
  sessionAddForm?.querySelector("[data-session-workspace-custom]")?.addEventListener("click", () => setSessionWorkspace({
    path: sessionAddWorkspaceCustomInput?.value.trim() || "",
    name: "其他目录",
    custom: true,
  }));
  sessionAddWorkspaceCustomInput?.addEventListener("input", () => {
    const path = sessionAddWorkspaceCustomInput.value.trim();
    if (sessionAddWorkspace) sessionAddWorkspace.value = path;
    if (sessionAddWorkspacePath) sessionAddWorkspacePath.textContent = path || "请输入这台电脑上的绝对路径";
  });
  sessionAddRuntime?.addEventListener("change", updateSessionAddForm);
  sessionAddNativeInput?.addEventListener("input", updateSessionAddForm);
  sessionAddConfirm?.addEventListener("change", updateSessionAddForm);
  sessionAddForm?.querySelector("[data-session-discover]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const option = sessionAddRuntime?.selectedOptions?.[0];
    if (option?.dataset.discoverMode !== "native") {
      showDialogStatus(sessionAddStatus, "这个 Runtime 不支持 Session 列表发现，请直接输入原生 Session ID。", true);
      return;
    }
    button.disabled = true;
    showDialogStatus(sessionAddStatus, "正在同步 Session 元数据；不会读取正文。", false);
    try {
      const payload = await parseActionResponse(await fetch(route("/api/sessions/discover"), {
        method: "POST",
        headers: window.goalboardControlHeaders?.() || {},
        body: JSON.stringify({ runtime_id: sessionAddRuntime.value }),
      }));
      const options = sessionAddForm.querySelector("[data-session-discovery-options]");
      options.replaceChildren();
      (payload.records || []).forEach((record) => {
        if (!record.native_runtime_session_id) return;
        const item = document.createElement("option");
        item.value = record.native_runtime_session_id;
        item.label = (record.title || "未命名 Session") + (record.runtime_workspace_hint ? " · " + record.runtime_workspace_hint : "");
        options.append(item);
      });
      showDialogStatus(sessionAddStatus, payload.records?.length
        ? "已同步 " + payload.records.length + " 条元数据。选择或输入 Session ID 后再确认加入。"
        : "Runtime 当前没有返回可发现的 Session。", false);
    } catch (error) {
      showDialogStatus(sessionAddStatus, error instanceof Error ? error.message : String(error), true);
    } finally {
      button.disabled = false;
    }
  });
  sessionAddForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!sessionAddConfirm?.checked) return;
    sessionAddSubmit.disabled = true;
    showDialogStatus(sessionAddStatus, sessionAddAction.value === "create" ? "正在创建并登记 Session..." : "正在关联这条 Session...", false);
    try {
      await parseActionResponse(await fetch(route("/api/sessions"), {
        method: "POST",
        headers: window.goalboardControlHeaders?.() || {},
        body: JSON.stringify({
          action: sessionAddAction.value,
          runtime_id: sessionAddRuntime.value,
          native_runtime_session_id: sessionAddNativeInput?.value.trim() || null,
          title: sessionAddForm.querySelector("[data-session-add-title]")?.value.trim() || null,
          current_goal_id: sessionAddForm.querySelector("[data-session-add-goal]")?.value || null,
          workspace_id: sessionAddWorkspaceId?.value || null,
          workspace_path: sessionAddForm.querySelector("[data-session-add-workspace]")?.value.trim() || null,
          user_confirmed: true,
        }),
      }));
      sessionAddDialog.close();
      location.reload();
    } catch (error) {
      showDialogStatus(sessionAddStatus, error instanceof Error ? error.message : String(error), true);
      sessionAddSubmit.disabled = false;
    }
  });

  const relationsDialog = document.querySelector("[data-session-relations-dialog]");
  const relationsForm = relationsDialog?.querySelector("[data-session-relations-form]");
  const relationsProject = relationsForm?.querySelector("[data-session-relations-project]");
  const relationsGoal = relationsForm?.querySelector("[data-session-relations-goal]");
  const relationsWorkspace = relationsForm?.querySelector("[data-session-relations-workspace]");
  const relationsConfirm = relationsForm?.querySelector("[data-session-relations-confirm]");
  const relationsSubmit = relationsForm?.querySelector("[data-session-relations-submit]");
  const relationsStatus = relationsForm?.querySelector("[data-session-relations-status]");
  let relationsDetail = null;
  const updateRelationsForm = () => {
    const sameProject = relationsProject?.value === relationsDialog?.dataset.currentProjectId;
    if (relationsGoal) {
      relationsGoal.disabled = !sameProject;
      if (!sameProject) relationsGoal.value = "";
    }
    const note = relationsForm?.querySelector("[data-session-relations-note]");
    if (note) note.textContent = sameProject
      ? "切换或清空当前 Goal 会把旧 Goal 保留为历史。"
      : relationsProject?.value
        ? "转移到另一个 Project 时会清空当前 Goal，并保留原 Goal 历史。"
        : "移出当前 Project 后，这条 Session 会从本目录消失；原 Runtime 内容不会删除。";
    if (relationsSubmit) relationsSubmit.disabled = !relationsConfirm?.checked;
  };
  document.querySelectorAll("[data-open-session-relations]").forEach((button) => button.addEventListener("click", () => {
    relationsDetail = button.closest("[data-operation-detail]");
    relationsForm?.reset();
    if (relationsProject) relationsProject.value = relationsDialog?.dataset.currentProjectId || "";
    if (relationsGoal) relationsGoal.value = relationsDetail?.dataset.sessionCurrentGoalId || "";
    if (relationsWorkspace) relationsWorkspace.value = relationsDetail?.dataset.sessionWorkspacePath || "";
    const name = relationsForm?.querySelector("[data-session-relations-name]");
    if (name) name.textContent = relationsDetail?.querySelector("h1")?.textContent || relationsDetail?.dataset.detailId || "";
    if (relationsStatus) relationsStatus.hidden = true;
    updateRelationsForm();
    relationsDialog?.showModal();
  }));
  relationsProject?.addEventListener("change", updateRelationsForm);
  relationsConfirm?.addEventListener("change", updateRelationsForm);
  relationsForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!relationsDetail?.dataset.detailId || !relationsConfirm?.checked) return;
    relationsSubmit.disabled = true;
    showDialogStatus(relationsStatus, "正在保存这条 Session 的关系...", false);
    try {
      await parseActionResponse(await fetch(route("/api/sessions/" + encodeURIComponent(relationsDetail.dataset.detailId) + "/associations"), {
        method: "PATCH",
        headers: window.goalboardControlHeaders?.() || {},
        body: JSON.stringify({
          project_id: relationsProject.value || null,
          current_goal_id: relationsGoal?.disabled ? null : relationsGoal?.value || null,
          workspace_path: relationsWorkspace?.value.trim() || null,
          user_confirmed: true,
        }),
      }));
      relationsDialog.close();
      location.reload();
    } catch (error) {
      showDialogStatus(relationsStatus, error instanceof Error ? error.message : String(error), true);
      relationsSubmit.disabled = false;
    }
  });

  const handoffDialog = document.querySelector("[data-session-handoff-dialog]");
  const handoffForm = handoffDialog?.querySelector("[data-session-handoff-form]");
  const handoffRuntime = handoffForm?.querySelector("[data-handoff-runtime]");
  const handoffWorkspace = handoffForm?.querySelector("[data-handoff-workspace]");
  const handoffContent = handoffForm?.querySelector("[data-handoff-content]");
  const handoffConfirm = handoffForm?.querySelector("[data-handoff-confirm]");
  const handoffSave = handoffForm?.querySelector("[data-handoff-save]");
  const handoffSend = handoffForm?.querySelector("[data-handoff-send]");
  const handoffCancel = handoffForm?.querySelector("[data-handoff-cancel]");
  const handoffStatus = handoffForm?.querySelector("[data-handoff-status]");
  const handoffState = handoffForm?.querySelector("[data-handoff-state]");
  let handoffDetail = null;
  let handoffPackageId = null;
  let handoffTargetLocked = false;
  let handoffRetryable = true;
  let handoffCancellable = true;
  const handoffStateLabel = (state) => ({ draft: "草稿", sending: "发送中", failed: "等待重试", sent: "已发送", cancelled: "已取消" })[state] || "草稿";
  const updateHandoffForm = () => {
    const busy = handoffDialog?.dataset.handoffBusy === "true";
    const option = handoffRuntime?.selectedOptions?.[0];
    const native = option?.dataset.handoffMode === "native";
    const capability = handoffForm?.querySelector("[data-handoff-capability]");
    if (capability) capability.textContent = handoffTargetLocked
      ? "目标 Session 已经创建。可以修改交接正文并重试，但目标 Runtime 和工作目录不会再改变。"
      : native
        ? "会创建一条新的原生 Session，并把右侧内容作为第一条消息发送；不会加载来源 Runtime 的原生身份。"
        : "这个 Runtime 没有原生 Handoff Adapter。GoalBoard 会创建托管 Session 并保存交接内容，不伪装成原生送达。";
    if (handoffRuntime) handoffRuntime.disabled = busy || handoffTargetLocked || !handoffRetryable;
    if (handoffWorkspace) handoffWorkspace.disabled = busy || handoffTargetLocked || !handoffRetryable;
    if (handoffContent) handoffContent.disabled = busy || !handoffRetryable;
    const editable = Boolean(handoffPackageId && handoffContent?.value.trim() && !busy && handoffRetryable);
    if (handoffSave) handoffSave.disabled = !editable;
    if (handoffCancel) handoffCancel.disabled = !handoffPackageId || busy || !handoffCancellable;
    if (handoffSend) handoffSend.disabled = !editable || !handoffConfirm?.checked;
  };
  const applyHandoffPayload = (payload) => {
    const handoff = payload?.handoff;
    if (!handoff) return;
    handoffPackageId = handoff.package_id;
    if (handoffRuntime && handoff.target_runtime_id) handoffRuntime.value = handoff.target_runtime_id;
    if (handoffWorkspace) handoffWorkspace.value = handoff.target_workspace_path || "";
    if (handoffContent && typeof handoff.content === "string") handoffContent.value = handoff.content;
    handoffTargetLocked = Boolean(handoff.destination_session_id);
    handoffRetryable = handoff.state === "draft" || (handoff.state === "failed" && handoff.retryable !== false);
    handoffCancellable = handoff.state === "draft" || handoff.state === "failed";
    if (handoffState) handoffState.textContent = handoffStateLabel(handoff.state);
    if (handoffSend) handoffSend.textContent = handoff.state === "sending"
      ? "发送中"
      : handoff.state === "failed"
      ? handoffRetryable ? "重试发送" : "不能重试"
      : "创建并发送";
    updateHandoffForm();
  };
  const handoffBody = (confirmed = false) => ({
    target_runtime_id: handoffRuntime?.value || "",
    target_workspace_path: handoffWorkspace?.value.trim() || null,
    content: handoffContent?.value || "",
    user_confirmed: confirmed,
  });
  document.querySelectorAll("[data-open-session-handoff]").forEach((button) => button.addEventListener("click", async () => {
    handoffDetail = button.closest("[data-operation-detail]");
    if (!handoffDetail?.dataset.detailId || !handoffDetail.dataset.sessionCurrentGoalId) return;
    handoffForm?.reset();
    handoffPackageId = null;
    handoffTargetLocked = false;
    handoffRetryable = true;
    handoffCancellable = true;
    if (handoffWorkspace) handoffWorkspace.value = handoffDetail.dataset.sessionWorkspacePath || "";
    const source = handoffForm?.querySelector("[data-handoff-source-session]");
    const goal = handoffForm?.querySelector("[data-handoff-goal]");
    if (source) source.textContent = handoffDetail.dataset.detailId;
    if (goal) goal.textContent = handoffDetail.querySelector("[data-current-goal-value]")?.textContent || handoffDetail.dataset.sessionCurrentGoalId;
    if (handoffContent) handoffContent.value = "";
    if (handoffStatus) handoffStatus.hidden = true;
    if (handoffState) handoffState.textContent = "正在生成";
    if (handoffDialog) handoffDialog.dataset.handoffBusy = "true";
    updateHandoffForm();
    handoffDialog?.showModal();
    showDialogStatus(handoffStatus, "正在读取当前 Goal Contract 和最小 Session 上下文...", false);
    try {
      const payload = await parseActionResponse(await fetch(route("/api/sessions/" + encodeURIComponent(handoffDetail.dataset.detailId) + "/handoffs"), {
        method: "POST",
        headers: window.goalboardControlHeaders?.() || {},
        body: JSON.stringify({
          target_runtime_id: handoffRuntime?.value || "codex",
          target_workspace_path: handoffWorkspace?.value.trim() || null,
        }),
      }));
      applyHandoffPayload(payload);
      showDialogStatus(handoffStatus, payload.handoff?.state === "sending"
        ? "另一条发送请求仍在执行。GoalBoard 已锁定这份 package，完成或租约过期后再刷新。"
        : payload.handoff?.state === "failed" && payload.handoff?.retryable === false
          ? "上次失败不能安全重试。请取消这次 Handoff 后重新创建。"
          : payload.reused
            ? "已恢复上次未发送的 package。修改后可保存或继续发送。"
            : "package 已生成但尚未发送。请审阅目标组合和正文。", false);
      handoffContent?.focus();
    } catch (error) {
      showDialogStatus(handoffStatus, error instanceof Error ? error.message : String(error), true);
      if (handoffState) handoffState.textContent = "生成失败";
    } finally {
      if (handoffDialog) handoffDialog.dataset.handoffBusy = "false";
      updateHandoffForm();
    }
  }));
  handoffRuntime?.addEventListener("change", updateHandoffForm);
  handoffWorkspace?.addEventListener("input", updateHandoffForm);
  handoffContent?.addEventListener("input", updateHandoffForm);
  handoffConfirm?.addEventListener("change", updateHandoffForm);
  handoffSave?.addEventListener("click", async () => {
    if (!handoffPackageId) return;
    if (handoffDialog) handoffDialog.dataset.handoffBusy = "true";
    updateHandoffForm();
    showDialogStatus(handoffStatus, "正在保存草稿...", false);
    try {
      const payload = await parseActionResponse(await fetch(route("/api/session-handoffs/" + encodeURIComponent(handoffPackageId)), {
        method: "PATCH",
        headers: window.goalboardControlHeaders?.() || {},
        body: JSON.stringify(handoffBody(false)),
      }));
      applyHandoffPayload(payload);
      showDialogStatus(handoffStatus, "草稿已保存在本机；尚未创建或联系目标 Runtime。", false);
    } catch (error) {
      showDialogStatus(handoffStatus, error instanceof Error ? error.message : String(error), true);
    } finally {
      if (handoffDialog) handoffDialog.dataset.handoffBusy = "false";
      updateHandoffForm();
    }
  });
  handoffCancel?.addEventListener("click", async () => {
    if (!handoffPackageId) return;
    if (handoffDialog) handoffDialog.dataset.handoffBusy = "true";
    updateHandoffForm();
    try {
      await parseActionResponse(await fetch(route("/api/session-handoffs/" + encodeURIComponent(handoffPackageId) + "/cancel"), {
        method: "POST",
        headers: window.goalboardControlHeaders?.() || {},
        body: "{}",
      }));
      handoffDialog?.close();
      showToast("这次 Handoff 已取消，没有创建目标 Session。");
    } catch (error) {
      showDialogStatus(handoffStatus, error instanceof Error ? error.message : String(error), true);
    } finally {
      if (handoffDialog) handoffDialog.dataset.handoffBusy = "false";
      updateHandoffForm();
    }
  });
  handoffForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!handoffPackageId || !handoffConfirm?.checked) return;
    if (handoffDialog) handoffDialog.dataset.handoffBusy = "true";
    updateHandoffForm();
    showDialogStatus(handoffStatus, handoffTargetLocked
      ? "正在把修改后的 package 补发到已经创建的目标 Session..."
      : "正在创建新的目标 Session 并发送 package...", false);
    try {
      const response = await fetch(route("/api/session-handoffs/" + encodeURIComponent(handoffPackageId) + "/send"), {
        method: "POST",
        headers: window.goalboardControlHeaders?.() || {},
        body: JSON.stringify(handoffBody(true)),
      });
      const payload = await response.json().catch(() => ({}));
      applyHandoffPayload(payload);
      if (!response.ok) throw new Error(payload.error || "目标 Runtime 没有完成 Handoff，package 已保留。");
      showDialogStatus(handoffStatus, payload.handoff?.delivery_mode === "native"
        ? "新原生 Session 已创建，Handoff 已作为第一条消息发送。"
        : "新的 GoalBoard 托管 Session 已创建；package 已保存为可读取内容。", false);
      handoffDialog?.close();
      location.reload();
    } catch (error) {
      showDialogStatus(handoffStatus, error instanceof Error ? error.message : String(error), true);
      if (handoffState) handoffState.textContent = "等待重试";
      if (handoffSend) handoffSend.textContent = "重试发送";
    } finally {
      if (handoffDialog) handoffDialog.dataset.handoffBusy = "false";
      updateHandoffForm();
    }
  });

  const archiveDialog = document.querySelector("[data-session-archive-dialog]");
  const archiveForm = archiveDialog?.querySelector("[data-session-archive-form]");
  const archiveConfirm = archiveForm?.querySelector("[data-session-archive-confirm]");
  const archiveSubmit = archiveForm?.querySelector("[data-session-archive-submit]");
  const archiveStatus = archiveForm?.querySelector("[data-session-archive-status]");
  let archiveDetail = null;
  let archiveNext = true;
  document.querySelectorAll("[data-session-archive]").forEach((button) => button.addEventListener("click", () => {
    archiveDetail = button.closest("[data-operation-detail]");
    archiveNext = button.dataset.sessionArchive === "true";
    archiveForm?.reset();
    const title = archiveForm?.querySelector("[data-session-archive-title]");
    const name = archiveForm?.querySelector("[data-session-archive-name]");
    const impact = archiveForm?.querySelector("[data-session-archive-impact]");
    const copy = archiveForm?.querySelector("[data-session-archive-confirm-copy]");
    if (title) title.textContent = archiveNext ? "归档 Session 记录" : "恢复 Session 记录";
    if (name) name.textContent = archiveDetail?.querySelector("h1")?.textContent || archiveDetail?.dataset.detailId || "";
    if (impact) impact.textContent = archiveNext ? "从默认活跃记录中整理为已归档；仍可筛选和恢复。" : "恢复为可查看记录；所有关系和历史保持不变。";
    if (copy) copy.textContent = archiveNext ? "确认只归档 GoalBoard 记录，不删除 Runtime 内容。" : "确认恢复这条 GoalBoard Session 记录。";
    if (archiveStatus) archiveStatus.hidden = true;
    if (archiveSubmit) archiveSubmit.disabled = true;
    archiveDialog?.showModal();
  }));
  archiveConfirm?.addEventListener("change", () => { if (archiveSubmit) archiveSubmit.disabled = !archiveConfirm.checked; });
  archiveForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!archiveDetail?.dataset.detailId || !archiveConfirm?.checked) return;
    archiveSubmit.disabled = true;
    showDialogStatus(archiveStatus, archiveNext ? "正在归档记录..." : "正在恢复记录...", false);
    try {
      await parseActionResponse(await fetch(route("/api/sessions/" + encodeURIComponent(archiveDetail.dataset.detailId) + "/archive"), {
        method: "POST",
        headers: window.goalboardControlHeaders?.() || {},
        body: JSON.stringify({ archived: archiveNext, user_confirmed: true }),
      }));
      archiveDialog.close();
      location.reload();
    } catch (error) {
      showDialogStatus(archiveStatus, error instanceof Error ? error.message : String(error), true);
      archiveSubmit.disabled = false;
    }
  });
  document.querySelectorAll("[data-dialog-close]").forEach((button) => button.addEventListener("click", () => button.closest("dialog")?.close()));
  document.querySelectorAll('[data-work-surface-open="sessions"]').forEach((button) => button.addEventListener("click", () => {
    queueMicrotask(() => loadSessionContent(document.querySelector('[data-work-surface="sessions"] [data-operation-detail]:not([hidden])')));
  }));
  const deepLink = location.hash.replace(/^#/, "");
  if (deepLink === "sessions" || deepLink === "workspaces") {
    if (deepLink === "workspaces") history.replaceState(null, "", location.pathname + location.search + "#sessions");
    document.querySelector('[data-work-surface-open="sessions"][data-directory-open="sessions"]')?.click();
  }
})();
`;

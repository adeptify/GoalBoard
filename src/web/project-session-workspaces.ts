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

function renderWorkspaceRow(item: ProjectWorkspaceRecord, selected: boolean): string {
  const search = [item.name, item.path, item.runtimes, workspaceStateLabel(item.state), item.projectLinked ? "已关联" : "Session 使用中"].join(" ").toLocaleLowerCase();
  const updatedAt = Number.isFinite(Date.parse(item.updatedAt || "")) ? Date.parse(item.updatedAt!) : 0;
  return `<button class="project-record-row directory-list-row${selected ? " is-selected" : ""}" type="button" role="option" aria-selected="${selected}" tabindex="${selected ? "0" : "-1"}" data-operation-row="workspace" data-operation-select="${escapeHtml(item.id)}" data-record-id="${escapeHtml(item.id)}" data-record-filter-value="${escapeHtml(item.state)}" data-record-updated="${updatedAt}" data-record-session-count="${item.sessionCount}" data-record-title="${escapeHtml(item.name.toLocaleLowerCase())}" data-record-search="${escapeHtml(search)}">
    <span class="project-record-select">
      <span><strong title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</strong><small>${escapeHtml(item.path)}</small></span>
    </span>
    <span class="directory-row-state project-record-state--${escapeHtml(item.state)}">${escapeHtml(workspaceStateLabel(item.state))}</span>
    <span class="project-record-meta"><span>${item.sessionCount} 个 Sessions / ${escapeHtml(item.runtimes)}</span><time>${escapeHtml(item.updated)}</time></span>
  </button>`;
}

function renderDirectory(
  kind: "sessions" | "workspaces",
  title: string,
  note: string,
  records: readonly (ProjectSessionRecord | ProjectWorkspaceRecord)[],
  hasData: boolean,
): string {
  const isSessions = kind === "sessions";
  const rows = hasData
    ? records.map((item, index) => isSessions
      ? renderSessionRow(item as ProjectSessionRecord, index === 0)
      : renderWorkspaceRow(item as ProjectWorkspaceRecord, index === 0)).join("")
    : "";
  return `<section class="desktop-directory-panel project-record-directory" data-directory-panel="${kind}" data-operation-directory="${kind}" hidden>
    <header class="desktop-directory-heading"><button type="button" data-directory-back aria-label="返回上一级">${icon("back")}</button><span><strong>${title}</strong><small>${note}</small></span>${isSessions ? `<button class="directory-heading-action" type="button" data-open-session-add aria-label="添加 Session" title="添加 Session">${icon("plus")}</button>` : `<button class="directory-heading-action" type="button" data-open-workspace-add aria-label="添加工作目录" title="添加工作目录">${icon("plus")}</button>`}</header>
    <header class="project-record-tools">
      <label class="tree-search">${icon("search")}<input type="search" data-operation-search="${kind}" placeholder="搜索${isSessions ? "标题、ID、Goal" : "名称、路径、Runtime"}" aria-label="搜索${title}"><kbd>⌘F</kbd></label>
      ${isSessions ? `<details class="project-record-filter-menu"><summary aria-label="筛选与排序">${icon("filter")}<span>筛选</span></summary><div><label>Runtime<select data-session-runtime-filter><option value="all">全部 Runtime</option></select></label><label>状态<select data-session-status-filter><option value="all">全部状态</option><option value="idle">可查看</option><option value="archived">已归档</option></select></label><label>内容<select data-operation-filter="${kind}"><option value="all">全部内容</option><option value="native">原生内容</option><option value="fallback">GoalBoard 记录</option><option value="unavailable">不可读取</option></select></label><label>排序<select data-session-sort><option value="updated-desc">最近更新</option><option value="updated-asc">最早更新</option><option value="title-asc">标题 A–Z</option></select></label></div></details><button class="project-record-add-compact" type="button" data-open-session-add aria-label="添加 Session">${icon("plus")}</button>` : `<details class="project-record-filter-menu"><summary aria-label="筛选与排序">${icon("filter")}<span>筛选</span></summary><div><label>状态<select data-operation-filter="${kind}"><option value="all">全部状态</option><option value="healthy">路径正常</option><option value="missing">路径缺失</option><option value="conflict">关联冲突</option></select></label><label>排序<select data-workspace-sort><option value="updated-desc">最近更新</option><option value="title-asc">名称 A–Z</option><option value="sessions-desc">Sessions 最多</option></select></label></div></details><button class="project-record-add-compact" type="button" data-open-workspace-add aria-label="添加工作目录">${icon("plus")}</button>`}
    </header>
    <div class="project-record-scroll" role="listbox" aria-label="${title}列表" data-operation-list="${kind}">${rows}</div>
    <div class="project-record-empty" data-operation-empty="${kind}"${hasData ? " hidden" : ""}>${icon(isSessions ? "terminal" : "folder")}<strong>${hasData ? "没有匹配结果" : `这个项目还没有${isSessions ? " Session" : "工作目录"}`}</strong><p>${hasData ? "清除搜索或更改筛选条件。" : isSessions ? "创建或显式关联后，Session 才会出现在这里。" : "从 Runtime 启动或显式关联后，路径才会出现在这里。"}</p><button type="button" data-operation-clear="${kind}"${hasData ? "" : " hidden"}>清除筛选</button></div>
    <footer class="tree-footer"><span>共 <strong data-operation-count="${kind}">${hasData ? records.length : 0}</strong> 条</span><small>${escapeHtml(note)}</small></footer>
  </section>`;
}

function renderSessionContent(item: ProjectSessionRecord): string {
  if (item.contentMode === "native" || item.contentMode === "fallback") {
    const native = item.contentMode === "native";
    return `<div class="session-content-state" data-session-content-list>${icon("activity")}<div><h3>${native ? "按需读取执行内容" : "读取 GoalBoard 执行记录"}</h3><p>${native ? "进入这条 Session 后，GoalBoard 会合并原 Runtime 历史与本地 TUI 记录。" : "只读取 GoalBoard 已持久化并能证明的 TUI 与执行事实。"}</p><button class="document-action" type="button" data-session-content-load>读取内容</button></div></div>`;
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
          <header><div><h2 id="session-content-${escapeHtml(item.id)}">${item.contentMode === "fallback" ? "GoalBoard 执行记录" : "执行内容"}</h2><p>${item.contentMode === "native" ? "按需合并原 Runtime 历史与 GoalBoard TUI 记录，每段都标明来源。" : item.contentMode === "fallback" ? "只显示 GoalBoard 已持久化并能证明的记录。" : "当前适配器没有内容读取能力。"}</p></div><label class="operation-content-search">${icon("search")}<input type="search" data-session-content-search placeholder="搜索本次执行" aria-label="搜索当前 Session 内容"${item.contentMode === "unavailable" ? " disabled" : ""}></label></header>
          <div class="session-content-body">${renderSessionContent(item)}<p class="operation-search-empty" data-session-content-empty hidden>当前内容中没有匹配结果。</p></div>
        </section>
      </div>
      <aside class="goal-focus-aside" aria-label="Session 上下文">
        <section class="goal-focus-context operation-current-context"><header><div><h2>当前关系</h2><p>续跑使用这些已确认事实。</p></div><button type="button" data-open-session-relations>管理关系</button></header><dl><div><dt>项目</dt><dd>${escapeHtml(projectName)}</dd></div><div><dt>当前 Goal</dt><dd><span data-current-goal-value>${escapeHtml(item.currentGoal || "未选择")}</span><button type="button" data-work-surface-open="goal" data-directory-open="goals">去 Goals</button></dd></div><div><dt>工作目录</dt><dd><code>${escapeHtml(item.workspace)}</code><button type="button" data-work-surface-open="workspaces" data-directory-open="workspaces">管理</button></dd></div><div><dt>内容来源</dt><dd>${escapeHtml(contentModeLabel(item.contentMode))}</dd></div></dl></section>
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

function renderWorkspaceSessions(item: ProjectWorkspaceRecord): string {
  return item.sessions?.length
    ? `<ul class="workspace-session-list">${item.sessions.map((session) => `<li>${icon("terminal")}<span><strong>${escapeHtml(session.title)}</strong><small>${escapeHtml(session.runtime)} / ${escapeHtml(session.updated)}</small></span><em>${escapeHtml(session.state)}</em></li>`).join("")}</ul>`
    : `<div class="operation-aside-empty">${icon("info")}<strong>还没有 Session</strong><small>启动后才会出现，不根据路径猜测关系。</small></div>`;
}

function renderWorkspaceDetail(item: ProjectWorkspaceRecord, selected: boolean, projectName: string): string {
  const canLaunch = item.state === "healthy";
  const canRepair = item.state === "missing" || item.state === "conflict";
  const relationLabel = item.projectLinked ? "已显式关联" : "Session 使用中";
  return `<article class="goal-document project-operation-document project-workspace-document" data-operation-detail="workspace" data-detail-id="${escapeHtml(item.id)}" data-workspace-path="${escapeHtml(item.path)}" data-workspace-linked="${item.projectLinked === true}" data-workspace-session-count="${item.sessionCount}"${selected ? "" : " hidden"}>
    <section class="goal-hero project-operation-hero" aria-labelledby="workspace-title-${escapeHtml(item.id)}"><header class="goal-header"><div class="goal-title-kicker"><span class="project-record-state project-record-state--${escapeHtml(item.state)}">${escapeHtml(workspaceStateLabel(item.state))}</span><div class="goal-title-facts"><span>${escapeHtml(projectName)}</span><span>${item.sessionCount} 个 Sessions</span><span>${escapeHtml(relationLabel)}</span><span>最近更新 ${escapeHtml(item.updated)}</span></div></div><div class="goal-title-row"><div class="goal-title-copy"><h1 id="workspace-title-${escapeHtml(item.id)}">${escapeHtml(item.name)}</h1><p class="goal-title-outcome">${escapeHtml(item.summary)}</p></div><div class="goal-title-actions"><button class="goal-primary-action" type="button" data-open-session-launch${canLaunch ? "" : " disabled"}>${icon("plus")}<span>启动新 Session</span></button><button class="document-action" type="button" data-open-path-repair>${icon("refresh")}<span>${canRepair ? "修复路径" : "更改路径"}</span></button></div></div><p class="operation-action-status" data-workspace-action-status role="status" hidden></p></header></section>
    <div class="goal-focus-layout project-operation-layout">
      <div class="goal-focus-main"><section class="goal-focus-criteria workspace-main-surface"><header><div><h2>路径与已知 Sessions</h2><p>路径只是启动位置，Session 关系来自明确记录。</p></div></header><div class="workspace-path-fact"><span>${icon(item.state === "healthy" ? "check" : "alert")}</span><div><strong>${escapeHtml(workspaceStateLabel(item.state))}</strong><code data-workspace-path>${escapeHtml(item.path)}</code><p>${item.state === "healthy" ? "目录可访问。GoalBoard 不取得目录所有权。" : item.state === "missing" ? "路径不可访问，修复记录前不能启动 Runtime。" : "两个记录指向同一路径，继续前需要明确保留哪一条。"}</p></div></div><section class="workspace-known-sessions"><header><h3>已知 Sessions</h3><button type="button" data-work-surface-open="sessions" data-directory-open="sessions">打开 Sessions</button></header>${renderWorkspaceSessions(item)}</section></section></div>
      <aside class="goal-focus-aside" aria-label="工作目录上下文"><section class="goal-focus-context workspace-context"><header><h2>启动条件</h2><p>每次创建都重新确认，不沿用旧 Session。</p></header><ol class="workspace-launch-checks"><li><span>${icon(item.state === "healthy" ? "check" : "alert")}</span><div><strong>目录可用</strong><small>${item.state === "healthy" ? "已确认" : "需要处理"}</small></div></li><li><span>${icon("terminal")}</span><div><strong>选择 Runtime</strong><small>${escapeHtml(item.runtimes)}</small></div></li><li><span>${icon("target")}</span><div><strong>选择 Goal</strong><small>由用户在启动前确认</small></div></li></ol></section><section class="companion-runtime workspace-project-relation"><header><div><small>Project</small><h2>项目关系</h2></div><span>${escapeHtml(relationLabel)}</span></header><p>${escapeHtml(projectName)}</p><dl><div><dt>已知 Sessions</dt><dd>${item.sessionCount}</dd></div><div><dt>其他 Project</dt><dd>${Math.max(0, (item.projectCount ?? 0) - 1)}</dd></div><div><dt>最近检查</dt><dd>${escapeHtml(item.updated)}</dd></div></dl>${item.projectLinked ? `<button type="button" data-open-workspace-unlink>解除并移出当前项目${icon("chevron-right")}</button>` : `<button type="button" data-workspace-link>显式关联当前项目${icon("chevron-right")}</button>`}</section></aside>
    </div>
  </article>`;
}

function renderWorkspaceSurface(records: readonly ProjectWorkspaceRecord[], hasData: boolean, projectName: string): string {
  return `<section class="desktop-work-surface project-operation-surface" data-work-surface="workspaces" data-work-surface-label="工作目录" hidden>${hasData
    ? records.map((item, index) => renderWorkspaceDetail(item, index === 0, projectName)).join("")
    : `<div class="archive-empty project-operation-surface-empty">${icon("folder")}<h1>这个项目还没有工作目录</h1><p>从 Runtime 启动或显式关联后，路径才会出现在这里。</p></div>`}</section>`;
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
  return `<dialog class="project-operation-dialog" data-session-add-dialog><form method="dialog" data-session-add-form><header><div><h2>添加 Session</h2><p>加入已有 Runtime Session，或明确创建一条新的 Session。</p></div><button type="button" data-dialog-close aria-label="关闭">${icon("x")}</button></header><section>
    <label>添加方式<select data-session-add-action><option value="link">加入已有 Session</option><option value="create">创建新 Session</option></select></label>
    <label>Runtime<select data-session-add-runtime>${runtimeOptions}</select></label>
    <div class="session-add-native" data-session-add-native><label>Runtime 原生 Session ID<input data-session-native-id list="session-discovery-options" autocomplete="off" placeholder="输入 ID，或先同步可发现记录" required></label><datalist id="session-discovery-options" data-session-discovery-options></datalist><button class="document-action" type="button" data-session-discover>${icon("refresh")}<span>同步可发现记录</span></button></div>
    <label>标题<input data-session-add-title maxlength="160" placeholder="可选；留空使用 Runtime 标题"></label>
    <label>当前 Goal<select data-session-add-goal><option value="">暂不关联 Goal</option>${goalOptions}</select></label>
    <label>工作目录<input data-session-add-workspace placeholder="可选；请输入绝对路径"></label>
    <p class="operation-capability-note" data-session-add-capability></p>
    <label class="operation-confirm-check"><input type="checkbox" data-session-add-confirm><span>确认只为这条 Session 写入当前 Project、Goal 和工作目录关系。</span></label>
    <p class="operation-dialog-status" data-session-add-status role="status" hidden></p>
  </section><footer><button type="button" data-dialog-close>取消</button><button class="button-primary" type="submit" data-session-add-submit disabled>加入 Session</button></footer></form></dialog>
  <dialog class="project-operation-dialog" data-session-relations-dialog data-current-project-id="${escapeHtml(project?.project_id || "")}"><form method="dialog" data-session-relations-form><header><div><h2>管理 Session 关系</h2><p>每条 Session 同时只有一个 Project 和一个当前 Goal。</p></div><button type="button" data-dialog-close aria-label="关闭">${icon("x")}</button></header><section>
    <dl class="operation-confirm-facts"><div><dt>Session</dt><dd data-session-relations-name></dd></div><div><dt>当前 Project</dt><dd>${escapeHtml(project?.display_name || "当前项目")}</dd></div></dl>
    <label>目标 Project<select data-session-relations-project>${projectOptions}<option value="">移出当前 Project</option></select></label>
    <label>当前 Goal<select data-session-relations-goal><option value="">不设置当前 Goal</option>${goalOptions}</select></label>
    <label>工作目录<input data-session-relations-workspace placeholder="留空表示解除工作目录关系"></label>
    <p class="operation-capability-note" data-session-relations-note>切换 Goal 会保留旧 Goal 历史；转移或移出 Project 会清空当前 Goal。</p>
    <label class="operation-confirm-check"><input type="checkbox" data-session-relations-confirm><span>确认只更新这条 Session 的关系。</span></label>
    <p class="operation-dialog-status" data-session-relations-status role="status" hidden></p>
  </section><footer><button type="button" data-dialog-close>取消</button><button class="button-primary" type="submit" data-session-relations-submit disabled>保存关系</button></footer></form></dialog>
  <dialog class="project-operation-dialog session-handoff-dialog" data-session-handoff-dialog data-current-project-id="${escapeHtml(project?.project_id || "")}"><form method="dialog" data-session-handoff-form><header><div><h2>创建 Goal Handoff</h2><p>先审阅交接内容，再创建一条全新的目标 Session。</p></div><button type="button" data-dialog-close aria-label="关闭">${icon("x")}</button></header><section class="session-handoff-review">
    <aside class="session-handoff-controls" aria-label="Handoff 目标">
      <dl class="operation-confirm-facts"><div><dt>来源 Session</dt><dd data-handoff-source-session></dd></div><div><dt>Project</dt><dd>${escapeHtml(project?.display_name || "当前项目")}</dd></div><div><dt>当前 Goal</dt><dd data-handoff-goal></dd></div></dl>
      <label>目标 Runtime<select data-handoff-runtime>${runtimeOptions}</select></label>
      <label>目标工作目录<input data-handoff-workspace autocomplete="off" placeholder="可选；请输入绝对路径"></label>
      <p class="operation-capability-note" data-handoff-capability></p>
      <label class="operation-confirm-check"><input type="checkbox" data-handoff-confirm><span>确认使用上面的 Runtime、Project、Goal 和工作目录创建新 Session，并发送右侧内容。</span></label>
      <p class="operation-dialog-status" data-handoff-status role="status" hidden></p>
      <button class="session-handoff-cancel" type="button" data-handoff-cancel disabled>取消这次 Handoff</button>
    </aside>
    <div class="session-handoff-editor"><header><div><h3>交接内容</h3><p>内容由当前 Goal Contract 与最小 Session 上下文生成，可以直接修改。</p></div><span data-handoff-state>草稿</span></header><textarea data-handoff-content aria-label="可编辑的 Handoff package" spellcheck="false" placeholder="正在生成 Handoff package..."></textarea></div>
  </section><footer><button type="button" data-dialog-close>稍后继续</button><button type="button" data-handoff-save disabled>保存草稿</button><button class="button-primary" type="submit" data-handoff-send disabled>创建并发送</button></footer></form></dialog>
  <dialog class="project-operation-dialog project-operation-confirm-dialog" data-session-archive-dialog><form method="dialog" data-session-archive-form><header><div><h2 data-session-archive-title>归档 Session 记录</h2><p>只整理 GoalBoard 记录，不删除或关闭 Runtime 原生内容。</p></div><button type="button" data-dialog-close aria-label="关闭">${icon("x")}</button></header><section><dl class="operation-confirm-facts"><div><dt>Session</dt><dd data-session-archive-name></dd></div><div><dt>影响</dt><dd data-session-archive-impact></dd></div></dl><label class="operation-confirm-check"><input type="checkbox" data-session-archive-confirm><span data-session-archive-confirm-copy></span></label><p class="operation-dialog-status" data-session-archive-status role="status" hidden></p></section><footer><button type="button" data-dialog-close>取消</button><button class="button-primary" type="submit" data-session-archive-submit disabled>确认</button></footer></form></dialog>
  <dialog class="project-operation-dialog" data-workspace-add-dialog><form method="dialog" data-workspace-add-form><header><div><h2>添加工作目录</h2><p>把一个绝对路径显式关联到当前 Project。</p></div><button type="button" data-dialog-close aria-label="关闭">${icon("x")}</button></header><section><dl class="operation-confirm-facts"><div><dt>Project</dt><dd>${escapeHtml(project?.display_name || "当前项目")}</dd></div><div><dt>默认关系</dt><dd>不会创建</dd></div></dl><label>绝对路径<input data-workspace-add-path autocomplete="off" placeholder="/Users/name/code/project" required></label><p class="operation-capability-note">GoalBoard 会规范化路径身份；不会扫描、创建或取得文件夹所有权。</p><label class="operation-confirm-check"><input type="checkbox" data-workspace-add-confirm><span>确认把这条路径关联到当前 Project。</span></label><p class="operation-dialog-status" data-workspace-add-status role="status" hidden></p></section><footer><button type="button" data-dialog-close>取消</button><button class="button-primary" type="submit" data-workspace-add-submit disabled>添加工作目录</button></footer></form></dialog>
  <dialog class="project-operation-dialog" data-launch-dialog><form method="dialog" data-launch-form><header><div><h2>启动新 Session</h2><p>从这个工作目录创建一条新的 Runtime Session。</p></div><button type="button" data-dialog-close aria-label="关闭">${icon("x")}</button></header><section><dl class="operation-confirm-facts"><div><dt>Project</dt><dd>${escapeHtml(project?.display_name || "当前项目")}</dd></div><div><dt>工作目录</dt><dd data-launch-workspace></dd></div></dl><label>Runtime<select data-launch-runtime>${runtimeOptions}</select></label><label>当前 Goal<select data-launch-goal><option value="">暂不关联 Goal</option>${goalOptions}</select></label><label>Session 标题<input data-launch-title maxlength="160" placeholder="可选；留空使用 Goal 或 Runtime 标题"></label><p class="operation-capability-note" data-launch-capability></p><label class="operation-confirm-check"><input type="checkbox" data-launch-confirm><span>确认使用上面的 Runtime、Project、Goal 和工作目录创建新 Session。</span></label><p class="operation-dialog-status" data-launch-status role="status" hidden></p></section><footer><button type="button" data-dialog-close>取消</button><button class="button-primary" type="submit" data-launch-submit disabled>启动 Session</button></footer></form></dialog>
  <dialog class="project-operation-dialog" data-repair-dialog><form method="dialog" data-repair-form><header><div><h2>修复工作目录记录</h2><p>只更新 GoalBoard 记录，不移动、创建或删除文件。</p></div><button type="button" data-dialog-close aria-label="关闭">${icon("x")}</button></header><section><dl class="operation-confirm-facts"><div><dt>原路径</dt><dd data-repair-previous></dd></div><div><dt>相关 Sessions</dt><dd data-repair-session-count></dd></div></dl><label>新的绝对路径<input data-repair-path autocomplete="off" required></label><label class="operation-confirm-check"><input type="checkbox" data-repair-confirm><span>确认更新当前 Project 的目录记录和匹配 Session；不会操作文件系统。</span></label><p class="operation-dialog-status" data-repair-status role="status" hidden></p></section><footer><button type="button" data-dialog-close>取消</button><button class="button-primary" type="submit" data-repair-submit disabled>保存路径</button></footer></form></dialog>
  <dialog class="project-operation-dialog project-operation-confirm-dialog" data-workspace-unlink-dialog><form method="dialog" data-workspace-unlink-form><header><div><h2>解除工作目录关系</h2><p>目录会从当前 Project 移除，真实文件夹不会变化。</p></div><button type="button" data-dialog-close aria-label="关闭">${icon("x")}</button></header><section><dl class="operation-confirm-facts"><div><dt>工作目录</dt><dd data-workspace-unlink-path></dd></div><div><dt>相关 Sessions</dt><dd data-workspace-unlink-sessions></dd></div><div><dt>不受影响</dt><dd>其他 Project、Goal 历史、Runtime 内容与真实文件</dd></div></dl><label class="operation-confirm-check"><input type="checkbox" data-workspace-unlink-confirm><span>确认解除当前 Project 关系，并清除匹配 Session 的工作目录关系。</span></label><p class="operation-dialog-status" data-workspace-unlink-status role="status" hidden></p></section><footer><button type="button" data-dialog-close>取消</button><button class="button-primary" type="submit" data-workspace-unlink-submit disabled>解除关系</button></footer></form></dialog>`;
}

export function renderProjectOperations(
  project: ProjectOperationsProject | null,
  data?: ProjectOperationsData,
): ProjectOperationsSlice {
  const sessionRecords = data?.sessions ?? [];
  const workspaceRecords = data?.workspaces ?? [];
  const hasSessionData = sessionRecords.length > 0;
  const hasWorkspaceData = workspaceRecords.length > 0;
  const projectName = project?.display_name || "当前项目";
  return {
    rootItems: `<button class="desktop-module-item" type="button" data-directory-open="sessions" data-work-surface-open="sessions">${icon("terminal")}<span><strong>Sessions</strong><small>执行内容、Goal 历史与续跑</small></span><em>${hasSessionData ? sessionRecords.length : 0}</em></button><button class="desktop-module-item" type="button" data-directory-open="workspaces" data-work-surface-open="workspaces">${icon("folder")}<span><strong>工作目录</strong><small>路径、已知 Sessions 与启动</small></span><em>${hasWorkspaceData ? workspaceRecords.length : 0}</em></button>`,
    directories: `${renderDirectory("sessions", "Sessions", "执行与内容", sessionRecords, hasSessionData)}${renderDirectory("workspaces", "工作目录", "路径与启动", workspaceRecords, hasWorkspaceData)}`,
    surfaces: `${renderSessionSurface(sessionRecords, hasSessionData, projectName)}${renderWorkspaceSurface(workspaceRecords, hasWorkspaceData, projectName)}`,
    overlays: renderOverlays(data, project),
  };
}

export const PROJECT_OPERATIONS_STYLES = `
  .project-record-directory { min-height: 0; grid-template-rows: 40px 82px minmax(0, 1fr) 46px; }
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
  .project-record-row { width: 100%; min-width: 0; min-height: 56px; padding: 8px; border: 0; border-radius: 8px; color: var(--ink-soft); background: transparent; display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: minmax(22px, auto) 18px; column-gap: 8px; align-items: center; text-align: left; cursor: pointer; }
  body[data-desktop-shell="true"] .project-record-directory .project-record-row:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 5%, transparent); }
  body[data-desktop-shell="true"] .project-record-directory .project-record-row.is-selected { color: var(--ink); background: var(--paper); box-shadow: 0 1px 2px color-mix(in srgb, var(--shadow-color) 28%, transparent); }
  .project-record-select { min-width: 0; min-height: 22px; color: inherit; display: block; }
  .project-record-select > span { min-width: 0; display: grid; gap: 1px; }
  .project-record-select strong, .project-record-select small, .project-record-meta span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .project-record-select strong { color: inherit; font-size: 11.5px; font-weight: 620; }
  .project-record-row.is-selected .project-record-select strong { font-weight: 690; }
  .project-record-select small { color: var(--faint); font-size: 9.5px; }
  body[data-desktop-shell="true"] .project-record-directory .project-record-state--healthy { color: var(--green); border-color: color-mix(in srgb, var(--green) 32%, var(--line)); background: var(--green-soft); }
  body[data-desktop-shell="true"] .project-record-directory :is(.project-record-state--missing, .project-record-state--conflict) { color: var(--red); border-color: color-mix(in srgb, var(--red) 30%, var(--line)); background: var(--red-soft); }
  .project-record-meta { grid-column: 1 / -1; min-width: 0; color: var(--faint); display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 7px; font-size: 9px; }
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
  .project-operation-document { width: 100%; gap: 10px; }
  .project-operation-hero { padding-bottom: 0; }
  .project-operation-hero .goal-header { padding-bottom: 14px; }
  .project-operation-hero .goal-title-facts { flex-wrap: wrap; }
  .project-operation-hero .goal-title-actions { flex-wrap: wrap; }
  .project-operation-hero .goal-title-actions .goal-primary-action,
  .project-operation-hero .goal-title-actions .document-action { min-height: 34px; margin: 0; white-space: nowrap; }
  .project-operation-hero .goal-title-actions button:disabled { opacity: .42; cursor: not-allowed; }
  .operation-action-status { margin: 8px 0 0; color: var(--muted); font-size: 10px; }
  .operation-action-status.is-error { color: var(--red); }
  .project-operation-layout { padding-inline: 0; }
  .session-execution, .workspace-main-surface { min-width: 0; min-height: 560px; }
  .session-execution > header, .workspace-main-surface > header { align-items: center; }
  .operation-content-search { position: relative; min-width: 184px; display: flex; align-items: center; }
  .operation-content-search svg { position: absolute; left: 9px; color: var(--muted); pointer-events: none; }
  .operation-content-search input { width: 100%; height: 32px; padding: 0 9px 0 28px; border: 1px solid var(--line); border-radius: 7px; color: var(--ink); background: var(--page); font-size: 10px; }
  .operation-content-search input:focus { border-color: var(--blue); }
  .session-content-body { min-width: 0; padding-top: 2px; }
  .session-transcript { width: 100%; max-width: 74ch; min-width: 0; margin: 0 auto; }
  .session-content-warning { margin: 0 0 8px; padding: 9px 11px; border-radius: 7px; color: var(--red); background: color-mix(in srgb, var(--red) 8%, var(--paper)); font-size: 10px; line-height: 1.55; }
  .session-turn { padding: 15px 0; border-bottom: 1px solid var(--line); }
  .session-turn header { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px 12px; }
  .session-turn header strong { min-width: 0; overflow-wrap: anywhere; font-size: 10px; }
  .session-turn time { color: var(--faint); font-size: 10px; font-variant-numeric: tabular-nums; }
  .session-turn p { margin: 5px 0 0; color: var(--ink-soft); overflow-wrap: anywhere; font-size: 12px; line-height: 1.65; }
  .session-turn details { margin-top: 7px; }
  .session-turn details summary { color: var(--blue-dark); font-size: 10px; cursor: pointer; }
  .session-turn details pre { margin: 8px 0 0; padding: 10px 11px; overflow: auto; border: 1px solid var(--line); border-radius: 7px; color: var(--ink-soft); background: var(--page); white-space: pre-wrap; overflow-wrap: anywhere; font: 10px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .session-turn--user { margin: 7px 0; padding: 12px 13px; border: 0; border-radius: 10px; background: color-mix(in srgb, var(--blue-soft) 55%, var(--paper)); }
  .session-turn--event { color: var(--muted); }
  .session-turn--event p { font-size: 10.5px; }
  .session-event-ledger { max-width: 74ch; margin: 0 auto; padding: 0; list-style: none; }
  .session-event-ledger li { padding: 15px 0; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 42px 24px minmax(0, 1fr); gap: 9px; }
  .session-event-ledger time, .session-event-ledger small { color: var(--faint); font-size: 9.5px; }
  .session-event-ledger > li > svg { color: var(--muted); font-size: 16px; }
  .session-event-ledger strong { font-size: 11px; }
  .session-event-ledger p { margin: 3px 0; color: var(--ink-soft); font-size: 11px; }
  .session-content-state { min-height: 360px; padding: 50px 24px; color: var(--muted); display: grid; grid-template-columns: 28px minmax(0, 420px); justify-content: center; align-content: center; gap: 12px; }
  .session-content-state > svg { font-size: 24px; }
  .session-content-state > div:only-child { grid-column: 1 / -1; width: min(100%, 420px); }
  .session-content-state h3 { margin: 0; color: var(--ink); font-size: 14px; }
  .session-content-state p { margin: 5px 0 0; font-size: 11px; line-height: 1.6; }
  .session-content-state button { margin-top: 12px; }
  .operation-search-empty { margin: 30px 0; color: var(--muted); text-align: center; }
  .operation-current-context dd { align-items: start; gap: 6px; }
  .operation-current-context > header { align-items: start; display: flex; justify-content: space-between; gap: 10px; }
  .operation-current-context > header button { min-height: 28px; padding: 0; border: 0; color: var(--blue-dark); background: transparent; font-size: 9.5px; white-space: nowrap; }
  .operation-current-context dd button { min-height: 24px; padding: 0; border: 0; color: var(--blue-dark); background: transparent; font-size: 9.5px; justify-self: start; }
  .operation-current-context code { overflow-wrap: anywhere; font: 9.5px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .operation-goal-history { min-height: 0; }
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

  .workspace-path-fact { margin: 2px 0 20px; padding: 15px 0 17px; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 26px minmax(0, 1fr); gap: 10px; }
  .workspace-path-fact > span { color: var(--muted); font-size: 18px; }
  .workspace-path-fact strong { display: block; color: var(--ink); font-size: 11px; }
  .workspace-path-fact code { display: block; margin-top: 4px; overflow-wrap: anywhere; font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .workspace-path-fact p { margin: 5px 0 0; color: var(--muted); font-size: 10px; }
  .workspace-known-sessions > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .workspace-known-sessions h3 { margin: 0; font-size: 11px; }
  .workspace-known-sessions header button { min-height: 28px; padding: 0; border: 0; color: var(--blue-dark); background: transparent; font-size: 9.5px; }
  .workspace-session-list { margin: 8px 0 0; padding: 0; list-style: none; }
  .workspace-session-list li { padding: 11px 0; display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; gap: 8px; }
  .workspace-session-list li + li { border-top: 1px solid var(--line); }
  .workspace-session-list svg { color: var(--muted); font-size: 15px; }
  .workspace-session-list span { min-width: 0; display: grid; }
  .workspace-session-list strong { font-size: 10.5px; }
  .workspace-session-list small, .workspace-session-list em { color: var(--faint); font-size: 9.5px; font-style: normal; }
  .workspace-launch-checks { margin: 0; padding: 0; list-style: none; }
  .workspace-launch-checks li { padding: 9px 0; display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 8px; }
  .workspace-launch-checks li + li { border-top: 1px solid var(--line); }
  .workspace-launch-checks svg { color: var(--muted); }
  .workspace-launch-checks div { display: grid; }
  .workspace-launch-checks strong { font-size: 10px; }
  .workspace-launch-checks small { color: var(--faint); font-size: 9px; }
  .workspace-project-relation > p { color: var(--ink); }

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
  .operation-capability-note, .operation-dialog-status { margin: 0; color: var(--muted); font-size: 10px; line-height: 1.5; }
  .operation-dialog-status.is-error { color: var(--red); }
  .project-operation-confirm-dialog { width: min(460px, calc(100vw - 28px)); }

  @media (max-width: 760px) {
    .project-record-directory { grid-template-rows: 54px minmax(0, 1fr) 42px; }
    .project-record-directory .desktop-directory-heading { display: none !important; }
    .project-record-tools { padding: 5px 8px; grid-template-columns: minmax(0, 1fr) 44px 44px; }
    .project-record-tools .tree-search, .project-record-filter-menu { grid-column: auto; }
    .project-record-filter-menu > summary { width: 44px; height: 44px; padding: 0; }
    .project-record-filter-menu > summary span { display: none; }
    .project-record-filter-menu > div { position: fixed; z-index: 80; top: auto; right: 10px; bottom: 64px; left: 10px; width: auto; grid-template-columns: 1fr 1fr; }
    .project-record-add-compact { width: 44px; height: 44px; padding: 0; border: 0; border-radius: 7px; color: var(--ink); background: var(--paper); display: grid; place-items: center; }
    .project-record-tools .tree-search input, .project-record-filter select { height: 44px; }
    .project-record-row { min-height: 64px; padding: 7px 8px; }
    .project-record-select strong { font-size: 12px; }
    .project-record-select small, .project-record-meta { font-size: 9.5px; }
    .project-operation-document { padding: 18px 14px 40px; }
    body[data-desktop-shell="true"] .project-operation-hero .goal-title-row { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
    body[data-desktop-shell="true"] .project-operation-hero .goal-title-actions { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .project-operation-hero .goal-title-actions .goal-primary-action, .project-operation-hero .goal-title-actions .document-action { min-height: 44px; justify-content: center; }
    .project-operation-layout { grid-template-columns: minmax(0, 1fr); gap: 10px; }
    .project-operation-layout, .project-operation-layout .goal-focus-main, .session-execution, .session-content-body, .session-transcript { width: 100%; min-width: 0; max-width: 100%; }
    .project-operation-layout .goal-focus-main { order: 1; }
    .project-operation-layout .goal-focus-aside { order: 2; }
    .project-session-document .goal-focus-aside { display: contents; }
    .project-session-document .operation-goal-history { order: 1; }
    .project-session-document .goal-focus-main { order: 2; }
    .project-session-document .operation-current-context { order: 3; }
    .project-session-document .operation-identity { order: 4; }
    .project-session-document .operation-archive { order: 5; }
    .session-execution, .workspace-main-surface { min-height: 0; }
    .session-execution > header { align-items: stretch; flex-direction: column; }
    .operation-content-search { width: 100%; }
    .operation-content-search input { min-height: 44px; }
    .session-turn p { font-size: 11.5px; }
    .session-content-state { min-height: 280px; padding: 34px 16px; }
    .operation-current-context dd button, .workspace-known-sessions header button, .operation-archive { min-height: 44px; }
    .project-operation-dialog { width: 100vw; max-width: none; height: 100dvh; max-height: none; margin: 0; border: 0; border-radius: 0; }
    .project-operation-dialog form > section { max-height: calc(100dvh - 132px); overflow: auto; }
    .session-handoff-dialog form { height: 100dvh; }
    .session-handoff-dialog form > section.session-handoff-review { max-height: none; overflow: auto; grid-template-columns: minmax(0, 1fr); }
    .session-handoff-controls { overflow: visible; border-right: 0; border-bottom: 1px solid var(--line); }
    .session-handoff-editor { min-height: 54dvh; }
    .session-handoff-editor textarea { min-height: 46dvh; resize: vertical; font-size: 10.5px; }
    .session-handoff-dialog footer { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .session-handoff-dialog footer .button-primary { grid-column: 1 / -1; grid-row: 1; }
    .project-operation-dialog header button, .project-operation-dialog footer button { min-width: 44px; min-height: 44px; }
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
  const renderSessionTimeline = (detail, payload) => {
    const body = detail.querySelector(".session-content-body");
    body.replaceChildren();
    const events = Array.isArray(payload.events) ? payload.events : [];
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
    events.forEach((event) => {
      const article = document.createElement("article");
      article.className = "session-turn" + (event.kind === "user_message" ? " session-turn--user" : ["tool", "status", "approval", "artifact", "terminal_output"].includes(event.kind) ? " session-turn--event" : "");
      const header = document.createElement("header");
      const label = document.createElement("strong");
      label.textContent = event.label || "执行事件";
      const source = document.createElement("small");
      source.textContent = sourceLabel(event.source);
      const time = document.createElement("time");
      const date = new Date(event.occurred_at);
      time.textContent = Number.isNaN(date.getTime()) ? "" : date.toLocaleString([], { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
      header.append(label, source, time);
      const eventContent = event.content || "";
      const collapseTechnicalContent = ["tool", "artifact", "terminal_output"].includes(event.kind) && eventContent.length > 1200;
      if (collapseTechnicalContent) {
        const details = document.createElement("details");
        const summary = document.createElement("summary");
        summary.textContent = "查看完整记录 · " + eventContent.length.toLocaleString() + " 字";
        const content = document.createElement("pre");
        content.textContent = eventContent;
        details.append(summary, content);
        article.append(header, details);
      } else {
        const content = document.createElement("p");
        content.textContent = eventContent;
        article.append(header, content);
      }
      list.append(article);
    });
    const empty = document.createElement("p");
    empty.className = "operation-search-empty";
    empty.dataset.sessionContentEmpty = "";
    empty.hidden = true;
    empty.textContent = "当前内容中没有匹配结果。";
    body.append(list, empty);
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
    const runtime = kind === "sessions" ? String(directory.querySelector("[data-session-runtime-filter]")?.value || "all") : "all";
    const status = kind === "sessions" ? String(directory.querySelector("[data-session-status-filter]")?.value || "all") : "all";
    const sort = kind === "sessions"
      ? String(directory.querySelector("[data-session-sort]")?.value || "updated-desc")
      : String(directory.querySelector("[data-workspace-sort]")?.value || "updated-desc");
    const rows = [...directory.querySelectorAll("[data-operation-row]")];
    const visible = rows.filter((row) => {
      const contentMatches = kind === "sessions" ? row.dataset.recordContent === filter : row.dataset.recordFilterValue === filter;
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
        : sort === "sessions-desc"
          ? Number(right.dataset.recordSessionCount || 0) - Number(left.dataset.recordSessionCount || 0)
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
    directory.querySelector("[data-workspace-sort]")?.addEventListener("change", () => filterRecords(kind));
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
    if (!event.target.matches("[data-session-content-search]")) return;
    const detail = event.target.closest("[data-operation-detail]");
    const query = event.target.value.trim().toLocaleLowerCase();
    const items = [...detail.querySelectorAll(".session-turn,.session-event-ledger li,.session-content-state")];
    let shown = 0;
    items.forEach((item) => { item.hidden = Boolean(query) && !item.textContent.toLocaleLowerCase().includes(query); if (!item.hidden) shown += 1; });
    const empty = detail.querySelector("[data-session-content-empty]");
    if (empty) empty.hidden = shown > 0;
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
  const updateSessionAddForm = () => {
    const action = sessionAddAction?.value || "link";
    const option = sessionAddRuntime?.selectedOptions?.[0];
    const createMode = option?.dataset.createMode || "registry";
    const discoverMode = option?.dataset.discoverMode || "unsupported";
    if (sessionAddNative) sessionAddNative.hidden = action !== "link";
    if (sessionAddNativeInput) sessionAddNativeInput.required = action === "link";
    const capability = sessionAddForm?.querySelector("[data-session-add-capability]");
    if (capability) capability.textContent = action === "create"
      ? createMode === "native"
        ? "会请求所选 Runtime 创建一条新的原生 Session；不会自动发送消息。"
        : "这个 Runtime 没有原生创建接口，将建立 GoalBoard 托管记录，不伪装成已启动 Runtime。"
      : discoverMode === "native"
        ? "可以先同步 Runtime 元数据；只有提交后才会关联当前 Project。"
        : "这个 Runtime 不支持发现列表，请粘贴原生 Session ID；GoalBoard 不读取正文。";
    if (sessionAddSubmit) {
      sessionAddSubmit.textContent = action === "create" ? "创建 Session" : "加入 Session";
      sessionAddSubmit.disabled = !sessionAddConfirm?.checked || (action === "link" && !sessionAddNativeInput?.value.trim());
    }
  };
  document.querySelectorAll("[data-open-session-add]").forEach((button) => button.addEventListener("click", () => {
    sessionAddForm?.reset();
    if (sessionAddStatus) sessionAddStatus.hidden = true;
    updateSessionAddForm();
    sessionAddDialog?.showModal();
  }));
  sessionAddAction?.addEventListener("change", updateSessionAddForm);
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
  const workspaceAddDialog = document.querySelector("[data-workspace-add-dialog]");
  const workspaceAddForm = workspaceAddDialog?.querySelector("[data-workspace-add-form]");
  const workspaceAddPath = workspaceAddForm?.querySelector("[data-workspace-add-path]");
  const workspaceAddConfirm = workspaceAddForm?.querySelector("[data-workspace-add-confirm]");
  const workspaceAddSubmit = workspaceAddForm?.querySelector("[data-workspace-add-submit]");
  const workspaceAddStatus = workspaceAddForm?.querySelector("[data-workspace-add-status]");
  const updateWorkspaceAdd = () => {
    if (workspaceAddSubmit) workspaceAddSubmit.disabled = !workspaceAddConfirm?.checked || !workspaceAddPath?.value.trim();
  };
  const openWorkspaceAdd = (workspacePath = "") => {
    workspaceAddForm?.reset();
    if (workspaceAddPath) {
      workspaceAddPath.value = workspacePath;
      workspaceAddPath.readOnly = Boolean(workspacePath);
    }
    if (workspaceAddStatus) workspaceAddStatus.hidden = true;
    updateWorkspaceAdd();
    workspaceAddDialog?.showModal();
  };
  document.querySelectorAll("[data-open-workspace-add]").forEach((button) => button.addEventListener("click", () => openWorkspaceAdd()));
  document.querySelectorAll("[data-workspace-link]").forEach((button) => button.addEventListener("click", () => {
    const detail = button.closest("[data-operation-detail]");
    openWorkspaceAdd(detail?.dataset.workspacePath || "");
  }));
  workspaceAddPath?.addEventListener("input", updateWorkspaceAdd);
  workspaceAddConfirm?.addEventListener("change", updateWorkspaceAdd);
  workspaceAddForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!workspaceAddConfirm?.checked || !workspaceAddPath?.value.trim()) return;
    workspaceAddSubmit.disabled = true;
    showDialogStatus(workspaceAddStatus, "正在规范化路径并关联当前 Project...", false);
    try {
      await parseActionResponse(await fetch(route("/api/workspaces"), {
        method: "POST",
        headers: window.goalboardControlHeaders?.() || {},
        body: JSON.stringify({ workspace_path: workspaceAddPath.value.trim(), user_confirmed: true }),
      }));
      workspaceAddDialog.close();
      location.hash = "workspaces";
      location.reload();
    } catch (error) {
      showDialogStatus(workspaceAddStatus, error instanceof Error ? error.message : String(error), true);
      workspaceAddSubmit.disabled = false;
    }
  });
  const launchDialog = document.querySelector("[data-launch-dialog]");
  const launchForm = launchDialog?.querySelector("[data-launch-form]");
  const launchRuntime = launchForm?.querySelector("[data-launch-runtime]");
  const launchConfirm = launchForm?.querySelector("[data-launch-confirm]");
  const launchSubmit = launchForm?.querySelector("[data-launch-submit]");
  const launchStatus = launchForm?.querySelector("[data-launch-status]");
  let launchDetail = null;
  const updateLaunchCapability = () => {
    const mode = launchRuntime?.selectedOptions?.[0]?.dataset.createMode || "registry";
    const note = launchForm?.querySelector("[data-launch-capability]");
    if (note) note.textContent = mode === "native"
      ? "会请求所选 Runtime 创建新的原生 Session；不会复用现有 Session ID。"
      : "所选 Runtime 没有原生创建接口，将建立 GoalBoard 托管记录，不伪装成已启动 Runtime。";
    if (launchSubmit) launchSubmit.disabled = !launchConfirm?.checked;
  };
  document.querySelectorAll("[data-open-session-launch]").forEach((button) => button.addEventListener("click", () => {
    launchDetail = button.closest("[data-operation-detail]");
    launchForm?.reset();
    const workspace = launchForm?.querySelector("[data-launch-workspace]");
    if (workspace) workspace.textContent = launchDetail?.dataset.workspacePath || "";
    if (launchStatus) launchStatus.hidden = true;
    updateLaunchCapability();
    launchDialog?.showModal();
  }));
  launchRuntime?.addEventListener("change", updateLaunchCapability);
  launchConfirm?.addEventListener("change", updateLaunchCapability);
  launchForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!launchDetail?.dataset.detailId || !launchConfirm?.checked) return;
    launchSubmit.disabled = true;
    showDialogStatus(launchStatus, "正在创建新的 Session...", false);
    try {
      await parseActionResponse(await fetch(route("/api/workspaces/" + encodeURIComponent(launchDetail.dataset.detailId) + "/sessions"), {
        method: "POST",
        headers: window.goalboardControlHeaders?.() || {},
        body: JSON.stringify({
          runtime_id: launchRuntime?.value,
          current_goal_id: launchForm?.querySelector("[data-launch-goal]")?.value || null,
          title: launchForm?.querySelector("[data-launch-title]")?.value.trim() || null,
          user_confirmed: true,
        }),
      }));
      launchDialog.close();
      location.hash = "sessions";
      location.reload();
    } catch (error) {
      showDialogStatus(launchStatus, error instanceof Error ? error.message : String(error), true);
      launchSubmit.disabled = false;
    }
  });

  const repairDialog = document.querySelector("[data-repair-dialog]");
  const repairForm = repairDialog?.querySelector("[data-repair-form]");
  const repairPath = repairForm?.querySelector("[data-repair-path]");
  const repairConfirm = repairForm?.querySelector("[data-repair-confirm]");
  const repairSubmit = repairForm?.querySelector("[data-repair-submit]");
  const repairStatus = repairForm?.querySelector("[data-repair-status]");
  let repairingDetail = null;
  const updateRepair = () => {
    if (repairSubmit) repairSubmit.disabled = !repairConfirm?.checked || !repairPath?.value.trim();
  };
  document.querySelectorAll("[data-open-path-repair]").forEach((button) => button.addEventListener("click", () => {
    repairingDetail = button.closest("[data-operation-detail]");
    repairForm?.reset();
    if (repairPath) repairPath.value = repairingDetail?.dataset.workspacePath || "";
    const previous = repairForm?.querySelector("[data-repair-previous]");
    const count = repairForm?.querySelector("[data-repair-session-count]");
    if (previous) previous.textContent = repairingDetail?.dataset.workspacePath || "";
    if (count) count.textContent = (repairingDetail?.dataset.workspaceSessionCount || "0") + " 条";
    if (repairStatus) repairStatus.hidden = true;
    updateRepair();
    repairDialog?.showModal();
  }));
  repairPath?.addEventListener("input", updateRepair);
  repairConfirm?.addEventListener("change", updateRepair);
  repairForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!repairingDetail?.dataset.detailId || !repairConfirm?.checked || !repairPath?.value.trim()) return;
    repairSubmit.disabled = true;
    showDialogStatus(repairStatus, "正在更新目录身份和匹配 Session...", false);
    try {
      await parseActionResponse(await fetch(route("/api/workspaces/" + encodeURIComponent(repairingDetail.dataset.detailId) + "/path"), {
        method: "PATCH",
        headers: window.goalboardControlHeaders?.() || {},
        body: JSON.stringify({ workspace_path: repairPath.value.trim(), user_confirmed: true }),
      }));
      repairDialog.close();
      location.reload();
    } catch (error) {
      showDialogStatus(repairStatus, error instanceof Error ? error.message : String(error), true);
      repairSubmit.disabled = false;
    }
  });

  const unlinkDialog = document.querySelector("[data-workspace-unlink-dialog]");
  const unlinkForm = unlinkDialog?.querySelector("[data-workspace-unlink-form]");
  const unlinkConfirm = unlinkForm?.querySelector("[data-workspace-unlink-confirm]");
  const unlinkSubmit = unlinkForm?.querySelector("[data-workspace-unlink-submit]");
  const unlinkStatus = unlinkForm?.querySelector("[data-workspace-unlink-status]");
  let unlinkDetail = null;
  document.querySelectorAll("[data-open-workspace-unlink]").forEach((button) => button.addEventListener("click", () => {
    unlinkDetail = button.closest("[data-operation-detail]");
    unlinkForm?.reset();
    const workspace = unlinkForm?.querySelector("[data-workspace-unlink-path]");
    const sessions = unlinkForm?.querySelector("[data-workspace-unlink-sessions]");
    if (workspace) workspace.textContent = unlinkDetail?.dataset.workspacePath || "";
    if (sessions) sessions.textContent = (unlinkDetail?.dataset.workspaceSessionCount || "0") + " 条将解除工作目录关系";
    if (unlinkStatus) unlinkStatus.hidden = true;
    if (unlinkSubmit) unlinkSubmit.disabled = true;
    unlinkDialog?.showModal();
  }));
  unlinkConfirm?.addEventListener("change", () => { if (unlinkSubmit) unlinkSubmit.disabled = !unlinkConfirm.checked; });
  unlinkForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!unlinkDetail?.dataset.detailId || !unlinkConfirm?.checked) return;
    unlinkSubmit.disabled = true;
    showDialogStatus(unlinkStatus, "正在解除当前 Project 关系...", false);
    try {
      await parseActionResponse(await fetch(route("/api/workspaces/" + encodeURIComponent(unlinkDetail.dataset.detailId) + "/unlink"), {
        method: "POST",
        headers: window.goalboardControlHeaders?.() || {},
        body: JSON.stringify({ user_confirmed: true }),
      }));
      unlinkDialog.close();
      location.reload();
    } catch (error) {
      showDialogStatus(unlinkStatus, error instanceof Error ? error.message : String(error), true);
      unlinkSubmit.disabled = false;
    }
  });
  document.querySelectorAll("[data-dialog-close]").forEach((button) => button.addEventListener("click", () => button.closest("dialog")?.close()));
  document.querySelectorAll('[data-work-surface-open="sessions"]').forEach((button) => button.addEventListener("click", () => {
    queueMicrotask(() => loadSessionContent(document.querySelector('[data-work-surface="sessions"] [data-operation-detail]:not([hidden])')));
  }));
  const deepLink = location.hash.replace(/^#/, "");
  if (deepLink === "sessions" || deepLink === "workspaces") document.querySelector('[data-work-surface-open="' + deepLink + '"][data-directory-open="' + deepLink + '"]')?.click();
})();
`;

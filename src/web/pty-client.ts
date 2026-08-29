import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import xtermCss from "@xterm/xterm/css/xterm.css";

type PanelRecord = {
  panel_id: string;
  goal_id: string;
  runtime_kind: string;
  launch_command: string;
  launch_args: string[];
  cwd: string | null;
  work_context_id: string;
  title: string;
  status: "open" | "exited";
  spawn?: {
    command: string;
    args: string[];
    cwd: string | null;
    env: Record<string, string>;
  };
};

type SpawnMode = "start" | "attach" | "reopen" | "reconnect";

type ChildGoalSummary = {
  goal: { goal_id: string; title: string };
  status_label: string;
  status_meaning: string;
  next_action: string;
};

type GoalChangedDetail = {
  goalId?: string;
  goalTitle?: string;
  statusLabel?: string;
  statusMeaning?: string;
  parentReadOnly?: boolean;
  children?: ChildGoalSummary[];
};

declare global {
  interface Window {
    L?: (zh: string, vars?: Record<string, string | number>) => string;
    goalboardControlHeaders?: () => Record<string, string>;
  }
}

type PtyServerMessage =
  | { type: "ready" }
  | { type: "spawned"; panelId?: string; attached?: boolean; started?: boolean; replay?: string }
  | { type: "data"; panelId?: string; data?: string }
  | { type: "exit"; panelId?: string; exitCode?: number; signal?: number }
  | { type: "error"; panelId?: string; message?: string };

const style = document.createElement("style");
style.textContent = String(xtermCss);
document.head.appendChild(style);

const pane = document.querySelector("[data-tui-pane]") as HTMLElement | null;
if (pane) {
  const tabsEl = pane.querySelector("[data-tui-tabs]") as HTMLElement;
  const terminalHost = pane.querySelector("[data-tui-terminal]") as HTMLElement;
  const emptyEl = pane.querySelector("[data-tui-empty]") as HTMLElement | null;
  const statusEl = pane.querySelector("[data-tui-status]") as HTMLElement | null;
  const ownerTitleEl = pane.querySelector("[data-tui-owner-title]") as HTMLElement | null;
  const ownerStatusEl = pane.querySelector("[data-tui-owner-status]") as HTMLElement | null;
  const parentGuardEl = pane.querySelector("[data-tui-parent-guard]") as HTMLElement | null;
  const childChoicesEl = pane.querySelector("[data-tui-child-choices]") as HTMLElement | null;
  const menu = pane.querySelector("[data-tui-menu]") as HTMLFormElement;
  const advanceBtn = pane.querySelector("[data-tui-advance]") as HTMLButtonElement;
  const copyBtn = pane.querySelector("[data-tui-copy]") as HTMLButtonElement | null;
  const fillBtn = pane.querySelector("[data-tui-fill]") as HTMLButtonElement;
  const reopenBtn = pane.querySelector("[data-tui-reopen]") as HTMLButtonElement;
  const addBtn = pane.querySelector("[data-tui-add]") as HTMLButtonElement;
  const genericFields = menu.querySelector("[data-tui-generic-fields]") as HTMLElement | null;
  const genericOpen = menu.querySelector("[data-tui-generic-open]") as HTMLButtonElement | null;
  const L = window.L ?? ((zh: string) => zh);
  const routePrefix = document.body.dataset.routePrefix || "";
  const route = (pathname: string) => routePrefix + pathname;

  const terminalPalette = () => document.documentElement.dataset.resolvedTerminalTheme === "light"
    ? {
        background: "#fbfbfc",
        foreground: "#202023",
        cursor: "#202023",
        cursorAccent: "#fbfbfc",
        selectionBackground: "#dce4f8",
        selectionInactiveBackground: "#eceefa",
        black: "#252528",
        red: "#a64e51",
        green: "#347759",
        yellow: "#936b2d",
        blue: "#5068b7",
        magenta: "#8157a2",
        cyan: "#36787f",
        white: "#d7d7dc",
        brightBlack: "#6a6a73",
        brightRed: "#b95c5f",
        brightGreen: "#43886a",
        brightYellow: "#a47a38",
        brightBlue: "#6078c8",
        brightMagenta: "#9569b5",
        brightCyan: "#478b92",
        brightWhite: "#ffffff",
      }
    : {
        background: "#101012",
        foreground: "#f0f0f2",
        cursor: "#f0f0f2",
        cursorAccent: "#101012",
        selectionBackground: "#33405b",
        selectionInactiveBackground: "#282b34",
        black: "#202023",
        red: "#e08386",
        green: "#78b391",
        yellow: "#d0a15b",
        blue: "#91a7f2",
        magenta: "#c594d8",
        cyan: "#75b7be",
        white: "#d8d8dd",
        brightBlack: "#73737c",
        brightRed: "#ee9a9d",
        brightGreen: "#91c7a7",
        brightYellow: "#dfb773",
        brightBlue: "#acbdf6",
        brightMagenta: "#d8abe8",
        brightCyan: "#91cbd0",
        brightWhite: "#ffffff",
      };

  const sessions = new Map<string, { term: Terminal; fit: FitAddon; wrapper: HTMLElement; hasOutput: boolean }>();
  const applyTerminalPalette = () => {
    const palette = terminalPalette();
    sessions.forEach(({ term }) => {
      term.options.theme = palette;
    });
  };
  window.addEventListener("goalboard:terminal-theme-change", applyTerminalPalette);
  const alive = new Set<string>();
  const pendingSpawns = new Map<string, { resolve: (value: PtyServerMessage) => void; reject: (error: Error) => void }>();
  const spawnTail = new Map<string, Promise<unknown>>();
  let panels: PanelRecord[] = [];
  let activeId: string | null = null;
  let selectedKind = (menu.querySelector("[data-tui-kind]:not(:disabled)") as HTMLButtonElement | null)?.dataset.tuiKind || "generic";
  let promptCache = "";
  let socket: WebSocket | null = null;
  let socketReady: Promise<WebSocket> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectAttempt = 0;
  let reconnectStopped = false;
  let panelLoadSequence = 0;
  let parentReadOnly = pane.dataset.tuiParentReadOnly === "true";

  const headers = () => ({
    "content-type": "application/json",
    "x-goalboard-desktop": "1",
    ...(window.goalboardControlHeaders?.() ?? {}),
  });
  const desktopHeaders = () => ({
    "x-goalboard-desktop": "1",
    ...(window.goalboardControlHeaders?.() ?? {}),
  });

  const goalId = () => pane.dataset.goalId || "";

  const resumeId = () => String(new FormData(menu).get("resume_session_id") || "").trim() || undefined;

  const setKind = (kind: string) => {
    selectedKind = kind;
    if (genericFields) genericFields.hidden = kind !== "generic";
    if (genericOpen) genericOpen.hidden = kind !== "generic";
    menu.querySelectorAll("[data-tui-kind]").forEach((button) => {
      button.classList.toggle("is-selected", (button as HTMLElement).dataset.tuiKind === kind);
    });
  };

  const refreshRuntimeAvailability = async () => {
    const response = await fetch(route("/api/runtime-availability"), { headers: desktopHeaders() });
    if (!response.ok) return;
    const availability = await response.json() as Record<string, boolean>;
    menu.querySelectorAll<HTMLButtonElement>("[data-tui-kind]:not([data-tui-kind=generic])").forEach((button) => {
      const kind = button.dataset.tuiKind ?? "";
      const available = availability[kind] !== false;
      button.disabled = !available;
      if (available) {
        button.removeAttribute("title");
        button.querySelector("small")?.remove();
        return;
      }
      button.title = L("需要先安装 CLI");
      if (!button.querySelector("small")) {
        const hint = document.createElement("small");
        hint.textContent = L("未安装");
        button.append(hint);
      }
    });
    if ((menu.querySelector(`[data-tui-kind="${selectedKind}"]`) as HTMLButtonElement | null)?.disabled) {
      setKind((menu.querySelector("[data-tui-kind]:not(:disabled)") as HTMLButtonElement | null)?.dataset.tuiKind ?? "generic");
    }
  };

  const setStatus = (text: string, tone: "idle" | "busy" | "live" | "error" = "idle") => {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.dataset.tone = text ? tone : "";
  };

  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const showPageToast = (message: string, error = false) => {
    const toast = document.querySelector("[data-toast]") as HTMLElement | null;
    if (!toast) {
      setStatus(message, error ? "error" : "idle");
      return;
    }
    toast.textContent = message;
    toast.classList.toggle("is-error", error);
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
  };

  const setMenuOpen = (open: boolean) => {
    if (open && parentReadOnly) {
      setStatus(L("请进入一个具体的子 Goal"), "error");
      return;
    }
    menu.classList.toggle("is-open", open);
    menu.setAttribute("aria-hidden", String(!open));
    addBtn.setAttribute("aria-expanded", String(open));
    if (open) {
      menu.removeAttribute("inert");
      setKind(selectedKind);
      (menu.querySelector(`[data-tui-kind="${selectedKind}"]`) as HTMLButtonElement | null)?.focus();
      return;
    }
    menu.setAttribute("inert", "");
  };

  const errorText = (error: unknown) => {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === "string" && error) return error;
    if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
    return String(error);
  };

  const parentReadOnlyMessage = () =>
    L("这条上层 Goal 由子 Goal 共同完成，当前终端只读。请进入具体的子 Goal 查看或继续。");

  const panelBelongsHere = (panel: PanelRecord | null | undefined) =>
    Boolean(panel && panel.goal_id === goalId());

  const canControlPanel = (panel: PanelRecord | null | undefined): panel is PanelRecord => {
    if (parentReadOnly) {
      setStatus(parentReadOnlyMessage(), "error");
      return false;
    }
    if (!panelBelongsHere(panel)) {
      setStatus(
        L("当前页面已经切到另一条 Goal，这个终端不会跟着切换。请回到它所属的 Goal 再操作。"),
        "error",
      );
      return false;
    }
    return true;
  };

  const renderChildChoices = (children: ChildGoalSummary[]) => {
    if (!childChoicesEl) return;
    childChoicesEl.innerHTML = children.length
      ? children.map((child) => `<a class="tui-child-choice" href="${escapeHtml(route(`/goals/${encodeURIComponent(child.goal.goal_id)}`))}">
          <span><strong>${escapeHtml(child.goal.title)}</strong><small>${escapeHtml(child.status_label)} · ${escapeHtml(child.next_action)}</small></span>
          <b>${escapeHtml(L("打开这个子 Goal"))}<svg aria-hidden="true"><use href="#icon-chevron-right"></use></svg></b>
        </a>`).join("")
      : `<p>${escapeHtml(L("还没有可推进的子 Goal，请先检查 Goal 的拆分。"))}</p>`;
  };

  const updateEmptyCopy = (readOnly: boolean) => {
    if (!emptyEl) return;
    const paragraphs = emptyEl.querySelectorAll("p");
    const title = paragraphs[0]?.querySelector("strong");
    if (title) title.textContent = readOnly ? L("这个上层 Goal 不直接使用终端") : L("还没有终端");
    if (paragraphs[1]) {
      paragraphs[1].textContent = readOnly
        ? L("请从上方进入一个具体的子 Goal。")
        : L("点右上角「添加终端」，在这个 Goal 上打开常用 Runtime 或自定义命令。");
    }
  };

  const setParentGuard = (readOnly: boolean, children: ChildGoalSummary[] = []) => {
    parentReadOnly = readOnly;
    pane.dataset.tuiParentReadOnly = String(readOnly);
    pane.toggleAttribute("data-tui-read-only", readOnly);
    if (parentGuardEl) parentGuardEl.hidden = !readOnly;
    if (readOnly) renderChildChoices(children);
    updateEmptyCopy(readOnly);
    addBtn.disabled = readOnly;
    addBtn.title = readOnly ? L("请进入一个具体的子 Goal") : "";
    if (readOnly) setMenuOpen(false);
  };

  const controlToken = () =>
    document.querySelector('meta[name="goalboard-control-token"]')?.getAttribute("content") || "";

  const rejectSpawn = (panelId: string | undefined, error: Error) => {
    if (!panelId) return;
    const pending = pendingSpawns.get(panelId);
    if (!pending) return;
    pendingSpawns.delete(panelId);
    pending.reject(error);
  };

  const handlePtyMessage = (value: PtyServerMessage) => {
    if (value.type === "data") {
      if (!value.panelId || value.data == null) return;
      const session = sessions.get(value.panelId);
      if (!session) return;
      session.term.write(value.data);
      session.hasOutput = true;
      return;
    }
    if (value.type === "exit") {
      if (!value.panelId) return;
      alive.delete(value.panelId);
      const panel = panels.find((item) => item.panel_id === value.panelId);
      if (panel) panel.status = "exited";
      const session = sessions.get(value.panelId);
      if (session) {
        const exitCode = value.exitCode ?? 0;
        session.term.write(`\r\n${L("终端进程已退出")}${value.exitCode != null ? `（${L("退出码")} ${exitCode}）` : ""}\r\n`);
        if (!session.hasOutput && exitCode !== 0) {
          session.term.write(`\r\n${L("进程在启动后立即退出，常见原因：命令未安装、不在 PATH 中或工作目录不存在。")}\r\n`);
        }
      }
      void fetch(route(`/api/panels/${encodeURIComponent(value.panelId)}/exited`), {
        method: "POST",
        headers: headers(),
        body: "{}",
      }).catch(() => undefined);
      if (activeId === value.panelId) {
        showTerminal(activeId);
        setStatus(
          value.exitCode != null ? L("终端已退出（退出码 {code}）", { code: value.exitCode }) : L("终端已退出"),
        );
      }
      return;
    }
    if (value.type === "spawned" && value.panelId) {
      pendingSpawns.get(value.panelId)?.resolve(value);
      pendingSpawns.delete(value.panelId);
      return;
    }
    if (value.type === "error") {
      const error = new Error(value.message || L("终端通道连接失败"));
      rejectSpawn(value.panelId, error);
      if (!value.panelId || value.panelId === activeId) setStatus(errorText(error), "error");
    }
  };

  const connectPty = (): Promise<WebSocket> => {
    if (socket && socket.readyState === WebSocket.OPEN) return Promise.resolve(socket);
    if (socketReady) return socketReady;
    socketReady = new Promise((resolve, reject) => {
      const token = controlToken();
      if (!token) {
        socketReady = null;
        reject(new Error(L("终端通道连接失败")));
        return;
      }
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${location.host}/pty`);
      let settled = false;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        if (socket === ws) socket = null;
        socketReady = null;
        reject(error);
      };
      ws.addEventListener("open", () => {
        ws.send(JSON.stringify({ type: "auth", token }));
      });
      ws.addEventListener("message", (event) => {
        let value: PtyServerMessage;
        try {
          value = JSON.parse(String(event.data)) as PtyServerMessage;
        } catch {
          return;
        }
        if (value.type === "ready") {
          if (settled) return;
          settled = true;
          socket = ws;
          resolve(ws);
          return;
        }
        handlePtyMessage(value);
      });
      ws.addEventListener("error", () => fail(new Error(L("终端通道连接失败"))));
      ws.addEventListener("close", () => {
        if (socket === ws) socket = null;
        socketReady = null;
        if (!settled) {
          fail(new Error(L("终端通道已断开")));
          return;
        }
        for (const panelId of [...pendingSpawns.keys()]) {
          rejectSpawn(panelId, new Error(L("终端通道已断开")));
        }
        if (alive.size) setStatus(L("终端通道已断开"), "error");
        scheduleReconnect();
      });
    });
    return socketReady;
  };

  const sendPty = async (message: Record<string, unknown>) => {
    const ws = await connectPty();
    ws.send(JSON.stringify(message));
  };

  const scheduleReconnect = () => {
    if (reconnectStopped) return;
    clearTimeout(reconnectTimer);
    const delay = Math.min(8_000, 400 * (2 ** Math.min(reconnectAttempt, 4)));
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      void reconnectLivePanels();
    }, delay);
  };

  const enqueueSpawn = (panelId: string, task: () => Promise<void>) => {
    const previous = spawnTail.get(panelId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(task);
    spawnTail.set(panelId, run);
    return run;
  };

  const stubPanel = (panelId: string): PanelRecord => ({
    panel_id: panelId,
    goal_id: "",
    runtime_kind: "generic",
    launch_command: "",
    launch_args: [],
    cwd: null,
    work_context_id: panelId,
    title: "",
    status: "open",
  });

  const markPanelNotRunning = async (panel: PanelRecord) => {
    alive.delete(panel.panel_id);
    panel.status = "exited";
    await fetch(route(`/api/panels/${encodeURIComponent(panel.panel_id)}/exited`), {
      method: "POST",
      headers: headers(),
      body: "{}",
    }).catch(() => undefined);
    if (activeId === panel.panel_id) showTerminal(activeId);
  };

  const forgetLocalSession = (panelId: string) => {
    spawnTail.delete(panelId);
    sessions.get(panelId)?.term.dispose();
    sessions.get(panelId)?.wrapper.remove();
    sessions.delete(panelId);
    alive.delete(panelId);
    rejectSpawn(panelId, new Error("closed"));
  };

  const current = () => panels.find((item) => item.panel_id === activeId) ?? null;

  const renderTabs = () => {
    tabsEl.innerHTML = panels.map((panel) => {
      const active = panel.panel_id === activeId ? " is-active" : "";
      const exited = panel.status === "exited" ? " is-exited" : "";
      const close = parentReadOnly
        ? `<small class="tui-tab-readonly">${escapeHtml(L("只读"))}</small>`
        : `<span class="tui-tab-close" data-tui-close="${escapeHtml(panel.panel_id)}" aria-label="${escapeHtml(L("关闭终端"))}"><svg aria-hidden="true"><use href="#icon-x"></use></svg></span>`;
      return `<button class="tui-tab${active}${exited}" type="button" data-tui-select="${escapeHtml(panel.panel_id)}" title="${escapeHtml(`${ownerTitleEl?.textContent || L("当前 Goal")} · ${panel.title}`)}"><span class="tui-tab-title">${escapeHtml(panel.title)}</span>${close}</button>`;
    }).join("");
  };

  const showTerminal = (panelId: string | null) => {
    for (const [id, session] of sessions) {
      session.wrapper.hidden = id !== panelId;
    }
    if (emptyEl) emptyEl.hidden = panels.length > 0;
    const panel = current();
    const live = Boolean(panelId && alive.has(panelId));
    const readOnly = parentReadOnly || Boolean(panel && !panelBelongsHere(panel));
    advanceBtn.disabled = !live || readOnly;
    if (copyBtn) copyBtn.disabled = readOnly || !goalId();
    fillBtn.disabled = !live || readOnly;
    reopenBtn.hidden = !(panel && !live && !readOnly);
    if (!panel) setStatus("");
    else if (parentReadOnly) setStatus(L("历史终端只读；请到具体的子 Goal 继续。"));
    else if (!panelBelongsHere(panel)) setStatus(L("这个终端属于另一条 Goal，当前不可操作。"), "error");
    else if (live) setStatus(L("终端已连接"), "live");
    else setStatus(L("终端进程已不在，可重新打开"));
    if (panelId && sessions.has(panelId)) {
      const session = sessions.get(panelId)!;
      requestAnimationFrame(() => {
        session.fit.fit();
        if (live) session.term.focus();
      });
    }
  };

  const ensureSession = (panelId: string) => {
    let session = sessions.get(panelId);
    if (session) return session;
    const wrapper = document.createElement("div");
    wrapper.className = "tui-xterm";
    terminalHost.appendChild(wrapper);
    const term = new Terminal({
      convertEol: false,
      fontSize: 13,
      lineHeight: 1.3,
      scrollback: 8000,
      macOptionIsMeta: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, "Cascadia Mono", Consolas, "Liberation Mono", "Courier New", monospace',
      cursorBlink: true,
      theme: terminalPalette(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(wrapper);
    requestAnimationFrame(() => wrapper.classList.add("is-ready"));
    term.onData((data) => {
      const panel = panels.find((item) => item.panel_id === panelId);
      if (!canControlPanel(panel)) return;
      void sendPty({ type: "write", panelId, data }).catch((error) => setStatus(errorText(error), "error"));
    });
    session = { term, fit, wrapper, hasOutput: false };
    sessions.set(panelId, session);
    return session;
  };

  const spawnBusyText = (mode: SpawnMode) => {
    if (mode === "reconnect") return L("正在重新连接终端…");
    if (mode === "attach") return L("正在连接终端…");
    return L("正在启动终端…");
  };

  const spawnPanel = async (panel: PanelRecord, mode: SpawnMode = "start") => {
    if ((mode === "start" || mode === "reopen") && !canControlPanel(panel)) return;
    await enqueueSpawn(panel.panel_id, async () => {
      if (mode === "attach" && alive.has(panel.panel_id) && sessions.has(panel.panel_id)) return;
      const session = ensureSession(panel.panel_id);
      try {
        if (mode === "reopen") {
          session.term.reset();
          session.hasOutput = false;
        }
        session.fit.fit();
        const size = session.fit.proposeDimensions();
        const spawn = panel.spawn;
        if (activeId === panel.panel_id) setStatus(spawnBusyText(mode), "busy");
        await connectPty();
        const spawned = new Promise<PtyServerMessage>((resolve, reject) => {
          const timer = setTimeout(() => {
            pendingSpawns.delete(panel.panel_id);
            reject(new Error(L("终端通道连接失败")));
          }, 20_000);
          pendingSpawns.set(panel.panel_id, {
            resolve: (value) => {
              clearTimeout(timer);
              resolve(value);
            },
            reject: (error) => {
              clearTimeout(timer);
              reject(error);
            },
          });
        });
        try {
          await sendPty({
            type: "spawn",
            panelId: panel.panel_id,
            command: spawn?.command ?? panel.launch_command,
            args: spawn?.args ?? panel.launch_args,
            cwd: spawn?.cwd ?? panel.cwd,
            env: spawn?.env ?? {
              GOALBOARD_PANEL_ID: panel.panel_id,
              GOALBOARD_GOAL_ID: panel.goal_id,
              GOALBOARD_WORK_CONTEXT_ID: panel.work_context_id,
              GOALBOARD_WORK_CONTEXT_STABLE: "true",
              GOALBOARD_RUNTIME_ID: panel.runtime_kind,
            },
            cols: Math.max(20, size?.cols ?? 80),
            rows: Math.max(8, size?.rows ?? 24),
            attachOnly: mode === "attach" || mode === "reconnect",
          });
        } catch (error) {
          pendingSpawns.get(panel.panel_id)?.reject(error instanceof Error ? error : new Error(String(error)));
        }
        const result = await spawned;
        if (!sessions.has(panel.panel_id)) return;
        if (result.type === "spawned" && !result.attached && result.started === false) {
          await markPanelNotRunning(panel);
          return;
        }
        if (mode === "reconnect") {
          session.term.reset();
          session.hasOutput = false;
        }
        if (result.type === "spawned" && result.replay && (mode === "reconnect" || !session.hasOutput)) {
          session.term.write(result.replay);
          session.hasOutput = true;
        }
        alive.add(panel.panel_id);
        panel.status = "open";
        requestAnimationFrame(() => {
          session.fit.fit();
          if (activeId === panel.panel_id) session.term.focus();
        });
        if (activeId === panel.panel_id) {
          setStatus(result.type === "spawned" && result.attached ? L("已回到正在运行的终端") : L("终端已连接"), "live");
        }
      } catch (error) {
        if (!sessions.has(panel.panel_id)) return;
        if (mode === "start" || mode === "reopen") {
          session.term.write(`\r\n${errorText(error)}\r\n`);
        }
        throw error;
      }
    });
  };

  const reconnectLivePanels = async () => {
    if (reconnectStopped) return;
    try {
      await connectPty();
      reconnectAttempt = 0;
      const known = new Map(panels.map((panel) => [panel.panel_id, panel]));
      const queue: Array<{ panel: PanelRecord; mode: SpawnMode }> = [];
      for (const panelId of [...alive]) {
        queue.push({ panel: known.get(panelId) ?? stubPanel(panelId), mode: "reconnect" });
      }
      for (const panel of panels) {
        if (panel.status === "open" && !alive.has(panel.panel_id)) {
          queue.push({ panel, mode: "attach" });
        }
      }
      for (const item of queue) {
        try {
          await spawnPanel(item.panel, item.mode);
        } catch (error) {
          if (activeId === item.panel.panel_id) setStatus(errorText(error), "error");
        }
      }
      showTerminal(activeId);
    } catch {
      scheduleReconnect();
    }
  };

  const loadPanels = async () => {
    const id = goalId();
    const requestSequence = ++panelLoadSequence;
    if (!id) {
      panels = [];
      activeId = null;
      renderTabs();
      showTerminal(null);
      return;
    }
    const response = await fetch(route(`/api/goals/${encodeURIComponent(id)}/panels`), {
      cache: "no-store",
      headers: desktopHeaders(),
    });
    if (!response.ok) return;
    const payload = await response.json() as { panels?: PanelRecord[] };
    if (requestSequence !== panelLoadSequence || id !== goalId()) return;
    panels = payload.panels ?? [];
    if (!panels.some((item) => item.panel_id === activeId)) {
      activeId = panels[0]?.panel_id ?? null;
    }
    renderTabs();
    for (const panel of panels) {
      if (panel.status !== "open") continue;
      try {
        await spawnPanel(panel, "attach");
      } catch (error) {
        if (activeId === panel.panel_id) setStatus(errorText(error), "error");
      }
    }
    showTerminal(activeId);
  };

  const openPanel = async (body: Record<string, unknown>) => {
    const id = goalId();
    if (!id) {
      setStatus(L("打开项目后，Goal 右侧可以添加终端"));
      return;
    }
    if (parentReadOnly) {
      setStatus(parentReadOnlyMessage(), "error");
      return;
    }
    const response = await fetch(route(`/api/goals/${encodeURIComponent(id)}/panels`), {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
    });
    const payload = await response.json() as { panel?: PanelRecord; spawn?: PanelRecord["spawn"]; error?: string };
    if (!response.ok || !payload.panel) {
      setStatus(payload.error || L("打开失败"), "error");
      return;
    }
    const record = { ...payload.panel, spawn: payload.spawn };
    panels.push(record);
    activeId = record.panel_id;
    renderTabs();
    showTerminal(activeId);
    setMenuOpen(false);
    try {
      await spawnPanel(record);
      showTerminal(activeId);
    } catch (error) {
      setStatus(errorText(error), "error");
      showTerminal(activeId);
    }
  };

  const closePanel = async (panelId: string) => {
    const panel = panels.find((item) => item.panel_id === panelId);
    if (!canControlPanel(panel)) return;
    await sendPty({ type: "kill", panelId }).catch(() => undefined);
    await fetch(route(`/api/panels/${encodeURIComponent(panelId)}`), {
      method: "DELETE",
      headers: headers(),
    });
    forgetLocalSession(panelId);
    panels = panels.filter((item) => item.panel_id !== panelId);
    if (activeId === panelId) activeId = panels[0]?.panel_id ?? null;
    renderTabs();
    showTerminal(activeId);
  };

  const writePrompt = async (send: boolean) => {
    const panel = current();
    if (!canControlPanel(panel)) return;
    const text = await loadAdvancePrompt(panel.goal_id);
    await sendPty({ type: "write", panelId: panel.panel_id, data: send ? `${text}\r` : text });
  };

  const loadAdvancePrompt = async (requestedGoalId?: string) => {
    const id = requestedGoalId || goalId();
    if (!id) throw new Error(L("打开失败"));
    if (parentReadOnly) throw new Error(parentReadOnlyMessage());
    if (requestedGoalId && requestedGoalId !== goalId()) {
      throw new Error(L("当前页面已经切到另一条 Goal，请回到终端所属的 Goal 再操作。"));
    }
    const response = await fetch(route(`/api/goals/${encodeURIComponent(id)}/advance-prompt`), {
      cache: "no-store",
      headers: desktopHeaders(),
    });
    const payload = await response.json() as { prompt?: string; error?: string };
    if (!response.ok) throw new Error(payload.error || L("打开失败"));
    const text = payload.prompt || promptCache;
    if (!text) throw new Error(L("打开失败"));
    promptCache = text;
    return text;
  };

  const copyAdvancePrompt = async () => {
    const text = await loadAdvancePrompt();
    try {
      await navigator.clipboard.writeText(text);
      showPageToast(L("命令已复制到剪贴板"));
    } catch {
      showPageToast(L("无法访问剪贴板，请手动复制"), true);
    }
  };

  addBtn.addEventListener("click", () => {
    if (parentReadOnly) {
      setStatus(parentReadOnlyMessage(), "error");
      return;
    }
    setMenuOpen(!menu.classList.contains("is-open"));
  });
  menu.querySelector("[data-tui-menu-cancel]")?.addEventListener("click", () => {
    setMenuOpen(false);
    addBtn.focus();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!menu.classList.contains("is-open")) return;
    const target = event.target as Node;
    if (menu.contains(target) || addBtn.contains(target)) return;
    setMenuOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !menu.classList.contains("is-open")) return;
    event.preventDefault();
    setMenuOpen(false);
    addBtn.focus();
  });
  menu.querySelectorAll("[data-tui-kind]").forEach((button) => {
    button.addEventListener("click", () => {
      const kind = (button as HTMLElement).dataset.tuiKind || "generic";
      setKind(kind);
      if (kind === "generic") {
        menu.querySelector<HTMLInputElement>("input[name=command]")?.focus();
        return;
      }
      void openPanel({
        runtime_kind: kind,
        resume_session_id: resumeId(),
      });
    });
  });
  menu.addEventListener("submit", (event) => {
    event.preventDefault();
    const command = String(new FormData(menu).get("command") || "").trim();
    void openPanel({
      runtime_kind: selectedKind,
      command: selectedKind === "generic" ? command : undefined,
      resume_session_id: resumeId(),
    });
  });
  tabsEl.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const closeId = target.closest("[data-tui-close]")?.getAttribute("data-tui-close");
    if (closeId) {
      event.preventDefault();
      void closePanel(closeId);
      return;
    }
    const selectId = target.closest("[data-tui-select]")?.getAttribute("data-tui-select");
    if (selectId) {
      activeId = selectId;
      renderTabs();
      showTerminal(activeId);
    }
  });
  advanceBtn.addEventListener("click", () => { void writePrompt(true).catch((error) => setStatus(errorText(error), "error")); });
  copyBtn?.addEventListener("click", () => { void copyAdvancePrompt().catch((error) => setStatus(errorText(error), "error")); });
  fillBtn.addEventListener("click", () => { void writePrompt(false).catch((error) => setStatus(errorText(error), "error")); });
  reopenBtn.addEventListener("click", () => {
    const panel = current();
    if (!canControlPanel(panel)) return;
    void (async () => {
      const response = await fetch(route(`/api/panels/${encodeURIComponent(panel.panel_id)}/reopen`), {
        method: "POST",
        headers: headers(),
        body: "{}",
      });
      const payload = await response.json() as { panel?: PanelRecord; spawn?: PanelRecord["spawn"]; error?: string };
      if (!response.ok) {
        setStatus(payload.error || L("打开失败"), "error");
        return;
      }
      if (payload.panel) {
        Object.assign(panel, payload.panel, { spawn: payload.spawn ?? panel.spawn });
      }
      await spawnPanel(panel, "reopen");
      showTerminal(activeId);
    })().catch((error) => setStatus(errorText(error), "error"));
  });

  document.addEventListener("goalboard:goal-changed", (event) => {
    const detail = (event as CustomEvent<GoalChangedDetail>).detail;
    if (ownerTitleEl && detail?.goalTitle) ownerTitleEl.textContent = detail.goalTitle;
    if (ownerStatusEl) {
      ownerStatusEl.textContent = detail?.statusLabel ?? "";
      ownerStatusEl.title = detail?.statusMeaning ?? "";
    }
    promptCache = "";
    setParentGuard(Boolean(detail?.parentReadOnly), detail?.children ?? []);
    renderTabs();
    showTerminal(activeId);
    void loadPanels();
  });

  new ResizeObserver(() => {
    if (activeId && sessions.has(activeId)) {
      const session = sessions.get(activeId)!;
      session.fit.fit();
      const size = session.fit.proposeDimensions();
      if (size) void sendPty({ type: "resize", panelId: activeId, cols: size.cols, rows: size.rows }).catch(() => undefined);
    }
  }).observe(terminalHost);

  terminalHost.addEventListener("pointerdown", () => {
    if (activeId && sessions.has(activeId)) sessions.get(activeId)!.term.focus();
  });

  window.addEventListener("beforeunload", () => {
    reconnectStopped = true;
    clearTimeout(reconnectTimer);
  });

  void (async () => {
    void refreshRuntimeAvailability().catch(() => undefined);
    try {
      await connectPty();
    } catch (error) {
      setStatus(errorText(error), "error");
    }
    await loadPanels();
  })();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

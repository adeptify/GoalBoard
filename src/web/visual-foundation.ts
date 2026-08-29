export type GoalBoardTheme = "light" | "dark" | "system";
export type GoalBoardDensity = "standard" | "compact";
export type GoalBoardTerminalTheme = "auto" | "light" | "dark";

export const GOALBOARD_THEME_STORAGE_KEY = "goalboard:theme";
export const GOALBOARD_DENSITY_STORAGE_KEY = "goalboard:density";
export const GOALBOARD_TERMINAL_THEME_STORAGE_KEY = "goalboard:terminal-theme";

export const THEME_BOOTSTRAP_SCRIPT = `
(() => {
  const themeKey = "${GOALBOARD_THEME_STORAGE_KEY}";
  const densityKey = "${GOALBOARD_DENSITY_STORAGE_KEY}";
  const terminalThemeKey = "${GOALBOARD_TERMINAL_THEME_STORAGE_KEY}";
  const validThemes = new Set(["light", "dark", "system"]);
  const validDensities = new Set(["standard", "compact"]);
  const validTerminalThemes = new Set(["auto", "light", "dark"]);
  let theme = "system";
  let density = "standard";
  let terminalTheme = "auto";
  try {
    const storedTheme = localStorage.getItem(themeKey);
    const storedDensity = localStorage.getItem(densityKey);
    const storedTerminalTheme = localStorage.getItem(terminalThemeKey);
    if (storedTheme && validThemes.has(storedTheme)) theme = storedTheme;
    if (storedDensity && validDensities.has(storedDensity)) density = storedDensity;
    if (storedTerminalTheme && validTerminalThemes.has(storedTerminalTheme)) terminalTheme = storedTerminalTheme;
  } catch {}
  const dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  const resolvedTheme = theme === "system" ? (dark ? "dark" : "light") : theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.resolvedTheme = resolvedTheme;
  document.documentElement.dataset.density = density;
  document.documentElement.dataset.terminalTheme = terminalTheme;
  document.documentElement.dataset.resolvedTerminalTheme = terminalTheme === "auto" ? resolvedTheme : terminalTheme;
})();`;

export const VISUAL_FOUNDATION_CLIENT_SCRIPT = `
(() => {
  const themeKey = "${GOALBOARD_THEME_STORAGE_KEY}";
  const densityKey = "${GOALBOARD_DENSITY_STORAGE_KEY}";
  const terminalThemeKey = "${GOALBOARD_TERMINAL_THEME_STORAGE_KEY}";
  const themeOptions = ["light", "dark", "system"];
  const densityOptions = ["standard", "compact"];
  const terminalThemeOptions = ["auto", "light", "dark"];
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const readTheme = () => {
    try {
      const value = localStorage.getItem(themeKey);
      return themeOptions.includes(value) ? value : "system";
    } catch {
      return "system";
    }
  };
  const readDensity = () => {
    try {
      const value = localStorage.getItem(densityKey);
      return densityOptions.includes(value) ? value : "standard";
    } catch {
      return "standard";
    }
  };
  const readTerminalTheme = () => {
    try {
      const value = localStorage.getItem(terminalThemeKey);
      return terminalThemeOptions.includes(value) ? value : "auto";
    } catch {
      return "auto";
    }
  };
  const applyTerminalTheme = (preference, persist = false) => {
    const next = terminalThemeOptions.includes(preference) ? preference : "auto";
    if (persist) {
      try { localStorage.setItem(terminalThemeKey, next); } catch {}
    }
    const resolved = next === "auto"
      ? (document.documentElement.dataset.resolvedTheme || (media.matches ? "dark" : "light"))
      : next;
    const previousResolved = document.documentElement.dataset.resolvedTerminalTheme;
    document.documentElement.dataset.terminalTheme = next;
    document.documentElement.dataset.resolvedTerminalTheme = resolved;
    document.querySelectorAll("[data-terminal-theme-option]").forEach((button) => {
      const selected = button.getAttribute("data-terminal-theme-option") === next;
      button.setAttribute("aria-pressed", String(selected));
    });
    if (previousResolved !== resolved) {
      window.dispatchEvent(new CustomEvent("goalboard:terminal-theme-change", { detail: { theme: resolved } }));
    }
  };
  const applyTheme = (preference, persist = false) => {
    const next = themeOptions.includes(preference) ? preference : "system";
    if (persist) {
      try { localStorage.setItem(themeKey, next); } catch {}
    }
    document.documentElement.dataset.theme = next;
    document.documentElement.dataset.resolvedTheme = next === "system" ? (media.matches ? "dark" : "light") : next;
    document.querySelectorAll("[data-theme-option]").forEach((button) => {
      const selected = button.getAttribute("data-theme-option") === next;
      button.setAttribute("aria-pressed", String(selected));
    });
    applyTerminalTheme(readTerminalTheme());
  };
  const applyDensity = (preference, persist = false) => {
    const next = densityOptions.includes(preference) ? preference : "standard";
    if (persist) {
      try { localStorage.setItem(densityKey, next); } catch {}
    }
    document.documentElement.dataset.density = next;
    document.querySelectorAll("[data-density-option]").forEach((button) => {
      const selected = button.getAttribute("data-density-option") === next;
      button.setAttribute("aria-pressed", String(selected));
    });
  };
  document.querySelectorAll("[data-theme-option]").forEach((button) => {
    button.addEventListener("click", () => {
      applyTheme(button.getAttribute("data-theme-option"), true);
      button.closest("details")?.removeAttribute("open");
    });
  });
  document.querySelectorAll("[data-density-option]").forEach((button) => {
    button.addEventListener("click", () => {
      applyDensity(button.getAttribute("data-density-option"), true);
    });
  });
  document.querySelectorAll("[data-terminal-theme-option]").forEach((button) => {
    button.addEventListener("click", () => {
      applyTerminalTheme(button.getAttribute("data-terminal-theme-option"), true);
    });
  });
  media.addEventListener?.("change", () => {
    if (readTheme() === "system") applyTheme("system");
  });
  window.addEventListener("storage", (event) => {
    if (event.key === themeKey) applyTheme(readTheme());
    if (event.key === densityKey) applyDensity(readDensity());
    if (event.key === terminalThemeKey) applyTerminalTheme(readTerminalTheme());
  });
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target instanceof Element ? event.target : null;
    const anchor = target?.closest("a[href]");
    if (!anchor || anchor.hasAttribute("download") || anchor.getAttribute("target")) return;
    const destination = new URL(anchor.href, location.href);
    if (destination.origin !== location.origin) return;
    if (destination.pathname === location.pathname && destination.search === location.search && destination.hash) return;
    document.body.dataset.navigationPending = "true";
    anchor.setAttribute("aria-busy", "true");
  }, true);
  window.addEventListener("pageshow", () => {
    delete document.body.dataset.navigationPending;
    document.querySelectorAll('a[aria-busy="true"]').forEach((anchor) => anchor.removeAttribute("aria-busy"));
  });
  applyTheme(readTheme());
  applyDensity(readDensity());
})();`;

/**
 * Calm Desktop
 *
 * This layer intentionally comes after the legacy page styles. It replaces
 * the visual world without changing GoalBoard's existing markup, state,
 * actions, or Runtime contracts.
 */
export const VISUAL_FOUNDATION_STYLES = `
  :root {
    color-scheme: light;
    --page: #f6f6f7;
    --paper: #ffffff;
    --ink: #19191b;
    --ink-soft: #424247;
    --muted: #62626b;
    --faint: #76767f;
    --line: #e8e8eb;
    --line-strong: #dcdce1;
    --rail: #f1f1f3;
    --blue: #5068b7;
    --blue-dark: #344b9b;
    --blue-soft: #e9edfb;
    --green: #347759;
    --green-soft: #edf6f0;
    --amber: #936b2d;
    --amber-soft: #f8f2e7;
    --red: #a64e51;
    --red-soft: #f9eeee;
    --terminal: #171719;
    --terminal-ink: #f1f1f3;
    --terminal-muted: #b5b5bd;
    --terminal-faint: #92929b;
    --terminal-border: #303036;
    --terminal-selection: #33405b;
    --action: #202023;
    --action-ink: #fbfbfc;
    --shadow-soft: 0 1px 2px rgba(25, 25, 31, .045), 0 4px 12px rgba(25, 25, 31, .035);
    --shadow-raised: 0 2px 5px rgba(25, 25, 31, .055), 0 10px 28px rgba(25, 25, 31, .06);
    --shadow: 0 12px 32px rgba(25, 25, 31, .095);
    --shadow-color: #19202c;
    --radius-item: 6px;
    --radius-control: 8px;
    --radius-surface: 10px;
    --font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  }

  html[data-resolved-theme="dark"] {
    color-scheme: dark;
    --page: #121214;
    --paper: #1b1b1e;
    --ink: #f0f0f2;
    --ink-soft: #c6c6cc;
    --muted: #96969f;
    --faint: #85858e;
    --line: #2b2b30;
    --line-strong: #38383f;
    --rail: #171719;
    --blue: #91a7f2;
    --blue-dark: #b1c0f6;
    --blue-soft: #292f46;
    --green: #78b391;
    --green-soft: #20332a;
    --amber: #d0a15b;
    --amber-soft: #372f22;
    --red: #e08386;
    --red-soft: #3b2528;
    --shadow-color: #000000;
    --terminal: #101012;
    --terminal-ink: #f0f0f2;
    --terminal-muted: #b5b5bd;
    --terminal-faint: #92929b;
    --terminal-border: #303036;
    --terminal-selection: #33405b;
    --action: #f0f0f2;
    --action-ink: #202023;
    --shadow-soft: 0 1px 2px rgba(0, 0, 0, .22), 0 5px 14px rgba(0, 0, 0, .14);
    --shadow-raised: 0 3px 7px rgba(0, 0, 0, .24), 0 13px 32px rgba(0, 0, 0, .18);
    --shadow: 0 22px 58px rgba(0, 0, 0, .38);
  }

  html[data-resolved-terminal-theme="light"] {
    --terminal: #fbfbfc;
    --terminal-ink: #202023;
    --terminal-muted: #65656e;
    --terminal-faint: #7b7b84;
    --terminal-border: #dedee3;
    --terminal-selection: #dce4f8;
  }

  html[data-resolved-terminal-theme="dark"] {
    --terminal: #101012;
    --terminal-ink: #f0f0f2;
    --terminal-muted: #b5b5bd;
    --terminal-faint: #92929b;
    --terminal-border: #303036;
    --terminal-selection: #33405b;
  }

  body {
    background: var(--page);
    color: var(--ink);
    font: 13px/1.5 var(--font);
    letter-spacing: -.003em;
  }

  body[data-navigation-pending="true"] { cursor: progress; }
  body[data-navigation-pending="true"]::before {
    content: "";
    position: fixed;
    z-index: 1000;
    top: 0;
    left: 0;
    width: 38%;
    height: 2px;
    background: var(--blue);
    transform-origin: left center;
    animation: goalboard-navigation-progress .7s ease-in-out infinite alternate;
    pointer-events: none;
  }
  body[data-navigation-pending="true"] a[aria-busy="true"] { color: var(--blue-dark); }
  @keyframes goalboard-navigation-progress {
    from { transform: scaleX(.45); opacity: .72; }
    to { transform: translateX(160%) scaleX(1.1); opacity: 1; }
  }

  svg { stroke-width: 1.7; }
  button, input, textarea, select { font-family: var(--font); }
  button:focus-visible, input:focus-visible, textarea:focus-visible,
  select:focus-visible, a:focus-visible, summary:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--blue), transparent 28%);
    outline-offset: 2px;
  }

  .app { grid-template-rows: 48px minmax(0, 1fr); }
  .topbar {
    border-bottom-color: var(--line);
    background: color-mix(in srgb, var(--paper) 94%, var(--rail));
    box-shadow: none;
    isolation: isolate;
    transform: translateZ(0);
  }
  .brand {
    min-width: 164px;
    padding: 0 20px;
    gap: 9px;
    border-right-color: var(--line);
  }
  .brand svg { width: 18px; height: 18px; font-size: 18px; stroke-width: 2; }
  .brand strong { font-size: 16px; font-weight: 680; letter-spacing: -.025em; }
  .project-context { padding: 0 12px 0 18px; color: var(--ink-soft); }
  .project-context strong, .project-context span { overflow: hidden; text-overflow: ellipsis; }
  .project-context a { color: var(--blue-dark); }
  .navigator-project {
    padding: 9px 10px 8px;
    border-bottom-color: var(--line);
    background: color-mix(in srgb, var(--paper) 58%, var(--rail));
    gap: 5px;
  }
  .navigator-project-primary > strong { color: var(--ink); font-size: 12px; font-weight: 680; letter-spacing: -.01em; }
  .top-action {
    height: 30px;
    margin-right: 8px;
    padding: 0 9px;
    border-radius: 8px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
  }
  a.top-action { color: var(--muted); }
  .top-action svg { width: 15px; height: 15px; font-size: 15px; }
  .locale-switch { margin-right: 6px; border-color: var(--line); border-radius: 9px; background: var(--paper); }
  .locale-switch a { border-radius: 7px; font-size: 11px; font-weight: 620; }

  .desktop-pane-header { display: none; }
  .goal-title-kicker { display: none; }

  body[data-desktop-shell="true"] .app { grid-template-rows: 42px minmax(0, 1fr); }
  body[data-desktop-shell="true"] .topbar {
    position: relative;
    min-height: 42px;
    padding-left: 88px;
    padding-bottom: 6px;
    background: color-mix(in srgb, var(--rail) 98%, var(--paper));
    -webkit-user-select: none;
    user-select: none;
  }
  body[data-desktop-shell="true"] .brand {
    position: absolute;
    left: 50%;
    z-index: 2;
    min-width: auto;
    height: 30px;
    padding: 0;
    gap: 6px;
    border-right: 0;
    transform: translateX(-50%);
  }
  body[data-desktop-shell="true"] .brand svg { width: 14px; height: 14px; color: var(--blue); display: block; }
  body[data-desktop-shell="true"] .brand strong { font-size: 12px; font-weight: 680; letter-spacing: -.01em; }
  body[data-desktop-shell="true"] .project-context {
    height: 28px;
    max-width: min(30vw, 360px);
    padding: 0 12px 0 0;
    border-left: 0;
    font-size: 11px;
  }
  body[data-desktop-shell="true"] .project-context strong { display: none; }
  body[data-desktop-shell="true"] .project-context span { font-weight: 620; }
  body[data-desktop-shell="true"] .project-context a { font-size: 10px; }
  body[data-desktop-shell="true"] .top-action,
  body[data-desktop-shell="true"] .theme-picker > summary { height: 26px; }
  body[data-desktop-shell="true"] .locale-switch a { min-height: 24px; }
  body[data-desktop-shell="true"] .top-action { margin-right: 6px; font-size: 11px; }

  body[data-desktop-shell="true"] .desktop-pane-header {
    min-width: 0;
    min-height: 56px;
    padding: 0 20px;
    border-bottom: 1px solid var(--line);
    background: var(--rail);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  body[data-desktop-shell="true"] .desktop-pane-header strong { font-size: 14px; font-weight: 680; letter-spacing: -.015em; }
  body[data-desktop-shell="true"] .desktop-pane-header small {
    min-width: 0;
    overflow: hidden;
    color: var(--faint);
    font-size: 9px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  body[data-desktop-shell="true"] .desktop-pane-header--navigator { min-height: 34px; padding-inline: 10px; }
  body[data-desktop-shell="true"] .desktop-pane-header--navigator strong { color: var(--muted); font-size: 10px; font-weight: 680; letter-spacing: .02em; }
  body[data-desktop-shell="true"] .tree-pane { grid-template-rows: auto 34px auto minmax(0, 1fr) 46px; }
  body[data-desktop-shell="true"] .document-pane { position: relative; }
  body[data-desktop-shell="true"] .document-pane > .desktop-pane-header {
    position: sticky;
    top: 0;
    z-index: 8;
    background: color-mix(in srgb, var(--paper) 96%, var(--rail));
  }
  @media (min-width: 1181px) {
    body[data-desktop-shell="true"] .workspace.is-desktop-tui {
      grid-template-columns: var(--tree-width, clamp(360px, 30vw, 480px)) 5px minmax(430px, 1fr) 5px var(--tui-width, clamp(440px, 37vw, 620px));
    }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui.is-graph-view,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui.is-graph-view.is-tui-collapsed,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui:has(> .tree-pane[data-navigator-view="graph"]) {
      grid-template-columns: minmax(620px, 1fr) 1px minmax(330px, 390px);
    }
  }
  body[data-desktop-shell="true"] .tree-chrome {
    padding: 10px 12px 9px;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 5px 7px;
  }
  body[data-desktop-shell="true"] .tree-search { grid-column: 1 / -1; grid-row: 1; }
  body[data-desktop-shell="true"] .navigator-view-switch { grid-column: 1; grid-row: 2; }
  body[data-desktop-shell="true"] .tree-tools { grid-column: 2; grid-row: 2; justify-content: flex-end; }
  body[data-desktop-shell="true"] .tree-tool { width: 26px; height: 26px; padding: 0; justify-content: center; }
  body[data-desktop-shell="true"] .tree-tool span,
  body[data-desktop-shell="true"] .tree-tool small { display: none; }
  body[data-desktop-shell="true"] .tree-scroll { padding: 8px 12px 18px; }
  body[data-desktop-shell="true"] .goal-status { min-height: 19px; padding: 0 5px; font-size: 10px; }
  body[data-desktop-shell="true"] .goal-status svg { width: 10px; height: 10px; }
  body[data-desktop-shell="true"] .tree-relations { margin-bottom: 3px; }
  body[data-desktop-shell="true"] .tree-relations > summary { min-height: 21px; padding-block: 1px; }
  body[data-desktop-shell="true"] .goal-document { width: 100%; padding: 23px 28px 52px; }
  body[data-desktop-shell="true"] .goal-header { padding-bottom: 18px; }
  body[data-desktop-shell="true"] .goal-title-kicker { min-height: 20px; margin-bottom: 4px; display: flex; align-items: center; }
  body[data-desktop-shell="true"] .goal-title-kicker .goal-status { background: transparent; padding-inline: 0; }
  body[data-desktop-shell="true"] .goal-title-row h1 { font-size: clamp(24px, 2vw, 30px); }
  body[data-desktop-shell="true"] .goal-title-actions .document-action--quick {
    width: 34px;
    min-width: 34px;
    padding: 0;
    justify-content: center;
  }
  body[data-desktop-shell="true"] .goal-title-actions .document-action--quick span { display: none; }
  body[data-desktop-shell="true"] .goal-workspace-nav {
    position: sticky;
    top: 0;
    right: auto;
    z-index: 6;
    margin: 0;
    padding: 0;
    border: 0;
    border-bottom: 1px solid var(--line);
    background: color-mix(in srgb, var(--paper) 96%, transparent);
    gap: 12px;
  }
  body[data-desktop-shell="true"] .goal-workspace-nav button {
    width: auto;
    min-width: 0;
    min-height: 34px;
    padding: 0 4px;
    border-radius: 0;
    font-size: 11px;
  }
  body[data-desktop-shell="true"] .goal-workspace-nav button svg { display: none; }
  body[data-desktop-shell="true"] .goal-workspace-nav button span { display: inline; }
  body[data-desktop-shell="true"] .goal-workspace-nav button::after { left: 2px; right: 2px; display: block; }
  body[data-desktop-shell="true"] .goal-workspace-nav button[aria-selected="true"] { background: transparent; }
  body[data-desktop-shell="true"] .goal-now { padding: 18px 0; }
  body[data-desktop-shell="true"] .goal-now-body { margin-top: 11px; }
  body[data-desktop-shell="true"] .goal-now-body > div > strong { font-size: 15px; }
  body[data-desktop-shell="true"] .goal-focus-criteria { padding: 18px 0 21px; }

  .theme-picker { position: relative; flex: 0 0 auto; }
  .theme-picker > summary { list-style: none; margin-right: 4px; cursor: pointer; }
  .theme-picker > summary::-webkit-details-marker { display: none; }
  .theme-picker > summary .theme-caret { width: 11px; height: 11px; transition: transform .16s ease; }
  .theme-picker[open] > summary { color: var(--blue-dark); background: var(--blue-soft); }
  .theme-picker[open] > summary .theme-caret { transform: rotate(180deg); }
  .theme-menu {
    position: absolute;
    z-index: 40;
    top: calc(100% + 7px);
    right: 4px;
    width: 166px;
    padding: 6px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    background: var(--paper);
    box-shadow: var(--shadow);
  }
  .theme-menu button {
    width: 100%;
    min-height: 34px;
    padding: 0 8px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--muted);
    display: grid;
    grid-template-columns: 17px minmax(0, 1fr) 15px;
    align-items: center;
    gap: 8px;
    text-align: left;
    cursor: pointer;
  }
  .theme-menu button:hover { color: var(--ink); background: var(--rail); }
  .theme-menu button[aria-pressed="true"] { color: var(--blue-dark); background: var(--blue-soft); }
  .theme-menu button > svg { width: 15px; height: 15px; }
  .theme-menu button .theme-check { opacity: 0; }
  .theme-menu button[aria-pressed="true"] .theme-check { opacity: 1; }

  .workspace { grid-template-columns: var(--tree-width, clamp(292px, 22vw, 380px)) 5px minmax(0, 1fr); }
  .workspace.is-desktop-tui {
    grid-template-columns: var(--tree-width, clamp(292px, 22vw, 380px)) 5px minmax(400px, 1fr) 5px var(--tui-width, min(36vw, 600px));
  }
  .workspace.is-graph-view,
  .workspace.is-desktop-tui.is-graph-view,
  .workspace.is-desktop-tui.is-graph-view.is-tui-collapsed {
    grid-template-columns: minmax(620px, 1fr) 5px minmax(310px, 370px);
  }
  .workspace.is-graph-view .tui-resizer,
  .workspace.is-graph-view .tui-pane,
  .workspace.is-graph-view .tui-expand { display: none; }
  .workbench-header {
    min-width: 0;
    border-bottom: 1px solid var(--line);
    background: var(--paper);
    display: none;
    align-items: center;
  }
  .workbench-switch {
    min-width: 0;
    padding: 3px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: color-mix(in srgb, var(--paper) 76%, var(--rail));
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .workbench-switch button {
    min-height: 28px;
    padding: 0 9px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--muted);
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font: 620 11px/1 var(--font);
    cursor: pointer;
  }
  .workbench-switch button svg { width: 12px; height: 12px; }
  .workbench-switch button:hover { color: var(--ink); }
  .workbench-switch button.is-active {
    color: var(--ink);
    background: var(--paper);
    box-shadow: 0 1px 4px rgba(22, 31, 43, .08);
  }
  .tree-pane {
    grid-template-rows: auto auto minmax(0, 1fr) 42px;
    border-right-color: var(--line);
    background: var(--rail);
  }
  .tree-chrome, .tree-footer {
    border-color: var(--line);
    background: var(--rail);
  }
  .tree-chrome { padding: 9px 10px 7px; gap: 5px; }
  .navigator-view-switch {
    width: fit-content;
    padding: 2px;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: color-mix(in srgb, var(--paper) 72%, var(--rail));
    display: grid;
    grid-template-columns: repeat(2, minmax(74px, 1fr));
    gap: 2px;
  }
  .navigator-view-switch button {
    min-height: 26px;
    padding: 0 8px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 10px;
    font-weight: 650;
    cursor: pointer;
  }
  .navigator-view-switch button svg { width: 12px; height: 12px; }
  .navigator-view-switch button.is-active { color: var(--ink); background: var(--paper); box-shadow: 0 1px 2px rgba(22, 31, 43, .08); }
  .tree-search input {
    height: 30px;
    border-color: var(--line);
    border-radius: 9px;
    background: var(--paper);
    color: var(--ink);
  }
  .tree-search kbd { border-color: var(--line); background: var(--paper); color: var(--faint); }
  .tree-scroll { padding: 8px 10px 16px; }
  .tree-children { margin-left: 14px; padding-left: 9px; border-left-color: color-mix(in srgb, var(--line-strong) 68%, transparent); }
  .tree-row { min-height: 38px; }
  .tree-toggle, .tree-guide { flex-basis: 18px; width: 18px; color: var(--faint); }
  .tree-toggle { border-radius: 6px; }
  .tree-toggle:hover { color: var(--ink-soft); background: color-mix(in srgb, var(--paper) 72%, transparent); }
  .tree-node {
    min-height: 36px;
    padding: 5px 8px;
    border-radius: 8px;
    color: var(--ink);
  }
  .tree-node:hover { background: color-mix(in srgb, var(--paper) 66%, transparent); }
  .tree-node.is-selected {
    color: var(--ink);
    background: color-mix(in srgb, var(--blue-soft) 86%, var(--paper));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--blue) 30%, transparent);
  }
  .tree-node.is-selected .tree-copy small { color: color-mix(in srgb, var(--blue-dark), var(--muted) 45%); }
  .tree-node.is-selected .goal-status { color: inherit; }
  .tree-copy { grid-template-columns: minmax(0, 1fr) auto; column-gap: 7px; align-items: baseline; }
  .tree-copy strong { font-size: 12.5px; font-weight: 610; }
  .tree-copy > small {
    display: block;
    max-width: min(38%, 220px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 9px;
    letter-spacing: 0;
  }
  .tree-progress {
    grid-column: 1 / -1;
    width: fit-content;
    margin-top: 3px;
    color: var(--muted);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 9px;
    font-variant-numeric: tabular-nums;
  }
  .tree-progress > i { width: 34px; height: 2px; overflow: hidden; background: var(--line-strong); }
  .tree-progress > i > b { display: block; width: var(--tree-progress); height: 100%; background: var(--green); }
  .tree-progress.is-blocked { color: var(--red); }
  .tree-progress.is-blocked > i > b { background: var(--red); }
  .tree-relations { margin: 0 0 5px 18px; color: var(--muted); }
  .tree-relations > summary {
    width: fit-content;
    max-width: calc(100% - 6px);
    min-height: 22px;
    padding: 1px 6px;
    border-radius: 7px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    list-style: none;
    cursor: pointer;
  }
  .tree-relations > summary::-webkit-details-marker { display: none; }
  .tree-relations > summary:hover { color: var(--ink-soft); background: color-mix(in srgb, var(--paper) 62%, transparent); }
  .tree-relations > summary svg { width: 10px; height: 10px; }
  .tree-relations > summary > svg:last-child { color: var(--faint); transition: transform .16s ease; }
  .tree-relations[open] > summary > svg:last-child { transform: rotate(180deg); }
  .tree-relations > summary strong { font-size: 10px; font-weight: 620; }
  .tree-relations > summary em { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 9px; font-style: normal; }
  .tree-relations.is-ready > summary em { color: var(--green); }
  .tree-relations.is-waiting > summary em { color: var(--amber); }
  .tree-relations.is-blocked > summary em { color: var(--red); }
  .tree-deps { margin: 2px 6px 6px 0; padding: 3px 0 2px 5px; border-left: 1px solid var(--line); }
  .tree-dep { min-height: 28px; padding: 3px 6px; align-items: center; }
  .tree-dep:hover { background: color-mix(in srgb, var(--blue-soft) 48%, transparent); }
  .tree-dep-copy { gap: 0; }
  .tree-dep-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-soft); font-size: 10px; }
  .tree-dep-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 9px; }
  .tree-dep > em { max-width: 84px; margin-left: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 9px; font-style: normal; }
  .tree-dep.is-waiting > em { color: var(--amber); }
  .tree-dep.is-ready > em { color: var(--green); }
  .tree-dep.is-blocked > em { color: var(--red); }
  .goal-status {
    min-height: 19px;
    padding: 1px 5px;
    gap: 4px;
    border-radius: 999px;
    background: color-mix(in srgb, currentColor 8%, transparent);
    font-size: 10px;
    font-weight: 650;
  }
  .goal-status svg { width: 11px; height: 11px; font-size: 11px; }
  .tree-footer { padding: 0 16px; color: var(--ink-soft); font-size: 11px; }

  .goal-navigator { min-width: 0; padding: 2px 0 18px; }
  .navigator-group { border-bottom: 1px solid var(--line); }
  .navigator-group:last-child { border-bottom: 0; }
  .navigator-group > header {
    height: 42px;
    padding: 0 8px;
    color: var(--muted);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .navigator-group > header > span { min-width: 0; display: inline-flex; align-items: center; gap: 8px; }
  .navigator-group > header i,
  .navigator-goal-leading i {
    width: 7px;
    height: 7px;
    border: 1.5px solid currentColor;
    border-radius: 50%;
    display: block;
  }
  .navigator-group > header strong { color: var(--ink-soft); font-size: 10px; font-weight: 680; letter-spacing: .045em; text-transform: uppercase; }
  .navigator-group > header small { color: var(--faint); font-size: 10px; font-variant-numeric: tabular-nums; }
  .navigator-group > header > svg { width: 12px; height: 12px; color: var(--faint); }
  .navigator-group > ul { list-style: none; margin: 0 0 7px; padding: 0; }
  .navigator-goal { min-width: 0; }
  .navigator-goal-row {
    width: 100%;
    min-width: 0;
    min-height: 44px;
    padding: 6px 8px 6px calc(8px + var(--navigator-depth, 0) * 14px);
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--ink-soft);
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 8px;
    text-align: left;
    cursor: pointer;
  }
  .navigator-goal-row:hover { color: var(--ink); background: color-mix(in srgb, var(--paper) 64%, transparent); }
  .navigator-goal-row.is-selected {
    color: var(--ink);
    background: var(--blue-soft);
    box-shadow: inset 2px 0 0 var(--blue);
  }
  .navigator-goal-leading { color: var(--faint); display: grid; place-items: center; }
  .navigator-goal-leading i { width: 8px; height: 8px; border-width: 1.5px; }
  .navigator-goal-row.is-selected .navigator-goal-leading { color: var(--blue); }
  .navigator-goal-copy { min-width: 0; display: flex; align-items: center; gap: 8px; }
  .navigator-goal-copy > strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 570; letter-spacing: -.008em; }
  .navigator-goal-copy .tree-progress { flex: 0 0 auto; margin: 0; }
  .navigator-goal-copy .tree-progress > i { display: none; }
  .navigator-relation-count { color: var(--faint); display: inline-flex; align-items: center; gap: 3px; font-size: 9px; }
  .navigator-relation-count svg { width: 10px; height: 10px; }
  .navigator-relation-count b { font-weight: 600; }
  .navigator-goal-row .goal-status { min-height: 19px; padding-inline: 6px; font-size: 10px; }
  .navigator-goal-row .goal-status svg { display: none; }
  .navigator-goal > .tree-relations { display: none; }
  .navigator-group--ready > header i { color: var(--green); background: var(--green); border-color: var(--green); }
  .navigator-group--active > header i { color: var(--amber); background: var(--amber); border-color: var(--amber); }
  .navigator-group--waiting > header i { color: var(--faint); }
  .navigator-group--blocked > header i { color: var(--red); background: var(--red); border-color: var(--red); }
  .navigator-group--done > header i { color: var(--faint); background: var(--faint); border-color: var(--faint); }

  html[data-resolved-theme="dark"] .navigator-goal-row:hover { background: color-mix(in srgb, var(--paper) 78%, var(--rail)); }
  html[data-resolved-theme="dark"] .navigator-goal-row.is-selected {
    background: color-mix(in srgb, var(--blue-soft) 88%, var(--paper));
  }

  .tree-pane[data-navigator-view="graph"] .tree-scroll { padding: 0; overflow: hidden; }
  .tree-pane[data-navigator-view="graph"] .goal-list-view { display: none; }
  .goal-graph {
    min-width: 0;
    height: 100%;
    background: var(--page);
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
  }
  .goal-graph[hidden] { display: none; }
  .graph-toolbar {
    min-height: 46px;
    padding: 7px 12px;
    border-bottom: 1px solid var(--line);
    background: var(--rail);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .graph-toolbar-copy { min-width: 0; margin-right: auto; display: grid; gap: 1px; }
  .graph-toolbar-copy strong { color: var(--ink); font-size: 12px; font-weight: 680; }
  .graph-toolbar-copy small { color: var(--muted); font-size: 9px; }
  body[data-desktop-shell="true"] .tree-pane[data-navigator-view="graph"] .graph-toolbar-copy { display: none; }
  .graph-relation-toggles { display: inline-flex; align-items: center; gap: 2px; }
  .graph-relation-toggles button,
  .graph-focus-toggle {
    min-height: 28px;
    padding: 0 8px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--paper);
    color: var(--muted);
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    font-weight: 620;
    cursor: pointer;
  }
  .graph-relation-toggles button:not(.is-active), .graph-focus-toggle:not(.is-active) { opacity: .52; }
  .graph-focus-toggle.is-active { color: var(--blue-dark); border-color: color-mix(in srgb, var(--blue), var(--line) 66%); background: var(--blue-soft); }
  .graph-focus-toggle svg { width: 12px; height: 12px; }
  .graph-zoom {
    min-height: 28px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--paper);
    display: inline-flex;
    align-items: center;
    overflow: hidden;
  }
  .graph-zoom button {
    width: 27px;
    height: 27px;
    padding: 0;
    border: 0;
    border-left: 1px solid var(--line);
    background: transparent;
    color: var(--muted);
    display: grid;
    place-items: center;
    font: 600 12px/1 var(--font);
    cursor: pointer;
  }
  .graph-zoom button:first-child { border-left: 0; }
  .graph-zoom button:hover { color: var(--ink); background: var(--rail); }
  .graph-zoom button:disabled { opacity: .35; cursor: default; }
  .graph-zoom button svg { width: 11px; height: 11px; }
  .graph-zoom output { width: 39px; color: var(--muted); text-align: center; font-size: 9px; font-variant-numeric: tabular-nums; }
  .graph-key { width: 8px; height: 8px; border: 1px solid currentColor; border-radius: 50%; display: inline-block; }
  .graph-key--parent { color: var(--blue); }
  .graph-key--dependency { color: var(--amber); }
  .graph-direction-note {
    min-height: 28px;
    padding: 0 13px;
    border-bottom: 1px solid var(--line);
    color: var(--muted);
    background: var(--paper);
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 9px;
  }
  .graph-direction-note svg { width: 11px; height: 11px; color: var(--blue); }
  .graph-viewport { min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; }
  .graph-stage {
    position: relative;
    width: max(100%, 860px);
    min-height: 100%;
    padding: 36px 22px 48px;
    display: grid;
    grid-template-columns: repeat(var(--graph-columns), minmax(74px, 1fr));
    grid-template-rows: repeat(var(--graph-visible-rows, var(--graph-rows)), 26px);
    column-gap: 12px;
    row-gap: 7px;
    align-items: center;
  }
  .graph-region {
    z-index: 0;
    align-self: stretch;
    min-width: 0;
    margin: -20px -12px -12px;
    border: 1px dashed color-mix(in srgb, var(--line-strong), transparent 20%);
    border-radius: 14px;
    background: color-mix(in srgb, var(--rail) 34%, transparent);
    pointer-events: none;
  }
  .graph-region > span {
    display: block;
    padding: 9px 11px;
    color: var(--muted);
    font-size: 9px;
    font-weight: 680;
    letter-spacing: .02em;
  }
  .graph-region--focus { grid-column: 1 / -1; grid-row: 1 / var(--graph-focus-end); border-color: color-mix(in srgb, var(--blue), var(--line) 72%); background: color-mix(in srgb, var(--blue-soft) 24%, transparent); }
  .graph-region--children { grid-column: 1 / -1; grid-row: var(--graph-children-start) / var(--graph-active-other-start, var(--graph-other-start)); }
  .graph-region--other { grid-column: 1 / -1; grid-row: var(--graph-active-other-start, var(--graph-other-start)) / -1; opacity: .7; }
  .graph-edges { z-index: 1; position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
  .graph-edge path { fill: none; stroke: var(--line-strong); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
  .graph-edge--part_of path { stroke: color-mix(in srgb, var(--blue), var(--line-strong) 30%); }
  .graph-edge--depends_on path { stroke: color-mix(in srgb, var(--amber), var(--line-strong) 22%); stroke-dasharray: 7 5; }
  .graph-arrow path { stroke: none; }
  .graph-arrow--part_of path { fill: color-mix(in srgb, var(--blue), var(--line-strong) 30%); }
  .graph-arrow--depends_on path { fill: color-mix(in srgb, var(--amber), var(--line-strong) 22%); }
  .graph-node {
    position: relative;
    z-index: 2;
    grid-column: var(--graph-column) / span var(--graph-column-span, 1);
    grid-row: var(--graph-row) / span 2;
    min-width: 0;
    min-height: 64px;
    padding: 9px 11px;
    border: 1px solid var(--line-strong);
    border-radius: 11px;
    background: color-mix(in srgb, var(--paper) 96%, var(--rail));
    color: var(--ink);
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr);
    align-items: start;
    gap: 5px 8px;
    text-align: left;
    box-shadow: 0 5px 16px rgba(22, 31, 43, .05);
    cursor: pointer;
  }
  .graph-node:hover { border-color: color-mix(in srgb, var(--blue), var(--line-strong) 45%); }
  .graph-node.is-selected { border-color: var(--blue); background: color-mix(in srgb, var(--blue-soft) 48%, var(--paper)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--blue), transparent 80%), 0 7px 22px rgba(22, 31, 43, .07); }
  .graph-node[data-graph-role="selected"] { min-height: 70px; padding: 10px 12px; }
  .graph-node-mark { width: 10px; height: 10px; margin-top: 3px; border: 1.5px solid var(--blue); border-radius: 50%; }
  .graph-node-copy { min-width: 0; display: grid; gap: 3px; }
  .graph-node-copy strong { overflow: hidden; color: var(--ink); font-size: 12px; font-weight: 650; line-height: 1.32; }
  .graph-node[data-graph-role="selected"] .graph-node-copy strong { font-size: 14px; }
  .graph-node-copy small {
    display: block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 9px;
    letter-spacing: 0;
  }
  .graph-node .goal-status { grid-column: 2; width: fit-content; min-height: 17px; padding: 0 5px; font-size: 9px; }
  .graph-node .goal-status svg { width: 10px; height: 10px; }
  .graph-node--satisfied .graph-node-mark,
  .graph-node--archived .graph-node-mark { border-color: var(--green); background: color-mix(in srgb, var(--green), transparent 78%); }
  .graph-node--execution-blocked .graph-node-mark,
  .graph-node--review-blocked .graph-node-mark,
  .graph-node--clarification-blocked .graph-node-mark,
  .graph-node--revalidation-blocked .graph-node-mark,
  .graph-node--invalidated .graph-node-mark { border-color: var(--red); background: color-mix(in srgb, var(--red), transparent 82%); }
  .graph-node[hidden], .graph-edge[hidden] { display: none; }
  .graph-legend {
    min-height: 36px;
    padding: 0 13px;
    border-top: 1px solid var(--line);
    background: var(--rail);
    color: var(--muted);
    display: flex;
    align-items: center;
    gap: 13px;
    font-size: 9px;
  }
  .graph-legend span { display: inline-flex; align-items: center; gap: 5px; }
  .graph-legend small { margin-left: auto; font-size: 9px; }

  .graph-stage {
    position: relative;
    width: 100%;
    min-width: 760px;
    min-height: max(100%, 620px);
    padding: 0;
    display: block;
  }
  .graph-orbit {
    position: absolute;
    z-index: 0;
    left: 50%;
    top: 50%;
    border: 1px solid color-mix(in srgb, var(--line-strong), transparent 28%);
    border-radius: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }
  .graph-orbit--inner { width: 48%; height: 40%; }
  .graph-orbit--middle { width: 78%; height: 68%; }
  .graph-orbit--outer { width: 92%; height: 84%; border-style: dashed; opacity: .72; }
  .graph-node {
    position: absolute;
    z-index: 2;
    left: var(--graph-x);
    top: var(--graph-y);
    width: 154px;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 10px;
    background: transparent;
    display: grid;
    grid-template-columns: 12px minmax(0, 1fr);
    align-items: center;
    gap: 7px;
    box-shadow: none;
    transform: translate(-50%, -50%);
  }
  .graph-node[data-graph-side="left"] { transform: translate(0, -50%); }
  .graph-node[data-graph-side="right"] { transform: translate(-100%, -50%); }
  .graph-node[data-graph-ring="1"] { transform: translate(-50%, -50%); }
  .graph-node:hover { border-color: transparent; }
  .graph-node:hover .graph-node-copy { background: var(--paper); box-shadow: 0 2px 10px rgba(22, 31, 43, .08); }
  .graph-node-mark {
    width: 12px;
    height: 12px;
    margin: 0;
    border-width: 2px;
    background: var(--paper);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--paper), transparent 24%);
  }
  .graph-node-copy {
    min-width: 0;
    padding: 5px 7px;
    border: 1px solid color-mix(in srgb, var(--line), transparent 22%);
    border-radius: 8px;
    background: color-mix(in srgb, var(--paper) 90%, transparent);
    display: block;
  }
  .graph-node-copy strong {
    display: -webkit-box;
    overflow: hidden;
    color: var(--ink);
    font-size: 11px;
    font-weight: 620;
    line-height: 1.32;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
  .graph-node .goal-status { display: none; }
  .graph-node.is-selected {
    width: 220px;
    min-height: 64px;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--blue), var(--line) 24%);
    background: var(--paper);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--blue), transparent 84%), 0 10px 28px rgba(22, 31, 43, .12);
  }
  .graph-node.is-selected .graph-node-copy { padding: 0; border: 0; background: transparent; }
  .graph-node.is-selected .graph-node-copy strong { font-size: 14px; font-weight: 680; }
  .graph-node.is-selected .goal-status { grid-column: 2; margin-top: 5px; display: inline-flex; }
  .graph-edge path { stroke-width: 1.45; opacity: .8; }
  .graph-edge--part_of path { stroke: color-mix(in srgb, var(--blue), var(--line-strong) 44%); }
  .graph-edge--depends_on path { stroke: color-mix(in srgb, var(--amber), var(--line-strong) 30%); stroke-dasharray: 5 5; }
  .graph-start circle { stroke-width: 1.6; }
  .graph-start--part_of circle { fill: var(--paper); stroke: color-mix(in srgb, var(--blue), var(--line-strong) 32%); }
  .graph-start--depends_on circle { fill: var(--paper); stroke: color-mix(in srgb, var(--amber), var(--line-strong) 24%); }
  .graph-edge:not(.is-selected-path) path { opacity: .46; }
  .graph-edge.is-selected-path path { stroke-width: 2.25; opacity: 1; }
  .graph-node.is-connected-path .graph-node-copy { border-color: color-mix(in srgb, var(--blue), var(--line) 46%); }
  .graph-node.is-path-source .graph-node-mark { box-shadow: 0 0 0 4px color-mix(in srgb, var(--amber), transparent 78%); }
  .graph-node.is-path-target .graph-node-mark { box-shadow: 0 0 0 4px color-mix(in srgb, var(--blue), transparent 78%); }
  .graph-direction-key i { width: 7px; height: 7px; border: 1.5px solid var(--muted); border-radius: 50%; }
  .graph-direction-key b { color: var(--muted); font-size: 11px; font-weight: 650; }
  html[data-resolved-theme="dark"] .graph-node-copy { background: color-mix(in srgb, var(--paper) 88%, transparent); }
  html[data-resolved-theme="dark"] .graph-node:hover .graph-node-copy,
  html[data-resolved-theme="dark"] .graph-node.is-selected { background: var(--paper); }

  .tree-resizer, .tui-resizer { background: var(--page); }
  .tree-resizer::after, .tui-resizer::after { background: var(--line); }
  .document-pane { background: var(--paper); }
  .document-pane[aria-busy="true"] > [data-goal-view] {
    opacity: 0;
    pointer-events: none;
    transition: opacity .12s ease;
  }
  .goal-document-loading {
    position: sticky;
    z-index: 9;
    top: 12px;
    width: fit-content;
    min-height: 32px;
    margin: 12px auto -44px;
    padding: 0 12px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    background: var(--paper);
    color: var(--ink-soft);
    box-shadow: 0 8px 24px color-mix(in srgb, var(--page) 76%, transparent);
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    font-weight: 620;
  }
  .goal-document-loading::before {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--blue);
    animation: pulse 1s ease-in-out infinite;
  }
  .goal-document { width: min(100%, 940px); padding: 22px 32px 56px; }
  .goal-header { padding-bottom: 13px; }
  .goal-title-row h1 { font-size: clamp(21px, 2vw, 27px); line-height: 1.18; letter-spacing: -.035em; }
  .goal-title-copy { min-width: 0; }
  .goal-title-outcome {
    max-width: 66ch;
    margin: 9px 0 0;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.55;
    letter-spacing: -.005em;
    white-space: pre-wrap;
  }
  .goal-more > summary, .goal-more > div { border-color: var(--line); background: var(--paper); }
  .goal-workspace-nav {
    margin: 0;
    padding: 0;
    border-top-color: var(--line);
    border-bottom-color: var(--line);
    background: color-mix(in srgb, var(--paper) 96%, transparent);
    backdrop-filter: none;
  }
  .goal-workspace-nav button { min-height: 40px; padding: 0 11px; font-size: 12px; font-weight: 600; }
  .goal-workspace-nav button::after { left: 11px; right: 11px; height: 1px; }
  .goal-focus-outcome {
    padding: 22px 0 20px;
    border-bottom: 1px solid var(--line);
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    gap: 10px;
  }
  .goal-focus-outcome > span { color: var(--blue); padding-top: 2px; }
  .goal-focus-outcome > span svg { width: 17px; height: 17px; }
  .goal-focus-outcome small { color: var(--muted); font-size: 11px; font-weight: 650; }
  .goal-focus-outcome p { max-width: 70ch; margin: 5px 0 0; color: var(--ink); font-size: 17px; line-height: 1.55; letter-spacing: -.015em; white-space: pre-wrap; }
  .goal-now {
    margin-top: 0;
    padding: 19px 0 18px;
    border: 0;
    border-bottom: 1px solid var(--line);
    border-radius: 0;
    background: transparent;
  }
  .goal-now-body {
    margin-top: 12px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px 18px;
  }
  .goal-now-body > div > strong { font-size: 16px; }
  .goal-now-body p { color: var(--ink-soft); }
  .goal-now-body small { display: block; margin-top: 5px; color: var(--muted); font-size: 10px; }
  .goal-now-body small b { margin-right: 4px; color: var(--ink-soft); }
  .goal-now-body .goal-primary-action { min-height: 34px; border-radius: 9px; white-space: nowrap; }
  .goal-now-blockers { border-top-color: color-mix(in srgb, var(--blue), var(--line) 72%); }
  .goal-now-blockers--clear { color: var(--muted); grid-template-columns: 180px minmax(0, 1fr); }
  .goal-now-blockers--clear > strong { color: var(--green); display: inline-flex; align-items: center; gap: 6px; }
  .goal-now-blockers--clear > strong svg { width: 13px; height: 13px; }
  .goal-now-blockers--clear p { margin: 0; color: var(--muted); font-size: 12px; }
  .goal-focus-criteria { padding: 19px 0 21px; border-bottom: 1px solid var(--line); }
  .goal-focus-criteria > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
  .goal-focus-criteria h2 { margin: 0; font-size: 15px; letter-spacing: -.015em; }
  .goal-focus-criteria header p { margin: 2px 0 0; color: var(--muted); font-size: 11px; }
  .goal-focus-criteria header > strong { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .goal-focus-criteria ul { list-style: none; margin: 10px 0 0; padding: 0; }
  .goal-focus-criteria li { min-height: 38px; padding: 7px 0; border-top: 1px solid var(--line); display: flex; align-items: flex-start; gap: 10px; }
  .goal-focus-criteria li > span:last-child { min-width: 0; display: grid; gap: 1px; }
  .goal-focus-criteria li > span:last-child > strong { font-size: 12px; font-weight: 620; }
  .goal-focus-criteria li small { color: var(--muted); font-size: 10px; }
  .goal-focus-criteria > a { width: fit-content; margin-top: 10px; color: var(--blue-dark); display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 650; text-decoration: none; }
  .goal-focus-criteria > a svg { width: 12px; height: 12px; }
  .goal-focus-criteria > a:hover { text-decoration: underline; }
  .goal-focus-context { padding: 19px 0 21px; border-bottom: 1px solid var(--line); }
  .goal-focus-context > header { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
  .goal-focus-context h2 { margin: 0; font-size: 15px; letter-spacing: -.015em; }
  .goal-focus-context header p { margin: 0; color: var(--muted); font-size: 10px; }
  .goal-focus-context dl { margin: 10px 0 0; }
  .goal-focus-context dl > div { min-height: 37px; border-top: 1px solid var(--line); display: grid; grid-template-columns: minmax(92px, 31%) minmax(0, 1fr); align-items: center; gap: 14px; }
  .goal-focus-context dt { color: var(--muted); font-size: 10px; }
  .goal-focus-context dd { margin: 0; overflow-wrap: anywhere; color: var(--ink-soft); font-size: 11px; }
  .companion-runtime { display: none; }
  .document-section { padding: 18px 0; border-bottom-color: var(--line); }
  .document-section h2, .document-subsection h3 { letter-spacing: -.015em; }
  .goal-purpose > section { padding: 12px 0; border-color: var(--line); }

  .tui-pane, .tui-tabs, .tui-owner { background: var(--rail); }
  .tui-pane { grid-template-rows: 58px 42px minmax(0, 1fr); }
  .tui-tabs { height: 42px; border-bottom-color: var(--line); }
  .tui-mode-label {
    height: 100%;
    padding: 0 8px;
    border-bottom: 1px solid var(--blue);
    color: var(--ink);
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    font-size: 11px;
    font-weight: 650;
  }
  .tui-stage { padding: 11px 12px 12px; gap: 9px; }
  .tui-tab.is-active { color: var(--ink); background: var(--paper); box-shadow: inset 0 0 0 1px var(--line); }
  .tui-owner {
    min-width: 0;
    padding: 9px 13px 8px;
    border-bottom: 1px solid var(--line);
    color: var(--muted);
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-content: center;
    gap: 2px 8px;
  }
  .tui-owner > strong { color: var(--ink); font-size: 14px; font-weight: 680; }
  .tui-owner > small { color: var(--blue-dark); font-size: 10px; font-weight: 650; }
  .tui-owner > span { grid-column: 1 / -1; min-width: 0; color: var(--muted); display: flex; align-items: center; gap: 6px; font-size: 10px; }
  .tui-owner > span i { width: 5px; height: 5px; border-radius: 50%; background: var(--green); flex: 0 0 auto; }
  .tui-owner > span b { font-weight: 600; }
  .tui-owner > span em { min-width: 0; overflow: hidden; color: var(--ink-soft); font-style: normal; text-overflow: ellipsis; white-space: nowrap; }
  .tui-menu {
    border-color: var(--line-strong);
    background: var(--paper);
    color: var(--ink);
    box-shadow: 0 16px 44px rgba(14, 18, 26, .18);
  }
  .tui-menu > strong { color: var(--ink); }
  .tui-menu input,
  .tui-menu select {
    border-color: var(--line-strong);
    background: color-mix(in srgb, var(--paper) 92%, var(--rail));
    color: var(--ink);
  }
  .tui-menu input::placeholder { color: var(--faint); }
  .tui-runtime-choices button,
  .tui-menu-actions button {
    border-color: var(--line-strong);
    background: color-mix(in srgb, var(--paper) 92%, var(--rail));
    color: var(--ink-soft);
  }
  .tui-runtime-choices button:hover,
  .tui-runtime-choices button.is-selected {
    border-color: color-mix(in srgb, var(--blue), var(--line-strong) 42%);
    background: var(--blue-soft);
    color: var(--blue-dark);
  }
  .tui-runtime-choices button:disabled {
    border-color: var(--line);
    background: var(--rail);
    color: var(--faint);
    opacity: .72;
  }
  .tui-menu-missing {
    border: 1px solid color-mix(in srgb, var(--amber), var(--line) 62%);
    background: var(--amber-soft);
    color: var(--amber);
  }
  .tui-chrome button { border-color: var(--line-strong); border-radius: 8px; background: var(--paper); }
  .tui-terminal { border-color: #2e3440; border-radius: 11px; box-shadow: inset 0 1px 0 rgba(255,255,255,.025); }
  .tui-empty { color: #89919f; }
  body[data-desktop-shell="true"] .tui-pane { grid-template-rows: 58px 42px minmax(0, 1fr); }
  body[data-desktop-shell="true"] .tui-owner { padding-inline: 18px; }
  body[data-desktop-shell="true"] .tui-owner > strong { font-size: 14px; }
  body[data-desktop-shell="true"] .tui-tabs { padding-inline: 12px 10px; }
  body[data-desktop-shell="true"] .tui-stage { padding: 12px 14px 14px; }
  body[data-desktop-shell="true"] .tui-chrome { padding: 0 2px; }
  body[data-desktop-shell="true"] .tui-terminal { border-radius: 10px; }

  @media (min-width: 1181px) and (max-width: 1320px) {
    body[data-desktop-shell="true"] .goal-title-row h1 { font-size: clamp(26px, 2.15vw, 30px); }
    body[data-desktop-shell="true"] .goal-now-body { grid-template-columns: minmax(0, 1fr); align-items: start; }
    body[data-desktop-shell="true"] .goal-now-body .goal-primary-action {
      grid-column: 1;
      width: fit-content;
      max-width: 100%;
      justify-self: start;
      white-space: normal;
    }
  }

  @container (max-width: 580px) {
    .goal-now-body { grid-template-columns: minmax(0, 1fr); align-items: start; }
    .goal-now-body .goal-primary-action {
      grid-column: 1;
      width: fit-content;
      max-width: 100%;
      justify-self: start;
      white-space: normal;
    }
  }

  html[data-resolved-theme="dark"] .topbar,
  html[data-resolved-theme="dark"] .tree-pane,
  html[data-resolved-theme="dark"] .tree-chrome,
  html[data-resolved-theme="dark"] .tree-footer,
  html[data-resolved-theme="dark"] .tui-pane,
  html[data-resolved-theme="dark"] .tui-tabs,
  html[data-resolved-theme="dark"] .tui-owner,
  html[data-resolved-theme="dark"] .settings-navigation,
  html[data-resolved-theme="dark"] .project-index-panel { background: var(--rail); }
  html[data-resolved-theme="dark"] .document-pane,
  html[data-resolved-theme="dark"] .goal-document,
  html[data-resolved-theme="dark"] .goal-workspace-nav,
  html[data-resolved-theme="dark"] .settings-document,
  html[data-resolved-theme="dark"] .theme-menu,
  html[data-resolved-theme="dark"] .dialog-shell { background: var(--paper); color: var(--ink); }
  html[data-resolved-theme="dark"] .locale-switch { background: var(--paper); }
  html[data-resolved-theme="dark"] .project-context,
  html[data-resolved-theme="dark"] .top-action,
  html[data-resolved-theme="dark"] a.top-action,
  html[data-resolved-theme="dark"] .tree-tool,
  html[data-resolved-theme="dark"] a.tree-tool,
  html[data-resolved-theme="dark"] .tree-footer,
  html[data-resolved-theme="dark"] .tree-dep-copy strong,
  html[data-resolved-theme="dark"] .goal-now-body p,
  html[data-resolved-theme="dark"] .goal-purpose p,
  html[data-resolved-theme="dark"] .business-copy,
  html[data-resolved-theme="dark"] .trash-summary,
  html[data-resolved-theme="dark"] .trash-restore-row,
  html[data-resolved-theme="dark"] .evidence-record p,
  html[data-resolved-theme="dark"] .relation-copy .relation-path,
  html[data-resolved-theme="dark"] .relation-authority small { color: var(--ink-soft); }
  html[data-resolved-theme="dark"] input,
  html[data-resolved-theme="dark"] textarea,
  html[data-resolved-theme="dark"] select,
  html[data-resolved-theme="dark"] .tree-filter,
  html[data-resolved-theme="dark"] .tree-search input,
  html[data-resolved-theme="dark"] .tree-search kbd,
  html[data-resolved-theme="dark"] .tui-tab.is-active,
  html[data-resolved-theme="dark"] .document-action,
  html[data-resolved-theme="dark"] .goal-meta,
  html[data-resolved-theme="dark"] .decision-record,
  html[data-resolved-theme="dark"] .decision-results,
  html[data-resolved-theme="dark"] .goal-tree-risk-options,
  html[data-resolved-theme="dark"] .decision-actions button:not(.button-primary) {
    border-color: var(--line-strong);
    background: color-mix(in srgb, var(--paper) 86%, var(--rail));
    color: var(--ink);
  }
  html[data-resolved-theme="dark"] .tree-filter-option,
  html[data-resolved-theme="dark"] .contract-diff-row,
  html[data-resolved-theme="dark"] .proposal-appendix,
  html[data-resolved-theme="dark"] .candidate-contract > div { border-color: var(--line); }
  html[data-resolved-theme="dark"] .decision-record-heading,
  html[data-resolved-theme="dark"] .decision-details > summary,
  html[data-resolved-theme="dark"] .decision-reason,
  html[data-resolved-theme="dark"] .decision-record > footer.decision-actions,
  html[data-resolved-theme="dark"] .decision-link-row,
  html[data-resolved-theme="dark"] .decision-results > header {
    border-color: var(--line);
    background: color-mix(in srgb, var(--rail) 76%, var(--paper));
    color: var(--ink);
  }
  html[data-resolved-theme="dark"] .decision-guidance {
    border-color: var(--line-strong);
    background: color-mix(in srgb, var(--paper) 88%, var(--rail));
  }
  html[data-resolved-theme="dark"] .decision-guidance > section { border-color: var(--line); }
  html[data-resolved-theme="dark"] .decision-recommendation.has-recommendation {
    background: color-mix(in srgb, var(--green-soft) 72%, var(--paper));
  }
  html[data-resolved-theme="dark"] .decision-details > summary,
  html[data-resolved-theme="dark"] .decision-kind,
  html[data-resolved-theme="dark"] .decision-link-row a,
  html[data-resolved-theme="dark"] .risk-decision > footer.decision-actions a { color: var(--blue-dark); }
  html[data-resolved-theme="dark"] .risk-decision-fact p,
  html[data-resolved-theme="dark"] .risk-decision-fact small { color: var(--ink-soft); }
  html[data-resolved-theme="dark"] .risk-state-preview {
    border-color: var(--blue);
    background: color-mix(in srgb, var(--blue-soft) 58%, var(--paper));
    color: var(--ink-soft);
  }
  html[data-resolved-theme="dark"] .decision-actions button:disabled {
    border-color: var(--line) !important;
    background: var(--page) !important;
    color: var(--faint) !important;
  }
  html[data-resolved-theme="dark"] .button-primary,
  html[data-resolved-theme="dark"] .button-primary:hover,
  html[data-resolved-theme="dark"] .planning-form footer button[type="submit"],
  html[data-resolved-theme="dark"] .runtime-plan-shell > footer .runtime-plan-apply,
  html[data-resolved-theme="dark"] .project-migration-form > footer .project-migration-submit {
    color: var(--page) !important;
  }
  html[data-resolved-theme="dark"] .navigator-view-switch,
  html[data-resolved-theme="dark"] .graph-toolbar,
  html[data-resolved-theme="dark"] .graph-legend { background: var(--rail); }
  html[data-resolved-theme="dark"] .navigator-view-switch button.is-active,
  html[data-resolved-theme="dark"] .graph-relation-toggles button,
  html[data-resolved-theme="dark"] .graph-node { background: var(--paper); color: var(--ink); }
  html[data-resolved-theme="dark"] .goal-factor-nav,
  html[data-resolved-theme="dark"] .relation-direction-control > div,
  html[data-resolved-theme="dark"] .relation-editor,
  html[data-resolved-theme="dark"] .relation-inactive-history,
  html[data-resolved-theme="dark"] .factor-advanced { border-color: var(--line-strong); background: var(--rail); }
  html[data-resolved-theme="dark"] .goal-factor-nav button { border-color: var(--line); background: transparent; color: var(--muted); }
  html[data-resolved-theme="dark"] .goal-factor-nav button:hover,
  html[data-resolved-theme="dark"] .goal-factor-nav button[aria-selected="true"] { background: var(--paper); color: var(--blue-dark); box-shadow: none; }
  html[data-resolved-theme="dark"] .goal-factor-nav button small { background: var(--line); color: var(--muted); }
  html[data-resolved-theme="dark"] .goal-factor-nav button[aria-selected="true"] small { background: var(--blue-soft); color: var(--blue-dark); }
  html[data-resolved-theme="dark"] .relation-group > header,
  html[data-resolved-theme="dark"] .relation-actions,
  html[data-resolved-theme="dark"] .risk-actions,
  html[data-resolved-theme="dark"] .impact-actions { background: var(--rail); }
  html[data-resolved-theme="dark"] .relation-kind { background: var(--line); color: var(--ink-soft); }
  html[data-resolved-theme="dark"] .relation-authority,
  html[data-resolved-theme="dark"] .relation-live-preview { border-color: color-mix(in srgb, var(--blue), var(--line) 68%); background: color-mix(in srgb, var(--blue-soft) 72%, var(--paper)); }
  html[data-resolved-theme="dark"] .tree-node:hover,
  html[data-resolved-theme="dark"] .tree-dep:hover { background: color-mix(in srgb, var(--blue-soft) 64%, transparent); }
  html[data-resolved-theme="dark"] .mobile-switch button.is-active { color: var(--blue-dark); background: transparent; box-shadow: none; }

  @media (max-width: 1120px) {
    .topbar .project-context > strong { display: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    body[data-navigation-pending="true"]::before,
    .goal-document-loading::before { animation: none; }
    .document-pane[aria-busy="true"] > [data-goal-view] { transition: none; }
  }

  @media (min-width: 761px) and (max-width: 1180px) {
    .workspace.is-desktop-tui,
    .workspace.is-desktop-tui.is-tui-collapsed {
      grid-template-columns: var(--tree-width, clamp(260px, 30vw, 320px)) 5px minmax(0, 1fr);
    }
    .workspace.is-desktop-tui .tui-resizer { display: none; }
    .workspace.is-desktop-tui .tui-pane {
      position: absolute;
      z-index: 12;
      top: 0;
      right: 0;
      bottom: 0;
      width: min(430px, 48vw);
      border-left: 1px solid var(--line-strong);
      box-shadow: -18px 0 42px rgba(21, 30, 43, .14);
    }
    .workspace.is-desktop-tui.is-tui-collapsed .tui-pane {
      visibility: hidden;
      pointer-events: none;
    }
    .workspace.is-desktop-tui .tui-expand {
      top: 50%;
      min-height: 104px;
      border-radius: 7px 0 0 7px;
      box-shadow: -8px 0 24px rgba(21, 30, 43, .12);
    }
    html[data-resolved-theme="dark"] .workspace.is-desktop-tui .tui-pane {
      box-shadow: -18px 0 48px rgba(0, 0, 0, .32);
    }
    .workspace.is-graph-view,
    .workspace.is-desktop-tui.is-graph-view,
    .workspace.is-desktop-tui.is-graph-view.is-tui-collapsed,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui:has(> .tree-pane[data-navigator-view="graph"]) {
      grid-template-columns: minmax(520px, 1fr) 5px minmax(300px, 36vw);
    }
  }

  @media (min-width: 761px) {
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] {
      grid-template-columns: minmax(0, 1fr) 5px minmax(330px, 32vw) !important;
    }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane {
      min-width: 0;
      grid-template-rows: auto 0 auto minmax(0, 1fr) 0;
    }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane > .navigator-project { grid-row: 1; }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane > .desktop-pane-header { grid-row: 2; }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane > .tree-chrome { grid-row: 3; }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane > .tree-scroll { grid-row: 4; }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane > .tree-footer { grid-row: 5; }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane > .desktop-pane-header,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-footer,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .graph-direction-note { display: none; }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .document-pane { min-width: 0; }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tui-resizer,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tui-pane,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tui-expand { display: none !important; }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui:has(> .tree-pane[data-navigator-view="graph"]) .tui-resizer,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui:has(> .tree-pane[data-navigator-view="graph"]) .tui-pane,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui:has(> .tree-pane[data-navigator-view="graph"]) .tui-expand { display: none; }
  }

  @media (min-width: 761px) {
    .workspace,
    .workspace.is-desktop-tui,
    .workspace.is-desktop-tui.is-tui-collapsed,
    .workspace.is-graph-view,
    .workspace.is-desktop-tui.is-graph-view,
    .workspace.is-desktop-tui.is-graph-view.is-tui-collapsed,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"],
    body[data-desktop-shell="true"] .workspace.is-desktop-tui:has(> .tree-pane[data-navigator-view="graph"]) {
      grid-template-columns: var(--tree-width, clamp(300px, 27vw, 400px)) 5px minmax(0, 1fr) !important;
      grid-template-rows: 50px minmax(0, 1fr);
    }
    .workspace > .tree-pane {
      grid-column: 1;
      grid-row: 1 / -1;
    }
    .workspace > .tree-resizer {
      grid-column: 2;
      grid-row: 1 / -1;
    }
    .workspace > .workbench-header {
      grid-column: 3;
      grid-row: 1;
      min-height: 50px;
      padding: 0 16px;
      display: flex;
    }
    body:not([data-desktop-shell="true"]) .workspace > .workbench-header {
      padding: 0 20px;
      background: var(--paper);
    }
    body:not([data-desktop-shell="true"]) .workbench-switch {
      align-self: stretch;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      gap: 18px;
    }
    body:not([data-desktop-shell="true"]) .workbench-switch button {
      position: relative;
      min-height: 49px;
      padding: 0 2px;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
    }
    body:not([data-desktop-shell="true"]) .workbench-switch button::after {
      content: "";
      position: absolute;
      right: 0;
      bottom: -1px;
      left: 0;
      height: 2px;
      border-radius: 2px 2px 0 0;
      background: transparent;
    }
    body:not([data-desktop-shell="true"]) .workbench-switch button.is-active { color: var(--ink); background: transparent; box-shadow: none; }
    body:not([data-desktop-shell="true"]) .workbench-switch button.is-active::after { background: var(--blue); }
    .workspace > .document-pane,
    .workspace > .goal-graph,
    .workspace > .tui-pane {
      grid-column: 3;
      grid-row: 2;
      min-width: 0;
      min-height: 0;
    }
    .workspace.is-desktop-tui > .tui-pane {
      position: relative !important;
      inset: auto !important;
      width: auto !important;
      border-left: 0;
      box-shadow: none !important;
    }
    .workspace > .tui-resizer,
    .workspace > .tui-expand { display: none !important; }
    .workspace[data-workspace-mode="focus"] > .goal-graph,
    .workspace[data-workspace-mode="focus"] > .tui-pane,
    .workspace[data-workspace-mode="graph"] > .document-pane,
    .workspace[data-workspace-mode="graph"] > .tui-pane,
    .workspace[data-workspace-mode="runtime"] > .document-pane,
    .workspace[data-workspace-mode="runtime"] > .goal-graph { display: none !important; }
    .workspace[data-workspace-mode="focus"] > .document-pane { display: block; }
    .workspace[data-workspace-mode="graph"] > .goal-graph { display: grid; }
    .workspace[data-workspace-mode="runtime"] > .tui-pane { display: grid; }
    .workspace[data-workspace-mode="graph"] > .workbench-header { display: none; }
    .workspace[data-workspace-mode="graph"] > .goal-graph { grid-row: 1 / -1; }
    body[data-desktop-shell="true"] .workspace[data-workspace-mode="graph"] .graph-toolbar-copy { display: none; }
    .tree-pane[data-navigator-view="graph"] .tree-scroll { padding: 8px 12px 18px; overflow: auto; }
    .tree-pane[data-navigator-view="graph"] .goal-list-view { display: block; }
    .navigator-view-switch { display: grid; }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane {
      grid-template-rows: auto 34px auto minmax(0, 1fr) 46px;
    }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane > .desktop-pane-header,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-footer,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .graph-direction-note { display: flex; }
    html[data-resolved-theme="dark"] .workbench-switch { background: var(--rail); }
    html[data-resolved-theme="dark"] .workbench-switch button.is-active { background: var(--paper); box-shadow: none; }
  }

  @media (max-width: 760px) {
    .app { grid-template-rows: 48px 44px minmax(0, 1fr); }
    body[data-desktop-shell="true"] .app { grid-template-rows: 44px 44px minmax(0, 1fr); }
    .topbar { min-width: 0; }
    .topbar[data-mobile-surface="document"] { transform: translateZ(.001px); }
    .brand { min-width: auto; padding: 0 12px; border-right: 0; }
    .brand strong { font-size: 15px; }
    .project-context { min-width: 0; padding: 0 8px; }
    .project-context span { max-width: 150px; }
    .top-spacer, body[data-desktop-shell="true"] .top-spacer { display: block; }
    .top-action { width: 30px; padding: 0; justify-content: center; }
    .top-action span, .theme-picker > summary span { display: none; }
    .theme-picker > summary .theme-caret { display: none; }
    .theme-menu { right: 0; }
    .mobile-switch {
      padding: 5px 8px;
      gap: 3px;
      border-bottom-color: var(--line);
      background: var(--rail);
    }
    .mobile-switch button {
      position: relative;
      min-height: 33px;
      border-radius: 0;
      color: var(--muted);
      font-size: 12px;
      font-weight: 620;
    }
    .mobile-switch button::after {
      content: "";
      position: absolute;
      left: 28%;
      right: 28%;
      bottom: -5px;
      height: 2px;
      border-radius: 1px;
      background: transparent;
    }
    .mobile-switch button.is-active { color: var(--blue-dark); background: transparent; box-shadow: none; }
    .mobile-switch button.is-active::after { background: var(--blue); }
    .workspace, .workspace.is-desktop-tui { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }
    .workspace.is-graph-view, .workspace.is-desktop-tui.is-graph-view { grid-template-columns: minmax(0, 1fr); }
    .tree-pane { border-right: 0; }
    body[data-desktop-shell="true"] .desktop-pane-header { display: none; }
    .workbench-header { display: none; }
    .workspace > .goal-graph { grid-column: 1; grid-row: 1; }
    body[data-desktop-shell="true"] .tree-pane { grid-template-rows: auto auto minmax(0, 1fr) 42px; }
    body[data-desktop-shell="true"] .goal-workspace-nav { display: none; }
    body[data-desktop-shell="true"] .goal-document { padding: 17px 18px 38px; }
    body[data-desktop-shell="true"] .goal-header { padding-bottom: 14px; }
    body[data-desktop-shell="true"] .goal-title-row { display: flex; align-items: flex-start; gap: 12px; }
    body[data-desktop-shell="true"] .goal-title-actions { flex: 0 0 auto; justify-content: flex-end; }
    body[data-desktop-shell="true"] .goal-title-row h1 { font-size: 18px; line-height: 1.28; letter-spacing: -.025em; }
    body[data-desktop-shell="true"] .goal-title-actions .document-action--quick span { display: none; }
    body[data-desktop-shell="true"] .goal-focus-outcome { display: none; }
    body[data-desktop-shell="true"] .goal-now {
      margin: 0;
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--rail);
    }
    body[data-desktop-shell="true"] .goal-now-body { margin-top: 10px; }
    body[data-desktop-shell="true"] .goal-now-body > div > strong { font-size: 14px; }
    body[data-desktop-shell="true"] .goal-now-body p { margin-top: 5px; }
    body[data-desktop-shell="true"] .goal-now-blockers { margin-top: 13px; padding-top: 11px; }
    body[data-desktop-shell="true"] .companion-runtime {
      margin-top: 14px;
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--paper);
      display: grid;
      gap: 10px;
    }
    body[data-desktop-shell="true"] .companion-runtime > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    body[data-desktop-shell="true"] .companion-runtime header small { color: var(--muted); font-size: 10px; font-weight: 650; }
    body[data-desktop-shell="true"] .companion-runtime h2 { margin: 2px 0 0; font-size: 15px; letter-spacing: -.015em; }
    body[data-desktop-shell="true"] .companion-runtime-state { color: var(--muted); display: inline-flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 650; }
    body[data-desktop-shell="true"] .companion-runtime-state i { width: 6px; height: 6px; border-radius: 50%; background: var(--faint); }
    body[data-desktop-shell="true"] .companion-runtime-state.is-active { color: var(--green); }
    body[data-desktop-shell="true"] .companion-runtime-state.is-active i { background: var(--green); }
    body[data-desktop-shell="true"] .companion-runtime > p { margin: 0; color: var(--ink-soft); font-size: 11px; }
    body[data-desktop-shell="true"] .companion-runtime-progress { display: flex; align-items: center; gap: 9px; }
    body[data-desktop-shell="true"] .companion-runtime-progress > i { height: 5px; min-width: 0; flex: 1; border-radius: 3px; background: var(--line); overflow: hidden; }
    body[data-desktop-shell="true"] .companion-runtime-progress b { width: var(--companion-progress); height: 100%; border-radius: inherit; background: var(--blue); display: block; }
    body[data-desktop-shell="true"] .companion-runtime-progress span { color: var(--muted); font-size: 10px; font-variant-numeric: tabular-nums; }
    body[data-desktop-shell="true"] .companion-runtime dl { margin: 0; padding-top: 9px; border-top: 1px solid var(--line); display: grid; grid-template-columns: 1fr 1fr; }
    body[data-desktop-shell="true"] .companion-runtime dl div { display: grid; gap: 2px; }
    body[data-desktop-shell="true"] .companion-runtime dt { color: var(--muted); font-size: 9px; }
    body[data-desktop-shell="true"] .companion-runtime dd { margin: 0; color: var(--ink); font-size: 11px; font-weight: 650; }
    body[data-desktop-shell="true"] .companion-runtime > button { width: fit-content; padding: 0; border: 0; background: transparent; color: var(--blue-dark); display: inline-flex; align-items: center; gap: 5px; font: 650 10px/1.2 var(--font); cursor: pointer; }
    body[data-desktop-shell="true"] .companion-runtime > button svg { width: 11px; height: 11px; }
    body[data-desktop-shell="true"] .goal-focus-criteria { margin-top: 3px; padding-top: 18px; }
    .navigator-view-switch { width: 100%; grid-template-columns: repeat(2, 1fr); }
    .graph-toolbar { flex-wrap: wrap; }
    .graph-toolbar-copy { flex-basis: 100%; }
    .graph-stage { min-width: 820px; padding-inline: 36px; }
    .graph-legend small { display: none; }
    .goal-document { padding: 18px 18px 44px; animation: none; }
    .goal-title-row h1 { font-size: 22px; }
    .goal-workspace-nav button { min-height: 38px; padding: 0 10px; font-size: 11px; }
    .goal-now { padding: 14px; }
    .tui-pane { grid-template-rows: 52px 38px minmax(0, 1fr); }
  }

  @media (min-width: 761px) {
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-chrome {
      padding: 4px 6px;
      gap: 2px 4px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-search input {
      height: 26px;
      border-radius: 5px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .navigator-view-switch {
      padding: 1px;
      border-radius: 6px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .navigator-view-switch button {
      min-height: 22px;
      border-radius: 4px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-scroll {
      padding: 2px 6px 8px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-children {
      margin-left: 8px;
      padding-left: 4px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-row {
      min-height: 27px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-toggle,
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-guide {
      width: 13px;
      height: 23px;
      flex-basis: 13px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-node {
      min-height: 25px;
      padding: 1px 4px;
      border-radius: 4px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-copy strong {
      font-size: 12px;
      font-weight: 570;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-copy {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-copy strong {
      min-width: 0;
      flex: 1;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-progress {
      flex: 0 0 auto;
      margin-top: 0;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-progress > i {
      display: none;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-node .goal-status {
      min-height: 16px;
      padding-inline: 0;
      border-color: transparent;
      border-radius: 0;
      background: transparent;
      font-size: 10px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-node .goal-status svg {
      display: none;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-relations {
      margin: 0 0 1px 13px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-relations > summary {
      min-height: 17px;
      padding-block: 0;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-deps {
      margin: 0 0 3px 13px;
      padding-block: 1px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-dep {
      min-height: 21px;
      padding-block: 1px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-footer {
      min-height: 30px;
      padding-inline: 8px;
      font-size: 10px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-document {
      width: min(100%, 1120px);
      padding: 11px 18px 30px;
      font-size: 12px;
      line-height: 1.5;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-header {
      padding-bottom: 6px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-title-kicker {
      min-height: 15px;
      margin-bottom: 1px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-title-row {
      gap: 8px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-title-row h1 {
      font-size: clamp(18px, 1.55vw, 23px);
      line-height: 1.2;
      letter-spacing: -.025em;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-title-outcome {
      margin-top: 3px;
      font-size: 12px;
      line-height: 1.4;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-workspace-nav {
      gap: 6px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-workspace-nav button {
      min-height: 28px;
      padding-inline: 3px;
      font-size: 10px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-focus-outcome {
      padding: 10px 0;
      gap: 6px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-focus-outcome p {
      margin-top: 2px;
      font-size: 13px;
      line-height: 1.42;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-now {
      padding: 9px 0;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-now-body {
      margin-top: 6px;
      gap: 6px 10px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-now-body > div > strong {
      font-size: 13px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-now-body small {
      margin-top: 2px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-now-blockers {
      margin-top: 6px;
      padding-top: 6px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-focus-criteria,
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-focus-context {
      padding: 9px 0 11px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-focus-criteria ul,
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-focus-context dl {
      margin-top: 5px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-focus-criteria li {
      min-height: 28px;
      padding: 3px 0;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-focus-context dl > div {
      min-height: 27px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .document-section {
      padding: 9px 0;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .section-heading {
      margin-bottom: 5px;
      gap: 5px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .section-heading h2,
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-technical > header strong {
      font-size: 14px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .section-heading p,
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-technical > header small {
      font-size: 10px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .document-subsection {
      margin-top: 7px;
      padding-top: 7px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-purpose > section {
      padding: 6px 0;
      gap: 8px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-technical {
      padding-top: 10px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-technical > header {
      padding-bottom: 7px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-technical-body {
      padding-bottom: 12px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .navigator-project {
      padding: 9px 10px 8px;
      gap: 4px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .navigator-project-primary {
      gap: 6px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .navigator-project-primary > strong {
      font-size: 13px;
    }
    html[data-density="compact"] body[data-desktop-shell="true"][data-board-view]:not([data-board-view="decisions"]) .tree-pane {
      grid-template-rows: auto 30px auto minmax(0, 1fr) 32px;
    }
    html[data-density="compact"] body[data-desktop-shell="true"][data-board-view]:not([data-board-view="decisions"]) .desktop-pane-header--navigator {
      min-height: 30px;
      padding-inline: 10px;
    }
    html[data-density="compact"] body[data-desktop-shell="true"][data-board-view]:not([data-board-view="decisions"]) .goal-document {
      padding: 10px 18px 30px;
    }
  }

  /* Quiet Paper visual replacement. Persistent hierarchy comes from calm
     surfaces and spacing; color is reserved for action, focus, and real state. */
  body {
    background: var(--page);
    color: var(--ink);
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  .topbar {
    border-bottom-color: transparent;
    background: var(--page);
  }
  .brand { border-right-color: transparent; }
  .brand svg { color: var(--ink); }
  .top-action,
  a.top-action {
    border-radius: var(--radius-control);
    color: var(--muted);
  }
  .top-action:hover,
  a.top-action:hover,
  .top-action.is-current,
  a.top-action.is-current {
    color: var(--ink);
    background: color-mix(in srgb, var(--ink) 6%, transparent);
  }
  body[data-desktop-shell="true"] .app { grid-template-rows: 44px minmax(0, 1fr); }
  body[data-desktop-shell="true"] .topbar {
    min-height: 44px;
    padding-bottom: 0;
    background: var(--page);
  }
  body[data-desktop-shell="true"] .brand svg { color: var(--ink-soft); }

  .workspace { background: var(--page); }
  .tree-pane,
  .tree-chrome,
  .tree-footer,
  .navigator-project,
  body[data-desktop-shell="true"] .desktop-pane-header--navigator {
    border-color: transparent;
    background: var(--rail);
  }
  .navigator-project {
    padding: 13px 14px 8px;
    gap: 4px;
  }
  .navigator-project-primary > strong {
    color: var(--ink);
    font-size: 13px;
    font-weight: 680;
  }
  body[data-desktop-shell="true"] .desktop-pane-header--navigator {
    min-height: 30px;
    padding-inline: 14px;
  }
  body[data-desktop-shell="true"] .desktop-pane-header--navigator strong {
    color: var(--faint);
    font-size: 10px;
    font-weight: 650;
    letter-spacing: .035em;
  }
  body[data-desktop-shell="true"] .tree-pane {
    grid-template-rows: auto 30px auto minmax(0, 1fr) 42px;
  }

  .tree-chrome { padding: 7px 10px 9px; }
  body[data-desktop-shell="true"] .tree-chrome { padding: 7px 12px 9px; }
  .tree-search input,
  input:not([type="checkbox"]):not([type="radio"]),
  textarea,
  select {
    border-color: transparent;
    border-radius: var(--radius-control);
    background: color-mix(in srgb, var(--paper) 68%, var(--rail));
    color: var(--ink);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .tree-search input { height: 32px; padding-inline: 30px 46px; }
  .tree-search kbd {
    border: 0;
    border-radius: 5px;
    background: transparent;
  }
  .navigator-view-switch,
  .workbench-switch {
    padding: 2px;
    border: 0;
    border-radius: var(--radius-control);
    background: color-mix(in srgb, var(--ink) 5%, transparent);
  }
  .navigator-view-switch button,
  .workbench-switch button { border-radius: 7px; }
  .navigator-view-switch button.is-active,
  .workbench-switch button.is-active {
    color: var(--ink);
    background: var(--paper);
    box-shadow: 0 1px 3px rgba(28, 29, 26, .08);
  }
  .tree-tool,
  a.tree-tool {
    border-color: transparent;
    border-radius: var(--radius-control);
    color: var(--muted);
    background: transparent;
  }
  .tree-tool:hover,
  a.tree-tool:hover {
    border-color: transparent;
    color: var(--ink);
    background: color-mix(in srgb, var(--ink) 6%, transparent);
  }
  .tree-scroll { padding-inline: 10px; }
  .tree-children { border-left-color: color-mix(in srgb, var(--ink) 9%, transparent); }
  .tree-node,
  .navigator-goal-row { border-radius: var(--radius-item); }
  .tree-node:hover,
  .navigator-goal-row:hover { background: color-mix(in srgb, var(--ink) 5%, transparent); }
  .tree-node.is-selected,
  .navigator-goal-row.is-selected {
    color: var(--ink);
    background: color-mix(in srgb, var(--ink) 7%, transparent);
    box-shadow: none;
  }
  .tree-node.is-selected .tree-copy small { color: var(--muted); }
  .navigator-goal-row.is-selected .navigator-goal-leading { color: var(--blue-dark); }
  .navigator-group { border-bottom-color: transparent; }
  .navigator-group + .navigator-group { margin-top: 3px; }
  .navigator-group > header { height: 36px; }
  .navigator-group > header strong { color: var(--muted); letter-spacing: .025em; }
  .tree-footer { padding-inline: 14px; color: var(--muted); }

  .tree-resizer,
  .tui-resizer { background: var(--page); }
  .tree-resizer::after,
  .tui-resizer::after { background: transparent; }
  .tree-resizer:hover::after,
  .tui-resizer:hover::after,
  .tree-resizer:focus-visible::after,
  .tui-resizer:focus-visible::after { background: var(--line-strong); }
  .document-pane {
    background: var(--paper);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  body[data-desktop-shell="true"] .goal-document {
    width: min(100%, 980px);
    margin-inline: auto;
    padding: 30px clamp(28px, 3.2vw, 48px) 68px;
  }
  body[data-desktop-shell="true"] .goal-header { padding-bottom: 20px; }
  body[data-desktop-shell="true"] .goal-title-row h1 {
    font-size: clamp(25px, 2vw, 31px);
    line-height: 1.18;
    letter-spacing: -.032em;
  }
  .goal-title-outcome { max-width: 72ch; color: var(--muted); }
  .document-action,
  .goal-more > summary {
    border-color: transparent;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--muted);
  }
  .document-action:hover,
  .goal-more > summary:hover {
    border-color: transparent;
    color: var(--ink);
    background: color-mix(in srgb, var(--ink) 5%, transparent);
  }
  body[data-desktop-shell="true"] .goal-workspace-nav,
  .goal-workspace-nav {
    width: fit-content;
    max-width: 100%;
    margin: 0 0 8px;
    padding: 3px;
    border: 0;
    border-radius: 10px;
    background: color-mix(in srgb, var(--ink) 5%, transparent);
    gap: 2px;
  }
  body[data-desktop-shell="true"] .goal-workspace-nav button,
  .goal-workspace-nav button {
    min-height: 31px;
    padding-inline: 11px;
    border-radius: 7px;
    color: var(--muted);
  }
  .goal-workspace-nav button::after { display: none !important; }
  body[data-desktop-shell="true"] .goal-workspace-nav button[aria-selected="true"],
  .goal-workspace-nav button[aria-selected="true"] {
    color: var(--ink);
    background: var(--paper);
    box-shadow: 0 1px 3px rgba(28, 29, 26, .09);
  }
  .goal-focus-outcome,
  .goal-now,
  .goal-focus-criteria,
  .goal-focus-context,
  .document-section { border-bottom-color: color-mix(in srgb, var(--line) 78%, transparent); }
  .goal-focus-outcome { padding-block: 25px 24px; }
  .goal-focus-outcome > span { color: var(--blue-dark); }
  .goal-focus-outcome p { max-width: 72ch; color: var(--ink); }
  .goal-now { padding-block: 23px; }
  .button-primary,
  .goal-primary-action,
  .planning-primary-action,
  .project-migration-submit,
  .runtime-plan-apply {
    border-color: var(--action) !important;
    border-radius: var(--radius-control) !important;
    background: var(--action) !important;
    color: var(--action-ink) !important;
    box-shadow: none !important;
  }
  .button-primary:hover,
  .goal-primary-action:hover,
  .planning-primary-action:hover,
  .project-migration-submit:hover,
  .runtime-plan-apply:hover { opacity: .88; }
  .goal-now-blockers { border-top-color: var(--line); }
  .goal-focus-criteria li,
  .goal-focus-context dl > div { border-top-color: color-mix(in srgb, var(--line) 78%, transparent); }
  .goal-focus-context dl {
    padding-block: 3px;
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
  }
  .goal-focus-context dl > div { border-top: 0; }

  .theme-menu,
  .tui-menu,
  .dialog-shell,
  .runtime-plan-dialog,
  .project-migration-dialog {
    border-color: var(--line);
    border-radius: var(--radius-surface);
    background: var(--paper);
    box-shadow: var(--shadow);
  }
  .theme-menu button { border-radius: 8px; }
  .theme-menu button[aria-pressed="true"] {
    color: var(--ink);
    background: color-mix(in srgb, var(--ink) 6%, transparent);
  }
  .tui-pane,
  .tui-tabs,
  .tui-owner { background: var(--rail); }
  .tui-tab.is-active {
    color: var(--ink);
    background: var(--paper);
    box-shadow: none;
  }
  .tui-mode-label { border-bottom-color: var(--ink-soft); }
  .tui-terminal { border-color: #30322f; border-radius: 12px; }

  .settings-content { background: var(--page); }
  .settings-navigation {
    margin: 8px 0 8px 8px;
    padding: 16px 10px;
    border: 0;
    border-radius: var(--radius-surface) 0 0 var(--radius-surface);
    background: var(--rail);
  }
  .settings-navigation a { border-radius: 8px; }
  .settings-navigation a:hover { background: color-mix(in srgb, var(--ink) 5%, transparent); }
  .settings-navigation a[aria-current="page"] {
    color: var(--ink);
    background: color-mix(in srgb, var(--ink) 7%, transparent);
    box-shadow: none;
  }
  .settings-content {
    margin: 8px 8px 8px 0;
    border-radius: 0 var(--radius-surface) var(--radius-surface) 0;
    background: var(--paper);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .settings-shell--standalone .settings-content {
    margin-left: 8px;
    border-radius: var(--radius-surface);
  }
  .settings-document { padding: 44px clamp(30px, 4vw, 56px) 84px; }
  .settings-heading { border-bottom-color: var(--line); }
  .preference-option {
    min-height: 88px;
    border-color: var(--line);
    border-radius: 12px;
    background: var(--paper);
  }
  .preference-option:hover,
  .preference-option[aria-pressed="true"],
  .preference-option[aria-current="true"] {
    border-color: var(--line-strong);
    color: var(--ink);
    background: color-mix(in srgb, var(--ink) 5%, var(--paper));
  }
  .preference-option .preference-check { color: var(--blue-dark); }
  .settings-record-action button,
  .settings-button,
  .settings-action-section button,
  .settings-import-row button,
  .project-record-tools form button,
  .service-action-row button {
    border-color: var(--line-strong);
    border-radius: var(--radius-control);
    color: var(--ink-soft);
    background: var(--paper);
  }
  .settings-record-action button:hover,
  .settings-button:hover,
  .settings-action-section button:hover,
  .settings-import-row button:hover,
  .project-record-tools form button:hover,
  .service-action-row button:hover {
    border-color: var(--line-strong);
    color: var(--ink);
    background: color-mix(in srgb, var(--ink) 5%, var(--paper));
  }
  .project-rules-intro {
    margin: 22px 0 18px;
    padding: 0 0 22px;
    border: 0;
    border-bottom: 1px solid var(--line);
    border-radius: 0;
    background: transparent;
  }
  .project-rules-intro ol { gap: 0; }
  .project-rules-intro li {
    padding: 9px 14px;
    border: 0;
    border-radius: 0;
    background: transparent;
  }
  .project-rules-intro li + li { border-left: 1px solid var(--line); }
  .project-rules-intro li > span:first-child {
    color: var(--ink-soft);
    background: color-mix(in srgb, var(--ink) 6%, transparent);
  }
  .policy-source {
    border-color: var(--line);
    border-radius: 12px;
  }
  .policy-source--goal { border-color: var(--line-strong); }
  .policy-source > summary,
  .policy-source--goal > summary {
    background: color-mix(in srgb, var(--paper) 42%, var(--rail));
  }
  .policy-mode-options label > span,
  .policy-toggle,
  .policy-counter { border-radius: var(--radius-control); }
  .policy-mode-options input:checked + span {
    border-color: var(--line-strong);
    background: color-mix(in srgb, var(--ink) 6%, var(--paper));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 8%, transparent);
  }
  .policy-form-group > header > span {
    color: var(--ink-soft);
    background: var(--rail);
  }

  .project-index-panel {
    border: 0;
    border-radius: 16px;
    background: var(--paper);
    box-shadow: var(--shadow);
    overflow: hidden;
  }
  .project-index-heading { border-bottom-color: var(--line); }
  .project-index-desktop-note {
    border: 0;
    border-radius: var(--radius-control);
    background: var(--rail);
    color: var(--ink-soft);
    font-weight: 520;
  }
  .project-list a:hover { background: color-mix(in srgb, var(--ink) 5%, var(--paper)); }
  .project-list a:hover svg { color: var(--ink); }
  .project-index-migration,
  .project-index-note { background: color-mix(in srgb, var(--paper) 42%, var(--rail)); }
  .project-index-start a,
  .project-index-migrate { border-radius: var(--radius-control); }
  .project-index-start a:first-child {
    border-color: var(--action);
    color: var(--action-ink);
    background: var(--action);
  }

  html[data-resolved-theme="dark"] .tree-node.is-selected,
  html[data-resolved-theme="dark"] .navigator-goal-row.is-selected,
  html[data-resolved-theme="dark"] .settings-navigation a[aria-current="page"] {
    background: color-mix(in srgb, var(--ink) 9%, transparent);
  }
  html[data-resolved-theme="dark"] .document-pane,
  html[data-resolved-theme="dark"] .settings-content { box-shadow: inset 0 0 0 1px var(--line); }

  @media (min-width: 761px) {
    body[data-board-view] .workspace { padding: 0 8px 8px; }
    body[data-board-view] .tree-pane {
      border-right: 0;
      border-radius: var(--radius-surface) 0 0 var(--radius-surface);
      overflow: hidden;
    }
    body[data-board-view] .document-pane {
      border-radius: var(--radius-surface);
      overflow: auto;
    }
    body[data-board-view] .tui-pane {
      border-left: 0;
      border-radius: 0 var(--radius-surface) var(--radius-surface) 0;
      overflow: hidden;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-document {
      width: min(100%, 1120px);
      padding: 14px 24px 36px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-workspace-nav {
      margin-bottom: 4px;
      padding: 2px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-workspace-nav button {
      min-height: 26px;
      padding-inline: 8px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .navigator-project { padding: 7px 9px 5px; }
  }

  @media (max-width: 760px) {
    .app { grid-template-rows: 48px 44px minmax(0, 1fr); }
    body[data-desktop-shell="true"] .app { grid-template-rows: 44px 44px minmax(0, 1fr); }
    body[data-board-view] .workspace { background: var(--paper); }
    .mobile-switch {
      border-bottom: 0;
      background: var(--page);
    }
    .mobile-switch button.is-active { color: var(--ink); }
    .mobile-switch button.is-active::after { background: var(--ink-soft); }
    .tree-pane,
    .document-pane,
    .tui-pane { border-radius: 0; box-shadow: none; }
    body[data-desktop-shell="true"] .goal-now,
    body[data-desktop-shell="true"] .companion-runtime {
      border-color: transparent;
      border-radius: 12px;
      background: var(--rail);
    }
    body[data-desktop-shell="true"] .goal-now-body {
      grid-template-columns: minmax(0, 1fr);
      align-items: start;
    }
    body[data-desktop-shell="true"] .goal-now-body .goal-primary-action {
      grid-column: 1;
      width: fit-content;
      max-width: 100%;
      justify-self: start;
      white-space: normal;
    }
    .settings-navigation,
    .settings-content,
    .settings-shell--standalone .settings-content {
      margin: 0;
      border-radius: 0;
      box-shadow: none;
    }
    .project-rules-intro li + li { border-left: 0; border-top: 1px solid var(--line); }
  }

  /* Calm Desktop visual replacement. The frame is structural, the Goal is
     the canvas, and hierarchy comes from type, alignment, and proportion. */
  body {
    background: var(--page);
    color: var(--ink);
    font-size: 13px;
    line-height: 1.52;
    letter-spacing: 0;
  }

  body[data-desktop-shell="true"] .app { grid-template-rows: 52px minmax(0, 1fr); }
  body[data-desktop-shell="true"] .topbar,
  .topbar {
    min-height: 52px;
    padding: 0;
    border-bottom: 1px solid var(--line);
    background: var(--paper);
    box-shadow: none;
  }
  body[data-desktop-shell="true"] .brand,
  .brand {
    position: static;
    min-width: var(--tree-width, clamp(292px, 24vw, 324px));
    height: 100%;
    padding: 0 18px;
    border-right: 0;
    gap: 8px;
    transform: none;
  }
  body[data-desktop-shell="true"] .brand svg,
  .brand svg { width: 17px; height: 17px; color: var(--ink); }
  body[data-desktop-shell="true"] .brand strong,
  .brand strong { font-size: 14px; font-weight: 720; letter-spacing: -.025em; }
  body[data-desktop-shell="true"] .project-context { display: none; }
  body[data-desktop-shell="true"] .top-action,
  body[data-desktop-shell="true"] .theme-picker > summary,
  .top-action,
  .theme-picker > summary {
    height: 32px;
    margin-right: 10px;
    padding-inline: 10px;
    border: 0;
    border-radius: 7px;
    color: var(--muted);
    background: transparent;
    font-size: 11px;
  }
  .top-action:hover,
  a.top-action:hover,
  .theme-picker > summary:hover {
    color: var(--ink);
    background: var(--rail);
  }

  body[data-board-view] .workspace,
  .workspace {
    padding: 0;
    background: var(--paper);
    grid-template-columns: var(--tree-width, clamp(292px, 24vw, 324px)) 4px minmax(0, 1fr);
  }
  body[data-desktop-shell="true"] .workspace.is-desktop-tui {
    grid-template-columns: var(--tree-width, clamp(292px, 24vw, 324px)) 4px minmax(420px, 1fr) 4px var(--tui-width, clamp(400px, 34vw, 560px));
  }
  body[data-desktop-shell="true"] .workspace.is-desktop-tui.is-tui-collapsed {
    grid-template-columns: var(--tree-width, clamp(292px, 24vw, 324px)) 4px minmax(0, 1fr) 0 0;
  }
  .tree-resizer,
  .tui-resizer { background: var(--line); }
  .tree-resizer::after,
  .tui-resizer::after { inset-inline: 1px; background: transparent; }
  .tree-resizer:hover,
  .tui-resizer:hover { background: var(--blue); }

  body[data-board-view] .tree-pane,
  .tree-pane {
    border: 0;
    border-radius: 0;
    background: var(--rail);
    overflow: hidden;
  }
  body[data-desktop-shell="true"] .tree-pane {
    grid-template-rows: auto 32px auto minmax(0, 1fr) 40px;
  }
  .navigator-project {
    min-height: 94px;
    padding: 13px 14px 11px;
    border: 0;
    border-bottom: 1px solid var(--line);
    border-radius: 0;
    background: var(--rail);
    gap: 4px;
  }
  .navigator-project-primary {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    align-items: center;
    gap: 6px 8px;
  }
  .navigator-project-primary > strong {
    min-width: 0;
    overflow: hidden;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: -.015em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  body[data-desktop-shell="true"] .desktop-pane-header--navigator {
    min-height: 32px;
    padding: 0 14px;
    border: 0;
    background: var(--rail);
  }
  body[data-desktop-shell="true"] .desktop-pane-header--navigator strong {
    color: var(--muted);
    font-size: 10px;
    font-weight: 650;
    letter-spacing: .03em;
  }

  .tree-chrome,
  body[data-desktop-shell="true"] .tree-chrome {
    padding: 7px 12px 10px;
    border: 0;
    border-bottom: 1px solid var(--line);
    background: var(--rail);
    gap: 7px;
  }
  .tree-search input,
  input:not([type="checkbox"]):not([type="radio"]),
  textarea,
  select {
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    background: var(--paper);
    color: var(--ink);
    box-shadow: none;
  }
  .tree-search input { height: 34px; padding-inline: 31px 45px; }
  .tree-search input::placeholder { color: var(--muted); opacity: 1; }
  .tree-search kbd { color: var(--muted); background: transparent; }
  .navigator-view-switch,
  .workbench-switch {
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    gap: 12px;
  }
  .navigator-view-switch button,
  .workbench-switch button {
    position: relative;
    min-height: 28px;
    padding: 0 1px;
    border-radius: 0;
    color: var(--muted);
    background: transparent;
    box-shadow: none;
  }
  .navigator-view-switch button::after,
  .workbench-switch button::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: -1px;
    height: 1px;
    background: transparent;
  }
  .navigator-view-switch button.is-active,
  .workbench-switch button.is-active {
    color: var(--ink);
    background: transparent;
    box-shadow: none;
  }
  .navigator-view-switch button.is-active::after,
  .workbench-switch button.is-active::after { background: var(--ink); }
  .tree-tool,
  a.tree-tool {
    width: 27px;
    height: 27px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
  }
  .tree-tool:hover,
  a.tree-tool:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 6%, transparent); }

  .tree-scroll { padding: 8px 9px 20px; }
  .tree-children { border-left-color: var(--line-strong); }
  .tree-node,
  .navigator-goal-row {
    min-height: 38px;
    border: 0;
    border-radius: 6px;
    background: transparent;
  }
  .tree-node {
    padding: 5px 7px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
  }
  .tree-node:hover,
  .navigator-goal-row:hover { background: color-mix(in srgb, var(--ink) 5%, transparent); }
  .tree-node.is-selected,
  .navigator-goal-row.is-selected {
    color: var(--ink);
    background: var(--paper);
    box-shadow: 0 1px 2px rgba(24, 24, 30, .08), inset 0 0 0 1px var(--line);
  }
  .tree-copy strong,
  .navigator-goal-copy strong { font-size: 13px; font-weight: 620; line-height: 1.35; letter-spacing: -.008em; }
  .tree-node.is-selected .tree-copy strong,
  .navigator-goal-row.is-selected .navigator-goal-copy strong { font-weight: 700; }
  .tree-node.is-selected .tree-copy small { color: var(--muted); }
  .tree-progress { height: auto; background: transparent; }
  .tree-progress > span { color: var(--muted); background: transparent; font-size: 10px; }
  .tree-progress > i { background: var(--line-strong); }
  .tree-progress > i > b { background: var(--blue); }
  .goal-status { --goal-status-tone: var(--ink-soft); }
  .goal-status,
  body[data-desktop-shell="true"] .goal-status {
    min-height: 22px;
    max-width: 100%;
    padding: 1px 7px;
    border: 1px solid color-mix(in srgb, var(--goal-status-tone) 28%, var(--line));
    border-radius: 6px;
    color: var(--goal-status-tone);
    background: color-mix(in srgb, var(--goal-status-tone) 7%, var(--paper));
    font-size: 10.5px;
    font-weight: 680;
    line-height: 1.2;
  }
  .goal-status > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .goal-status--clarifying,
  .goal-status--executing,
  .goal-status--reviewing,
  .goal-status--revalidating { --goal-status-tone: var(--blue); }
  .goal-status--clarification_pending,
  .goal-status--clarification_decision_pending,
  .goal-status--compound_closure_pending,
  .goal-status--handoff_pending,
  .goal-status--execution_pending,
  .goal-status--completion_pending,
  .goal-status--review_pending,
  .goal-status--revalidation_pending { --goal-status-tone: var(--blue-dark); }
  .goal-status--clarification_blocked,
  .goal-status--execution_blocked,
  .goal-status--completion_blocked,
  .goal-status--review_blocked,
  .goal-status--revalidation_blocked,
  .goal-status--invalidated { --goal-status-tone: var(--red); }
  .goal-status--waiting_children { --goal-status-tone: var(--ink-soft); }
  .goal-status--satisfied { --goal-status-tone: var(--green); }
  .goal-status--trashed,
  .goal-status--archived { --goal-status-tone: var(--muted); }
  .tree-node.is-selected .goal-status { color: var(--goal-status-tone); }
  .tree-relations > summary strong { font-size: 10.5px; }
  .tree-relations > summary em {
    min-height: 19px;
    padding: 1px 5px;
    border: 1px solid color-mix(in srgb, currentColor 24%, var(--line));
    border-radius: 5px;
    background: color-mix(in srgb, currentColor 6%, var(--rail));
    display: inline-flex;
    align-items: center;
    font-size: 10px;
    font-weight: 620;
  }
  .tree-relations > summary { color: var(--muted); }
  .tree-footer {
    padding: 0 14px;
    border: 0;
    border-top: 1px solid var(--line);
    background: var(--rail);
    color: var(--muted);
  }

  body[data-board-view] .document-pane,
  .document-pane {
    border: 0;
    border-radius: 0;
    background: var(--paper);
    box-shadow: none;
    overflow: auto;
  }
  body[data-desktop-shell="true"] .goal-workspace-nav,
  .goal-workspace-nav {
    position: sticky;
    top: 0;
    z-index: 7;
    width: 100%;
    min-height: 48px;
    margin: 0;
    padding: 0;
    border: 0;
    border-bottom: 1px solid var(--line);
    border-radius: 0;
    background: color-mix(in srgb, var(--paper) 96%, transparent);
    backdrop-filter: blur(12px);
    gap: 22px;
    justify-content: flex-start;
  }
  body[data-desktop-shell="true"] .goal-workspace-nav button,
  .goal-workspace-nav button {
    min-height: 48px;
    padding: 0;
    border-radius: 0;
    color: var(--muted);
    background: transparent;
    box-shadow: none;
    font-size: 12px;
    font-weight: 610;
  }
  body[data-desktop-shell="true"] .goal-workspace-nav button[aria-selected="true"],
  .goal-workspace-nav button[aria-selected="true"] {
    color: var(--ink);
    background: transparent;
    box-shadow: inset 0 -2px 0 var(--ink);
  }
  .goal-workspace-nav button:hover { color: var(--ink); background: transparent; }

  body[data-desktop-shell="true"] .goal-document,
  .goal-document {
    width: min(100%, 880px);
    margin: 0 auto;
    padding: 44px clamp(42px, 5vw, 66px) 88px;
  }
  body[data-desktop-shell="true"] .goal-header,
  .goal-header { padding-bottom: 24px; border: 0; }
  body[data-desktop-shell="true"] .goal-title-kicker,
  .goal-title-kicker { min-height: 20px; margin: 0 0 8px; }
  .goal-title-kicker .goal-status { color: var(--muted); }
  body[data-desktop-shell="true"] .goal-title-row h1,
  .goal-title-row h1 {
    max-width: 22em;
    margin: 0;
    font-size: clamp(27px, 2.25vw, 34px);
    line-height: 1.2;
    letter-spacing: -.035em;
    font-weight: 710;
  }
  .goal-title-outcome {
    max-width: 68ch;
    margin-top: 12px;
    color: var(--muted);
    font-size: 13.5px;
    line-height: 1.65;
  }
  .document-action,
  .goal-more > summary {
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--muted);
  }
  .document-action:hover,
  .goal-more > summary:hover { color: var(--ink); background: var(--rail); }

  .goal-focus-outcome,
  .goal-now,
  .goal-focus-criteria,
  .goal-focus-context,
  .document-section {
    border-color: var(--line);
    background: transparent;
  }
  .goal-now {
    margin: 8px 0 0;
    padding: 30px 0 32px;
    border: 0;
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
    border-radius: 0;
    display: grid;
    grid-template-columns: 124px minmax(0, 1fr);
    column-gap: 34px;
  }
  body[data-desktop-shell="true"] .goal-now { padding: 30px 0 32px; }
  .goal-now > header {
    grid-column: 1;
    align-self: start;
    display: grid;
    justify-items: start;
    gap: 8px;
  }
  .goal-now > header h2,
  .goal-focus-criteria h2,
  .goal-focus-context h2 {
    margin: 0;
    color: var(--ink);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: -.01em;
  }
  .goal-now-body {
    grid-column: 2;
    margin: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: 0;
  }
  .goal-now-body > div { gap: 5px; }
  .goal-now-body > div > strong { font-size: 17px; line-height: 1.35; letter-spacing: -.015em; }
  .goal-now-body p { max-width: 62ch; color: var(--ink-soft); }
  .goal-now-body small { max-width: 68ch; color: var(--muted); line-height: 1.55; }
  .goal-now-body .goal-primary-action {
    grid-column: 1;
    width: fit-content;
    margin-top: 17px;
    justify-self: start;
  }
  .goal-primary-action,
  .button-primary,
  .planning-primary-action,
  .project-migration-submit,
  .runtime-plan-apply {
    min-height: 38px;
    padding-inline: 14px;
    border: 1px solid var(--action) !important;
    border-radius: 8px !important;
    background: var(--action) !important;
    color: var(--action-ink) !important;
    box-shadow: none !important;
    font-weight: 680;
  }
  .goal-primary-action:hover,
  .button-primary:hover,
  .planning-primary-action:hover { opacity: .9; transform: translateY(-1px); }
  .goal-now-blockers { grid-column: 2; margin-top: 20px; border-top-color: var(--line); }

  .goal-focus-criteria,
  .goal-focus-context {
    padding: 30px 0 32px;
    display: grid;
    grid-template-columns: 124px minmax(0, 1fr);
    column-gap: 34px;
  }
  body[data-desktop-shell="true"] .goal-focus-criteria,
  body[data-desktop-shell="true"] .goal-focus-context { padding: 30px 0 32px; }
  .goal-focus-criteria > header,
  .goal-focus-context > header {
    grid-column: 1;
    align-self: start;
    display: grid;
    gap: 5px;
  }
  .goal-focus-criteria > header p,
  .goal-focus-context > header p { color: var(--muted); font-size: 10.5px; line-height: 1.45; }
  .goal-focus-criteria > header > strong { color: var(--muted); font-size: 11px; }
  .goal-focus-criteria > ul,
  .goal-focus-criteria > .empty-row,
  .goal-focus-criteria > a,
  .goal-focus-context > dl { grid-column: 2; }
  .goal-focus-criteria > ul { margin: 0; }
  .goal-focus-criteria li { padding: 12px 0; border-top: 1px solid var(--line); }
  .goal-focus-criteria li:first-child { border-top: 0; padding-top: 0; }
  .goal-focus-criteria > a { width: fit-content; margin-top: 14px; color: var(--blue-dark); font-size: 11px; font-weight: 650; }
  .goal-focus-context { border-bottom: 0; }
  .goal-focus-context dl {
    margin: 0;
    padding: 0;
    border: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 28px;
  }
  .goal-focus-context dl > div {
    min-height: 46px;
    padding: 9px 0;
    border: 0;
    border-top: 1px solid var(--line);
  }
  .goal-focus-context dl > div:nth-child(-n+2) { border-top: 0; padding-top: 0; }
  .goal-focus-context dt { color: var(--muted); font-size: 10px; }
  .goal-focus-context dd { color: var(--ink); font-size: 12px; font-weight: 610; }

  .tui-pane,
  body[data-board-view] .tui-pane {
    border: 0;
    border-radius: 0;
    background: var(--paper);
    color: var(--ink);
  }
  .tui-owner,
  .tui-tabs {
    background: color-mix(in srgb, var(--paper) 96%, var(--rail));
    border-color: var(--line);
  }
  .tui-owner small,
  .tui-tab { color: var(--muted); }
  .tui-tab.is-active { color: var(--ink); background: var(--rail); }
  .tui-stage { background: var(--paper); }
  .tui-parent-guard {
    padding: 14px 2px 16px;
    border: 0;
    border-bottom: 1px solid var(--line);
    border-radius: 0;
    background: transparent;
    gap: 12px;
  }
  .tui-parent-guard-copy p,
  .tui-child-choices > p,
  .tui-owner > span,
  .tui-child-choice small,
  .tui-status { color: var(--muted); }
  .tui-owner > strong,
  .tui-parent-guard-copy strong,
  .tui-child-choice strong { color: var(--ink); }
  .tui-child-choices { padding-left: 24px; gap: 0; }
  .tui-child-choice {
    padding: 10px 2px;
    border: 0;
    border-top: 1px solid var(--line);
    border-radius: 0;
    background: transparent;
    color: var(--ink);
  }
  .tui-child-choice:hover { border-color: var(--line-strong); background: var(--rail); }
  .tui-chrome button {
    border-color: var(--line-strong);
    background: var(--paper);
    color: var(--ink-soft);
  }
  .tui-chrome button:hover:not(:disabled) { border-color: var(--line-strong); background: var(--rail); color: var(--ink); }
  .tui-chrome button:disabled { border-color: var(--line); background: transparent; color: var(--faint); }
  .tui-pane[data-tui-read-only="true"] .tui-chrome { opacity: 1; }
  .tui-chrome button:disabled,
  .tui-chrome .tui-advance:disabled {
    border-color: var(--line);
    background: var(--rail);
    color: var(--faint);
  }
  .tui-terminal {
    border-color: var(--terminal-border);
    border-radius: 8px;
    background: var(--terminal);
    color: var(--terminal-ink);
  }
  .tui-empty { color: var(--terminal-muted); }
  .tui-empty strong { color: var(--terminal-ink); }
  .tui-empty-mark { color: var(--terminal-faint); }

  .theme-menu,
  .tui-menu,
  .dialog-shell,
  .runtime-plan-dialog,
  .project-migration-dialog {
    border: 1px solid var(--line-strong);
    border-radius: 10px;
    background: var(--paper);
    box-shadow: var(--shadow);
  }
  .theme-menu button { border-radius: 6px; }
  .theme-menu button[aria-pressed="true"] { color: var(--ink); background: var(--rail); }

  .settings-shell,
  .settings-content { background: var(--paper); }
  .settings-navigation {
    margin: 0;
    padding: 28px 12px;
    border: 0;
    border-right: 1px solid var(--line);
    border-radius: 0;
    background: var(--rail);
  }
  .settings-navigation a { border-radius: 6px; }
  .settings-navigation a:hover { background: color-mix(in srgb, var(--ink) 5%, transparent); }
  .settings-navigation a[aria-current="page"] {
    color: var(--ink);
    background: var(--paper);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .settings-content,
  .settings-shell--standalone .settings-content {
    margin: 0;
    border: 0;
    border-radius: 0;
    background: var(--paper);
    box-shadow: none;
  }
  .settings-document { width: min(100%, 880px); margin: 0 auto; padding: 52px clamp(38px, 5vw, 64px) 90px; }
  .settings-heading { border-bottom-color: var(--line); }
  .preference-option {
    min-height: 84px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--paper);
  }
  .preference-option:hover,
  .preference-option[aria-pressed="true"],
  .preference-option[aria-current="true"] {
    border-color: var(--line-strong);
    color: var(--ink);
    background: var(--rail);
  }
  .preference-option .preference-check { color: var(--blue-dark); }

  .project-index-page { background: var(--page); }
  .project-index-panel {
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }
  .project-index-heading { border: 0; }
  .project-index-desktop-note { border: 0; background: transparent; }
  .project-index-migration { border: 0; background: color-mix(in srgb, var(--rail) 78%, var(--page)); }
  .project-index-note { border: 0; background: transparent; }

  html[data-resolved-theme="dark"] .tree-node.is-selected,
  html[data-resolved-theme="dark"] .navigator-goal-row.is-selected,
  html[data-resolved-theme="dark"] .settings-navigation a[aria-current="page"] {
    background: #232327;
    box-shadow: inset 0 0 0 1px var(--line-strong);
  }
  html[data-resolved-theme="dark"] .goal-workspace-nav { background: color-mix(in srgb, var(--paper) 96%, transparent); }

  @media (min-width: 761px) and (max-width: 1080px) {
    body[data-desktop-shell="true"] .goal-document { padding-inline: 36px; }
    .goal-now,
    .goal-focus-criteria,
    .goal-focus-context { grid-template-columns: 104px minmax(0, 1fr); column-gap: 24px; }
  }

  @media (min-width: 761px) {
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .workspace {
      --tree-width: clamp(276px, 22vw, 304px);
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .navigator-project { min-height: 82px; padding-block: 9px 8px; }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-chrome { padding-block: 5px 7px; }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-search input { height: 30px; }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-node,
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .navigator-goal-row { min-height: 32px; }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-node { padding-block: 3px; }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-status {
      min-height: 20px;
      padding-inline: 6px;
      border: 1px solid color-mix(in srgb, var(--goal-status-tone) 28%, var(--line));
      border-radius: 5px;
      background: color-mix(in srgb, var(--goal-status-tone) 7%, var(--paper));
      font-size: 10px;
    }
    html[data-density="compact"] body[data-desktop-shell="true"][data-board-view]:not([data-board-view="decisions"]) .tree-node .goal-status {
      min-height: 20px;
      padding-inline: 6px;
      border: 1px solid color-mix(in srgb, var(--goal-status-tone) 28%, var(--line));
      border-radius: 5px;
      background: color-mix(in srgb, var(--goal-status-tone) 7%, var(--paper));
      font-size: 10px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-progress > span { display: none; }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-progress > i {
      width: 24px;
      height: 2px;
      display: block;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-document {
      width: min(100%, 960px);
      padding: 28px 42px 64px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-title-row h1 { font-size: clamp(24px, 1.9vw, 29px); }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-now,
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-focus-criteria,
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-focus-context { padding-block: 22px 24px; }
  }

  @media (max-width: 760px) {
    body[data-desktop-shell="true"] .app,
    .app { grid-template-rows: 48px 44px minmax(0, 1fr); }
    body[data-desktop-shell="true"] .brand,
    .brand { min-width: 0; padding-inline: 14px; border-right: 0; }
    body[data-board-view] .workspace,
    .workspace { grid-template-columns: 1fr; }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui.is-tui-collapsed,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui.is-graph-view,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui:has(> .tree-pane[data-navigator-view="graph"]) {
      grid-template-columns: minmax(0, 1fr);
    }
    body[data-desktop-shell="true"] .tree-pane {
      grid-template-rows: auto auto minmax(0, 1fr) 42px;
    }
    .tree-chrome,
    body[data-desktop-shell="true"] .tree-chrome { align-content: start; }
    .mobile-switch { border-bottom: 1px solid var(--line); background: var(--paper); }
    .mobile-switch button.is-active::after { background: var(--ink); }
    body[data-desktop-shell="true"] .goal-workspace-nav,
    .goal-workspace-nav { min-height: 44px; padding-inline: 16px; gap: 18px; }
    body[data-desktop-shell="true"] .goal-workspace-nav button,
    .goal-workspace-nav button { min-height: 44px; }
    body[data-desktop-shell="true"] .goal-document,
    .goal-document { width: 100%; padding: 24px 20px 60px; }
    body[data-desktop-shell="true"] .goal-title-row h1,
    .goal-title-row h1 { max-width: none; font-size: 23px; }
    .goal-now,
    .goal-focus-criteria,
    .goal-focus-context {
      padding-block: 24px;
      grid-template-columns: 1fr;
      gap: 17px;
    }
    body[data-desktop-shell="true"] .goal-now,
    body[data-desktop-shell="true"] .goal-focus-criteria,
    body[data-desktop-shell="true"] .goal-focus-context {
      padding: 24px 0;
      border-radius: 0;
      background: transparent;
    }
    .goal-now > header,
    .goal-now-body,
    .goal-now-blockers,
    .goal-focus-criteria > header,
    .goal-focus-criteria > ul,
    .goal-focus-criteria > .empty-row,
    .goal-focus-criteria > a,
    .goal-focus-context > header,
    .goal-focus-context > dl { grid-column: 1; }
    .goal-focus-criteria > header p,
    .goal-focus-context > header p { max-width: 34ch; }
    .goal-focus-context dl { grid-template-columns: 1fr; }
    .goal-focus-context dl > div:nth-child(2) { border-top: 1px solid var(--line); padding-top: 9px; }
    .settings-navigation { border-right: 0; border-bottom: 1px solid var(--line); }
    .settings-document { padding: 30px 20px 64px; }
  }

  @container (max-width: 380px) {
    .tree-node .goal-status { max-width: 112px; }
    .tree-node .goal-status > span { white-space: nowrap; }
  }

  /* Project identity leads; utilities fit the title instead of claiming a row. */
  .navigator-project {
    min-height: 68px;
    padding: 10px 12px 8px;
    gap: 5px;
  }
  .navigator-project-primary {
    grid-template-columns: 18px minmax(0, 1fr) auto;
    gap: 8px;
  }
  html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .navigator-project {
    min-height: 62px;
    padding-block: 7px 6px;
  }

  /* The overview reads as work first, context second. */
  .goal-focus-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }
  .goal-focus-main,
  .goal-focus-aside { min-width: 0; }
  .goal-now {
    margin: 8px 0 0;
    padding: 20px 22px 22px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: color-mix(in srgb, var(--rail) 76%, var(--paper));
    display: block;
  }
  body[data-desktop-shell="true"] .goal-now { padding: 20px 22px 22px; }
  .goal-now > header {
    display: flex;
    align-items: center;
    justify-content: flex-start;
  }
  .goal-now > header h2 { font-size: 12px; color: var(--muted); }
  .goal-now-body {
    margin-top: 13px;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }
  .goal-now-body > div > strong { font-size: 16px; }
  .goal-now-body p { margin-top: 4px; }
  .goal-now-body small { margin-top: 5px; }
  .goal-now-body .goal-primary-action {
    grid-column: 1;
    width: fit-content;
    max-width: 11rem;
    min-height: 34px;
    margin-top: 14px;
    padding-inline: 12px;
    justify-self: start;
    white-space: nowrap;
  }
  .goal-now-blockers {
    grid-column: auto;
    margin: 18px 0 0;
    padding-top: 14px;
  }
  .goal-focus-criteria {
    padding: 27px 0 4px;
    border: 0;
    display: block;
  }
  body[data-desktop-shell="true"] .goal-focus-criteria { padding: 27px 0 4px; }
  .goal-focus-criteria > header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
  }
  .goal-focus-criteria > header p { margin-top: 4px; font-size: 11px; }
  .goal-focus-criteria > ul,
  .goal-focus-criteria > .empty-row,
  .goal-focus-criteria > a { grid-column: auto; }
  .goal-focus-criteria > ul { margin-top: 15px; }
  .goal-focus-criteria li { min-height: 44px; padding: 10px 0; }
  .goal-focus-criteria li > span:last-child > strong { font-size: 12.5px; line-height: 1.45; }
  .goal-focus-criteria li small { margin-top: 2px; font-size: 10.5px; line-height: 1.45; }
  .goal-focus-criteria > a { margin-top: 12px; }
  .goal-focus-aside {
    margin-top: 28px;
    padding-top: 24px;
    border-top: 1px solid var(--line);
  }
  .goal-focus-context {
    padding: 0;
    border: 0;
    display: block;
  }
  body[data-desktop-shell="true"] .goal-focus-context { padding: 0; }
  .goal-focus-context > header {
    display: block;
  }
  .goal-focus-context > header p { max-width: 34ch; margin-top: 4px; line-height: 1.45; }
  .goal-focus-context > dl {
    margin-top: 13px;
    padding: 0;
    border: 0;
    display: grid;
    grid-template-columns: 1fr;
  }
  .goal-focus-context dl > div,
  .goal-focus-context dl > div:nth-child(-n+2),
  .goal-focus-context dl > div:nth-child(2) {
    min-height: 36px;
    padding: 8px 0;
    border-top: 1px solid var(--line);
    display: grid;
    grid-template-columns: minmax(72px, 36%) minmax(0, 1fr);
    align-items: baseline;
    gap: 10px;
  }
  .goal-focus-context dt { font-size: 10px; }
  .goal-focus-context dd { font-size: 11px; font-weight: 620; text-align: right; }
  body[data-desktop-shell="true"] .goal-focus-aside .companion-runtime,
  .goal-focus-aside .companion-runtime {
    margin-top: 24px;
    padding: 15px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--rail);
    display: grid;
    gap: 10px;
  }
  .goal-focus-aside .companion-runtime > header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }
  .goal-focus-aside .companion-runtime header small { color: var(--muted); font-size: 9.5px; font-weight: 650; }
  .goal-focus-aside .companion-runtime h2 { margin: 2px 0 0; font-size: 14px; letter-spacing: -.015em; }
  .goal-focus-aside .companion-runtime-state {
    color: var(--muted);
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 9.5px;
    font-weight: 650;
    white-space: nowrap;
  }
  .goal-focus-aside .companion-runtime-state i { width: 6px; height: 6px; border-radius: 50%; background: var(--faint); }
  .goal-focus-aside .companion-runtime-state.is-active { color: var(--green); }
  .goal-focus-aside .companion-runtime-state.is-active i { background: var(--green); }
  .goal-focus-aside .companion-runtime > p { margin: 0; color: var(--ink-soft); font-size: 10.5px; line-height: 1.5; }
  .goal-focus-aside .companion-runtime-progress { display: flex; align-items: center; gap: 8px; }
  .goal-focus-aside .companion-runtime-progress > i { height: 4px; min-width: 0; flex: 1; border-radius: 2px; background: var(--line); overflow: hidden; }
  .goal-focus-aside .companion-runtime-progress b { width: var(--companion-progress); height: 100%; border-radius: inherit; background: var(--blue); display: block; }
  .goal-focus-aside .companion-runtime-progress span { color: var(--muted); font-size: 9.5px; font-variant-numeric: tabular-nums; }
  .goal-focus-aside .companion-runtime dl {
    margin: 0;
    padding-top: 9px;
    border-top: 1px solid var(--line);
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .goal-focus-aside .companion-runtime dl div { display: grid; gap: 2px; }
  .goal-focus-aside .companion-runtime dt { color: var(--muted); font-size: 9px; }
  .goal-focus-aside .companion-runtime dd { margin: 0; color: var(--ink); font-size: 10.5px; font-weight: 650; }
  .goal-focus-aside .companion-runtime > button {
    width: fit-content;
    min-height: 26px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--blue-dark);
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font: 650 10px/1.2 var(--font);
    cursor: pointer;
  }
  .goal-focus-aside .companion-runtime > button svg { width: 11px; height: 11px; }

  @container (min-width: 720px) {
    .goal-focus-layout {
      grid-template-columns: minmax(0, 1fr) minmax(220px, 250px);
      align-items: start;
      gap: 44px;
    }
    .goal-focus-aside {
      margin-top: 8px;
      padding: 4px 0 0 24px;
      border-top: 0;
      border-left: 1px solid var(--line);
    }
  }

  /* Focus is an inset reading surface; each detail tab shares one section-card grammar. */
  body[data-board-view] .document-pane,
  .document-pane {
    --focus-canvas-inset: clamp(12px, 1.4vw, 20px);
    padding: var(--focus-canvas-inset);
    scroll-padding-top: var(--focus-canvas-inset);
    background: color-mix(in srgb, var(--page) 78%, var(--rail));
  }
  body[data-desktop-shell="true"] .goal-document,
  .goal-document {
    width: min(100%, 1040px);
    min-height: calc(100% - (var(--focus-canvas-inset) * 2));
    margin: 0 auto;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    overflow: visible;
    display: grid;
    align-content: start;
    gap: 14px;
  }
  .goal-hero,
  .goal-workspace-panels {
    min-width: 0;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--paper);
    overflow: clip;
  }
  .goal-hero { padding: 34px clamp(30px, 4vw, 52px) 0; }
  .goal-workspace-panels { padding: 26px clamp(30px, 4vw, 52px) 70px; }
  body[data-desktop-shell="true"] .goal-header,
  .goal-header { padding-bottom: 22px; }
  body[data-desktop-shell="true"] .goal-workspace-nav,
  .goal-workspace-nav {
    position: static;
    top: auto;
    backdrop-filter: none;
  }
  .goal-workspace-panel { scroll-margin-top: calc(var(--focus-canvas-inset) + 58px); }

  @media (min-width: 761px) {
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-document {
      width: min(100%, 960px);
      padding: 0;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-hero {
      padding: 24px 34px 0;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-workspace-panels {
      padding: 20px 34px 56px;
    }
  }

  .focus-panel,
  .goal-factors,
  .goal-technical { padding: 0 0 24px; }
  .focus-panel-heading,
  .goal-factors-heading,
  .goal-technical > header {
    margin: 0 0 14px;
    padding: 0;
    border: 0;
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    align-items: start;
    gap: 9px;
  }
  .focus-panel-heading > svg,
  .goal-factors-heading > span,
  .goal-technical > header > span:first-child {
    width: 18px;
    height: 18px;
    margin-top: 1px;
    color: var(--muted);
  }
  .focus-panel-heading h2,
  .goal-factors-heading h2,
  .goal-technical > header strong {
    margin: 0;
    color: var(--ink);
    font-size: 15px;
    line-height: 1.35;
    letter-spacing: -.015em;
  }
  .focus-panel-heading p,
  .goal-factors-heading p,
  .goal-technical > header small {
    max-width: 68ch;
    margin: 3px 0 0;
    color: var(--muted);
    font-size: 11px;
    line-height: 1.5;
    font-weight: 400;
  }
  .goal-technical > header > span:nth-child(2) { display: block; }
  .goal-technical-body { padding: 0; }

  .focus-section-deck,
  .focus-section-deck.goal-factor-nav,
  .focus-section-deck.progress-overview {
    width: 100%;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    display: block;
    overflow: visible;
  }
  .focus-section-card-row {
    width: 100%;
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(136px, 1fr));
    align-items: stretch;
    gap: 10px;
  }
  .focus-section-card,
  .focus-section-card.goal-record-section {
    min-width: 0;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: color-mix(in srgb, var(--rail) 72%, var(--paper));
    overflow: clip;
    transition:
      border-color .2s ease,
      background-color .2s ease,
      box-shadow .28s cubic-bezier(.16, 1, .3, 1);
  }
  .focus-section-card.is-active {
    border-color: color-mix(in srgb, var(--blue) 42%, var(--line-strong));
    background: var(--paper);
    box-shadow: inset 0 -2px 0 color-mix(in srgb, var(--blue) 72%, transparent);
  }
  .focus-section-card-trigger,
  .focus-section-deck.goal-factor-nav .focus-section-card-trigger {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 84px;
    padding: 13px;
    border: 0;
    border-right: 0;
    border-radius: 0;
    background: transparent;
    color: var(--ink-soft);
    box-shadow: none;
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto auto;
    align-items: start;
    justify-content: stretch;
    gap: 9px;
    text-align: left;
    cursor: pointer;
  }
  .focus-section-card-trigger:hover,
  .focus-section-deck.goal-factor-nav .focus-section-card-trigger:hover {
    color: var(--ink);
    background: color-mix(in srgb, var(--ink) 3.5%, transparent);
  }
  .focus-section-card-trigger:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--blue) 62%, transparent);
    outline-offset: -3px;
  }
  .focus-section-card-icon {
    width: 18px;
    height: 18px;
    color: var(--muted);
    display: grid;
    place-items: center;
  }
  .focus-section-card.is-active .focus-section-card-icon { color: var(--blue-dark); }
  .focus-section-card-icon svg { width: 15px; height: 15px; }
  .focus-section-card-copy { min-width: 0; display: grid; gap: 4px; }
  .focus-section-card-copy strong {
    color: var(--ink);
    font-size: 12px;
    line-height: 1.35;
    font-weight: 690;
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }
  .focus-section-card-copy > small {
    max-width: none;
    max-height: none;
    overflow: visible;
    color: var(--muted);
    font-size: 10px;
    line-height: 1.5;
    opacity: 1;
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }
  .focus-section-deck.goal-factor-nav .focus-section-card-trigger .focus-section-card-copy > small {
    min-width: 0;
    width: auto;
    height: auto;
    padding: 0;
    border-radius: 0;
    background: transparent !important;
    color: var(--muted) !important;
    display: block;
    font-size: 10px;
  }
  .focus-section-card-count {
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--ink) 6%, transparent);
    color: var(--muted);
    display: inline-grid;
    place-items: center;
    font-size: 9px;
    font-variant-numeric: tabular-nums;
  }
  .focus-section-deck.goal-factor-nav .focus-section-card-trigger .focus-section-card-count {
    min-width: 20px;
    width: auto;
    height: 20px;
    padding: 0 6px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--ink) 6%, transparent) !important;
    color: var(--muted) !important;
    display: inline-grid;
    place-items: center;
    font-size: 9px;
  }
  .focus-section-card-caret {
    width: 16px;
    height: 16px;
    display: grid;
    place-items: center;
    color: var(--muted);
    transition: transform .34s cubic-bezier(.16, 1, .3, 1), color .2s ease;
  }
  .focus-section-card-caret svg { width: 13px; height: 13px; }
  .focus-section-card.is-active .focus-section-card-caret { color: var(--blue-dark); transform: rotate(90deg); }

  /* Relations read as records, not a pile of pills. */
  .focus-section-card-reveal .relation-layout {
    border-color: var(--line);
    border-radius: 10px;
    background: var(--paper);
    overflow: hidden;
  }
  .focus-section-card-reveal .relation-group { border-color: var(--line); }
  .focus-section-card-reveal .relation-group > header {
    min-height: 48px;
    padding: 12px 14px;
    border-color: var(--line);
    background: color-mix(in srgb, var(--rail) 64%, var(--paper));
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .focus-section-card-reveal .relation-group h3 {
    flex: 0 0 auto;
    margin: 0;
    color: var(--ink);
    font-size: 12px;
    line-height: 1.4;
  }
  .focus-section-card-reveal .relation-group h3 span {
    margin-left: 2px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .focus-section-card-reveal .relation-group > header p {
    min-width: 0;
    margin: 0;
    color: var(--muted);
    font-size: 10px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  .focus-section-card-reveal .relation-group > div { padding: 0 12px; }
  .focus-section-card-reveal .relation-group .empty-row {
    margin: 0;
    padding: 13px 2px 14px;
    color: var(--faint);
    font-size: 11px;
  }
  .focus-section-card-reveal .relation-record {
    min-width: 0;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: stretch;
    border-color: var(--line);
  }
  .focus-section-card-reveal .relation-row {
    width: 100%;
    min-width: 0;
    padding: 14px 8px 14px 2px;
    display: grid;
    grid-template-columns: 54px minmax(0, 1fr) auto 16px;
    align-items: start;
    justify-content: stretch;
    gap: 12px;
    border-radius: 0;
    color: var(--ink-soft);
    white-space: normal;
  }
  .focus-section-card-reveal .relation-row:hover {
    background: color-mix(in srgb, var(--blue-soft) 44%, transparent);
  }
  .focus-section-card-reveal .relation-kind {
    width: fit-content;
    max-width: 54px;
    margin-top: 1px;
    padding: 2px 7px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: color-mix(in srgb, var(--rail) 74%, var(--paper));
    color: var(--muted);
    font-size: 9px;
    line-height: 1.35;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .focus-section-card-reveal .relation-copy {
    min-width: 0;
    display: grid;
    gap: 4px;
  }
  .focus-section-card-reveal .relation-heading {
    min-width: 0;
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 4px 8px;
  }
  .focus-section-card-reveal .relation-heading strong {
    min-width: 0;
    color: var(--ink);
    font-size: 12px;
    line-height: 1.45;
    font-weight: 680;
    overflow-wrap: anywhere;
  }
  .focus-section-card-reveal .relation-copy :is(.relation-goal-id, .relation-path, .relation-reason) {
    width: auto;
    min-width: 0;
    height: auto;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent !important;
    color: var(--muted);
    display: block;
    font-size: 10px;
    line-height: 1.45;
    text-align: left;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .focus-section-card-reveal .relation-copy .relation-goal-id {
    color: var(--faint);
    font-size: 9px;
    letter-spacing: .02em;
  }
  .focus-section-card-reveal .relation-copy .relation-path { color: var(--ink-soft); }
  .focus-section-card-reveal .relation-state {
    margin-top: 1px;
    padding: 2px 7px;
    border: 1px solid currentColor;
    border-radius: 8px;
    background: transparent;
    font-size: 9px;
    line-height: 1.35;
    white-space: nowrap;
  }
  .focus-section-card-reveal .relation-row > svg {
    width: 14px;
    height: 14px;
    margin-top: 2px;
  }
  .focus-section-card-reveal .relation-deactivate-open {
    align-self: stretch;
    min-width: 48px;
    margin: 0;
    padding: 0 8px;
    border: 0;
    border-left: 1px solid var(--line);
    border-radius: 0;
    color: var(--muted);
    background: transparent;
    font-size: 10px;
    justify-content: center;
  }
  .focus-section-card-reveal .relation-deactivate-open:hover {
    border-color: var(--line);
    color: var(--red);
    background: var(--red-soft);
  }
  .focus-section-card-reveal .relation-deactivate-form {
    margin: 0 0 12px;
    border-radius: 8px;
  }
  .focus-section-stage {
    width: 100%;
    min-width: 0;
    margin-top: 12px;
    display: grid;
    align-items: start;
  }
  .focus-section-card-reveal {
    min-width: 0;
    display: grid;
    grid-template-rows: 0fr;
    opacity: 0;
    visibility: hidden;
    clip-path: inset(0 0 10% 0 round 12px);
    transform: translateY(10px);
    border-radius: 12px;
    background: transparent;
    box-shadow: inset 0 0 0 1px transparent;
    transition:
      grid-template-rows .52s cubic-bezier(.16, 1, .3, 1),
      opacity .28s ease,
      clip-path .52s cubic-bezier(.16, 1, .3, 1),
      transform .46s cubic-bezier(.16, 1, .3, 1),
      background-color .28s ease,
      box-shadow .28s ease,
      visibility 0s linear .52s;
  }
  .focus-section-card-reveal.is-active {
    grid-template-rows: 1fr;
    opacity: 1;
    visibility: visible;
    clip-path: inset(0 0 0 0);
    transform: translateY(0);
    background: color-mix(in srgb, var(--rail) 46%, var(--paper));
    box-shadow: inset 0 0 0 1px var(--line);
    transition-delay: .03s, .1s, .03s, .03s, .03s, .03s, 0s;
  }
  .focus-section-card-content {
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    padding: 0 20px;
    color: var(--ink-soft);
    transition: padding .42s cubic-bezier(.16, 1, .3, 1);
  }
  .focus-section-card-reveal.is-active .focus-section-card-content { padding: 22px 22px 24px; }
  .focus-section-card-content > :first-child { margin-top: 0; }
  .focus-section-card-content > :last-child { margin-bottom: 0; }
  .focus-section-card-reveal .goal-purpose,
  .focus-section-card-reveal .goal-edit-disclosure,
  .focus-section-card-reveal .child-progress,
  .focus-section-card-reveal .document-subsection,
  .focus-section-card-reveal .progress-overview,
  .focus-section-card-reveal .goal-technical-body { margin-left: 0; padding-left: 0; }
  .focus-section-card-reveal .document-subsection { margin-top: 15px; }
  .focus-section-card-reveal .document-subsection:first-child { margin-top: 0; }
  .focus-section-card-reveal .progress-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .focus-section-card.goal-record-section { border-bottom: 1px solid var(--line); }
  .focus-section-card-reveal.goal-record-section { border-bottom: 0; }
  .goal-factor-panel .focus-section-card-content > header,
  .focus-section-card-content > .goal-factor-panel > header,
  .focus-section-card-reveal.goal-factor-panel .focus-section-card-content > header { margin: 0 0 14px; }
  .focus-section-card-reveal.goal-factor-panel .focus-section-card-content > header h3 { margin: 0; font-size: 14px; }
  .focus-section-card-reveal.goal-factor-panel .focus-section-card-content > header p { margin: 3px 0 0; color: var(--muted); font-size: 11px; line-height: 1.5; }
  .goal-record-section .focus-section-card-content > section { padding-top: 15px; }
  .goal-record-section .focus-section-card-content > section > h3 { margin: 0 0 10px; font-size: 13px; }

  /* Overview regions share the same quiet spacing as the detail decks. */
  .goal-focus-layout { gap: 12px; }
  .goal-focus-main { display: grid; gap: 12px; }
  .goal-now,
  .goal-focus-criteria,
  .goal-focus-context,
  body[data-desktop-shell="true"] .goal-now,
  body[data-desktop-shell="true"] .goal-focus-criteria,
  body[data-desktop-shell="true"] .goal-focus-context {
    margin: 0;
    padding: 19px 20px 21px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: color-mix(in srgb, var(--rail) 62%, var(--paper));
  }
  @media (min-width: 761px) {
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-now,
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-focus-criteria,
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-focus-context {
      padding: 14px 18px 16px;
    }
  }
  .goal-focus-aside {
    margin: 0;
    padding: 0;
    border: 0;
    display: grid;
    align-content: start;
    gap: 12px;
  }
  body[data-desktop-shell="true"] .goal-focus-aside .companion-runtime,
  .goal-focus-aside .companion-runtime { margin: 0; background: color-mix(in srgb, var(--rail) 62%, var(--paper)); }
  html[data-resolved-theme="dark"] .focus-section-card-reveal :is(
    .risk-empty,
    .impact-empty,
    .risk-create,
    .impact-create,
    .impact-history,
    .risk-record,
    .impact-record,
    .risk-actions,
    .impact-actions,
    .risk-goal-picker,
    .policy-scope-note,
    .scope-gaps,
    .scope-gaps > .contract-list
  ) { background: var(--rail); color: var(--ink-soft); }
  html[data-resolved-theme="dark"] .focus-section-card-reveal :is(
    .risk-form,
    .risk-state-form,
    .impact-form,
    .impact-deactivate form
  ) { background: var(--paper); color: var(--ink); }
  html[data-resolved-theme="dark"] .focus-section-card-reveal :is(
    .risk-form input:not([type=checkbox]),
    .risk-form textarea,
    .risk-form select,
    .risk-state-form textarea,
    .risk-state-form select,
    .impact-form input,
    .impact-form textarea,
    .impact-form select,
    .impact-deactivate textarea
  ) { border-color: var(--line-strong); background: var(--page); color: var(--ink); }
  html[data-resolved-theme="dark"] .focus-section-card-reveal :is(.risk-effect, .risk-state-preview, .impact-effect) {
    background: color-mix(in srgb, var(--blue-soft) 72%, var(--paper));
    color: var(--ink-soft);
  }
  html[data-resolved-theme="dark"] .focus-section-card-reveal :is(.risk-actions, .impact-actions, .risk-create, .impact-create, .impact-history) summary:hover {
    background: color-mix(in srgb, var(--ink) 5%, transparent);
  }
  .focus-section-card-reveal .full-records > summary {
    background: color-mix(in srgb, var(--rail) 78%, var(--paper));
    color: var(--muted);
  }
  .focus-section-card-reveal .full-records > summary:hover {
    background: color-mix(in srgb, var(--ink) 5%, var(--rail));
  }
  @container (min-width: 720px) {
    .goal-focus-layout { gap: 14px; }
    .goal-focus-aside { margin: 0; padding: 0; border: 0; }
  }

  @container (max-width: 700px) {
    .focus-section-card-row { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .focus-section-card-trigger,
    .focus-section-deck.goal-factor-nav .focus-section-card-trigger {
      min-height: 72px;
      grid-template-columns: 18px minmax(0, 1fr) auto auto;
      align-items: start;
    }
    .focus-section-card-reveal .progress-facts,
    .technical-meta { grid-template-columns: 1fr; }
    .focus-section-card-reveal.is-active .focus-section-card-content { padding: 18px 18px 21px; }
    .focus-section-card-reveal .relation-row {
      grid-template-columns: 50px minmax(0, 1fr) auto 14px;
      gap: 9px;
    }
    .focus-section-card-reveal .relation-group > div { padding-inline: 10px; }
  }

  @container (max-width: 430px) {
    .focus-section-card-row { grid-template-columns: minmax(0, 1fr); }
    .focus-section-card-reveal .relation-record { grid-template-columns: minmax(0, 1fr); }
    .focus-section-card-reveal .relation-row {
      padding-right: 2px;
      grid-template-columns: 48px minmax(0, 1fr) auto;
    }
    .focus-section-card-reveal .relation-row > svg { display: none; }
    .focus-section-card-reveal .relation-deactivate-open {
      min-height: 34px;
      border-top: 1px solid var(--line);
      border-left: 0;
      justify-content: flex-end;
    }
  }

  @media (max-width: 760px) {
    body[data-board-view] .document-pane,
    .document-pane { --focus-canvas-inset: 8px; }
    body[data-desktop-shell="true"] .goal-document,
    .goal-document { padding: 0; border-radius: 0; gap: 12px; }
    .goal-hero { padding: 25px 18px 0; border-radius: 12px; }
    .goal-workspace-panels { padding: 20px 18px 56px; border-radius: 12px; }
    body[data-desktop-shell="true"] .goal-workspace-nav,
    .goal-workspace-nav { padding-inline: 0; }
  }

  /* Personal workspace shell. The application owns the left rail; the
     current project becomes one continuous working surface beside it. */
  .personal-sidebar,
  .desktop-project-context { display: none; }

  @media (min-width: 761px) {
    body[data-desktop-shell="true"] .app {
      height: 100dvh;
      min-height: 0;
      padding: 8px 12px 12px 8px;
      gap: 0 12px;
      grid-template-columns: 244px minmax(0, 1fr);
      grid-template-rows: 56px minmax(0, 1fr);
      background: var(--page);
    }

    body[data-desktop-shell="true"] .personal-sidebar {
      min-width: 0;
      min-height: 0;
      grid-column: 1;
      grid-row: 1 / 3;
      display: grid;
      grid-template-rows: 56px auto auto auto auto minmax(76px, 1fr) auto;
      align-content: start;
      color: var(--ink-soft);
      -webkit-user-select: none;
      user-select: none;
    }

    .personal-sidebar-brand {
      min-width: 0;
      min-height: 56px;
      padding: 0 12px 0 80px;
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--ink);
    }
    .personal-sidebar-brand svg { width: 17px; height: 17px; color: var(--ink); }
    .personal-sidebar-brand strong { font-size: 15px; font-weight: 740; letter-spacing: -.025em; }

    .personal-space-context {
      min-width: 0;
      min-height: 54px;
      margin: 4px 8px 10px;
      padding: 9px 10px;
      border: 1px solid var(--line);
      border-radius: 10px;
      display: grid;
      grid-template-columns: 30px minmax(0, 1fr) auto;
      align-items: center;
      gap: 9px;
      background: color-mix(in srgb, var(--paper) 62%, var(--rail));
    }
    .personal-space-mark {
      width: 30px;
      height: 30px;
      border-radius: 8px;
      display: grid;
      place-items: center;
      color: var(--ink);
      background: var(--paper);
      box-shadow: inset 0 0 0 1px var(--line);
    }
    .personal-space-mark svg { width: 15px; height: 15px; }
    .personal-space-copy { min-width: 0; display: grid; gap: 1px; }
    .personal-space-copy strong {
      overflow: hidden;
      color: var(--ink);
      font-size: 12px;
      font-weight: 690;
      letter-spacing: -.01em;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .personal-space-copy small { color: var(--muted); font-size: 10px; }
    .personal-space-state {
      padding: 2px 5px;
      border-radius: 5px;
      color: var(--muted);
      background: var(--rail);
      font-size: 9px;
      font-weight: 650;
    }

    .personal-new-goal {
      min-height: 38px;
      margin: 0 8px 12px;
      padding: 0 11px;
      border: 0;
      border-radius: 8px;
      display: flex;
      align-items: center;
      gap: 9px;
      color: var(--action-ink);
      background: var(--action);
      font-size: 12px;
      font-weight: 680;
      cursor: pointer;
      transition: opacity .18s ease, transform .18s cubic-bezier(.16, 1, .3, 1);
    }
    .personal-new-goal svg { width: 15px; height: 15px; }
    .personal-new-goal:hover { opacity: .9; transform: translateY(-1px); }
    .personal-new-goal:active { transform: translateY(0); }

    .personal-primary-nav,
    .personal-utility-nav {
      min-width: 0;
      padding: 0 8px;
      display: grid;
      gap: 2px;
    }
    .personal-primary-nav { padding-bottom: 10px; }
    .personal-utility-nav {
      margin: 0 8px;
      padding: 9px 0 10px;
      border-top: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
    }
    .personal-nav-item {
      width: 100%;
      min-width: 0;
      min-height: 34px;
      padding: 0 9px;
      border: 0;
      border-radius: 7px;
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr) auto auto;
      align-items: center;
      gap: 8px;
      color: var(--ink-soft);
      background: transparent;
      font: inherit;
      text-align: left;
      text-decoration: none;
    }
    a.personal-nav-item,
    button.personal-nav-item { cursor: pointer; }
    a.personal-nav-item:hover,
    button.personal-nav-item:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 5%, transparent); }
    .personal-nav-item.is-current {
      color: var(--ink);
      background: color-mix(in srgb, var(--paper) 72%, var(--rail));
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--line) 80%, transparent);
    }
    .personal-nav-item > svg { width: 16px; height: 16px; color: currentColor; }
    .personal-nav-item > span {
      min-width: 0;
      overflow: hidden;
      font-size: 12px;
      font-weight: 610;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .personal-nav-item > strong {
      min-width: 19px;
      min-height: 19px;
      padding: 0 5px;
      border-radius: 5px;
      display: grid;
      place-items: center;
      color: var(--muted);
      background: color-mix(in srgb, var(--ink) 5%, transparent);
      font-size: 10px;
      font-weight: 700;
    }
    .personal-nav-item.has-pending > strong { color: var(--blue-dark); background: var(--blue-soft); }
    .personal-nav-item kbd {
      color: var(--faint);
      font: 9px/1 var(--font);
    }
    .personal-nav-item.is-planned {
      color: var(--muted);
      cursor: default;
    }
    .personal-nav-item.is-planned > span { font-weight: 560; }
    .personal-nav-item.is-planned > small,
    .personal-nav-item.is-planned > em {
      color: var(--faint);
      font-size: 9px;
      font-style: normal;
      white-space: nowrap;
    }
    .personal-nav-item.is-planned > em {
      display: none;
    }

    .personal-recent-projects {
      min-width: 0;
      min-height: 0;
      padding: 17px 8px 10px;
      align-self: start;
    }
    .personal-recent-projects h2 {
      margin: 0 9px 7px;
      color: var(--faint);
      font-size: 10px;
      font-weight: 650;
    }
    .personal-project-link {
      min-width: 0;
      min-height: 32px;
      padding: 0 9px;
      border-radius: 7px;
      display: grid;
      grid-template-columns: 16px minmax(0, 1fr);
      align-items: center;
      gap: 8px;
      color: var(--ink-soft);
      text-decoration: none;
    }
    .personal-project-link:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 5%, transparent); }
    .personal-project-link svg { width: 14px; height: 14px; }
    .personal-project-link span {
      min-width: 0;
      overflow: hidden;
      font-size: 11px;
      font-weight: 610;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .personal-sidebar-footer {
      min-width: 0;
      padding: 10px 8px 2px;
      border-top: 1px solid var(--line);
      display: grid;
      gap: 7px;
    }
    .personal-settings-link {
      min-height: 32px;
      padding: 0 9px;
      border-radius: 7px;
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--ink-soft);
      font-size: 11px;
      font-weight: 610;
      text-decoration: none;
    }
    .personal-settings-link:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 5%, transparent); }
    .personal-settings-link svg { width: 15px; height: 15px; }
    .personal-local-state {
      min-width: 0;
      padding: 4px 9px 0;
      display: grid;
      grid-template-columns: 15px minmax(0, 1fr);
      align-items: start;
      gap: 8px;
      color: var(--muted);
    }
    .personal-local-state > svg { width: 14px; height: 14px; margin-top: 2px; }
    .personal-local-state > span { min-width: 0; display: grid; gap: 1px; }
    .personal-local-state strong { color: var(--ink-soft); font-size: 10px; font-weight: 630; }
    .personal-local-state small { overflow: hidden; color: var(--faint); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }

    body[data-desktop-shell="true"] .topbar {
      min-width: 0;
      min-height: 56px;
      grid-column: 2;
      grid-row: 1;
      padding: 0 12px 0 16px;
      border: 1px solid var(--line);
      border-bottom: 0;
      border-radius: 14px 14px 0 0;
      display: flex;
      background: var(--paper);
    }
    body[data-desktop-shell="true"] .topbar > .brand,
    body[data-desktop-shell="true"] .topbar > .top-action { display: none; }
    body[data-desktop-shell="true"] .topbar > .top-spacer { display: block; }
    body[data-desktop-shell="true"] .desktop-project-context {
      min-width: 0;
      min-height: 55px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .desktop-project-mark {
      width: 30px;
      height: 30px;
      border-radius: 8px;
      display: grid;
      place-items: center;
      color: var(--ink-soft);
      background: var(--rail);
    }
    .desktop-project-mark svg { width: 15px; height: 15px; }
    .desktop-project-copy { min-width: 0; max-width: min(30vw, 360px); display: grid; gap: 0; }
    .desktop-project-copy small { color: var(--faint); font-size: 9px; }
    .desktop-project-copy strong {
      min-width: 0;
      overflow: hidden;
      color: var(--ink);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: -.015em;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .desktop-project-sync {
      min-height: 22px;
      padding: 0 7px;
      border-radius: 5px;
      display: inline-flex;
      align-items: center;
      color: var(--green);
      background: var(--green-soft);
      font-size: 9px;
      font-weight: 660;
      white-space: nowrap;
    }
    .desktop-project-sync.is-syncing { color: var(--blue-dark); background: var(--blue-soft); }
    .desktop-project-sync.is-offline { color: var(--amber); background: var(--amber-soft); }
    .desktop-project-actions { display: flex; align-items: center; gap: 2px; }
    .desktop-project-actions a {
      min-height: 30px;
      padding: 0 8px;
      border-radius: 7px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--muted);
      font-size: 10px;
      font-weight: 620;
      text-decoration: none;
    }
    .desktop-project-actions a:hover { color: var(--ink); background: var(--rail); }
    .desktop-project-actions svg { width: 14px; height: 14px; }

    body[data-desktop-shell="true"] .mobile-switch { display: none; }
    body[data-desktop-shell="true"] .workspace,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui.is-tui-collapsed,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"],
    body[data-desktop-shell="true"] .workspace.is-desktop-tui:has(> .tree-pane[data-navigator-view="graph"]) {
      min-width: 0;
      min-height: 0;
      grid-column: 2;
      grid-row: 2;
      border: 1px solid var(--line);
      border-radius: 0 0 14px 14px;
      overflow: hidden;
      background: var(--paper);
    }
    body[data-desktop-shell="true"] .navigator-project { display: none; }
    body[data-desktop-shell="true"] .tree-pane,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane {
      grid-template-rows: 34px auto minmax(0, 1fr) 46px;
    }
    body[data-desktop-shell="true"] .tree-pane > .desktop-pane-header { grid-row: 1; }
    body[data-desktop-shell="true"] .tree-pane > .tree-chrome { grid-row: 2; }
    body[data-desktop-shell="true"] .tree-pane > .tree-scroll { grid-row: 3; }
    body[data-desktop-shell="true"] .tree-pane > .tree-footer { grid-row: 4; }
  }

  @media (min-width: 761px) and (max-width: 1040px) {
    body[data-desktop-shell="true"] .app {
      padding-right: 8px;
      gap: 0 8px;
      grid-template-columns: 224px minmax(0, 1fr);
    }
    .personal-sidebar-brand { padding-left: 72px; }
    .personal-nav-item { padding-inline: 8px; }
    .personal-nav-item.is-planned > small { display: none; }
    .personal-nav-item.is-planned > em { display: none; }
    .desktop-project-actions a span { display: none; }
  }

  /* Personal workbench v2: Codex-density application rail, project index,
     and a Goal dossier whose real contract is visible in the first viewport. */
  .goal-brief-grid,
  .goal-title-facts { display: none; }

  @media (min-width: 761px) {
    body[data-desktop-shell="true"] .app {
      padding: 0;
      gap: 0;
      grid-template-columns: 216px minmax(0, 1fr);
      grid-template-rows: 44px minmax(0, 1fr);
      background: var(--page);
    }

    body[data-desktop-shell="true"] .personal-sidebar {
      padding: 0 8px 8px;
      border-right: 1px solid var(--line);
      grid-template-rows: 48px auto auto auto auto minmax(12px, 1fr) auto;
      background: color-mix(in srgb, var(--rail) 78%, var(--page));
    }
    .personal-sidebar-brand {
      min-height: 48px;
      padding: 0 8px 0 72px;
      gap: 7px;
    }
    .personal-sidebar-brand svg { width: 16px; height: 16px; }
    .personal-sidebar-brand strong { font-size: 14px; font-weight: 730; }

    .personal-space-context {
      min-height: 36px;
      margin: 2px 0 8px;
      padding: 3px 7px;
      border: 0;
      border-radius: 7px;
      grid-template-columns: 26px minmax(0, 1fr);
      gap: 7px;
      background: transparent;
    }
    .personal-space-mark {
      width: 26px;
      height: 26px;
      border-radius: 7px;
      background: var(--paper);
      box-shadow: inset 0 0 0 1px var(--line);
    }
    .personal-space-mark svg { width: 13px; height: 13px; }
    .personal-space-copy strong { font-size: 11.5px; }
    .personal-space-copy small { font-size: 9px; }

    .personal-quick-actions {
      margin: 0 0 13px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 34px;
      gap: 5px;
    }
    .personal-new-goal {
      min-height: 34px;
      margin: 0;
      padding: 0 9px;
      border-radius: 7px;
      font-size: 11.5px;
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--action-ink) 10%, transparent);
    }
    .personal-new-goal:hover { transform: none; }
    .personal-search-button {
      width: 34px;
      min-height: 34px;
      padding: 0;
      border: 1px solid var(--line);
      border-radius: 7px;
      color: var(--muted);
      background: color-mix(in srgb, var(--paper) 64%, transparent);
      display: grid;
      place-items: center;
      cursor: pointer;
    }
    .personal-search-button:hover { color: var(--ink); background: var(--paper); }
    .personal-search-button svg { width: 14px; height: 14px; }

    .personal-nav-section { min-width: 0; margin: 0 0 14px; }
    .personal-nav-section > h2 {
      min-height: 23px;
      margin: 0;
      padding: 0 8px;
      color: var(--faint);
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 9.5px;
      font-weight: 680;
      letter-spacing: .02em;
    }
    .personal-nav-section > h2 a {
      width: 24px;
      height: 23px;
      border-radius: 5px;
      color: var(--faint);
      display: grid;
      place-items: center;
    }
    .personal-nav-section > h2 a:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 5%, transparent); }
    .personal-nav-section > h2 svg { width: 13px; height: 13px; }
    .personal-primary-nav { gap: 1px; }
    .personal-nav-item {
      min-height: 30px;
      padding: 0 8px;
      border-radius: 6px;
      grid-template-columns: 17px minmax(0, 1fr) auto;
      gap: 7px;
      font-size: 11.5px;
    }
    .personal-nav-item svg { width: 14px; height: 14px; }
    .personal-nav-item.is-current {
      color: var(--ink);
      background: var(--paper);
      box-shadow: inset 0 0 0 1px var(--line);
    }
    .personal-nav-item.is-planned { opacity: .62; }
    .personal-nav-item.is-planned > small {
      padding: 0;
      color: var(--faint);
      background: transparent;
      font-size: 8.5px;
      font-weight: 620;
    }
    .personal-nav-item > strong {
      min-width: 16px;
      padding: 1px 4px;
      border-radius: 8px;
      color: var(--muted);
      background: color-mix(in srgb, var(--ink) 7%, transparent);
      font-size: 9px;
      text-align: center;
    }

    .personal-project-link {
      min-height: 38px;
      padding: 4px 8px;
      border-radius: 7px;
      grid-template-columns: 17px minmax(0, 1fr) 7px;
      gap: 7px;
    }
    .personal-project-link > svg { width: 14px; height: 14px; }
    .personal-project-link > span { min-width: 0; display: grid; gap: 0; }
    .personal-project-link strong {
      overflow: hidden;
      color: var(--ink-soft);
      font-size: 11px;
      font-weight: 620;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .personal-project-link small { color: var(--faint); font-size: 8.5px; }
    .personal-project-link > i { width: 6px; height: 6px; border-radius: 50%; background: var(--green); }
    .personal-project-link.is-current { background: color-mix(in srgb, var(--ink) 4%, transparent); }

    .personal-sidebar-spacer { min-height: 0; }
    .personal-sidebar-footer {
      padding: 8px 0 0;
      border-top: 1px solid var(--line);
    }
    .personal-account {
      min-height: 46px;
      padding: 5px 6px;
      border-radius: 8px;
      color: var(--ink-soft);
      display: grid;
      grid-template-columns: 30px minmax(0, 1fr) 26px;
      align-items: center;
      gap: 7px;
      text-decoration: none;
    }
    .personal-account:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 5%, transparent); }
    .personal-account-avatar {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      color: var(--ink);
      background: var(--paper);
      box-shadow: inset 0 0 0 1px var(--line-strong);
      display: grid;
      place-items: center;
    }
    .personal-account-avatar svg { width: 14px; height: 14px; }
    .personal-account-copy { min-width: 0; display: grid; gap: 1px; }
    .personal-account-copy strong { font-size: 11px; font-weight: 650; }
    .personal-account-copy small { color: var(--faint); display: flex; align-items: center; gap: 5px; font-size: 8.5px; }
    .personal-account-copy small i { width: 5px; height: 5px; border-radius: 50%; background: var(--green); }
    .personal-account-settings { width: 26px; height: 26px; border-radius: 6px; color: var(--muted); display: grid; place-items: center; }
    .personal-account:hover .personal-account-settings { color: var(--ink); background: var(--paper); }
    .personal-account-settings svg { width: 14px; height: 14px; }

    body[data-desktop-shell="true"] .topbar {
      min-height: 44px;
      padding: 0 12px;
      border: 0;
      border-bottom: 1px solid var(--line);
      border-radius: 0;
      background: var(--paper);
    }
    body[data-desktop-shell="true"] .desktop-project-context {
      min-height: 43px;
      gap: 5px;
      color: var(--faint);
      font-size: 10px;
    }
    body[data-desktop-shell="true"] .desktop-project-context > span,
    body[data-desktop-shell="true"] .desktop-project-context > strong {
      max-width: 170px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    body[data-desktop-shell="true"] .desktop-project-context > strong { max-width: min(42vw, 520px); color: var(--ink-soft); font-size: 10.5px; font-weight: 620; }
    body[data-desktop-shell="true"] .desktop-project-context > svg { width: 11px; height: 11px; }
    body[data-desktop-shell="true"] .desktop-project-sync { margin-left: auto; }

    body[data-desktop-shell="true"] .workspace,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui.is-tui-collapsed,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"],
    body[data-desktop-shell="true"] .workspace.is-desktop-tui:has(> .tree-pane[data-navigator-view="graph"]) {
      grid-column: 2;
      grid-row: 2;
      grid-template-columns: clamp(284px, var(--tree-width, 300px), 320px) 1px minmax(0, 1fr) !important;
      grid-template-rows: 40px minmax(0, 1fr);
      border: 0;
      border-radius: 0;
      background: var(--paper);
    }
    body[data-desktop-shell="true"] .tree-resizer { width: 1px; background: var(--line); }
    body[data-desktop-shell="true"] .tree-resizer::after { width: 9px; }
    body[data-desktop-shell="true"] .tree-pane,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane {
      grid-template-rows: 62px 28px auto minmax(0, 1fr) 30px;
      background: color-mix(in srgb, var(--rail) 80%, var(--page));
    }
    body[data-desktop-shell="true"] .navigator-project {
      min-height: 62px;
      padding: 9px 10px 7px;
      border-bottom: 1px solid var(--line);
      display: grid;
    }
    body[data-desktop-shell="true"] .navigator-project-primary { min-height: 27px; }
    body[data-desktop-shell="true"] .tree-pane > .navigator-project { grid-row: 1; }
    body[data-desktop-shell="true"] .tree-pane > .desktop-pane-header { grid-row: 2; }
    body[data-desktop-shell="true"] .tree-pane > .tree-chrome { grid-row: 3; }
    body[data-desktop-shell="true"] .tree-pane > .tree-scroll { grid-row: 4; }
    body[data-desktop-shell="true"] .tree-pane > .tree-footer { grid-row: 5; }
    body[data-desktop-shell="true"] .desktop-pane-header--navigator {
      min-height: 28px;
      padding: 0 10px;
      border-bottom: 0;
    }
    body[data-desktop-shell="true"] .tree-chrome { padding: 5px 8px 7px; }
    body[data-desktop-shell="true"] .tree-search { height: 30px; }
    body[data-desktop-shell="true"] .tree-scroll { padding: 4px 8px 12px; }
    body[data-desktop-shell="true"] .tree-footer { min-height: 30px; padding: 0 9px; }
    body[data-desktop-shell="true"] .tree-footer small { display: none; }

    body[data-desktop-shell="true"] .workspace > .workbench-header {
      min-height: 40px;
      padding: 0 14px;
      border-bottom: 1px solid var(--line);
      background: var(--paper);
    }
    body[data-desktop-shell="true"] .workbench-switch { min-height: 31px; }
    body[data-desktop-shell="true"] .workbench-switch button { min-height: 27px; padding-inline: 9px; font-size: 10px; }

    body[data-desktop-shell="true"] .document-pane {
      --focus-canvas-inset: 0px;
      padding: 0;
      background: var(--paper);
    }
    body[data-desktop-shell="true"] .goal-document {
      width: 100%;
      min-height: 100%;
      gap: 0;
      background: var(--paper);
    }
    body[data-desktop-shell="true"] .goal-hero,
    body[data-desktop-shell="true"] .goal-workspace-panels {
      border: 0;
      border-radius: 0;
      background: var(--paper);
      overflow: visible;
    }
    body[data-desktop-shell="true"] .goal-hero { padding: 15px 22px 0; border-bottom: 1px solid var(--line); }
    body[data-desktop-shell="true"] .goal-header { padding-bottom: 10px; }
    body[data-desktop-shell="true"] .goal-title-kicker { min-height: 20px; margin-bottom: 5px; gap: 10px; }
    body[data-desktop-shell="true"] .goal-title-facts {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--faint);
      font-size: 9px;
    }
    body[data-desktop-shell="true"] .goal-title-facts span { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
    body[data-desktop-shell="true"] .goal-title-facts svg { width: 10px; height: 10px; }
    body[data-desktop-shell="true"] .goal-title-row { align-items: flex-start; gap: 12px; }
    body[data-desktop-shell="true"] .goal-title-row h1 {
      max-width: 30ch;
      font-size: clamp(20px, 1.7vw, 25px);
      line-height: 1.2;
      letter-spacing: -.025em;
    }
    body[data-desktop-shell="true"] .goal-title-outcome { display: none; }
    body[data-desktop-shell="true"] .goal-title-actions .document-action { min-height: 28px; }

    body[data-desktop-shell="true"] .goal-brief-grid {
      margin-top: 10px;
      border-top: 1px solid var(--line);
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr) minmax(0, 1fr);
    }
    body[data-desktop-shell="true"] .goal-brief-item {
      min-width: 0;
      padding: 10px 12px 11px;
      border-left: 1px solid var(--line);
    }
    body[data-desktop-shell="true"] .goal-brief-item:first-child { padding-left: 0; border-left: 0; }
    body[data-desktop-shell="true"] .goal-brief-item h2 {
      margin: 0 0 4px;
      color: var(--faint);
      font-size: 9.5px;
      font-weight: 680;
    }
    body[data-desktop-shell="true"] .goal-brief-item p {
      margin: 0;
      overflow: hidden;
      color: var(--ink-soft);
      display: -webkit-box;
      font-size: 11px;
      line-height: 1.45;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
    }
    body[data-desktop-shell="true"] .goal-workspace-nav {
      min-height: 34px;
      margin: 0;
      padding: 0;
      border-top: 1px solid var(--line);
      border-bottom: 0;
      gap: 16px;
    }
    body[data-desktop-shell="true"] .goal-workspace-nav button {
      flex: 0 0 auto;
      min-height: 33px;
      padding: 0 1px;
      font-size: 9.5px;
    }

    body[data-desktop-shell="true"] .goal-workspace-panels { padding: 14px 22px 42px; }
    body[data-desktop-shell="true"] .goal-focus-layout { gap: 10px; }
    body[data-desktop-shell="true"] .goal-focus-main { gap: 10px; }
    body[data-desktop-shell="true"] .goal-now,
    body[data-desktop-shell="true"] .goal-focus-criteria,
    body[data-desktop-shell="true"] .goal-focus-context {
      padding: 13px 14px 15px;
      border-radius: 8px;
    }
    body[data-desktop-shell="true"] .goal-now > header h2,
    body[data-desktop-shell="true"] .goal-focus-criteria h2,
    body[data-desktop-shell="true"] .goal-focus-context h2 { font-size: 12px; }
    body[data-desktop-shell="true"] .goal-now-body { margin-top: 7px; }
    body[data-desktop-shell="true"] .goal-now-body > div > strong { font-size: 14px; line-height: 1.4; }
    body[data-desktop-shell="true"] .goal-now-body p { margin-top: 3px; font-size: 10.5px; }
    body[data-desktop-shell="true"] .goal-now-body small { margin-top: 3px; font-size: 9.5px; }
    body[data-desktop-shell="true"] .goal-now-body .goal-primary-action { min-height: 30px; margin-top: 10px; padding-inline: 10px; font-size: 10px; }
    body[data-desktop-shell="true"] .goal-focus-criteria > header p,
    body[data-desktop-shell="true"] .goal-focus-context > header p { display: none; }
    body[data-desktop-shell="true"] .goal-focus-criteria > ul { margin-top: 8px; }
    body[data-desktop-shell="true"] .goal-focus-criteria li { min-height: 32px; padding: 6px 0; }
    body[data-desktop-shell="true"] .goal-focus-criteria li > span:last-child > strong { font-size: 10.5px; }
    body[data-desktop-shell="true"] .goal-focus-criteria li small { font-size: 9px; }
    body[data-desktop-shell="true"] .goal-focus-criteria > a { margin-top: 8px; font-size: 9.5px; }
    body[data-desktop-shell="true"] .goal-focus-context > dl { margin-top: 7px; }
    body[data-desktop-shell="true"] .goal-focus-context dl > div { min-height: 28px; padding: 5px 0; }
    body[data-desktop-shell="true"] .goal-focus-context dt { font-size: 9px; }
    body[data-desktop-shell="true"] .goal-focus-context dd { font-size: 9.5px; }
    body[data-desktop-shell="true"] .goal-focus-aside .companion-runtime { padding: 12px; border-radius: 8px; gap: 8px; }
  }

  @container (min-width: 610px) {
    body[data-desktop-shell="true"] .goal-focus-layout {
      grid-template-columns: minmax(0, 1fr) minmax(188px, 218px);
      align-items: start;
      gap: 10px;
    }
  }

  @media (min-width: 761px) and (max-width: 1040px) {
    body[data-desktop-shell="true"] .app { grid-template-columns: 196px minmax(0, 1fr); }
    body[data-desktop-shell="true"] .workspace,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui.is-tui-collapsed {
      grid-template-columns: clamp(250px, var(--tree-width, 272px), 282px) 1px minmax(0, 1fr) !important;
    }
    .personal-sidebar-brand { padding-left: 64px; }
    .personal-nav-item.is-planned > small { display: none; }
    body[data-desktop-shell="true"] .goal-brief-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    body[data-desktop-shell="true"] .goal-brief-item--outcome { grid-column: 1 / -1; padding-left: 0; border-left: 0; border-bottom: 1px solid var(--line); }
  }

  /* Personal workbench v3: one directory, project-scoped tabs, and soft work surfaces. */
  @media (min-width: 761px) {
    body[data-desktop-shell="true"] {
      --desktop-titlebar-height: 48px;
      --desktop-project-control-center-y: 21.5px;
      --desktop-native-control-row-height: calc(var(--desktop-project-control-center-y) * 2);
    }
    body[data-desktop-shell="true"] .app {
      height: 100dvh;
      padding: 0;
      gap: 0;
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr);
      background: var(--page);
    }
    body[data-desktop-shell="true"] .topbar { display: none; }
    body[data-desktop-shell="true"] .mobile-switch { display: none; }
    body[data-desktop-shell="true"] .workspace,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui.is-tui-collapsed,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"],
    body[data-desktop-shell="true"] .workspace.is-desktop-tui:has(> .tree-pane[data-navigator-view="graph"]) {
      grid-column: 1;
      grid-row: 1;
      grid-template-columns: clamp(286px, var(--tree-width, 310px), 334px) 8px minmax(0, 1fr) !important;
      grid-template-rows: var(--desktop-titlebar-height) minmax(0, 1fr);
      border: 0;
      border-radius: 0;
      background: var(--page);
      overflow: hidden;
    }

    body[data-desktop-shell="true"] .tree-pane,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane {
      min-width: 0;
      min-height: 0;
      padding: 0 8px;
      border: 0;
      grid-column: 1;
      grid-row: 1 / -1;
      grid-template-rows: auto minmax(0, 1fr) auto !important;
      color: var(--ink-soft);
      background: color-mix(in srgb, var(--rail) 78%, var(--page));
      box-shadow: none;
      overflow: visible;
      z-index: 2;
    }
    body[data-desktop-shell="true"] .tree-resizer {
      width: 8px;
      border: 0;
      grid-column: 2;
      grid-row: 2 / -1;
      background: transparent;
      z-index: 3;
    }
    body[data-desktop-shell="true"] .tree-resizer::after {
      width: 8px;
      background: transparent;
    }
    body[data-desktop-shell="true"] .tree-resizer:hover::after,
    body[data-desktop-shell="true"] .tree-resizer.is-dragging::after {
      background: color-mix(in srgb, var(--blue) 18%, transparent);
    }

    body[data-desktop-shell="true"] .navigator-project {
      min-width: 0;
      min-height: var(--desktop-titlebar-height);
      padding: 0 2px 0 88px;
      border: 0;
      grid-row: 1;
      background: transparent;
      position: relative;
      z-index: 24;
    }
    body[data-desktop-shell="true"]:not([data-native-desktop="true"]) .navigator-project {
      padding-left: 2px;
    }
    body[data-desktop-shell="true"] .navigator-project-primary {
      min-width: 0;
      height: var(--desktop-native-control-row-height);
      display: grid;
      grid-template-columns: minmax(0, 178px) 28px minmax(12px, 1fr);
      align-items: center;
      gap: 2px;
    }
    body[data-desktop-shell="true"] .navigator-project-menu {
      min-width: 0;
      position: relative;
    }
    body[data-desktop-shell="true"] .navigator-project-selector {
      min-width: 0;
      height: 30px;
      padding: 0 7px;
      border-radius: 8px;
      color: var(--ink-soft);
      display: grid;
      grid-template-columns: 16px minmax(0, 1fr) 12px;
      align-items: center;
      gap: 6px;
      list-style: none;
      cursor: pointer;
      transition: color .14s ease, background .14s ease;
    }
    body[data-desktop-shell="true"] .navigator-project-selector::-webkit-details-marker { display: none; }
    body[data-desktop-shell="true"] .navigator-project-selector:hover,
    body[data-desktop-shell="true"] .navigator-project-menu[open] > .navigator-project-selector {
      color: var(--ink);
      background: color-mix(in srgb, var(--ink) 6%, transparent);
    }
    body[data-desktop-shell="true"] .navigator-project-selector:focus-visible {
      outline: 0;
      box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--blue) 62%, transparent);
    }
    body[data-desktop-shell="true"] .navigator-project-selector > svg:first-child {
      width: 15px;
      height: 15px;
      color: var(--muted);
    }
    body[data-desktop-shell="true"] .navigator-project-selector > svg:last-child { width: 11px; height: 11px; color: var(--faint); transition: transform .14s ease; }
    body[data-desktop-shell="true"] .navigator-project-menu[open] .navigator-project-selector > svg:last-child { transform: rotate(180deg); }
    body[data-desktop-shell="true"] .navigator-project-selector strong { min-width: 0; overflow: hidden; color: inherit; font-size: 11.5px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
    body[data-desktop-shell="true"] .navigator-project-menu-popover {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      width: min(310px, calc(100vw - 24px));
      padding: 7px;
      border: 0;
      border-radius: 12px;
      color: var(--ink-soft);
      background: var(--paper);
      box-shadow: 0 14px 34px color-mix(in srgb, var(--shadow-color) 62%, transparent);
      z-index: 80;
    }
    body[data-desktop-shell="true"] .navigator-project-menu-popover > span {
      min-height: 24px;
      padding: 0 8px;
      color: var(--faint);
      display: flex;
      align-items: center;
      font-size: 9px;
      font-weight: 650;
    }
    body[data-desktop-shell="true"] .navigator-project-menu-popover nav { display: grid; gap: 1px; }
    body[data-desktop-shell="true"] .navigator-project-option,
    body[data-desktop-shell="true"] .navigator-project-manage {
      min-width: 0;
      min-height: 34px;
      padding: 0 8px;
      border-radius: 8px;
      color: inherit;
      display: flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
    }
    body[data-desktop-shell="true"] .navigator-project-option { justify-content: space-between; }
    body[data-desktop-shell="true"] .navigator-project-option:hover,
    body[data-desktop-shell="true"] .navigator-project-option.is-current,
    body[data-desktop-shell="true"] .navigator-project-manage:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 6%, transparent); }
    body[data-desktop-shell="true"] .navigator-project-option > span { min-width: 0; flex: 1 1 auto; display: flex; align-items: center; gap: 8px; }
    body[data-desktop-shell="true"] .navigator-project-option strong { min-width: 0; overflow: hidden; font-size: 11px; font-weight: 590; text-overflow: ellipsis; white-space: nowrap; }
    body[data-desktop-shell="true"] .navigator-project-option svg,
    body[data-desktop-shell="true"] .navigator-project-manage svg { width: 13px; height: 13px; color: var(--muted); flex: 0 0 auto; }
    body[data-desktop-shell="true"] .navigator-project-option > svg { color: var(--blue-dark); }
    body[data-desktop-shell="true"] .navigator-project-manage { margin-top: 4px; color: var(--muted); font-size: 10.5px; }
    body[data-desktop-shell="true"] .navigator-project-settings {
      width: 28px;
      height: 28px;
      min-height: 28px;
      border-radius: 7px;
      color: var(--muted);
      display: grid;
      place-items: center;
      transition: color .14s ease, background .14s ease;
    }
    body[data-desktop-shell="true"] .navigator-project-settings:hover {
      color: var(--ink);
      background: color-mix(in srgb, var(--ink) 6%, transparent);
    }
    body[data-desktop-shell="true"] .navigator-project-settings svg { width: 13px; height: 13px; }
    body[data-desktop-shell="true"] .desktop-titlebar-drag--left { min-width: 12px; width: auto; }

    body[data-desktop-shell="true"] .desktop-directory-panel {
      min-width: 0;
      min-height: 0;
      grid-row: 2;
      overflow: hidden;
    }
    body[data-desktop-shell="true"] .desktop-directory-panel[hidden] { display: none !important; }
    body[data-desktop-shell="true"] .desktop-directory-root,
    body[data-desktop-shell="true"] .desktop-directory-secondary {
      padding: 4px 2px 10px;
      overflow-y: auto;
    }
    body[data-desktop-shell="true"] .desktop-module-list { display: grid; gap: 1px; }
    body[data-desktop-shell="true"] .desktop-module-item {
      width: 100%;
      min-width: 0;
      min-height: 40px;
      padding: 4px 8px;
      border: 0;
      border-radius: 8px;
      color: var(--ink-soft);
      background: transparent;
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr) auto;
      align-items: center;
      gap: 7px;
      text-align: left;
      text-decoration: none;
      cursor: pointer;
      transition: color .14s ease, background .14s ease;
    }
    body[data-desktop-shell="true"] .desktop-module-item:hover {
      color: var(--ink);
      background: color-mix(in srgb, var(--ink) 5%, transparent);
    }
    body[data-desktop-shell="true"] .desktop-module-item.is-current {
      color: var(--ink);
      background: color-mix(in srgb, var(--ink) 8%, transparent);
    }
    body[data-desktop-shell="true"] .desktop-module-item:focus-visible { outline: 0; box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--blue) 62%, transparent); }
    body[data-desktop-shell="true"] .desktop-module-item--inbox { color: var(--ink-soft); background: transparent; }
    body[data-desktop-shell="true"] .desktop-module-item--inbox.is-current { color: var(--ink); background: color-mix(in srgb, var(--ink) 8%, transparent); }
    body[data-desktop-shell="true"] .desktop-module-item > svg { width: 14px; height: 14px; color: var(--muted); }
    body[data-desktop-shell="true"] .desktop-module-item > svg:last-child { width: 12px; height: 12px; color: var(--faint); opacity: .66; }
    body[data-desktop-shell="true"] .desktop-module-item:hover > svg:last-child { opacity: 1; }
    body[data-desktop-shell="true"] .desktop-module-item > span { min-width: 0; display: grid; gap: 0; }
    body[data-desktop-shell="true"] .desktop-module-item strong,
    body[data-desktop-shell="true"] .desktop-module-item small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    body[data-desktop-shell="true"] .desktop-module-item strong { color: inherit; font-size: 11.5px; font-weight: 620; }
    body[data-desktop-shell="true"] .desktop-module-item small { color: var(--faint); font-size: 8.5px; }
    body[data-desktop-shell="true"] .desktop-module-item em {
      color: var(--muted);
      font-size: 8.5px;
      font-style: normal;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    body[data-desktop-shell="true"] .desktop-module-item.is-planned { opacity: .62; cursor: default; }
    body[data-desktop-shell="true"] .desktop-module-item.is-planned:hover { background: transparent; }

    body[data-desktop-shell="true"] .desktop-directory-heading {
      min-height: 40px;
      padding: 2px 6px;
      display: grid;
      grid-template-columns: 24px minmax(0, 1fr);
      align-items: center;
      gap: 5px;
    }
    body[data-desktop-shell="true"] .desktop-directory-heading > button {
      width: 24px;
      height: 24px;
      padding: 0;
      border: 0;
      border-radius: 6px;
      color: var(--muted);
      background: transparent;
      display: grid;
      place-items: center;
      cursor: pointer;
    }
    body[data-desktop-shell="true"] .desktop-directory-heading > button:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 6%, transparent); }
    body[data-desktop-shell="true"] .desktop-directory-heading > button:focus-visible { outline: 0; box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--blue) 62%, transparent); }
    body[data-desktop-shell="true"] .desktop-directory-heading > button svg { width: 12px; height: 12px; transform: rotate(180deg); }
    body[data-desktop-shell="true"] .desktop-directory-heading > span { min-width: 0; display: grid; gap: 0; }
    body[data-desktop-shell="true"] .desktop-directory-heading strong { font-size: 12.5px; font-weight: 680; }
    body[data-desktop-shell="true"] .desktop-directory-heading small { color: var(--faint); font-size: 8.5px; }
    body[data-desktop-shell="true"] .desktop-directory-empty {
      margin: 8px 4px;
      padding: 20px 14px;
      border-radius: 14px;
      color: var(--muted);
      background: color-mix(in srgb, var(--paper) 56%, transparent);
      display: grid;
      justify-items: start;
      gap: 7px;
    }
    body[data-desktop-shell="true"] .desktop-directory-empty svg { width: 20px; height: 20px; }
    body[data-desktop-shell="true"] .desktop-directory-empty strong { color: var(--ink-soft); font-size: 12px; }
    body[data-desktop-shell="true"] .desktop-directory-empty p { margin: 0; color: var(--faint); font-size: 10px; line-height: 1.5; }
    body[data-desktop-shell="true"] .desktop-directory-empty span { color: var(--blue-dark); font-size: 9px; font-weight: 680; }

    body[data-desktop-shell="true"] .desktop-goal-directory {
      grid-template-rows: auto auto minmax(0, 1fr) auto;
      background: transparent;
    }
    body[data-desktop-shell="true"] .desktop-goal-directory:not([hidden]) { display: grid; }
    body[data-desktop-shell="true"] .desktop-goal-directory .desktop-directory-heading { grid-row: 1; }
    body[data-desktop-shell="true"] .desktop-goal-directory .tree-chrome {
      min-height: 30px;
      padding: 0 6px 3px;
      border: 0;
      grid-row: 2;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 5px;
    }
    body[data-desktop-shell="true"] .desktop-goal-directory .tree-search { display: none; }
    body[data-desktop-shell="true"] .navigator-view-switch {
      width: auto;
      padding: 2px;
      border: 0;
      border-radius: 9px;
      grid-template-columns: repeat(2, 28px);
      background: color-mix(in srgb, var(--paper) 54%, transparent);
    }
    body[data-desktop-shell="true"] .navigator-view-switch button { width: 28px; min-height: 26px; padding: 0; }
    body[data-desktop-shell="true"] .navigator-view-switch button span { display: none; }
    body[data-desktop-shell="true"] .navigator-view-switch button.is-active {
      color: var(--blue-dark);
      background: var(--paper);
      box-shadow: 0 3px 10px color-mix(in srgb, var(--shadow-color) 50%, transparent);
    }
    body[data-desktop-shell="true"] .tree-tools { min-width: 0; display: flex; justify-content: flex-end; gap: 2px; }
    body[data-desktop-shell="true"] .tree-tool { width: 26px; height: 26px; min-height: 26px; padding: 0; border: 0; border-radius: 7px; justify-content: center; }
    body[data-desktop-shell="true"] .tree-tool:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 6%, transparent); box-shadow: none; }
    body[data-desktop-shell="true"] .tree-tool span,
    body[data-desktop-shell="true"] .tree-tool small { display: none; }
    body[data-desktop-shell="true"] .tree-scroll {
      min-height: 0;
      padding: 2px 5px 12px;
      grid-row: 3;
    }
    body[data-desktop-shell="true"] .tree-row { min-height: 30px; border-radius: 7px; transition: background .14s ease; }
    body[data-desktop-shell="true"] .tree-row:hover,
    body[data-desktop-shell="true"] .tree-row:has(.tree-node.is-selected) {
      background: color-mix(in srgb, var(--ink) 6%, transparent);
    }
    body[data-desktop-shell="true"] .tree-toggle,
    body[data-desktop-shell="true"] .tree-guide { width: 16px; height: 24px; flex-basis: 16px; }
    body[data-desktop-shell="true"] .tree-node { min-height: 28px; padding: 2px 6px; border-radius: 7px; }
    body[data-desktop-shell="true"] .tree-node:focus-visible { outline: 0; box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--blue) 62%, transparent); }
    body[data-desktop-shell="true"] .tree-node.is-selected { background: transparent; box-shadow: none; }
    body[data-desktop-shell="true"] .tree-copy strong { font-size: 11.5px; font-weight: 590; }
    body[data-desktop-shell="true"] .tree-copy small { display: none; }
    body[data-desktop-shell="true"] .tree-node .goal-status { font-size: 8.5px; }
    body[data-desktop-shell="true"] .tree-footer {
      min-height: 28px;
      padding: 0 8px 5px;
      border: 0;
      grid-row: 4;
      color: var(--faint);
      background: transparent;
    }
    body[data-desktop-shell="true"] .tree-footer small { display: none; }

    body[data-desktop-shell="true"] .personal-sidebar-footer {
      min-height: 58px;
      margin: 0;
      padding: 5px 2px 8px;
      border: 0;
      grid-row: 3;
    }
    body[data-desktop-shell="true"] .personal-account {
      min-height: 46px;
      padding: 5px 7px;
      border-radius: 11px;
      grid-template-columns: 32px minmax(0, 1fr) 30px;
      transition: color .18s ease, background .18s ease, box-shadow .18s ease;
    }
    body[data-desktop-shell="true"] .personal-account:hover {
      color: var(--ink);
      background: var(--paper);
      box-shadow: 0 5px 16px color-mix(in srgb, var(--shadow-color) 32%, transparent);
    }
    body[data-desktop-shell="true"] .personal-account-copy strong { font-size: 11.5px; }
    body[data-desktop-shell="true"] .personal-account-copy small { color: var(--faint); font-size: 9px; }

    body[data-desktop-shell="true"] .workspace > .workbench-header {
      min-width: 0;
      min-height: 48px;
      padding: 0 10px;
      border: 0;
      grid-column: 3;
      grid-row: 1;
      background: var(--page);
      display: block;
    }
    body[data-desktop-shell="true"] .desktop-workbench-bar {
      min-width: 0;
      height: var(--desktop-native-control-row-height);
      display: grid;
      grid-template-columns: minmax(0, max-content) minmax(72px, 1fr) auto;
      align-items: center;
      gap: 8px;
    }
    body[data-desktop-shell="true"] .desktop-titlebar-drag {
      min-width: 72px;
      width: auto;
      height: 100%;
      -webkit-app-region: drag;
      user-select: none;
    }
    body[data-desktop-shell="true"] .desktop-work-tabs {
      min-width: 0;
      max-width: min(56vw, 680px);
      display: flex;
      align-items: center;
      gap: 5px;
      overflow-x: auto;
      scrollbar-width: none;
    }
    body[data-desktop-shell="true"] .desktop-work-tabs::-webkit-scrollbar { display: none; }
    body[data-desktop-shell="true"] .desktop-work-tab {
      min-width: 0;
      max-width: 245px;
      height: 34px;
      padding: 0 3px 0 0;
      border-radius: 10px;
      color: var(--muted);
      background: color-mix(in srgb, var(--paper) 46%, transparent);
      display: grid;
      grid-template-columns: minmax(0, 1fr) 24px;
      align-items: center;
      transition: color .18s ease, background .18s ease, box-shadow .18s ease;
    }
    body[data-desktop-shell="true"] .desktop-work-tab.is-selected {
      color: var(--ink);
      background: var(--paper);
      box-shadow: 0 4px 14px color-mix(in srgb, var(--shadow-color) 34%, transparent);
    }
    body[data-desktop-shell="true"] .desktop-work-tab.is-utility {
      min-width: max-content;
      padding-right: 0;
      grid-template-columns: minmax(0, 1fr);
    }
    body[data-desktop-shell="true"] .desktop-work-tab.is-utility > [role="tab"] {
      padding: 0 12px;
      display: flex;
      white-space: nowrap;
      cursor: default;
    }
    body[data-desktop-shell="true"] .desktop-work-tab > [role="tab"] {
      min-width: 0;
      height: 34px;
      padding: 0 5px 0 10px;
      border: 0;
      color: inherit;
      background: transparent;
      display: grid;
      grid-template-columns: 7px minmax(0, 1fr);
      align-items: center;
      gap: 7px;
      text-align: left;
      cursor: pointer;
    }
    body[data-desktop-shell="true"] .desktop-work-tab > [role="tab"] i { width: 6px; height: 6px; border-radius: 50%; background: var(--amber); }
    body[data-desktop-shell="true"] .desktop-work-tab > [role="tab"] i[data-status="executing"],
    body[data-desktop-shell="true"] .desktop-work-tab > [role="tab"] i[data-status="ready"] { background: var(--green); }
    body[data-desktop-shell="true"] .desktop-work-tab > [role="tab"] span { overflow: hidden; font-size: 10.5px; font-weight: 640; text-overflow: ellipsis; white-space: nowrap; }
    body[data-desktop-shell="true"] .desktop-work-tab > button:last-child {
      width: 24px;
      height: 24px;
      padding: 0;
      border: 0;
      border-radius: 7px;
      color: var(--faint);
      background: transparent;
      opacity: 0;
      cursor: pointer;
      transition: opacity .14s ease, color .14s ease, background .14s ease;
    }
    body[data-desktop-shell="true"] .desktop-work-tab:hover > button:last-child,
    body[data-desktop-shell="true"] .desktop-work-tab:focus-within > button:last-child { opacity: 1; }
    body[data-desktop-shell="true"] .desktop-work-tab > button:last-child:hover { color: var(--ink); background: var(--rail); }
    body[data-desktop-shell="true"] .desktop-workbench-actions { display: flex; align-items: center; gap: 4px; }
    body[data-desktop-shell="true"] .navigator-project-selector,
    body[data-desktop-shell="true"] .navigator-project-settings,
    body[data-desktop-shell="true"] .desktop-work-tabs,
    body[data-desktop-shell="true"] .desktop-workbench-actions { -webkit-app-region: no-drag; }
    body[data-desktop-shell="true"] .desktop-workbench-actions > button {
      width: 30px;
      height: 30px;
      padding: 0;
      border: 0;
      border-radius: 8px;
      color: var(--muted);
      background: transparent;
      display: grid;
      place-items: center;
      cursor: pointer;
    }
    body[data-desktop-shell="true"] .desktop-workbench-actions > button:hover { color: var(--ink); background: var(--paper); box-shadow: 0 4px 12px color-mix(in srgb, var(--shadow-color) 45%, transparent); }
    body[data-desktop-shell="true"] .desktop-workbench-actions > button svg { width: 14px; height: 14px; }
    body[data-desktop-shell="true"] .desktop-workbench-actions .workbench-switch { min-height: 30px; padding: 2px; border: 0; border-radius: 9px; background: color-mix(in srgb, var(--paper) 50%, transparent); }
    body[data-desktop-shell="true"] .desktop-workbench-actions .workbench-switch button { min-height: 26px; padding-inline: 8px; border-radius: 7px; font-size: 9.5px; }

    body[data-desktop-shell="true"] .document-pane {
      --focus-canvas-inset: 0px;
      min-width: 0;
      min-height: 0;
      padding: 0 10px 12px 2px;
      grid-column: 3;
      grid-row: 2;
      background: var(--page);
    }
    body[data-desktop-shell="true"] .desktop-work-surface {
      min-width: 0;
      min-height: 100%;
    }
    body[data-desktop-shell="true"] .desktop-work-surface[hidden] { display: none !important; }
    body[data-desktop-shell="true"] .desktop-utility-surface {
      padding: clamp(28px, 5vw, 64px);
      background: var(--page);
      align-content: start;
    }
    body[data-desktop-shell="true"] .desktop-utility-surface:not([hidden]) { display: grid; gap: 34px; }
    body[data-desktop-shell="true"] .desktop-utility-heading {
      min-width: 0;
      max-width: 760px;
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr) auto;
      align-items: start;
      gap: 14px;
    }
    body[data-desktop-shell="true"] .desktop-utility-heading > svg {
      width: 24px;
      height: 24px;
      margin-top: 2px;
      color: var(--muted);
    }
    body[data-desktop-shell="true"] .desktop-utility-heading h1 {
      margin: 0;
      color: var(--ink);
      font-size: clamp(22px, 2.2vw, 30px);
      font-weight: 720;
      letter-spacing: -.025em;
      line-height: 1.15;
    }
    body[data-desktop-shell="true"] .desktop-utility-heading p {
      margin: 7px 0 0;
      max-width: 64ch;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.55;
    }
    body[data-desktop-shell="true"] .desktop-utility-heading > span {
      min-height: 24px;
      padding: 0 9px;
      border-radius: 7px;
      color: var(--muted);
      background: color-mix(in srgb, var(--ink) 6%, transparent);
      display: inline-flex;
      align-items: center;
      font-size: 9px;
      font-weight: 680;
      white-space: nowrap;
    }
    body[data-desktop-shell="true"] .desktop-utility-note {
      max-width: 760px;
      padding: 20px 22px;
      border-radius: 14px;
      color: var(--ink-soft);
      background: var(--paper);
      box-shadow: var(--shadow-soft);
    }
    body[data-desktop-shell="true"] .desktop-utility-note strong { color: var(--ink); font-size: 12.5px; }
    body[data-desktop-shell="true"] .desktop-utility-note p { margin: 7px 0 0; max-width: 68ch; color: var(--muted); font-size: 11.5px; line-height: 1.65; }
    body[data-desktop-shell="true"][data-desktop-surface]:not([data-desktop-surface="goal"]) .desktop-workbench-actions .workbench-switch,
    body[data-desktop-shell="true"][data-desktop-surface]:not([data-desktop-surface="goal"]) .desktop-workbench-actions [data-open-create],
    body[data-desktop-shell="true"][data-desktop-surface]:not([data-desktop-surface="goal"]) .tui-resizer,
    body[data-desktop-shell="true"][data-desktop-surface]:not([data-desktop-surface="goal"]) .tui-pane { display: none !important; }
    body[data-desktop-shell="true"] .goal-document {
      width: 100%;
      min-height: 100%;
      gap: 10px;
      padding: 0 12px 36px;
      background: transparent;
    }
    body[data-desktop-shell="true"] .goal-hero,
    body[data-desktop-shell="true"] .goal-workspace-panels {
      border: 0;
      border-radius: 0;
      background: transparent;
      overflow: visible;
    }
    body[data-desktop-shell="true"] .goal-hero { padding: 16px 8px 0; }
    body[data-desktop-shell="true"] .goal-header { padding: 0 4px 12px; }
    body[data-desktop-shell="true"] .goal-title-kicker { min-height: 26px; margin-bottom: 8px; gap: 10px; }
    body[data-desktop-shell="true"] .goal-title-kicker .goal-status {
      min-height: 26px;
      padding: 2px 9px;
      gap: 6px;
      border-radius: 8px;
      background: color-mix(in srgb, var(--goal-status-tone) 7%, var(--paper));
      font-size: 10.5px;
    }
    body[data-desktop-shell="true"] .goal-title-kicker .goal-status svg { width: 12px; height: 12px; }
    body[data-desktop-shell="true"] .goal-title-row h1 { max-width: 34ch; font-size: clamp(21px, 1.85vw, 28px); line-height: 1.18; letter-spacing: -.025em; }
    body[data-desktop-shell="true"] .goal-brief-grid {
      margin: 8px 0 10px;
      border: 0;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 9px;
    }
    body[data-desktop-shell="true"] .goal-brief-item,
    body[data-desktop-shell="true"] .goal-brief-item:first-child {
      min-height: 104px;
      padding: 13px 14px;
      border: 0;
      border-radius: 14px;
      background: var(--paper);
      box-shadow: var(--shadow-soft);
    }
    body[data-desktop-shell="true"] .goal-brief-item h2 { margin-bottom: 6px; color: var(--ink); font-size: 11px; font-weight: 720; }
    body[data-desktop-shell="true"] .goal-brief-item p { color: var(--ink-soft); font-size: 10.5px; line-height: 1.55; -webkit-line-clamp: 4; }
    body[data-desktop-shell="true"] .goal-workspace-nav {
      width: fit-content;
      min-height: 34px;
      margin: 0 0 4px;
      padding: 3px;
      border: 0;
      border-radius: 10px;
      gap: 2px;
      background: color-mix(in srgb, var(--paper) 54%, transparent);
    }
    body[data-desktop-shell="true"] .goal-workspace-nav button { min-height: 28px; padding: 0 10px; border-radius: 8px; font-size: 9.5px; }
    body[data-desktop-shell="true"] .goal-workspace-nav button::after { display: none; }
    body[data-desktop-shell="true"] .goal-workspace-nav button[aria-selected="true"] { color: var(--ink); background: var(--paper); box-shadow: var(--shadow-soft); }
    body[data-desktop-shell="true"] .goal-workspace-panels {
      min-height: max(420px, calc(100dvh - 340px));
      padding: 8px 8px 40px;
      display: grid;
      align-items: stretch;
    }
    body[data-desktop-shell="true"] .goal-workspace-panel:not([hidden]) {
      width: 100%;
      min-width: 0;
      min-height: 100%;
    }
    body[data-desktop-shell="true"] .goal-workspace-panel[data-goal-panel]:not([data-goal-panel="overview"]):not([hidden]) {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      align-content: stretch;
    }
    body[data-desktop-shell="true"] .goal-workspace-panel:not([hidden]) > .focus-panel,
    body[data-desktop-shell="true"] .goal-workspace-panel:not([hidden]) > .goal-factors,
    body[data-desktop-shell="true"] .goal-workspace-panel:not([hidden]) > [data-goal-records-content] {
      width: 100%;
      min-width: 0;
      min-height: 100%;
    }
    body[data-desktop-shell="true"] .goal-workspace-panel:not([hidden]) .focus-panel,
    body[data-desktop-shell="true"] .goal-workspace-panel:not([hidden]) .goal-factors,
    body[data-desktop-shell="true"] .goal-workspace-panel:not([hidden]) .goal-technical,
    body[data-desktop-shell="true"] .goal-workspace-panel:not([hidden]) .focus-section-deck {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
      align-content: stretch;
    }
    body[data-desktop-shell="true"] .goal-workspace-panel:not([hidden]) .focus-section-stage {
      min-height: max(280px, calc(100dvh - 510px));
      align-items: stretch;
    }
    body[data-desktop-shell="true"] .goal-workspace-panel:not([hidden]) .focus-section-stage > .focus-section-card-reveal {
      grid-area: 1 / 1;
    }
    body[data-desktop-shell="true"] .goal-workspace-panel:not([hidden]) .focus-section-card-reveal.is-active {
      width: 100%;
      min-height: 100%;
      align-self: stretch;
    }
    body[data-desktop-shell="true"] .goal-workspace-panel:not([hidden]) .focus-section-card-reveal.is-active .focus-section-card-content {
      width: 100%;
      min-height: 100%;
    }
    body[data-desktop-shell="true"] .goal-workspace-panel[data-goal-panel="overview"]:not([hidden]) .goal-focus-layout {
      min-height: 100%;
      align-items: stretch;
    }
    body[data-desktop-shell="true"] .goal-workspace-panel[data-goal-panel="overview"]:not([hidden]) .goal-focus-main,
    body[data-desktop-shell="true"] .goal-workspace-panel[data-goal-panel="overview"]:not([hidden]) .goal-focus-aside {
      grid-template-rows: auto minmax(0, 1fr);
      align-content: stretch;
    }
    body[data-desktop-shell="true"] .goal-workspace-panel[data-goal-panel="overview"]:not([hidden]) .goal-focus-criteria,
    body[data-desktop-shell="true"] .goal-workspace-panel[data-goal-panel="overview"]:not([hidden]) .companion-runtime {
      min-height: 100%;
    }
    body[data-desktop-shell="true"] .goal-focus-layout { gap: 10px; }
    body[data-desktop-shell="true"] .goal-focus-main { gap: 10px; }
    body[data-desktop-shell="true"] .goal-now,
    body[data-desktop-shell="true"] .goal-focus-criteria,
    body[data-desktop-shell="true"] .goal-focus-context,
    body[data-desktop-shell="true"] .goal-focus-aside .companion-runtime {
      padding: 15px 16px;
      border: 0;
      border-radius: 14px;
      background: var(--paper);
      box-shadow: 0 5px 16px color-mix(in srgb, var(--shadow-color) 27%, transparent);
    }

    body[data-desktop-shell="true"][data-board-view="decisions"] .document-pane { padding: 0 12px 14px 2px; }
    body[data-desktop-shell="true"] .inbox-workspace {
      width: min(100%, 980px);
      margin: 0 auto;
      padding: 14px 20px 60px;
      animation: none;
    }
    body[data-desktop-shell="true"] .inbox-header {
      min-height: 50px;
      padding: 3px 4px 10px;
      border: 0;
      align-items: center;
    }
    body[data-desktop-shell="true"] .inbox-header > div { max-width: 72ch; }
    body[data-desktop-shell="true"] .inbox-header h1 { margin: 0 0 2px; font-size: 20px; line-height: 1.25; letter-spacing: -.02em; }
    body[data-desktop-shell="true"] .inbox-header p { font-size: 10.5px; }
    body[data-desktop-shell="true"] .inbox-header > strong {
      min-width: 0;
      color: var(--ink-soft);
      display: inline-flex;
      align-items: baseline;
      gap: 5px;
      font-size: 15px;
      text-align: left;
    }
    body[data-desktop-shell="true"] .inbox-header > strong small { margin: 0; font-size: 9px; }
    body[data-desktop-shell="true"] .inbox-workspace > .decision-summary {
      min-height: 34px;
      padding: 0 4px 8px;
      border: 0;
      gap: 6px 15px;
      font-size: 9.5px;
    }
    body[data-desktop-shell="true"] .inbox-workspace > .decision-summary span { gap: 4px; }
    body[data-desktop-shell="true"] .inbox-workspace .decision-groups { gap: 2px; }
    body[data-desktop-shell="true"] .inbox-group {
      padding: 0;
      border: 0;
      border-radius: 10px;
      background: transparent;
      scroll-margin-top: 8px;
    }
    body[data-desktop-shell="true"] .inbox-group > summary::-webkit-details-marker { display: none; }
    body[data-desktop-shell="true"] .inbox-item {
      min-width: 0;
      min-height: 46px;
      padding: 5px 8px;
      border-radius: 9px;
      color: var(--ink-soft);
      display: grid;
      grid-template-columns: 22px minmax(0, 1fr) auto 22px 14px;
      align-items: center;
      gap: 8px;
      list-style: none;
      cursor: pointer;
      transition: color .14s ease, background .14s ease;
    }
    body[data-desktop-shell="true"] .inbox-item:hover,
    body[data-desktop-shell="true"] .inbox-group[open] > .inbox-item {
      color: var(--ink);
      background: color-mix(in srgb, var(--ink) 6%, transparent);
    }
    body[data-desktop-shell="true"] .inbox-item:focus-visible { outline: 0; box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--blue) 62%, transparent); }
    body[data-desktop-shell="true"] .inbox-item-icon { width: 22px; height: 22px; color: var(--muted); display: grid; place-items: center; }
    body[data-desktop-shell="true"] .inbox-item-icon svg { width: 14px; height: 14px; }
    body[data-desktop-shell="true"] .inbox-item-copy { min-width: 0; display: grid; gap: 1px; }
    body[data-desktop-shell="true"] .inbox-item-copy strong,
    body[data-desktop-shell="true"] .inbox-item-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    body[data-desktop-shell="true"] .inbox-item-copy strong { color: inherit; font-size: 11.5px; font-weight: 620; }
    body[data-desktop-shell="true"] .inbox-item-copy small { color: var(--faint); font-size: 8.5px; }
    body[data-desktop-shell="true"] .inbox-item-types { min-width: 0; display: flex; align-items: center; justify-content: flex-end; gap: 4px; }
    body[data-desktop-shell="true"] .inbox-item-types > span {
      min-height: 22px;
      padding: 0 7px;
      border-radius: 7px;
      color: var(--muted);
      background: color-mix(in srgb, var(--ink) 5%, transparent);
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 8.5px;
      white-space: nowrap;
    }
    body[data-desktop-shell="true"] .inbox-item-types svg { width: 10px; height: 10px; }
    body[data-desktop-shell="true"] .inbox-item-types em { color: var(--faint); font-style: normal; font-variant-numeric: tabular-nums; }
    body[data-desktop-shell="true"] .inbox-item > b { color: var(--muted); font-size: 9px; font-weight: 590; font-variant-numeric: tabular-nums; text-align: center; }
    body[data-desktop-shell="true"] .inbox-item > svg { width: 11px; height: 11px; color: var(--faint); transition: transform .14s ease; }
    body[data-desktop-shell="true"] .inbox-group[open] > .inbox-item > svg { transform: rotate(180deg); }
    body[data-desktop-shell="true"] .inbox-item-detail { padding: 9px 8px 18px 38px; }
    body[data-desktop-shell="true"] .inbox-item-detail .decision-owner { margin: 0 2px 10px; align-items: center; }
    body[data-desktop-shell="true"] .inbox-item-detail .decision-owner > div > span { display: none; }
    body[data-desktop-shell="true"] .inbox-item-detail .decision-owner-link strong { font-size: 12px; }
    body[data-desktop-shell="true"] .inbox-item-detail .decision-owner-link small { font-size: 9px; }
    body[data-desktop-shell="true"] .inbox-workspace .decision-stack { gap: 9px; }
    body[data-desktop-shell="true"] .inbox-workspace .decision-record,
    body[data-desktop-shell="true"] .inbox-workspace .decision-stack > .human-review-list {
      border: 0;
      border-radius: 12px;
      background: var(--paper);
      box-shadow: 0 6px 18px color-mix(in srgb, var(--shadow-color) 26%, transparent);
    }
    body[data-desktop-shell="true"] .inbox-workspace .decision-record-heading,
    body[data-desktop-shell="true"] .inbox-workspace .decision-record > footer.decision-actions,
    body[data-desktop-shell="true"] .inbox-workspace .decision-stack > .human-review-list > .decision-record-heading {
      border: 0;
      background: color-mix(in srgb, var(--paper) 82%, var(--rail));
    }
    body[data-desktop-shell="true"] .inbox-workspace .decision-record-body { padding: 12px 14px; }
    body[data-desktop-shell="true"] .inbox-workspace .decision-record-body > h3 { font-size: 14px; }
    body[data-desktop-shell="true"] .inbox-workspace .decision-results { margin-top: 22px; border: 0; border-radius: 12px; box-shadow: none; }

    body[data-desktop-shell="true"] .tui-pane[data-tui-read-only] {
      grid-template-rows: 58px minmax(0, 1fr);
    }
    body[data-desktop-shell="true"] .tui-pane[data-tui-read-only] .tui-tabs,
    body[data-desktop-shell="true"] .tui-pane[data-tui-read-only] .tui-chrome,
    body[data-desktop-shell="true"] .tui-pane[data-tui-read-only] .tui-terminal,
    body[data-desktop-shell="true"] .tui-pane[data-tui-read-only] .tui-menu {
      display: none !important;
    }
    body[data-desktop-shell="true"] .tui-pane[data-tui-read-only] .tui-stage {
      padding: 0 18px 18px;
      grid-template-areas: "guard";
      grid-template-rows: minmax(0, 1fr);
    }
    body[data-desktop-shell="true"] .tui-pane[data-tui-read-only] .tui-parent-guard {
      min-height: 100%;
      max-height: none;
      padding-top: 18px;
      border-bottom: 0;
      align-content: start;
    }

    @container (max-width: 700px) {
      body[data-desktop-shell="true"] .inbox-item-types { display: none; }
      body[data-desktop-shell="true"] .inbox-item { grid-template-columns: 22px minmax(0, 1fr) 22px 14px; }
      body[data-desktop-shell="true"] .inbox-item-detail { padding-left: 8px; }
    }

    body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) {
      height: 100dvh;
      display: grid;
      grid-template-columns: clamp(286px, 310px, 334px) minmax(0, 1fr);
      grid-template-rows: var(--desktop-titlebar-height) minmax(0, 1fr);
      background: var(--page);
    }
    body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) > .topbar {
      min-width: 0;
      height: var(--desktop-native-control-row-height);
      min-height: var(--desktop-native-control-row-height);
      padding: 0 10px;
      border: 0;
      grid-column: 2;
      grid-row: 1;
      background: var(--page);
      display: flex;
      box-shadow: none;
    }
    body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) > .topbar .brand { display: none; }
    body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) > .topbar .project-context {
      width: fit-content;
      max-width: min(62vw, 460px);
      height: 32px;
      padding: 0 12px;
      border: 0;
      border-radius: 10px;
      color: var(--ink);
      background: transparent;
      box-shadow: none;
      display: flex;
      align-items: center;
      gap: 7px;
    }
    body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) > .topbar .project-context strong,
    body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) > .topbar .project-context small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) > .topbar .project-context strong { color: var(--ink); font-size: 10.5px; font-weight: 680; }
    body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) > .topbar .project-context small { color: var(--faint); font-size: 9.5px; }
    body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) > .topbar .top-action {
      width: 30px;
      height: 30px;
      min-height: 30px;
      margin: 0;
      padding: 0;
      border: 0;
      border-radius: 8px;
      color: var(--muted);
      background: transparent;
      display: grid;
      place-items: center;
    }
    body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) > .topbar .top-action:hover { color: var(--ink); background: var(--paper); box-shadow: 0 4px 12px color-mix(in srgb, var(--shadow-color) 45%, transparent); }
    body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) > .topbar .top-action span { display: none; }
    body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) > .settings-shell { display: contents; }
    body.settings-page[data-desktop-shell="true"]:has(.settings-navigation) .settings-navigation {
      min-width: 0;
      min-height: 0;
      padding: 0 8px;
      border: 0;
      grid-column: 1;
      grid-row: 1 / -1;
      grid-template-rows: var(--desktop-titlebar-height) 50px minmax(0, 1fr) auto;
      gap: 0;
      background: color-mix(in srgb, var(--rail) 78%, var(--page));
      box-shadow: none;
      display: grid;
      z-index: 2;
    }
    body.settings-page[data-desktop-shell="true"] .settings-desktop-project {
      min-width: 0;
      height: var(--desktop-titlebar-height);
      min-height: var(--desktop-titlebar-height);
      padding: 0 2px 0 80px;
      grid-row: 1;
      display: grid;
      grid-template-columns: minmax(0, 178px) 28px minmax(12px, 1fr);
      grid-template-rows: var(--desktop-native-control-row-height);
      align-content: start;
      align-items: center;
      gap: 2px;
    }
    body.settings-page[data-desktop-shell="true"]:not([data-native-desktop="true"]) .settings-desktop-project {
      padding-left: 2px;
    }
    body.settings-page[data-desktop-shell="true"] .settings-desktop-heading {
      min-height: 50px;
      padding: 3px 6px 5px;
      grid-row: 2;
      display: grid;
      grid-template-columns: 28px minmax(0, 1fr);
      align-items: center;
      gap: 6px;
    }
    body.settings-page[data-desktop-shell="true"] .settings-desktop-heading > a {
      width: 28px;
      min-height: 28px;
      padding: 0;
      border-radius: 8px;
      color: var(--muted);
      background: transparent;
      display: grid;
      place-items: center;
    }
    body.settings-page[data-desktop-shell="true"] .settings-desktop-heading > a:hover { color: var(--ink); background: var(--paper); }
    body.settings-page[data-desktop-shell="true"] .settings-desktop-heading > a svg { width: 14px; height: 14px; transform: rotate(180deg); }
    body.settings-page[data-desktop-shell="true"] .settings-desktop-heading > span { min-width: 0; display: grid; gap: 2px; }
    body.settings-page[data-desktop-shell="true"] .settings-desktop-heading strong { font-size: 13.5px; font-weight: 720; }
    body.settings-page[data-desktop-shell="true"] .settings-desktop-heading small { overflow: hidden; color: var(--faint); font-size: 9.5px; text-overflow: ellipsis; white-space: nowrap; }
    body.settings-page[data-desktop-shell="true"] .settings-nav-body { min-height: 0; padding: 2px; grid-row: 3; overflow-y: auto; }
    body.settings-page[data-desktop-shell="true"] .settings-navigation .settings-nav-label { display: none; }
    body.settings-page[data-desktop-shell="true"] .settings-navigation .settings-nav-group { gap: 4px; }
    body.settings-page[data-desktop-shell="true"] .settings-navigation .settings-nav-group + .settings-nav-group { margin: 0; padding: 0; border: 0; }
    body.settings-page[data-desktop-shell="true"] .settings-navigation .settings-nav-group > a {
      min-height: 52px;
      padding: 6px 9px;
      border-radius: 11px;
      color: var(--ink-soft);
      grid-template-columns: 20px minmax(0, 1fr);
      gap: 9px;
      transition: color .18s ease, background .18s ease;
    }
    body.settings-page[data-desktop-shell="true"] .settings-navigation .settings-nav-group > a:hover,
    body.settings-page[data-desktop-shell="true"] .settings-navigation .settings-nav-group > a[aria-current="page"] {
      color: var(--ink);
      background: var(--paper);
      box-shadow: none;
    }
    body.settings-page[data-desktop-shell="true"] .settings-navigation .settings-nav-group > a > svg { width: 16px; height: 16px; }
    body.settings-page[data-desktop-shell="true"] .settings-navigation .settings-nav-group > a strong { font-size: 11.5px; }
    body.settings-page[data-desktop-shell="true"] .settings-navigation .settings-nav-group > a small { color: var(--faint); font-size: 9px; }
    body.settings-page[data-desktop-shell="true"] .settings-navigation > .personal-sidebar-footer { grid-row: 4; }
    body.settings-page[data-desktop-shell="true"] .settings-content {
      min-width: 0;
      min-height: 0;
      padding: 0 14px 24px 10px;
      grid-column: 2;
      grid-row: 2;
      overflow-y: auto;
      background: var(--page);
    }
    body.settings-page[data-desktop-shell="true"] .settings-document,
    body.settings-page[data-desktop-shell="true"] .planning-catalog,
    body.settings-page[data-desktop-shell="true"] .planning-detail,
    body.settings-page[data-desktop-shell="true"] .planning-edit,
    body.settings-page[data-desktop-shell="true"] .work-planning {
      width: min(100%, 1060px);
      margin: 0 auto;
      padding: 18px 18px 48px;
      background: transparent;
    }
    body.settings-page[data-desktop-shell="true"] .settings-heading { margin-bottom: 18px; padding: 0 2px; border: 0; }
    body.settings-page[data-desktop-shell="true"] .settings-heading h1 { font-size: clamp(23px, 2vw, 30px); letter-spacing: -.025em; }
    body.settings-page[data-desktop-shell="true"] .settings-heading p { max-width: 72ch; color: var(--muted); }
    body.settings-page[data-desktop-shell="true"] .appearance-settings { border: 0; display: grid; gap: 6px; }
    body.settings-page[data-desktop-shell="true"] .preference-section { padding: 18px 0; border: 0; }
    body.settings-page[data-desktop-shell="true"] .project-rules-intro li + li { border: 0; }
    body.settings-page[data-desktop-shell="true"] .project-rules-intro li {
      border: 0;
      border-radius: 10px;
      background: color-mix(in srgb, var(--rail) 70%, var(--paper));
    }
    body.settings-page[data-desktop-shell="true"] .settings-section,
    body.settings-page[data-desktop-shell="true"] .settings-action-section,
    body.settings-page[data-desktop-shell="true"] .diagnostics-summary,
    body.settings-page[data-desktop-shell="true"] .launcher-section,
    body.settings-page[data-desktop-shell="true"] .project-rules-intro,
    body.settings-page[data-desktop-shell="true"] .policy-form,
    body.settings-page[data-desktop-shell="true"] .planning-library-note,
    body.settings-page[data-desktop-shell="true"] .planning-composition-overview {
      border: 0;
      border-radius: 14px;
      background: var(--paper);
      box-shadow: var(--shadow-soft);
    }
  }

  @media (min-width: 761px) and (max-width: 1180px) {
    body[data-desktop-shell="true"] .workspace,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui.is-tui-collapsed {
      grid-template-columns: clamp(274px, var(--tree-width, 286px), 300px) 7px minmax(0, 1fr) !important;
    }
    body[data-desktop-shell="true"] .desktop-work-tab { max-width: 190px; }
    body[data-desktop-shell="true"] .desktop-workbench-actions .workbench-switch span { display: none; }
    body[data-desktop-shell="true"] .goal-brief-grid { grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); }
    body[data-desktop-shell="true"] .goal-brief-item--outcome { grid-column: 1 / -1; min-height: 82px; }
  }

  @media (max-width: 760px) {
    body:not([data-desktop-shell="true"]) .topbar .brand { flex: 0 0 auto; padding-right: 6px; }
    body:not([data-desktop-shell="true"]) .topbar .brand strong { display: none; }
    body[data-desktop-shell="true"] .navigator-project,
    body[data-desktop-shell="true"] .personal-sidebar-footer,
    body[data-desktop-shell="true"] .desktop-directory-panel:not(.desktop-goal-directory),
    body[data-desktop-shell="true"] .desktop-goal-directory .desktop-directory-heading { display: none !important; }
    body[data-desktop-shell="true"] .desktop-goal-directory {
      min-height: 0;
      display: grid !important;
      grid-template-rows: auto minmax(0, 1fr) 42px;
    }
    body[data-desktop-shell="true"] .desktop-goal-directory .tree-chrome { grid-row: 1; }
    body[data-desktop-shell="true"] .desktop-goal-directory .tree-scroll { grid-row: 2; }
    body[data-desktop-shell="true"] .desktop-goal-directory .tree-footer { grid-row: 3; }
    body[data-desktop-shell="true"] .tree-pane { grid-template-rows: minmax(0, 1fr) !important; }
  }

  @media (prefers-reduced-motion: reduce) {
    .personal-new-goal { transition: none; }
    body[data-desktop-shell="true"] .navigator-project-selector,
    body[data-desktop-shell="true"] .desktop-module-item,
    body[data-desktop-shell="true"] .tree-row,
    body[data-desktop-shell="true"] .desktop-work-tab { transition: none; transform: none; }
    .theme-picker > summary .theme-caret { transition: none; }
    .focus-section-card,
    .focus-section-card-caret,
    .focus-section-card-reveal,
    .focus-section-card-content { transition: none; }
  }
`;

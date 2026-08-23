export type GoalBoardTheme = "light" | "dark" | "system";

export const GOALBOARD_THEME_STORAGE_KEY = "goalboard:theme";

export const THEME_BOOTSTRAP_SCRIPT = `
(() => {
  const key = "${GOALBOARD_THEME_STORAGE_KEY}";
  const valid = new Set(["light", "dark", "system"]);
  let preference = "system";
  try {
    const stored = localStorage.getItem(key);
    if (stored && valid.has(stored)) preference = stored;
  } catch {}
  const dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  document.documentElement.dataset.theme = preference;
  document.documentElement.dataset.resolvedTheme = preference === "system" ? (dark ? "dark" : "light") : preference;
})();`;

export const VISUAL_FOUNDATION_CLIENT_SCRIPT = `
(() => {
  const key = "${GOALBOARD_THEME_STORAGE_KEY}";
  const options = ["light", "dark", "system"];
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const readPreference = () => {
    try {
      const value = localStorage.getItem(key);
      return options.includes(value) ? value : "system";
    } catch {
      return "system";
    }
  };
  const applyTheme = (preference, persist = false) => {
    const next = options.includes(preference) ? preference : "system";
    if (persist) {
      try { localStorage.setItem(key, next); } catch {}
    }
    document.documentElement.dataset.theme = next;
    document.documentElement.dataset.resolvedTheme = next === "system" ? (media.matches ? "dark" : "light") : next;
    document.querySelectorAll("[data-theme-option]").forEach((button) => {
      const selected = button.getAttribute("data-theme-option") === next;
      button.setAttribute("aria-pressed", String(selected));
    });
  };
  document.querySelectorAll("[data-theme-option]").forEach((button) => {
    button.addEventListener("click", () => {
      applyTheme(button.getAttribute("data-theme-option"), true);
      button.closest("details")?.removeAttribute("open");
    });
  });
  media.addEventListener?.("change", () => {
    if (readPreference() === "system") applyTheme("system");
  });
  window.addEventListener("storage", (event) => {
    if (event.key === key) applyTheme(readPreference());
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
  applyTheme(readPreference());
})();`;

/**
 * Quiet Intent Workspace
 *
 * This layer intentionally comes after the legacy page styles. It introduces
 * the shared visual system without changing GoalBoard's existing markup,
 * state, actions, or Runtime contracts.
 */
export const VISUAL_FOUNDATION_STYLES = `
  :root {
    color-scheme: light;
    --page: #f2f3f5;
    --paper: #ffffff;
    --ink: #1a1c21;
    --ink-soft: #3f4652;
    --muted: #6c7380;
    --faint: #9aa0aa;
    --line: #e8eaf0;
    --line-strong: #dce0e7;
    --rail: #f5f6f8;
    --blue: #4f6ff7;
    --blue-dark: #3654d8;
    --blue-soft: #eef1ff;
    --green: #2b8a57;
    --green-soft: #edf8f1;
    --amber: #a76513;
    --amber-soft: #fff6e7;
    --red: #bf4545;
    --red-soft: #fff0f0;
    --terminal: #11141a;
    --terminal-ink: #eef1f5;
    --shadow: 0 18px 48px rgba(23, 27, 35, .14);
    --font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  }

  html[data-resolved-theme="dark"] {
    color-scheme: dark;
    --page: #111318;
    --paper: #191c22;
    --ink: #f1f3f6;
    --ink-soft: #c7ccd4;
    --muted: #9ba2ae;
    --faint: #747c89;
    --line: #252a32;
    --line-strong: #303640;
    --rail: #15181e;
    --blue: #7189ff;
    --blue-dark: #9bafff;
    --blue-soft: #222a45;
    --green: #61c58b;
    --green-soft: #183326;
    --amber: #e0a553;
    --amber-soft: #382b18;
    --red: #f07575;
    --red-soft: #3a2024;
    --terminal: #0c0f14;
    --terminal-ink: #eef1f5;
    --shadow: 0 20px 56px rgba(0, 0, 0, .32);
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
  .project-bar { gap: 8px; }
  .project-context { padding: 0 12px 0 18px; color: var(--ink-soft); }
  .project-context strong, .project-context span { overflow: hidden; text-overflow: ellipsis; }
  .project-context a { color: var(--blue-dark); }
  .project-decisions {
    height: 26px;
    border-color: var(--line);
    border-radius: 9px;
    background: var(--paper);
    color: var(--ink-soft);
  }
  a.project-decisions { color: var(--ink-soft); }
  .project-demo, .sync-state { font-size: 11px; }
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
  body[data-desktop-shell="true"] .project-bar { height: 28px; }
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
  body[data-desktop-shell="true"] .project-decisions,
  body[data-desktop-shell="true"] .top-action,
  body[data-desktop-shell="true"] .theme-picker > summary { height: 26px; }
  body[data-desktop-shell="true"] .project-decisions { font-size: 10px; }
  body[data-desktop-shell="true"] .project-demo,
  body[data-desktop-shell="true"] .sync-state { font-size: 10px; }
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
  body[data-desktop-shell="true"] .tree-pane { grid-template-rows: 56px auto minmax(0, 1fr) 46px; }
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
    grid-template-rows: auto minmax(0, 1fr) 42px;
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
  .tree-copy strong { font-size: 12.5px; font-weight: 610; }
  .tree-copy > small { display: none; }
  .tree-progress {
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
  .graph-node-copy small { display: none; }
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
    grid-template-columns: 26px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px 18px;
  }
  .goal-now-mark {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--blue);
    color: #fff;
    display: grid;
    place-items: center;
  }
  .goal-now-mark svg { width: 13px; height: 13px; }
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
    body[data-desktop-shell="true"] .goal-now-body { grid-template-columns: 26px minmax(0, 1fr); align-items: start; }
    body[data-desktop-shell="true"] .goal-now-body .goal-primary-action {
      grid-column: 2;
      width: fit-content;
      max-width: 100%;
      justify-self: start;
      white-space: normal;
    }
  }

  @container (max-width: 580px) {
    .goal-now-body { grid-template-columns: 26px minmax(0, 1fr); align-items: start; }
    .goal-now-body .goal-primary-action {
      grid-column: 2;
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
  html[data-resolved-theme="dark"] .project-decisions,
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
    .topbar .project-demo, .topbar .sync-state, .topbar .project-context > strong { display: none; }
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
      grid-template-rows: 0 auto minmax(0, 1fr) 0;
    }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane > .desktop-pane-header { grid-row: 1; }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane > .tree-chrome { grid-row: 2; }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane > .tree-scroll { grid-row: 3; }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane > .tree-footer { grid-row: 4; }
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
      grid-template-rows: 56px auto minmax(0, 1fr) 46px;
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
    .project-bar { min-width: 0; flex: 1; }
    .project-context { min-width: 0; padding: 0 8px; }
    .project-context span { max-width: 150px; }
    .project-decisions, .project-demo, .sync-state, .top-spacer { display: none; }
    body[data-desktop-shell="true"] .project-bar { display: none; }
    body[data-desktop-shell="true"] .top-spacer { display: block; }
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
    body[data-desktop-shell="true"] .tree-pane { grid-template-rows: auto minmax(0, 1fr) 42px; }
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

  @media (prefers-reduced-motion: reduce) {
    .theme-picker > summary .theme-caret { transition: none; }
  }
`;

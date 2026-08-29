import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  GOALBOARD_DENSITY_STORAGE_KEY,
  GOALBOARD_TERMINAL_THEME_STORAGE_KEY,
  GOALBOARD_THEME_STORAGE_KEY,
  THEME_BOOTSTRAP_SCRIPT,
  VISUAL_FOUNDATION_CLIENT_SCRIPT,
  VISUAL_FOUNDATION_STYLES,
} from "../src/web/visual-foundation.js";

test("visual foundation keeps Light, Dark, and System as local presentation choices", () => {
  assert.equal(GOALBOARD_THEME_STORAGE_KEY, "goalboard:theme");
  assert.match(THEME_BOOTSTRAP_SCRIPT, /localStorage\.getItem/);
  assert.match(THEME_BOOTSTRAP_SCRIPT, /prefers-color-scheme: dark/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /data-theme-option/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /localStorage\.setItem/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /addEventListener\?\.\("change"/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /dataset\.navigationPending = "true"/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /a\[aria-busy="true"\]/);
  assert.match(VISUAL_FOUNDATION_STYLES, /data-navigation-pending="true"/);
});

test("visual foundation ships one restrained Calm Desktop world across workbench and settings", () => {
  assert.match(VISUAL_FOUNDATION_STYLES, /--page: #f3f3f5;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--paper: #ffffff;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--muted: #62626b;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--faint: #76767f;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--action: #202023;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--radius-surface: 10px;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /body\[data-board-view\] \.document-pane,[\s\S]*border-radius: 0;[\s\S]*box-shadow: none;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tree-node\.is-selected,[\s\S]*background: var\(--paper\);[\s\S]*inset 0 0 0 1px var\(--line\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.settings-navigation a\[aria-current="page"\][\s\S]*background: var\(--paper\);/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.project-index-panel \{[\s\S]*border-radius: 12px;/);
});

test("visual foundation keeps Standard and Compact as local presentation choices", () => {
  assert.equal(GOALBOARD_DENSITY_STORAGE_KEY, "goalboard:density");
  assert.match(THEME_BOOTSTRAP_SCRIPT, /goalboard:density/);
  assert.match(THEME_BOOTSTRAP_SCRIPT, /dataset\.density = density/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /data-density-option/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /applyDensity/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /localStorage\.setItem\(densityKey/);
  assert.match(VISUAL_FOUNDATION_STYLES, /@media \(min-width: 761px\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /data-density="compact"/);
  assert.match(VISUAL_FOUNDATION_STYLES, /body\[data-board-view\]:not\(\[data-board-view="decisions"\]\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tree-row \{\s*min-height: 27px;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tree-node \{\s*min-height: 25px;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-document \{\s*width: min\(100%, 1120px\);/);
  assert.match(VISUAL_FOUNDATION_STYLES, /data-desktop-shell="true"[^}]+\.goal-document \{\s*padding: 10px 18px 30px;/);
  const compactSelectorHeaders = [...VISUAL_FOUNDATION_STYLES.matchAll(/([^{}]+)\{/g)]
    .map((match) => match[1] ?? "")
    .filter((selector) => selector.includes('data-density="compact"'))
    .join("\n");
  assert.ok(compactSelectorHeaders.length > 0);
  assert.doesNotMatch(compactSelectorHeaders, /\.tui-/);
});

test("visual foundation keeps terminal appearance separate and local", () => {
  assert.equal(GOALBOARD_TERMINAL_THEME_STORAGE_KEY, "goalboard:terminal-theme");
  assert.match(THEME_BOOTSTRAP_SCRIPT, /dataset\.resolvedTerminalTheme/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /data-terminal-theme-option/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /applyTerminalTheme/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /goalboard:terminal-theme-change/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /localStorage\.setItem\(terminalThemeKey/);
});

test("live xterm sessions receive the selected terminal palette", () => {
  const ptyClientSource = readFileSync(new URL("../src/web/pty-client.ts", import.meta.url), "utf8");
  assert.match(ptyClientSource, /theme: terminalPalette\(\)/);
  assert.match(ptyClientSource, /goalboard:terminal-theme-change/);
  assert.match(ptyClientSource, /term\.options\.theme = palette/);
  assert.match(ptyClientSource, /selectionBackground/);
  assert.match(ptyClientSource, /brightWhite/);
});

test("visual foundation defines one wide workbench and one narrow companion", () => {
  assert.match(VISUAL_FOUNDATION_STYLES, /data-resolved-theme="dark"/);
  assert.match(VISUAL_FOUNDATION_STYLES, /workspace\.is-desktop-tui/);
  assert.match(VISUAL_FOUNDATION_STYLES, /@media \(max-width: 760px\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.mobile-switch/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.companion-runtime/);
  assert.match(VISUAL_FOUNDATION_STYLES, /body\[data-desktop-shell="true"\] \.app \{ grid-template-rows: 44px 44px minmax\(0, 1fr\); \}/);
  assert.match(VISUAL_FOUNDATION_STYLES, /body\[data-desktop-shell="true"\] \.topbar \{[\s\S]*padding-left: 88px/);
  assert.match(VISUAL_FOUNDATION_STYLES, /body\[data-desktop-shell="true"\] \.brand svg \{[^}]*display: block/);
  assert.match(VISUAL_FOUNDATION_STYLES, /grid-template-columns: var\(--tree-width, clamp\(360px, 30vw, 480px\)\) 5px minmax\(430px, 1fr\) 5px var\(--tui-width, clamp\(440px, 37vw, 620px\)\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /body\[data-desktop-shell="true"\] \.goal-workspace-nav \{ display: none; \}/);
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES, /linear-gradient/);
});

test("desktop shell uses one project directory, project tabs, and soft work surfaces", () => {
  assert.match(VISUAL_FOUNDATION_STYLES, /Personal workbench v3: one directory, project-scoped tabs, and soft work surfaces/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--desktop-titlebar-height: 48px/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--desktop-project-control-center-y: 16px/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--desktop-native-control-row-height: calc\(var\(--desktop-project-control-center-y\) \* 2\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /grid-template-columns: clamp\(286px, var\(--tree-width, 310px\), 334px\) 8px minmax\(0, 1fr\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tree-pane,[\s\S]*grid-template-rows: auto minmax\(0, 1fr\) auto !important/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tree-pane,[\s\S]*padding: 0 8px;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tree-pane,[\s\S]*background: color-mix\(in srgb, var\(--rail\) 78%, var\(--page\)\);[\s\S]*box-shadow: none;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.settings-navigation \{[\s\S]*background: color-mix\(in srgb, var\(--rail\) 78%, var\(--page\)\);[\s\S]*box-shadow: none;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tree-resizer \{[\s\S]*grid-row: 2 \/ -1;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.navigator-project \{[\s\S]*min-height: var\(--desktop-titlebar-height\);[\s\S]*padding: 0 2px 0 72px;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.navigator-project-primary \{[\s\S]*height: var\(--desktop-native-control-row-height\);[\s\S]*grid-template-columns: minmax\(0, 178px\) 28px minmax\(12px, 1fr\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.navigator-project-menu-popover \{[\s\S]*position: absolute;[\s\S]*box-shadow: 0 14px 34px/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.desktop-directory-panel\[hidden\] \{ display: none !important; \}/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.desktop-module-item \{[\s\S]*min-height: 40px;[\s\S]*border-radius: 8px;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.desktop-module-item\.is-current \{[\s\S]*background: color-mix\(in srgb, var\(--ink\) 8%, transparent\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.inbox-item \{[\s\S]*min-height: 46px;[\s\S]*grid-template-columns: 22px minmax\(0, 1fr\) auto 22px 14px/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.desktop-goal-directory \.tree-search \{ display: none; \}/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.personal-sidebar-footer \{[\s\S]*grid-row: 3;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.desktop-work-tab\.is-selected \{[\s\S]*background: var\(--paper\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.desktop-work-tab\.is-utility \{[\s\S]*min-width: max-content;[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.desktop-work-tab\.is-utility > \[role="tab"\] \{[\s\S]*white-space: nowrap;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.desktop-workbench-bar \{[\s\S]*grid-template-columns: minmax\(0, max-content\) minmax\(72px, 1fr\) auto;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.desktop-titlebar-drag \{[\s\S]*min-width: 72px;[\s\S]*-webkit-app-region: drag;[\s\S]*user-select: none;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.desktop-work-surface\[hidden\] \{ display: none !important; \}/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.desktop-utility-surface:not\(\[hidden\]\) \{ display: grid; gap: 34px; \}/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\[data-desktop-surface\]:not\(\[data-desktop-surface="goal"\]\)[\s\S]*\.tui-pane \{ display: none !important; \}/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-brief-item,[\s\S]*box-shadow:/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-workspace-panels \{[\s\S]*min-height: max\(420px, calc\(100dvh - 340px\)\);[\s\S]*display: grid;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-workspace-panel:not\(\[hidden\]\) \.focus-section-stage \{[\s\S]*min-height: max\(280px, calc\(100dvh - 510px\)\);[\s\S]*align-items: stretch;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.focus-section-stage > \.focus-section-card-reveal \{[\s\S]*grid-area: 1 \/ 1;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-workspace-panel\[data-goal-panel="overview"\]:not\(\[hidden\]\) \.goal-focus-main,[\s\S]*\.goal-focus-aside \{[\s\S]*grid-template-rows: auto minmax\(0, 1fr\);[\s\S]*align-content: stretch;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-workspace-panel:not\(\[hidden\]\) \.focus-section-deck \{[\s\S]*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tui-pane\[data-tui-read-only\] \.tui-tabs,[\s\S]*\.tui-menu \{[\s\S]*display: none !important;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /body\.settings-page\[data-desktop-shell="true"\]:has\(\.settings-navigation\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /> \.topbar \{[\s\S]*height: var\(--desktop-titlebar-height\);[\s\S]*min-height: 48px;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.settings-navigation \{[\s\S]*grid-template-rows: var\(--desktop-titlebar-height\) 50px 50px minmax\(0, 1fr\) auto;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.settings-navigation > \.desktop-titlebar-safe \{ grid-row: 1; \}/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.settings-heading \{ margin-bottom: 18px; padding: 0 2px; border: 0; \}/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.preference-section \{ padding: 18px 0; border: 0; \}/);
});

test("runtime workbench becomes a two-column layout with a dock at standard widths", () => {
  assert.match(VISUAL_FOUNDATION_STYLES, /@media \(min-width: 761px\) and \(max-width: 1180px\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /workspace\.is-desktop-tui\.is-tui-collapsed[\s\S]*grid-template-columns: var\(--tree-width,[\s\S]*minmax\(0, 1fr\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /workspace\.is-desktop-tui \.tui-pane \{[\s\S]*position: absolute;[\s\S]*width: min\(430px, 48vw\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /workspace\.is-desktop-tui \.tui-expand/);
});

test("visual foundation keeps the Goal navigator dense and relationships progressive", () => {
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tree-progress/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tree-relations > summary/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tree-relations\[open\]/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tree-dep-copy small \{[^}]*text-overflow: ellipsis/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--goal-status-tone: var\(--ink-soft\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /border: 1px solid color-mix\(in srgb, var\(--goal-status-tone\) 28%, var\(--line\)\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-status--execution_blocked,[\s\S]*--goal-status-tone: var\(--red\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.navigator-project-primary \{[\s\S]*grid-template-columns: 18px minmax\(0, 1fr\) auto/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.navigator-project-action \{[\s\S]*width: 28px;[\s\S]*justify-content: center/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.navigator-project-action span \{ display: none; \}/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.navigator-project-action svg \{ width: 15px; height: 15px; \}/);
  assert.match(VISUAL_FOUNDATION_STYLES, /grid-template-rows: auto auto minmax\(0, 1fr\) 42px/);
});

test("Goal Tree keeps each stable Goal id visible beside its title", () => {
  const goalIdRule = VISUAL_FOUNDATION_STYLES.match(/\.tree-copy > small \{([^}]*)\}/)?.[1] ?? "";
  assert.match(goalIdRule, /display:\s*block/);
  assert.doesNotMatch(goalIdRule, /display:\s*none/);
  assert.match(goalIdRule, /text-overflow:\s*ellipsis/);
});

test("Goal Graph keeps each stable Goal id visible with its node title", () => {
  const goalIdRule = VISUAL_FOUNDATION_STYLES.match(/\.graph-node-copy small \{([^}]*)\}/)?.[1] ?? "";
  assert.match(goalIdRule, /display:\s*block/);
  assert.doesNotMatch(goalIdRule, /display:\s*none/);
  assert.match(goalIdRule, /text-overflow:\s*ellipsis/);
});

test("runtime separates app chrome from a configurable terminal canvas", () => {
  assert.match(VISUAL_FOUNDATION_STYLES, /--terminal-muted: #b5b5bd;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--terminal-faint: #92929b;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /data-resolved-terminal-theme="light"[\s\S]*--terminal: #fbfbfc;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /data-resolved-terminal-theme="dark"[\s\S]*--terminal: #101012;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tui-pane,[\s\S]*background: var\(--paper\);[\s\S]*color: var\(--ink\);/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tui-parent-guard-copy p,[\s\S]*color: var\(--muted\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tui-chrome \.tui-advance:disabled[\s\S]*background: var\(--rail\);[\s\S]*color: var\(--faint\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tui-terminal \{[\s\S]*background: var\(--terminal\);[\s\S]*color: var\(--terminal-ink\);/);
});

test("visual foundation makes the default Goal view an action-led Focus", () => {
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-focus-outcome/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-focus-criteria/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-now-blockers--clear/);
  assert.match(VISUAL_FOUNDATION_STYLES, /data-resolved-theme="dark"\] \.goal-factor-nav/);
  assert.match(VISUAL_FOUNDATION_STYLES, /data-resolved-theme="dark"\] \.risk-state-preview/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-focus-layout \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /@container \(min-width: 720px\)[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(220px, 250px\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-now-body \.goal-primary-action \{[\s\S]*max-width: 11rem/);
  assert.match(VISUAL_FOUNDATION_STYLES, /@media \(min-width: 761px\) \{[\s\S]*data-density="compact"[\s\S]*\.goal-now,[\s\S]*\.goal-focus-criteria,[\s\S]*\.goal-focus-context \{[\s\S]*padding: 14px 18px 16px;/);
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES, /\.goal-now-mark/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-focus-aside \{[\s\S]*border-top: 1px solid var\(--line\)/);
});

test("visual foundation gives every Focus detail one responsive section deck", () => {
  assert.match(VISUAL_FOUNDATION_STYLES, /--focus-canvas-inset: clamp\(12px, 1\.4vw, 20px\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-document \{[\s\S]*background: transparent;[\s\S]*display: grid;[\s\S]*gap: 14px;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-hero,[\s\S]*\.goal-workspace-panels \{[\s\S]*border-radius: 14px;[\s\S]*background: var\(--paper\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.focus-section-card-row \{[\s\S]*display: grid;[\s\S]*repeat\(auto-fit, minmax\(136px, 1fr\)\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.focus-section-card-copy > small \{[\s\S]*max-height: none;[\s\S]*overflow: visible;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.focus-section-card-trigger,[\s\S]*height: 100%;[\s\S]*align-items: start;/);
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES.slice(VISUAL_FOUNDATION_STYLES.lastIndexOf("/* Focus is an inset reading surface")), /\.focus-section-card\.is-active \{[^}]*flex:/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.focus-section-stage \{[\s\S]*margin-top: 12px;[\s\S]*display: grid;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.focus-section-card-reveal \{[\s\S]*clip-path: inset\(0 0 10% 0 round 12px\);/);
  assert.match(VISUAL_FOUNDATION_STYLES, /@container \(max-width: 700px\)[\s\S]*\.focus-section-card-row \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.focus-section-card[\s\S]*transition: none;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /Relations read as records, not a pile of pills/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.focus-section-card-reveal \.relation-row \{[\s\S]*grid-template-columns: 54px minmax\(0, 1fr\) auto 16px;[\s\S]*justify-content: stretch;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.relation-goal-id, \.relation-path, \.relation-reason[\s\S]*background: transparent !important;/);
});

test("visual foundation gives Goal Graph a radial clustered workspace", () => {
  assert.match(VISUAL_FOUNDATION_STYLES, /workspace\.is-desktop-tui\.is-graph-view/);
  assert.match(VISUAL_FOUNDATION_STYLES, /body\[data-desktop-shell="true"\] \.workspace\.is-desktop-tui\.is-graph-view/);
  assert.match(VISUAL_FOUNDATION_STYLES, /:has\(> \.tree-pane\[data-navigator-view="graph"\]\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.workspace\.is-desktop-tui\[data-navigator-view="graph"\]/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-graph/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.graph-stage/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.graph-orbit--inner/);
  assert.match(VISUAL_FOUNDATION_STYLES, /left: var\(--graph-x\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /top: var\(--graph-y\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /tree-pane > \.tree-scroll \{ grid-row: 4; \}/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.graph-zoom/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.graph-edge--depends_on path/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.graph-arrow--part_of path/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.graph-arrow--depends_on path/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.graph-node\.is-selected/);
});

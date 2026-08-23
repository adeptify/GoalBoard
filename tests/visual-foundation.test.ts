import assert from "node:assert/strict";
import test from "node:test";

import {
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
});

test("visual foundation makes the default Goal view an action-led Focus", () => {
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-focus-outcome/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-focus-criteria/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-now-blockers--clear/);
  assert.match(VISUAL_FOUNDATION_STYLES, /data-resolved-theme="dark"\] \.goal-factor-nav/);
  assert.match(VISUAL_FOUNDATION_STYLES, /data-resolved-theme="dark"\] \.risk-state-preview/);
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
  assert.match(VISUAL_FOUNDATION_STYLES, /tree-pane > \.tree-scroll \{ grid-row: 3; \}/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.graph-zoom/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.graph-edge--depends_on path/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.graph-arrow--part_of path/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.graph-arrow--depends_on path/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.graph-node\.is-selected/);
});

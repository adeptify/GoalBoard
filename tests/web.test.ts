import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Script } from "node:vm";
import { GoalBoardCoordinator } from "../src/v1/coordinator.js";
import { DEMO_BOARD_ID, seedDemoBoard } from "../src/v1/demo.js";
import { SqliteGoalBoardStore } from "../src/v1/store.js";
import { GoalBoardProjectCatalog, normalizeRuntimeWorkContext } from "../src/projects/catalog.js";
import { RuntimeIntegrationService } from "../src/install/runtime-integration.js";
import { GoalBoardWebServiceManager } from "../src/install/web-service.js";
import { GoalBoardServer } from "../src/mcp/server.js";
import {
  GOAL_TREE_STATUS_ORDER,
  activeOutgoingDependsOn,
  countGoalDecisions,
  displayedPassedCriterionIds,
  firstBlockedDescendant,
  goalTreeReferenceLabel,
  renderGoalBoardMomentumFragment,
  renderFeedWorkbenchFragment,
  renderGoalPanelFragment,
  renderGoalQuickRecordFragment,
  goalTreeReferenceLabels,
  renderGoalRecordEventsFragment,
  renderGoalRecordsFragment,
  renderGoalBoardWorkbenchClientScript,
  renderGoalBoardWorkbenchStylesheet,
  renderGoalBoardProjectSettings,
  WORK_TAB_VISIBILITY_CLIENT_SCRIPT,
  renderGoalBoardWeb,
  renderPersistedFeedItemDetail,
  sortGoalTreeItems,
  unsatisfiedOutgoingDependencies,
  WEB_GOAL_STATUSES,
  WEB_GOAL_EVENT_PAGE_SIZE,
} from "../src/web/render.js";
import {
  buildGoalBoardWebView,
  cachedGoalBoardWebView,
  createGoalBoardWebServer as createBaseGoalBoardWebServer,
} from "../src/web/server.js";

const WEB_TEST_CONTROL_TOKEN = "goalboard-web-test-control-token-0123456789abcdef";
const WORKBENCH_CLIENT_SCRIPT = renderGoalBoardWorkbenchClientScript();
const WORKBENCH_STYLES = renderGoalBoardWorkbenchStylesheet();
let webRequestSequence = 0;

type GoalTreeBrowserLayout = {
  paneWidth: number;
  titleWhiteSpace: string;
  titleLineCount: number;
  titleClientWidth: number;
  titleScrollWidth: number;
  titleClientHeight: number;
  titleScrollHeight: number;
  parentCollapsedLineCount: number;
  parentCollapsedTitleHeight: number;
  parentCollapsedWhiteSpace: string;
  parentCollapsedRowHeight: number;
  parentCollapsedProgressDisplay: string;
  parentExpandedLineCount: number;
  parentExpandedTitleHeight: number;
  parentExpandedWhiteSpace: string;
  parentExpandedRowHeight: number;
  parentExpandedProgressDisplay: string;
  parentRestoredLineCount: number;
  parentRestoredRowHeight: number;
  parentRestoredProgressDisplay: string;
};

type DecisionDeepLinkBrowserState = {
  selectedEntryId: string | null;
  targetDetailHidden: boolean | null;
  formVisible: boolean;
  submitVisible: boolean;
  formFocused: boolean;
  mobileView: string | null;
  searchValue: string | null;
};

type DesktopWorkTabBrowserLayout = {
  initial: { railLeft: number; railRight: number; tabLeft: number; tabRight: number; scrollLeft: number; scrollWidth: number; tabCount: number };
  resized: { railLeft: number; railRight: number; tabLeft: number; tabRight: number; scrollLeft: number; scrollWidth: number; tabCount: number };
};

let cachedGoalTreeBrowserLayout: Promise<GoalTreeBrowserLayout | null> | undefined;

function readGoalTreeBrowserLayout(): Promise<GoalTreeBrowserLayout | null> {
  if (cachedGoalTreeBrowserLayout !== undefined) return cachedGoalTreeBrowserLayout;
  const browser = [
    process.env.GOALBOARD_TEST_CHROME,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));
  if (!browser) {
    cachedGoalTreeBrowserLayout = Promise.resolve(null);
    return cachedGoalTreeBrowserLayout;
  }

  const directory = mkdtempSync(join(tmpdir(), "goalboard-tree-layout-"));
  const htmlPath = join(directory, "layout.html");
  const profilePath = join(directory, "chrome-profile");
  mkdirSync(profilePath);
  const longTitle = "建立即刻平台五十位以上经过逐项核验且保留完整证据边界的高质量人工智能创作者详细基线名单";
  writeFileSync(htmlPath, `<!doctype html>
    <html><head><meta charset="utf-8"><style>${WORKBENCH_STYLES}</style></head>
    <body data-board-view="current" data-desktop-shell="true" data-native-desktop="true">
      <div class="app"><main class="workspace" style="--tree-width: 519px; width: 1178px; height: 760px">
        <aside class="tree-pane" data-desktop-directory="goals">
          <section class="desktop-directory-panel desktop-goal-directory">
            <div class="tree-scroll"><ul class="goal-tree">
            <li class="tree-item is-collapsed" id="parent-item">
              <div class="tree-row" id="parent-row"><button class="tree-toggle" type="button"></button><div class="tree-entry directory-list-row">
                <button class="tree-node" type="button"><span class="tree-copy"><span class="tree-title-line"><strong id="parent-title">${longTitle}</strong></span><small>G2G</small></span></button>
                <span class="directory-row-state"><span class="goal-status goal-status--clarification_pending">目标待澄清</span></span>
                <span class="tree-meta-line"><span class="tree-progress" id="parent-progress"><span>3/8</span><i><b></b></i></span></span>
              </div></div>
              <ul class="tree-children"><li class="tree-item"><div class="tree-row"><span class="tree-guide"></span><div class="tree-entry directory-list-row"><button class="tree-node" type="button"><span class="tree-copy"><span class="tree-title-line"><strong>可见的子 Goal</strong></span></span></button><span class="directory-row-state"><span class="goal-status goal-status--satisfied">已完成</span></span><span class="tree-meta-line"></span></div></div></li></ul>
            </li>
            <li class="tree-item"><ul class="tree-children"><li class="tree-item"><ul class="tree-children"><li class="tree-item"><ul class="tree-children"><li class="tree-item">
              <div class="tree-row"><span class="tree-guide"></span><div class="tree-entry directory-list-row">
                <button class="tree-node" type="button"><span class="tree-copy"><span class="tree-title-line"><strong id="target-title">${longTitle}</strong></span><small>G2G/J</small></span></button>
                <span class="directory-row-state" id="target-status"><span class="goal-status goal-status--execution_blocked">执行受阻</span></span>
                <span class="tree-meta-line"><span class="tree-progress"><span>1 个前置</span></span></span>
              </div></div>
            </li></ul></li></ul></li></ul></li></ul></div>
          </section>
        </aside><div class="tree-resizer"></div><section class="document-pane"></section>
      </main></div>
      <script>
        const pane = document.querySelector(".tree-pane");
        const title = document.querySelector("#target-title");
        const range = document.createRange();
        range.selectNodeContents(title);
        const parent = document.querySelector("#parent-item");
        const parentTitle = document.querySelector("#parent-title");
        const parentRow = document.querySelector("#parent-row");
        const parentProgress = document.querySelector("#parent-progress");
        const parentMetrics = () => {
          const parentRange = document.createRange();
          parentRange.selectNodeContents(parentTitle);
          return {
            lineCount: parentRange.getClientRects().length,
            titleHeight: parentTitle.getBoundingClientRect().height,
            whiteSpace: getComputedStyle(parentTitle).whiteSpace,
            rowHeight: parentRow.getBoundingClientRect().height,
            progressDisplay: getComputedStyle(parentProgress).display,
          };
        };
        const parentCollapsed = parentMetrics();
        parent.classList.remove("is-collapsed");
        const parentExpanded = parentMetrics();
        parent.classList.add("is-collapsed");
        const parentRestored = parentMetrics();
        const result = {
          paneWidth: pane.getBoundingClientRect().width,
          titleWhiteSpace: getComputedStyle(title).whiteSpace,
          titleLineCount: range.getClientRects().length,
          titleClientWidth: title.clientWidth,
          titleScrollWidth: title.scrollWidth,
          titleClientHeight: title.clientHeight,
          titleScrollHeight: title.scrollHeight,
          parentCollapsedLineCount: parentCollapsed.lineCount,
          parentCollapsedTitleHeight: parentCollapsed.titleHeight,
          parentCollapsedWhiteSpace: parentCollapsed.whiteSpace,
          parentCollapsedRowHeight: parentCollapsed.rowHeight,
          parentCollapsedProgressDisplay: parentCollapsed.progressDisplay,
          parentExpandedLineCount: parentExpanded.lineCount,
          parentExpandedTitleHeight: parentExpanded.titleHeight,
          parentExpandedWhiteSpace: parentExpanded.whiteSpace,
          parentExpandedRowHeight: parentExpanded.rowHeight,
          parentExpandedProgressDisplay: parentExpanded.progressDisplay,
          parentRestoredLineCount: parentRestored.lineCount,
          parentRestoredRowHeight: parentRestored.rowHeight,
          parentRestoredProgressDisplay: parentRestored.progressDisplay,
        };
        document.title = "RESULT:" + btoa(unescape(encodeURIComponent(JSON.stringify(result))));
      </script>
    </body></html>`);

  cachedGoalTreeBrowserLayout = new Promise((resolve, reject) => {
    const child = spawn(browser, [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-background-mode",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-extensions",
      "--no-default-browser-check",
      "--no-first-run",
      `--user-data-dir=${profilePath}`,
      "--window-size=1178,760",
      "--dump-dom",
      `file://${htmlPath}`,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let result: GoalTreeBrowserLayout | null = null;
    const timer = setTimeout(() => child.kill("SIGTERM"), 10_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      const encoded = stdout.match(/<title>RESULT:([^<]+)<\/title>/)?.[1];
      if (!encoded || result) return;
      result = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as GoalTreeBrowserLayout;
      child.kill("SIGTERM");
    });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", (error) => reject(error));
    child.on("close", () => {
      clearTimeout(timer);
      rmSync(directory, { recursive: true, force: true });
      if (result) resolve(result);
      else reject(new Error(`${stderr}\nBrowser layout result missing from DOM:\n${stdout.slice(0, 500)}`));
    });
  });
  return cachedGoalTreeBrowserLayout;
}

function readDecisionDeepLinkBrowserState(
  html: string,
  goalId: string,
  options: { width?: number; scenario?: "initial" | "after_feed_switch" | "restored_mobile_tree" } = {},
): Promise<DecisionDeepLinkBrowserState | null> {
  const browser = [
    process.env.GOALBOARD_TEST_CHROME,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));
  if (!browser) return Promise.resolve(null);

  const directory = mkdtempSync(join(tmpdir(), "goalboard-decision-deep-link-"));
  const profilePath = join(directory, "chrome-profile");
  const htmlPath = join(directory, "decisions.html");
  mkdirSync(profilePath);
  const scenario = options.scenario ?? "initial";
  const browserHtml = html.replace(
    '<script src="/assets/goalboard-workbench.js"></script>',
    `<script>
      if (${JSON.stringify(scenario)} === "restored_mobile_tree") {
        const state = JSON.parse(document.querySelector("#goalboard-data").textContent);
        const storageKey = "goalboard-ui:" + (state.project?.project_id || state.snapshot.board.board_id) + ":inbox";
        sessionStorage.setItem(storageKey, JSON.stringify({
          mobileView: "tree",
          workSurface: "feed",
          directory: "feed",
          feedPreset: "inbox_message",
          navigationVersion: 2,
        }));
      }
      globalThis.__gb24InboxWorkbenchHtml = [...document.querySelectorAll("[data-feed-detail]")]
        .map((detail) => detail.outerHTML).join("");
      globalThis.__gb24Fetch = globalThis.fetch.bind(globalThis);
      globalThis.fetch = (input, init) => {
        const url = new URL(String(input), location.href);
        if (url.pathname.endsWith("/api/feed/workbench")) {
          const preset = url.searchParams.get("preset");
          return Promise.resolve(new Response(
            preset === "inbox_message" ? globalThis.__gb24InboxWorkbenchHtml : "",
            { status: 200, headers: { "content-type": "text/html" } },
          ));
        }
        return globalThis.__gb24Fetch(input, init);
      };
    </script><script>${WORKBENCH_CLIENT_SCRIPT}</script><script>
      (async () => {
        const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 50));
        await nextFrame();
        await nextFrame();
        if (${JSON.stringify(scenario)} === "after_feed_switch") {
          document.querySelector('[data-work-surface-open="feed"][data-feed-preset="feed"]')?.click();
          await nextFrame();
          await nextFrame();
          const search = document.querySelector("[data-feed-search]");
          if (search) {
            search.value = "__hide_every_decision__";
            search.dispatchEvent(new Event("input", { bubbles: true }));
          }
          location.hash = ${JSON.stringify(`#decision-goal-${goalId}`)};
        }
        await nextFrame();
        await nextFrame();
        await nextFrame();
        const targetEntryId = ${JSON.stringify(`decision:${goalId}`)};
        const rows = [...document.querySelectorAll("[data-feed-entry-id]")];
        const selectedRow = rows.find((row) => row.classList.contains("is-selected"));
        const targetDetail = [...document.querySelectorAll("[data-feed-detail]")]
          .find((detail) => detail.dataset.feedDetail === targetEntryId);
        const form = targetDetail?.querySelector(
          "[data-human-review-form], [data-goal-tree-decision-form], [data-contract-decision-form], [data-candidate-decision-form], [data-rewire-decision-form], [data-risk-state-form]",
        );
        const submit = form?.querySelector('button[type="submit"]');
        const pane = document.querySelector("[data-document-pane]");
        const paneRect = pane?.getBoundingClientRect();
        const formRect = form?.getBoundingClientRect();
        const submitRect = submit?.getBoundingClientRect();
        const result = {
          selectedEntryId: selectedRow?.dataset.feedEntryId ?? null,
          targetDetailHidden: targetDetail ? targetDetail.hidden : null,
          formVisible: Boolean(paneRect && formRect && formRect.top >= paneRect.top - 1 && formRect.top < paneRect.bottom),
          submitVisible: Boolean(paneRect && submitRect && submitRect.top >= paneRect.top - 1 && submitRect.bottom <= paneRect.bottom + 1),
          formFocused: document.activeElement === form,
          mobileView: document.querySelector("[data-workspace]")?.dataset.mobileView ?? null,
          searchValue: document.querySelector("[data-feed-search]")?.value ?? null,
        };
        document.title = "RESULT:" + btoa(unescape(encodeURIComponent(JSON.stringify(result))));
      })();
    </script>`,
  );
  writeFileSync(
    htmlPath,
    browserHtml,
  );
  return new Promise((resolve, reject) => {
    const child = spawn(browser, [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-background-mode",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-extensions",
      "--no-default-browser-check",
      "--no-first-run",
      `--user-data-dir=${profilePath}`,
      `--window-size=${options.width ?? 1280},800`,
      "--virtual-time-budget=3000",
      "--dump-dom",
      `file://${htmlPath}${scenario === "after_feed_switch" ? "" : `#decision-goal-${encodeURIComponent(goalId)}`}`,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), 15_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (/<title>RESULT:[^<]+<\/title>/.test(stdout)) child.kill("SIGTERM");
    });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", () => {
      clearTimeout(timer);
      rmSync(directory, { recursive: true, force: true });
      if (!stdout) {
        reject(new Error(`${stderr}\nBrowser decision deep-link DOM is empty`));
        return;
      }
      const encoded = stdout.match(/<title>RESULT:([^<]+)<\/title>/)?.[1];
      if (!encoded) {
        reject(new Error(`${stderr}\nBrowser decision deep-link result missing from DOM:\n${stdout.slice(0, 500)}`));
        return;
      }
      resolve(JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as DecisionDeepLinkBrowserState);
    });
  });
}

function readDesktopWorkTabBrowserLayout(
  openTabs: string[],
): Promise<DesktopWorkTabBrowserLayout | null> {
  const browser = [
    process.env.GOALBOARD_TEST_CHROME,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));
  if (!browser) return Promise.resolve(null);

  const directory = mkdtempSync(join(tmpdir(), "goalboard-work-tabs-layout-"));
  const profilePath = join(directory, "chrome-profile");
  const htmlPath = join(directory, "work-tabs.html");
  mkdirSync(profilePath);
  const tabMarkup = openTabs.map((goalId, index) => `<div class="desktop-work-tab${index === openTabs.length - 1 ? " is-selected" : ""}" data-work-tab-shell="${goalId}"><button type="button" role="tab" data-work-tab="${goalId}" aria-selected="${index === openTabs.length - 1}"><i aria-hidden="true"></i><span>这是第 ${index + 1} 个用于验证完整可见的较长 Goal 标题</span></button><button type="button">×</button></div>`).join("");
  const browserHtml = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>${WORKBENCH_STYLES}
    .desktop-work-tabs.fixture-work-tabs { width: 420px; max-width: 420px; }
  </style></head><body data-board-view="current" data-desktop-shell="true" data-native-desktop="true">
    <div class="desktop-work-tabs fixture-work-tabs" data-work-tabs role="tablist" aria-label="已打开的 Goal">${tabMarkup}</div>
    <script>
      window.requestAnimationFrame = (callback) => setTimeout(() => callback(performance.now()), 0);
      window.cancelAnimationFrame = (handle) => clearTimeout(handle);
      const workTabs = document.querySelector("[data-work-tabs]");
      ${WORK_TAB_VISIBILITY_CLIENT_SCRIPT}
      ensureActiveWorkTabVisible();
      (async () => {
        const waitForLayout = () => new Promise((resolve) => setTimeout(resolve, 100));
        const snapshot = () => {
          const rail = document.querySelector("[data-work-tabs]");
          const tab = rail.querySelector(".desktop-work-tab.is-selected");
          const railRect = rail.getBoundingClientRect();
          const tabRect = tab.getBoundingClientRect();
          return {
            railLeft: railRect.left,
            railRight: railRect.right,
            tabLeft: tabRect.left,
            tabRight: tabRect.right,
            scrollLeft: rail.scrollLeft,
            scrollWidth: rail.scrollWidth,
            tabCount: rail.querySelectorAll(".desktop-work-tab").length,
          };
        };
        try {
          await waitForLayout();
          const initial = snapshot();
          const rail = document.querySelector("[data-work-tabs]");
          rail.style.width = "300px";
          rail.style.maxWidth = "300px";
          ensureActiveWorkTabVisible();
          await waitForLayout();
          await waitForLayout();
          const resized = snapshot();
          const result = { initial, resized };
          document.title = "RESULT:" + btoa(unescape(encodeURIComponent(JSON.stringify(result))));
        } catch (error) {
          document.title = "ERROR:" + String(error?.stack || error);
        }
      })();
    </script></body></html>`;
  writeFileSync(htmlPath, browserHtml);

  return new Promise((resolve, reject) => {
    const child = spawn(browser, [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-background-mode",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-extensions",
      "--no-default-browser-check",
      "--no-first-run",
      `--user-data-dir=${profilePath}`,
      "--window-size=800,500",
      "--virtual-time-budget=3000",
      "--dump-dom",
      `file://${htmlPath}`,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), 15_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (/<title>RESULT:[^<]+<\/title>/.test(stdout)) child.kill("SIGTERM");
    });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", () => {
      clearTimeout(timer);
      rmSync(directory, { recursive: true, force: true });
      const encoded = stdout.match(/<title>RESULT:([^<]+)<\/title>/)?.[1];
      if (!encoded) {
        reject(new Error(`${stderr}\nBrowser work-tab result missing from DOM:\n${stdout.slice(0, 500)}`));
        return;
      }
      resolve(JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as DesktopWorkTabBrowserLayout);
    });
  });
}

test("Goal Tree applies the width chosen with its splitter", async (context) => {
  const layout = await readGoalTreeBrowserLayout();
  if (!layout) return context.skip("Headless Chrome is unavailable");
  assert.ok(Math.abs(layout.paneWidth - 519) <= 1, `expected 519px, received ${layout.paneWidth}px`);
});

test("Goal Tree shows a long nested title without clipping", async (context) => {
  const layout = await readGoalTreeBrowserLayout();
  if (!layout) return context.skip("Headless Chrome is unavailable");
  assert.notEqual(layout.titleWhiteSpace, "nowrap");
  assert.ok(layout.titleLineCount > 1, `expected wrapped title, received ${layout.titleLineCount} line`);
  assert.ok(layout.titleScrollWidth <= layout.titleClientWidth + 1, "title is clipped horizontally");
  assert.ok(layout.titleScrollHeight <= layout.titleClientHeight + 1, "title is clipped vertically");
});

test("Goal Tree compacts an expanded parent row and restores its folded summary", async (context) => {
  const layout = await readGoalTreeBrowserLayout();
  if (!layout) return context.skip("Headless Chrome is unavailable");
  assert.ok(layout.parentCollapsedLineCount > 1, `expected folded parent title to wrap, received ${layout.parentCollapsedLineCount} line`);
  assert.notEqual(layout.parentCollapsedProgressDisplay, "none");
  assert.equal(layout.parentExpandedWhiteSpace, "nowrap");
  assert.ok(
    layout.parentExpandedTitleHeight < layout.parentCollapsedTitleHeight,
    `expected expanded title (${layout.parentExpandedTitleHeight}px) to be shorter than folded title (${layout.parentCollapsedTitleHeight}px)`,
  );
  assert.equal(layout.parentExpandedProgressDisplay, "none");
  assert.ok(
    layout.parentExpandedRowHeight < layout.parentCollapsedRowHeight,
    `expected expanded row (${layout.parentExpandedRowHeight}px) to be shorter than folded row (${layout.parentCollapsedRowHeight}px)`,
  );
  assert.ok(layout.parentRestoredLineCount > 1);
  assert.notEqual(layout.parentRestoredProgressDisplay, "none");
  assert.ok(Math.abs(layout.parentRestoredRowHeight - layout.parentCollapsedRowHeight) <= 1);
});

test("Desktop workbench keeps stable Goal ids visible in the Goal Tree", () => {
  assert.match(WORKBENCH_STYLES, /\.tree-copy > small \{[^}]*display:\s*block/);
  assert.doesNotMatch(
    WORKBENCH_STYLES,
    /body\[data-desktop-shell="true"\] \.tree-copy small \{[^}]*display:\s*none/,
  );
});

test("desktop work tabs keep a readable width and scroll instead of overlapping", () => {
  assert.match(
    WORKBENCH_STYLES,
    /\.desktop-work-tabs \{[^}]*overflow-x: auto;/,
  );
  assert.match(
    WORKBENCH_STYLES,
    /\.desktop-work-tab \{[^}]*flex: 0 0 clamp\(132px, 16vw, 190px\);/,
  );
  assert.match(
    WORKBENCH_STYLES,
    /\.desktop-work-tab > \[role="tab"\] span \{[^}]*overflow: hidden;[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/,
  );
  assert.match(
    WORKBENCH_CLIENT_SCRIPT,
    /const ensureActiveWorkTabVisible = \(\) => \{[\s\S]*activeTabShell[\s\S]*workTabs\.scrollLeft/,
  );
  assert.match(WORKBENCH_CLIENT_SCRIPT, /new ResizeObserver\(ensureActiveWorkTabVisible\)/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /persistWorkTabs\(\);\s*ensureActiveWorkTabVisible\(\);/);
});

test("desktop work tabs keep the active tab fully visible after restore and resize", async (context) => {
  const openTabs = ["goal-one", "goal-two", "goal-three", "goal-four"];
  const layout = await readDesktopWorkTabBrowserLayout(openTabs);
  if (!layout) return context.skip("Headless Chrome is unavailable");
  for (const [state, snapshot] of Object.entries(layout)) {
    assert.ok(snapshot.tabLeft >= snapshot.railLeft - 1, `${state}: active tab starts outside the rail: ${JSON.stringify(layout)}`);
    assert.ok(snapshot.tabRight <= snapshot.railRight + 1, `${state}: active tab ends outside the rail: ${JSON.stringify(layout)}`);
  }
  assert.equal(layout.initial.tabCount, 4);
  assert.ok(layout.initial.scrollWidth > layout.initial.railRight - layout.initial.railLeft);
  assert.ok(layout.initial.scrollLeft > 0, `restored trailing tab should scroll into view: ${JSON.stringify(layout)}`);
  assert.ok(layout.resized.scrollLeft >= layout.initial.scrollLeft, "narrower rail should preserve or advance the tab scroll");
});

test("Goal Tree uses compact Runtime references instead of long internal ids", () => {
  assert.equal(goalTreeReferenceLabel("cgs-g2a-opportunity-intelligence"), "G2A");
  assert.equal(goalTreeReferenceLabel("cgs-g2b-editorial-decision"), "G2B");
  assert.equal(goalTreeReferenceLabel("cgs-g12f-topic-analysis"), "G12F");
  assert.equal(goalTreeReferenceLabel("V1"), "V1");
  assert.equal(goalTreeReferenceLabel("draft-e5f42553-1111-2222-3333-444444444444"), null);
});

test("Goal Tree disambiguates Goals that share the same compact Runtime reference", () => {
  const labels = goalTreeReferenceLabels([
    "cgs-g2a-opportunity-intelligence",
    "cgs-g2g-ai-kol-quality-roster",
    "cgs-g2g-ai-kol-quality-roster-v2",
    "cgs-g2g-roster-schema",
    "cgs-g2g-roster-integration",
    "cgs-g2g-douyin-roster",
    "cgs-g2g-x-roster",
    "cgs-g2g-xiaohongshu-roster",
  ]);

  assert.equal(labels.get("cgs-g2a-opportunity-intelligence"), "G2A");
  assert.equal(labels.get("cgs-g2g-ai-kol-quality-roster"), "G2G");
  assert.equal(labels.get("cgs-g2g-ai-kol-quality-roster-v2"), "G2G/V2");
  assert.equal(labels.get("cgs-g2g-roster-schema"), "G2G/S");
  assert.equal(labels.get("cgs-g2g-roster-integration"), "G2G/I");
  assert.equal(labels.get("cgs-g2g-douyin-roster"), "G2G/D");
  assert.equal(labels.get("cgs-g2g-x-roster"), "G2G/X");
  assert.equal(labels.get("cgs-g2g-xiaohongshu-roster"), "G2G/XI");
  assert.equal(new Set(labels.values()).size, labels.size, "rendered Goal references must be unique");
});

test("Web keeps a released Run blocker as history instead of a current blocker", () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-historical-run-blocker-"));
  const databasePath = join(directory, "board.db");
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.initializeBoard({
    board_id: "historical-run-blocker-board",
    title: "Historical Run blocker",
    actor_id: "owner",
    idempotency_key: "historical-run-blocker-board-create",
  });
  coordinator.createGoal(
    "historical-run-blocker-board",
    {
      goal_id: "historical-run-blocker-goal",
      title: "范围已经纠偏的目标",
      outcome: "当前范围不再要求成本与返工证据",
      why: "避免旧执行判断继续冒充当前待办",
      business_logic: "历史报告保留原文，当前状态只由仍有效事实派生。",
      promised_outputs: ["当前范围不再要求成本与返工证据"],
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [{
        criterion_id: "historical-run-blocker-current-result",
        statement: "当前范围结果可检查",
        decision_method: "inspection",
        pass_condition: "当前状态不引用已释放 Run 的旧理由",
      }],
    },
    { actor_id: "owner", idempotency_key: "historical-run-blocker-goal-create" },
  );
  const selected = coordinator.selectGoalAndStart({
    board_id: "historical-run-blocker-board",
    goal_id: "historical-run-blocker-goal",
    actor_id: "runtime-old-scope",
    role: "executor",
    idempotency_key: "historical-run-blocker-select",
  });
  coordinator.reportRun({
    board_id: "historical-run-blocker-board",
    run_id: selected.run!.run_id,
    actor_id: "runtime-old-scope",
    state: "failed",
    block_reason: "旧范围要求补 Agent 成本、Token 和返工证据",
    idempotency_key: "historical-run-blocker-report",
  });
  const view = buildGoalBoardWebView(store, coordinator, {
    boardId: "historical-run-blocker-board",
  });
  const item = view.goals.find((candidate) => candidate.goal.goal_id === "historical-run-blocker-goal")!;
  assert.equal(item.work_state, "execution_pending");
  assert.deepEqual(item.reasons, []);
  const page = renderGoalBoardWeb(view, "historical-run-blocker-goal");
  const progress = renderGoalPanelFragment(view, "historical-run-blocker-goal", "progress") ?? "";
  assert.match(progress, /当时记录：旧范围要求补 Agent 成本、Token 和返工证据/);
  assert.match(progress, /这不是当前阻塞/);
  assert.doesNotMatch(page, /<dt>当前阻塞<\/dt><dd>旧范围要求补 Agent 成本、Token 和返工证据/);
  const records = renderGoalRecordsFragment(view, "historical-run-blocker-goal")!;
  assert.match(records, /当时报告的阻塞/);
  assert.match(records, /这条历史记录不会自动成为当前阻塞/);
  store.close();
});

test("an open completion Risk stays visible without replacing an executable Goal's next action", () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-completion-risk-action-"));
  const databasePath = join(directory, "board.db");
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.initializeBoard({
    board_id: "completion-risk-action-board",
    title: "Completion Risk action",
    actor_id: "owner",
    idempotency_key: "completion-risk-action-board-create",
  });
  coordinator.createGoal(
    "completion-risk-action-board",
    {
      goal_id: "completion-risk-action-goal",
      title: "继续修正真实搜索能力",
      outcome: "检索路由可以被真实复核",
      why: "新反证证明旧实现不足",
      business_logic: "先修正实现，再由 completion Risk 约束最终完成。",
      promised_outputs: ["可复核的检索路由"],
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [{
        criterion_id: "completion-risk-action-criterion",
        statement: "真实检索路由通过复核",
        decision_method: "inspection",
        pass_condition: "新的检查记录覆盖 Contract",
        required_evidence: ["inspection"],
      }],
    },
    { actor_id: "owner", idempotency_key: "completion-risk-action-goal-create" },
  );
  coordinator.addRisk(
    "completion-risk-action-board",
    {
      risk_id: "completion-risk-action-risk",
      goal_ids: ["completion-risk-action-goal"],
      description: "来源覆盖还没有完成最终核对",
      probability: "medium",
      impact: "不能宣告完整覆盖",
      affected_surfaces: ["真实来源覆盖"],
      trigger: "覆盖核对尚未完成",
      treatment: "mitigate",
      treatment_plan: "完成覆盖核对",
      blocking_mode: "completion",
      revisit_condition: "覆盖核对通过",
      owner: "research-owner",
    },
    { actor_id: "owner", idempotency_key: "completion-risk-action-risk-create" },
  );

  const view = buildGoalBoardWebView(store, coordinator, { boardId: "completion-risk-action-board" });
  const item = view.goals.find((entry) => entry.goal.goal_id === "completion-risk-action-goal")!;
  assert.equal(item.status, "execution_pending");
  assert.equal(
    countGoalDecisions(view, item.goal.goal_id),
    0,
    "a Runtime-mitigated Risk stays in Goal context instead of becoming a user decision",
  );
  const html = renderGoalBoardWeb(view, item.goal.goal_id);
  const factors = renderGoalPanelFragment(view, item.goal.goal_id, "factors") ?? "";
  assert.match(html, /data-goal-status="continue"/);
  assert.match(html, /goal-now-body[\s\S]*?<strong>处理风险<\/strong>/);
  assert.match(html, /goal-now-body[\s\S]*?<span>处理风险<\/span>/);
  assert.doesNotMatch(html, /goal-now-body[\s\S]{0,800}<strong>先完成等待你的决定<\/strong>/);
  assert.match(factors, /来源覆盖还没有完成最终核对/);

  store.close();
  rmSync(directory, { recursive: true, force: true });
});

test("Web keeps a replaced Goal as readable history while directing work to its replacement", () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-replaced-goal-"));
  const databasePath = join(directory, "board.db");
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  const boardId = "replaced-goal-board";
  coordinator.initializeBoard({
    board_id: boardId,
    title: "Replacement",
    actor_id: "owner",
    idempotency_key: "replaced-goal-board-create",
  });
  for (const [goalId, title] of [["roster-v1", "旧版 KOL 名单"], ["roster-v2", "新版七平台 KOL 名单"]]) {
    coordinator.createGoal(
      boardId,
      {
        goal_id: goalId,
        title,
        outcome: `${title}可检查`,
        why: "让执行范围保持当前有效",
        business_logic: "只推进用户当前确认的版本。",
        promised_outputs: [`${title}结果`],
        definition_state: "accepted",
        decomposition_state: "closed_leaf",
        acceptance_criteria: [{
          criterion_id: `${goalId}-criterion`,
          statement: `${title}存在`,
          decision_method: "inspection",
          pass_condition: "结果可读",
          required_evidence: ["artifact"],
        }],
      },
      { actor_id: "owner", idempotency_key: `create-${goalId}` },
    );
  }
  coordinator.addRelation(
    boardId,
    {
      from_goal_id: "roster-v2",
      to_goal_id: "roster-v1",
      type: "replaces",
      reason: "用户确认新版取代旧范围",
    },
    { actor_id: "owner", idempotency_key: "replace-roster-v1" },
  );
  const view = buildGoalBoardWebView(store, coordinator, { boardId });
  assert.equal(view.goals.find((item) => item.goal.goal_id === "roster-v1")?.status, "replaced");
  assert.equal(view.goals.find((item) => item.goal.goal_id === "roster-v2")?.status, "execution_pending");
  const html = renderGoalBoardWeb(view, "roster-v1");
  assert.match(html, /goal-status--replaced/);
  assert.match(html, /已被替代/);
  assert.match(html, /新版七平台 KOL 名单/);
  assert.match(html, /被替代/);
  store.close();
  rmSync(directory, { recursive: true, force: true });
});

test("completed Goal presentation closes criteria without inventing Evidence", () => {
  const item = {
    status: "satisfied",
    goal: {
      fulfillment_state: "satisfied",
      acceptance_criteria: [
        { criterion_id: "ROOT-C1" },
        { criterion_id: "ROOT-C2" },
      ],
    },
    passed_criteria: [],
  } as unknown as Parameters<typeof displayedPassedCriterionIds>[0];

  assert.deepEqual(displayedPassedCriterionIds(item), ["ROOT-C1", "ROOT-C2"]);
  assert.deepEqual(item.passed_criteria, [], "presentation must not fabricate canonical Evidence facts");

  item.status = "execution_pending";
  item.goal.fulfillment_state = "unmet";
  item.passed_criteria = ["ROOT-C1", "UNKNOWN"];
  assert.deepEqual(displayedPassedCriterionIds(item), ["ROOT-C1"]);
});

test("Web distinguishes local Contract satisfaction from recorded parent Contract coverage", () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-contract-coverage-"));
  const databasePath = join(directory, "coverage.db");
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.initializeBoard({
    board_id: "coverage-board",
    title: "Contract Coverage",
    actor_id: "user-1",
    idempotency_key: "coverage-board-create",
  });
  coordinator.createGoal(
    "coverage-board",
    {
      goal_id: "coverage-parent",
      title: "形成可解释的完整机会能力",
      outcome: "多源研究能够形成可解释机会",
      why: "避免把代表性样本误当成完整能力",
      business_logic: "父级能力由多个子 Contract 的明确结果共同覆盖。",
      promised_outputs: ["可解释的多源机会"],
      definition_state: "accepted",
      decomposition_state: "closed_compound",
      decomposition_review: {
        status: "complete",
        task_context: "content_research",
        coverage: [],
        open_goal_ids: [],
        next_step: "按子 Goal 推进。",
        contract_coverage: {
          promised_outputs: [
            {
              parent_promised_output: "可解释的多源机会",
              status: "complete",
              child_outputs: [
                { goal_id: "coverage-child", promised_output: "三类代表性样本" },
              ],
              reason: "这是用户确认的父子结果映射。",
            },
          ],
          acceptance_criteria: [
            {
              parent_criterion_id: "coverage-parent-criterion",
              status: "complete",
              child_criteria: [
                { goal_id: "coverage-child", criterion_id: "coverage-child-criterion" },
              ],
              reason: "子级检查提供父级验收依据。",
            },
          ],
        },
      },
      acceptance_criteria: [
        {
          criterion_id: "coverage-parent-criterion",
          statement: "机会形成链路可解释",
          decision_method: "inspection",
          pass_condition: "父子结果均可追溯",
          required_evidence: ["coverage-map"],
        },
      ],
    },
    { actor_id: "user-1", idempotency_key: "coverage-parent-create" },
  );
  coordinator.createGoal(
    "coverage-board",
    {
      goal_id: "coverage-child",
      title: "保存三类代表性样本",
      outcome: "三类样本可读取",
      why: "验证最小样本链路",
      business_logic: "只交付被当前 Contract 承诺的代表性样本。",
      promised_outputs: ["三类代表性样本"],
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [
        {
          criterion_id: "coverage-child-criterion",
          statement: "三类样本存在",
          decision_method: "inspection",
          pass_condition: "每类至少一个样本",
          required_evidence: ["sample-file"],
        },
      ],
    },
    { actor_id: "user-1", idempotency_key: "coverage-child-create" },
  );
  coordinator.addRelation(
    "coverage-board",
    {
      from_goal_id: "coverage-child",
      to_goal_id: "coverage-parent",
      type: "part_of",
      reason: "样本属于父级机会能力的一部分。",
    },
    { actor_id: "user-1", idempotency_key: "coverage-relation" },
  );
  store.db.prepare("UPDATE goals SET fulfillment_state = 'satisfied' WHERE goal_id = ?").run("coverage-child");

  const view = buildGoalBoardWebView(store, coordinator, { boardId: "coverage-board" });
  const childHtml = renderGoalPanelFragment(view, "coverage-child", "completion") ?? "";
  assert.match(childHtml, /本 Goal 按当前 Contract 已满足/);
  assert.match(childHtml, /对父 Goal 的贡献/);
  assert.match(childHtml, /形成可解释的完整机会能力/);
  assert.match(childHtml, /可解释的多源机会/);
  const parentHtml = renderGoalPanelFragment(view, "coverage-parent", "completion") ?? "";
  assert.match(parentHtml, /父子 Contract 覆盖/);
  assert.match(parentHtml, /三类代表性样本/);

  const partialReview = structuredClone(store.getGoal("coverage-parent")!.decomposition_review!);
  partialReview.contract_coverage!.promised_outputs[0]!.status = "partial";
  partialReview.contract_coverage!.promised_outputs[0]!.reason = "样本只覆盖演示链路，尚未覆盖完整父级能力。";
  partialReview.contract_coverage!.acceptance_criteria[0]!.status = "integration_required";
  partialReview.contract_coverage!.acceptance_criteria[0]!.reason = "仍需父级集成验收。";
  store.db
    .prepare("UPDATE goals SET decomposition_review_json = ?, fulfillment_state = 'unmet' WHERE goal_id = ?")
    .run(JSON.stringify(partialReview), "coverage-parent");
  const partialView = buildGoalBoardWebView(store, coordinator, { boardId: "coverage-board" });
  const partialParentHtml = renderGoalPanelFragment(partialView, "coverage-parent", "completion") ?? "";
  assert.match(partialParentHtml, /父级 Contract 仍有覆盖缺口/);
  assert.match(partialParentHtml, /现有子 Goal 的完成数量不足以证明父级承诺已经实现/);
  assert.doesNotMatch(partialParentHtml, /还剩 0 个子 Goal；全部完成后，这条父 Goal 会自动完成/);

  store.db
    .prepare("UPDATE goals SET decomposition_review_json = NULL, fulfillment_state = 'satisfied' WHERE goal_id = ?")
    .run("coverage-parent");
  const historicalView = buildGoalBoardWebView(store, coordinator, { boardId: "coverage-board" });
  const historicalParentHtml = renderGoalPanelFragment(historicalView, "coverage-parent", "completion") ?? "";
  assert.match(historicalParentHtml, /未记录父子 Contract 覆盖（历史数据）/);
  assert.equal(store.getGoal("coverage-parent")?.fulfillment_state, "satisfied");
  const historicalChildHtml = renderGoalPanelFragment(historicalView, "coverage-child", "completion") ?? "";
  assert.match(historicalChildHtml, /这条历史父 Goal 未记录父子 Contract 覆盖/);
  store.close();
  rmSync(directory, { recursive: true, force: true });
});

test("Goal Tree sorts ready work before blocked, waiting, and finished Goals", () => {
  assert.deepEqual([...GOAL_TREE_STATUS_ORDER].sort(), [...WEB_GOAL_STATUSES].sort());
  const ordered = sortGoalTreeItems([
    { status: "satisfied", goal: { priority: 9, created_at: "2026-01-01T00:00:00.000Z" } },
    { status: "waiting_children", goal: { priority: 8, created_at: "2026-01-02T00:00:00.000Z" } },
    { status: "execution_blocked", goal: { priority: 7, created_at: "2026-01-03T00:00:00.000Z" } },
    { status: "completion_blocked", goal: { priority: 7, created_at: "2026-01-03T12:00:00.000Z" } },
    { status: "clarification_pending", goal: { priority: 6, created_at: "2026-01-04T00:00:00.000Z" } },
    { status: "executing", goal: { priority: 1, created_at: "2026-01-06T00:00:00.000Z" } },
    { status: "execution_pending", goal: { priority: 1, created_at: "2026-01-05T00:00:00.000Z" } },
    { status: "execution_pending", goal: { priority: 3, created_at: "2026-01-07T00:00:00.000Z" } },
    { status: "completion_pending", goal: { priority: 1, created_at: "2026-01-08T00:00:00.000Z" } },
  ]);
  assert.deepEqual(ordered.map((item) => [item.status, item.goal.priority, item.goal.created_at]), [
    ["completion_pending", 1, "2026-01-08T00:00:00.000Z"],
    ["execution_pending", 3, "2026-01-07T00:00:00.000Z"],
    ["execution_pending", 1, "2026-01-05T00:00:00.000Z"],
    ["executing", 1, "2026-01-06T00:00:00.000Z"],
    ["clarification_pending", 6, "2026-01-04T00:00:00.000Z"],
    ["execution_blocked", 7, "2026-01-03T00:00:00.000Z"],
    ["completion_blocked", 7, "2026-01-03T12:00:00.000Z"],
    ["waiting_children", 8, "2026-01-02T00:00:00.000Z"],
    ["satisfied", 9, "2026-01-01T00:00:00.000Z"],
  ]);
});

function createGoalBoardWebServer(
  options: Parameters<typeof createBaseGoalBoardWebServer>[0] = {},
) {
  return createBaseGoalBoardWebServer({ ...options, controlToken: WEB_TEST_CONTROL_TOKEN });
}

function webFetch(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method === "GET" || method === "HEAD") return globalThis.fetch(input, init);
  const target = new URL(input instanceof Request ? input.url : String(input));
  const headers = new Headers(init.headers);
  if (!headers.has("origin")) headers.set("origin", target.origin);
  if (!headers.has("x-goalboard-control-token")) {
    headers.set("x-goalboard-control-token", WEB_TEST_CONTROL_TOKEN);
  }
  if (!headers.has("x-goalboard-idempotency-key")) {
    webRequestSequence += 1;
    headers.set("x-goalboard-idempotency-key", `web-test-request-${webRequestSequence}`);
  }
  return globalThis.fetch(input, { ...init, headers });
}

async function goalPageWithLazyContent(
  origin: string,
  goalId: string,
  panels: Array<"completion" | "progress" | "factors"> = [],
  quickRecord = false,
): Promise<string> {
  const encodedGoalId = encodeURIComponent(goalId);
  const fragments = await Promise.all([
    webFetch(`${origin}/goals/${encodedGoalId}`).then((response) => response.text()),
    ...panels.map((panel) =>
      webFetch(`${origin}/api/goals/${encodedGoalId}/panels/${panel}?view=current`)
        .then((response) => response.text())),
    ...(quickRecord
      ? [webFetch(`${origin}/api/goals/${encodedGoalId}/quick-record?view=current`)
          .then((response) => response.text())]
      : []),
  ]);
  return fragments.join("");
}

function rawHttpGet(port: number, path: string, hostHeader: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: "127.0.0.1", port, path, headers: { host: hostHeader } }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body }));
    });
    request.on("error", reject);
    request.end();
  });
}

function assertInlineScriptsCompile(html: string): void {
  const scripts = Array.from(html.matchAll(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/g));
  for (const [, source] of scripts) {
    if (!source.trim() || source.trim().startsWith("{")) continue;
    assert.doesNotThrow(() => new Script(source), "rendered inline script must be valid JavaScript");
  }
}

function workSurfaceHtml(html: string, surface: "goal" | "feed"): string {
  const marker = `data-work-surface="${surface}"`;
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, `missing ${surface} work surface`);
  const next = html.indexOf('data-work-surface="', start + marker.length);
  return html.slice(start, next === -1 ? html.length : next);
}

function feedDetailHtml(html: string, itemId: string): string {
  const marker = `data-feed-detail="${itemId}"`;
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, `missing feed detail ${itemId}`);
  const next = html.indexOf('<article class="feed-detail', start + marker.length);
  return html.slice(start, next === -1 ? html.length : next);
}

function webFixture() {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-"));
  const databasePath = join(directory, "demo.db");
  seedDemoBoard(databasePath);
  return { databasePath, homeDirectory: directory };
}

test("Web health identifies the process serving the response", async () => {
  const homeDirectory = mkdtempSync(join(tmpdir(), "goalboard-web-health-"));
  const server = createGoalBoardWebServer({ homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const health = await (await webFetch(`http://127.0.0.1:${address.port}/health`)).json() as {
      status: string;
      process_id?: number;
      service_process_id?: number;
    };
    assert.equal(health.status, "ok");
    assert.equal(health.process_id, process.pid);
    assert.equal(health.service_process_id, process.pid);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    rmSync(homeDirectory, { recursive: true, force: true });
  }
});

test("Web View cache follows canonical Board events instead of SQLite file lifecycle", () => {
  const { databasePath } = webFixture();
  const cache = new Map() as Parameters<typeof cachedGoalBoardWebView>[0];
  const options = { databasePath, boardId: DEMO_BOARD_ID, demo: true };

  const firstStore = new SqliteGoalBoardStore(databasePath);
  const first = cachedGoalBoardWebView(
    cache,
    firstStore,
    new GoalBoardCoordinator(firstStore),
    options,
  );
  firstStore.close();

  const reopenedStore = new SqliteGoalBoardStore(databasePath);
  try {
    const coordinator = new GoalBoardCoordinator(reopenedStore);
    const unchanged = cachedGoalBoardWebView(cache, reopenedStore, coordinator, options);
    assert.strictEqual(unchanged, first, "opening the SQLite WAL must not invalidate an unchanged Board");

    coordinator.createGoal(
      DEMO_BOARD_ID,
      {
        goal_id: "CACHE-EVENT",
        title: "通过事件使 Web View 失效",
        outcome: "",
        why: "",
        business_logic: "",
        definition_state: "draft",
        decomposition_state: "abstract",
        acceptance_criteria: [],
      },
      { actor_id: "test-user", idempotency_key: "web-cache-event" },
    );
    const changed = cachedGoalBoardWebView(cache, reopenedStore, coordinator, options);
    assert.notStrictEqual(changed, first);
    assert.ok(changed.goals.some((item) => item.goal.goal_id === "CACHE-EVENT"));

  } finally {
    reopenedStore.close();
  }
});

async function webProjectCatalogFixture() {
  const homeDirectory = mkdtempSync(join(tmpdir(), "goalboard-web-project-catalog-"));
  const alphaContext = {
    runtime_id: "web-project-test-runtime",
    stable_work_context_id: "web-project-alpha-session",
    host_declares_stable: true,
  };
  const betaContext = {
    runtime_id: "web-project-test-runtime",
    stable_work_context_id: "web-project-beta-session",
    host_declares_stable: true,
  };
  const catalog = await GoalBoardProjectCatalog.open({ homeDirectory });
  try {
    const alphaResolution = await catalog.createProjectAndBindRuntimeContext({
      context: alphaContext,
      display_name: "产品 Alpha",
      actor_id: "test-user",
      user_confirmed: true,
      idempotency_key: "web-project-alpha-create",
    });
    const betaResolution = await catalog.createProjectAndBindRuntimeContext({
      context: betaContext,
      display_name: "产品 Beta",
      actor_id: "test-user",
      user_confirmed: true,
      idempotency_key: "web-project-beta-create",
    });
    assert.ok(alphaResolution.project);
    assert.ok(betaResolution.project);
    return {
      homeDirectory,
      alpha: catalog.getProject(alphaResolution.project.project_id),
      beta: catalog.getProject(betaResolution.project.project_id),
      alphaContext,
      betaContext,
      bindingEvents: catalog.listRuntimeContextBindingEvents(),
    };
  } finally {
    catalog.close();
  }
}

function webRuntimeIntegrationFixture(homeDirectory: string) {
  const userHomeDirectory = join(homeDirectory, "test-user-home");
  const release = join(homeDirectory, "releases", "goalboard-web-test");
  const skill = join(release, "skills", "goal-advance");
  const launcher = join(homeDirectory, "bin", "goalboard-mcp");
  const runtimeBin = join(homeDirectory, "test-runtime-bin");
  mkdirSync(join(homeDirectory, "config"), { recursive: true });
  mkdirSync(skill, { recursive: true });
  mkdirSync(join(homeDirectory, "bin"), { recursive: true });
  mkdirSync(runtimeBin, { recursive: true });
  mkdirSync(userHomeDirectory, { recursive: true });
  writeFileSync(join(homeDirectory, "config", "installation.json"), `${JSON.stringify({
    schema_version: 2,
    installer: "goalboard-home-install-v1",
    version: "web-test",
    release_path: "releases/goalboard-web-test",
  }, null, 2)}\n`);
  writeFileSync(join(skill, "SKILL.md"), "---\nname: goal-advance\n---\n");
  writeFileSync(launcher, "#!/bin/sh\nexit 0\n");
  const codex = join(runtimeBin, "codex");
  const claude = join(runtimeBin, "claude");
  const opencode = join(runtimeBin, "opencode");
  const pi = join(runtimeBin, "pi");
  const grok = join(runtimeBin, "grok");
  for (const file of [codex, claude, opencode, pi, grok]) writeFileSync(file, "#!/bin/sh\nexit 0\n");
  [launcher, codex, claude, opencode, pi, grok].forEach((file) => chmodSync(file, 0o755));
  return {
    userHomeDirectory,
    skill,
    launcher,
    service: new RuntimeIntegrationService({
      homeDirectory,
      userHomeDirectory,
      runtimeExecutables: { codex, "claude-code": claude, opencode, "pi-agent": pi, "grok-build": grok },
      validateConnection: () => true,
    }),
  };
}

function addProjectGoal(
  project: { database_path: string; board_id: string },
  goalId: string,
  title: string,
): void {
  const store = new SqliteGoalBoardStore(project.database_path);
  try {
    new GoalBoardCoordinator(store).createGoal(
      project.board_id,
      {
        goal_id: goalId,
        title,
        outcome: "",
        why: "",
        business_logic: "",
        definition_state: "draft",
        decomposition_state: "abstract",
        acceptance_criteria: [],
      },
      { actor_id: "test-user", idempotency_key: `web-project-goal-${goalId}` },
    );
  } finally {
    store.close();
  }
}

function startProjectClarification(
  project: { database_path: string; board_id: string },
  goalId: string,
  actorId: string,
): void {
  const store = new SqliteGoalBoardStore(project.database_path);
  try {
    new GoalBoardCoordinator(store).selectGoalAndStart({
      board_id: project.board_id,
      goal_id: goalId,
      actor_id: actorId,
      role: "clarifier",
      idempotency_key: `web-project-start-${goalId}`,
    });
  } finally {
    store.close();
  }
}

function boardSnapshot(databasePath: string, boardId: string) {
  const store = new SqliteGoalBoardStore(databasePath);
  try {
    return store.snapshot(boardId);
  } finally {
    store.close();
  }
}

test("Web distinguishes automatic parent completion from decomposition confirmation and structural conflicts", async () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-parent-completion-"));
  const databasePath = join(directory, "goalboard.db");
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  const boardId = "web-parent-completion-board";
  coordinator.initializeBoard({
    board_id: boardId,
    title: "Parent Completion",
    actor_id: "web-user",
    idempotency_key: "parent-completion-init",
  });

  const createGoal = (
    goalId: string,
    title: string,
    definitionState: "draft" | "accepted",
    decompositionState: "frontier_open" | "closed_leaf" | "closed_compound",
  ) => coordinator.createGoal(
    boardId,
    {
      goal_id: goalId,
      title,
      outcome: `${title}的可检查结果`,
      why: "让父子 Goal 的完成关系可预测",
      business_logic: "子 Goal 交付具体结果，父 Goal 按已经确认的拆分方式汇总。",
      definition_state: definitionState,
      decomposition_state: decompositionState,
      acceptance_criteria: [{
        criterion_id: `${goalId}-done`,
        statement: `${title}达到预期结果`,
        decision_method: "inspection" as const,
        pass_condition: "页面说明和实际状态一致",
        required_evidence: ["test"],
      }],
    },
    { actor_id: "web-user", idempotency_key: `create-${goalId}` },
  ).goal;

  createGoal("OPEN-PARENT", "尚未确认拆分结束的父 Goal", "draft", "frontier_open");
  createGoal("OPEN-CHILD", "已经完成的当前子 Goal", "accepted", "closed_leaf");
  coordinator.addRelation(
    boardId,
    {
      from_goal_id: "OPEN-CHILD",
      to_goal_id: "OPEN-PARENT",
      type: "part_of",
      reason: "当前已知拆分的一部分",
    },
    { actor_id: "web-user", idempotency_key: "open-parent-child" },
  );
  store.db.prepare("UPDATE goals SET fulfillment_state = 'satisfied' WHERE goal_id = ?").run("OPEN-CHILD");

  createGoal("COMPOUND-PARENT", "已确认由子 Goal 完成的父 Goal", "accepted", "closed_compound");
  createGoal("COMPOUND-CHILD", "尚未完成的必要子 Goal", "accepted", "closed_leaf");
  coordinator.addRelation(
    boardId,
    {
      from_goal_id: "COMPOUND-CHILD",
      to_goal_id: "COMPOUND-PARENT",
      type: "part_of",
      reason: "确认由这条子 Goal 共同完成父目标",
    },
    { actor_id: "web-user", idempotency_key: "compound-parent-child" },
  );

  createGoal("LEAF-PARENT", "误标为叶子的父 Goal", "accepted", "closed_leaf");
  createGoal("LEAF-CHILD", "与叶子标记冲突的子 Goal", "accepted", "closed_leaf");
  coordinator.addRelation(
    boardId,
    {
      from_goal_id: "LEAF-CHILD",
      to_goal_id: "LEAF-PARENT",
      type: "part_of",
      reason: "暴露叶子 Goal 同时包含子 Goal 的结构冲突",
    },
    { actor_id: "web-user", idempotency_key: "leaf-parent-child" },
  );
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;

    const openPage = await goalPageWithLazyContent(origin, "OPEN-PARENT", ["completion"]);
    assert.match(openPage, /data-goal-id="OPEN-PARENT"[^>]*data-goal-status="continue"/);
    assert.match(openPage, /goal-status--continue[^>]*[\s\S]*?<span>可继续<\/span>/);
    assert.match(openPage, /当前列出的子 Goal 都完成了，但拆分还没有确认结束。先确认它们是否已经覆盖整个父目标/);
    assert.match(openPage, /data-open-goal-edit[^>]*aria-label="继续澄清"[^>]*>[\s\S]*?<span>继续澄清<\/span>/);
    assert.match(openPage, /child-progress--needs_confirmation/);
    assert.match(openPage, /现有子 Goal 已完成，父目标待确认/);
    assert.match(openPage, /先确认它们是否已经覆盖整个父目标/);

    const compoundPage = await goalPageWithLazyContent(origin, "COMPOUND-PARENT", ["completion"]);
    assert.match(compoundPage, /data-goal-id="COMPOUND-PARENT"[^>]*data-goal-status="waiting"/);
    assert.match(compoundPage, /goal-status--waiting[^>]*[\s\S]*?<span>等待中<\/span>/);
    assert.match(compoundPage, /child-progress--automatic/);
    assert.match(compoundPage, /子 Goal 完成后自动完成/);
    assert.match(compoundPage, /还剩 1 个子 Goal；全部完成后，这条父 Goal 会自动完成/);

    const leafPage = await goalPageWithLazyContent(origin, "LEAF-PARENT", ["completion"]);
    assert.match(leafPage, /data-goal-id="LEAF-PARENT"[^>]*data-goal-status="blocked"/);
    assert.match(leafPage, /goal-status--blocked[^>]*[\s\S]*?<span>受阻<\/span>/);
    assert.match(leafPage, /child-progress--conflict/);
    assert.match(leafPage, /父子结构需要确认/);
    assert.match(leafPage, /被标记为可以独立完成，却同时包含子 Goal/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web view derives understandable Goal states from canonical SQLite facts", () => {
  const { databasePath } = webFixture();
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  const now = new Date().toISOString();
  store.db
    .prepare(`
      INSERT INTO coverage_items (
        requirement_id, board_id, statement, disposition, owner_goal_id,
        reason, revisit_condition, blocking, created_at, updated_at
      ) VALUES (?, ?, ?, 'covered', ?, ?, NULL, 0, ?, ?)
    `)
    .run(
      "REQ-WEB-COVERAGE",
      DEMO_BOARD_ID,
      "所有 Goal 事实都能在 Web 中找到",
      "CORE",
      "由富数据 Web 夹具覆盖",
      now,
      now,
    );
  store.db
    .prepare(`
      INSERT INTO input_bindings (
        binding_id, board_id, goal_id, input_name, source_type, source_ref,
        snapshot_digest, state, reason, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?)
    `)
    .run(
      "INPUT-WEB-PROFILE",
      DEMO_BOARD_ID,
      "CORE",
      "产品规则",
      "url",
      "https://example.com/goalboard-contract",
      "sha256:web-fixture",
      "验证 Web 引用跳转",
      "test-user",
      now,
    );
  coordinator.addImpact(
    DEMO_BOARD_ID,
    {
      goal_id: "CORE",
      surface: "src/web/render.ts",
      access: "write",
      input_snapshot: "fixture-snapshot",
      reason: "验证完整 Impact 字段",
    },
    { actor_id: "test-user", idempotency_key: "web-rich-impact" },
  );
  coordinator.addRisk(
    DEMO_BOARD_ID,
    {
      risk_id: "RISK-WEB-OVERLOAD",
      goal_ids: ["CORE"],
      description: "字段过多导致信息过载",
      probability: "medium",
      impact: "high",
      affected_surfaces: ["Goal detail", "mobile"],
      trigger: "首屏成为原始字段墙",
      treatment: "mitigate",
      blocking_mode: "none",
      revisit_condition: "独立复核认为无法找到下一步",
      owner: "test-user",
    },
    { actor_id: "test-user", idempotency_key: "web-rich-risk" },
  );
  coordinator.setPolicy(
    DEMO_BOARD_ID,
    {
      goal_id: "CORE",
      policy: { goal_mode: "required", cross_reviewers: 1 },
      reason: "验证策略来源和 resolved policy",
    },
    { actor_id: "test-user", idempotency_key: "web-rich-policy" },
  );
  for (const [index, type] of [
    "conflicts_with",
    "mitigates",
    "extends",
    "replaces",
    "corrects",
    "invalidates",
    "migrates_from",
  ].entries()) {
    coordinator.addRelation(
      DEMO_BOARD_ID,
      {
        from_goal_id: "CORE",
        to_goal_id: "INTERFACES",
        type: type as "conflicts_with",
        state: "proposed",
        reason: `验证 ${type} 关系的完整呈现`,
      },
      { actor_id: "test-user", idempotency_key: `web-relation-${index}` },
    );
  }
  const coreRun = store.snapshot(DEMO_BOARD_ID).runs.find((run) => run.goal_id === "CORE");
  assert.ok(coreRun);
  coordinator.submitDependencyProposal({
    board_id: DEMO_BOARD_ID,
    actor_id: coreRun.actor_id,
    discovered_in_run_id: coreRun.run_id,
    dependencies: [
      {
        from_goal_id: "CORE",
        to_goal_id: "INTERFACES",
        type: "depends_on",
        action: "add",
        reason: "执行闭环需要先有稳定的 CLI 与 MCP 接口",
        basis: "contract_output",
        evidence_refs: [
          "https://example.com/contracts/interfaces",
          "tests/mcp.test.ts",
        ],
        impact_if_rejected: "接口契约可能在执行闭环完成后发生不兼容变化",
        confidence: 0.88,
        direction_reason: "CORE 消费 INTERFACES 的调用结果，INTERFACES 不消费 CORE 的运行证据",
      },
    ],
    idempotency_key: "web-dependency-proposal",
  });
  const view = buildGoalBoardWebView(store, coordinator, {
    databasePath,
    boardId: DEMO_BOARD_ID,
    demo: true,
  });
  assert.equal(view.active_goal_id, "V1");
  assert.equal(view.counts.satisfied, 1);
  assert.equal(view.counts.executing, 1);
  assert.equal(view.counts.execution_blocked, 4);
  assert.equal(view.counts.clarification_pending, 1);
  assert.equal(view.counts.waiting_children, 4);
  assert.equal(view.goals.find((item) => item.goal.goal_id === "V1")?.status, "waiting_children");
  assert.match(
    view.goals.find((item) => item.goal.goal_id === "WEB")?.reasons[0]?.message ?? "",
    /前置 Goal/,
  );
  assert.equal(view.coverage[0]?.requirement_id, "REQ-WEB-COVERAGE");
  assert.equal(view.input_bindings[0]?.snapshot_digest, "sha256:web-fixture");
  assert.ok(view.policy_bindings.length > 0);
  assert.ok(view.events.length > 0);
  const core = view.goals.find((item) => item.goal.goal_id === "CORE");
  assert.ok(core);
  assert.ok(core.claims.length > 0);
  assert.ok(core.runs.length > 0);
  assert.ok(core.relations.some((item) => item.type === "corrects"));
  assert.equal(core.impacts[0]?.input_snapshot, "fixture-snapshot");
  assert.equal(core.risks[0]?.trigger, "首屏成为原始字段墙");
  assert.equal(core.coverage[0]?.statement, "所有 Goal 事实都能在 Web 中找到");
  assert.equal(core.input_bindings[0]?.source_ref, "https://example.com/goalboard-contract");
  assert.ok(core.events.some((item) => item.object_id === "RISK-WEB-OVERLOAD"));
  assert.ok(core.events.some((item) => item.type === "rewire.proposed"));
  const interfaces = view.goals.find((item) => item.goal.goal_id === "INTERFACES");
  assert.ok(interfaces?.events.some((item) => item.type === "candidate.submitted"));
  const historyDialogue = coordinator.startDraftDialogue({
    board_id: DEMO_BOARD_ID,
    actor_id: "runtime-history-clarifier",
    goal_id: "RELEASE",
    rough_idea: "为发布检查补充一条影响接口交付的拆分建议。",
    idempotency_key: "web-history-dialogue",
  });
  assert.ok(historyDialogue.run);
  coordinator.submitGoalTreeProposal({
    board_id: DEMO_BOARD_ID,
    actor_id: "runtime-history-clarifier",
    discovered_in_run_id: historyDialogue.run.run_id,
    root_goal_id: "RELEASE",
    summary: "从 RELEASE 的澄清上下文中补充 INTERFACES 的一条待确认变更。",
    items: [
      {
        item_id: "web-history-cross-goal-item",
        kind: "goal",
        operation: "update",
        payload: { goal_id: "INTERFACES", priority: 81 },
        source_refs: ["tests/web.test.ts#event-ledger"],
        reason: "验证非根 Goal 也能查到影响它的 Goal Tree Proposal。",
        confidence: 0.9,
        affected_objects: [{ object_type: "goal", object_id: "INTERFACES" }],
      },
    ],
    idempotency_key: "web-history-cross-goal-tree-proposal",
  }).proposal;
  const historyView = buildGoalBoardWebView(store, coordinator, {
    databasePath,
    boardId: DEMO_BOARD_ID,
    demo: true,
  });
  assert.ok(
    historyView.goals
      .find((item) => item.goal.goal_id === "INTERFACES")
      ?.events.some((item) => item.type === "goal_tree_proposal.submitted"),
  );
  const historyDecisionHtml = renderGoalBoardWeb(historyView, undefined, false, true);
  const historyRootHtml = renderGoalBoardWeb(historyView, "RELEASE");
  assert.match(historyDecisionHtml, /data-goal-tree-decision-form/);
  assert.match(historyDecisionHtml, /这份 Goal 方案要采用，还是退回修改/);
  assert.match(historyDecisionHtml, /data-goal-tree-proposal-id=/);
  assert.match(historyDecisionHtml, /name="item_id" value="web-history-cross-goal-item"/);
  assert.match(historyDecisionHtml, /采用整份方案/);
  assert.match(historyDecisionHtml, /<details class="decision-details goal-tree-proposal-changes"><summary><span>查看采用后的 1 项变化/);
  assert.match(historyDecisionHtml, /展开查看每项变化/);
  assert.match(historyRootHtml, /href="\/decisions#decision-goal-RELEASE"/);
  const pageHtml = renderGoalBoardWeb(view);
  const projectPageHtml = renderGoalBoardWeb({
    ...view,
    route_prefix: "/projects/PROJECT-UI",
    project: { project_id: "PROJECT-UI", display_name: "GoalBoard 示例项目", data_class: "regenerable_demo" },
    projects: [{ project_id: "PROJECT-UI", display_name: "GoalBoard 示例项目", data_class: "regenerable_demo" }],
  });
  const desktopProjectPageHtml = renderGoalBoardWeb({
    ...view,
    route_prefix: "/projects/PROJECT-UI",
    project: { project_id: "PROJECT-UI", display_name: "GoalBoard 示例项目", data_class: "regenerable_demo" },
    projects: [{ project_id: "PROJECT-UI", display_name: "GoalBoard 示例项目", data_class: "regenerable_demo" }],
  }, undefined, false, false, false, "", true);
  const desktopProjectSettingsHtml = renderGoalBoardProjectSettings({
    ...view,
    route_prefix: "/projects/PROJECT-UI",
    project: { project_id: "PROJECT-UI", display_name: "GoalBoard 示例项目", data_class: "regenerable_demo" },
    projects: [{ project_id: "PROJECT-UI", display_name: "GoalBoard 示例项目", data_class: "regenerable_demo" }],
  }, "", true);
  const corePageHtml = renderGoalBoardWeb(view, "CORE");
  const completionFragment = renderGoalPanelFragment(view, "V1", "completion");
  const progressFragment = renderGoalPanelFragment(view, "V1", "progress");
  const factorsFragment = renderGoalPanelFragment(view, "V1", "factors");
  const coreCompletionFragment = renderGoalPanelFragment(view, "CORE", "completion");
  const coreProgressFragment = renderGoalPanelFragment(view, "CORE", "progress");
  const coreFactorsFragment = renderGoalPanelFragment(view, "CORE", "factors");
  const quickRecordFragment = renderGoalQuickRecordFragment(view, "V1");
  const momentumFragment = renderGoalBoardMomentumFragment(view, "V1");
  assert.ok(completionFragment);
  assert.ok(progressFragment);
  assert.ok(factorsFragment);
  assert.ok(coreCompletionFragment);
  assert.ok(coreProgressFragment);
  assert.ok(coreFactorsFragment);
  assert.ok(quickRecordFragment);
  assert.ok(momentumFragment);
  const waitingForHumanView = structuredClone(view);
  const waitingForHumanGoal = waitingForHumanView.goals.find((item) => item.goal.goal_id === "CORE");
  assert.ok(waitingForHumanGoal);
  waitingForHumanGoal.status = "waiting_for_human";
  waitingForHumanGoal.work_state = "waiting_for_human";
  waitingForHumanGoal.display_status = "waiting_user";
  waitingForHumanGoal.display_status_label = "等你";
  waitingForHumanGoal.main_action_label = "完成验收";
  waitingForHumanGoal.action_summary = "工程检查已经完成，现在只等你的验收";
  waitingForHumanGoal.action_projection.display_status = "waiting_user";
  waitingForHumanGoal.action_projection.primary_action = {
    action_id: "action-waiting-human-test",
    actor: "user",
    kind: "review",
    status: "ready",
    target_type: "review_obligation",
    target_id: "human-review-test",
    reasons: [],
  };
  waitingForHumanGoal.action_projection.actions = [waitingForHumanGoal.action_projection.primary_action];
  waitingForHumanGoal.reasons = [{
    code: "review.user_approval_required",
    severity: "blocker",
    subject_type: "goal",
    subject_id: "CORE",
    message: "Runtime 可承担的检查已经结束，当前只剩用户本人验收与决定",
    facts: { criterion_ids: ["CORE-HUMAN"], next_action: "open_goalboard" },
    remediation: "请用户完成真实操作并提交验收依据。",
  }];
  waitingForHumanGoal.review_obligations = waitingForHumanGoal.review_obligations
    .filter((item) => item.role !== "human_approver");
  const waitingForHumanHtml = renderGoalBoardWeb(waitingForHumanView, "CORE");
  // Keep this broad presentation contract checking the same assembled workbench
  // surface even though production now serves shared assets and heavy Goal
  // panels through separate lazy fragments.
  const html = `${pageHtml}${completionFragment}${progressFragment}${factorsFragment}${quickRecordFragment}${momentumFragment}<style>${WORKBENCH_STYLES}</style><script>${WORKBENCH_CLIENT_SCRIPT}</script>`;
  const coreHtml = `${corePageHtml}${coreCompletionFragment}${coreProgressFragment}${coreFactorsFragment}<style>${WORKBENCH_STYLES}</style><script>${WORKBENCH_CLIENT_SCRIPT}</script>`;
  const recordsFragment = renderGoalRecordsFragment(view, "V1");
  const coreRecordsFragment = renderGoalRecordsFragment(view, "CORE");
  assert.ok(recordsFragment);
  assert.ok(coreRecordsFragment);
  const decisionPageHtml = renderGoalBoardWeb(view, undefined, false, true);
  const decisionHtml = `${decisionPageHtml}<style>${WORKBENCH_STYLES}</style><script>${WORKBENCH_CLIENT_SCRIPT}</script>`;
  assert.ok(html.startsWith("<!--\nTHESIS:"));
  assert.match(desktopProjectPageHtml, /class="navigator-native-row">[\s\S]*class="navigator-directory-toggle"[\s\S]*class="navigator-project-primary">/);
  assert.match(desktopProjectPageHtml, /class="navigator-project-primary">[\s\S]*class="navigator-project-menu[\s\S]*class="navigator-project-notifications"[^>]*disabled[\s\S]*class="navigator-project-settings"/);
  assert.match(desktopProjectSettingsHtml, /class="settings-desktop-project">[\s\S]*class="navigator-native-row">[\s\S]*class="navigator-project-primary">/);
  assert.match(desktopProjectSettingsHtml, /class="navigator-project-notifications"[^>]*disabled[^>]*aria-label="通知，暂不可用"/);
  assert.equal((html.match(/data-goal-view=/g) ?? []).length, 1);
  assert.match(html, /data-goal-view="V1"/);
  assert.doesNotMatch(html, /data-goal-view="CORE"/);
  assert.equal((coreHtml.match(/data-goal-view=/g) ?? []).length, 1);
  assert.match(coreHtml, /data-goal-view="CORE"/);
  assert.match(html, /等待子 Goal/);
  assert.equal((html.match(/data-goal-section=/g) ?? []).length, 6);
  assert.match(html, /role="tablist" aria-label="Goal 详情"/);
  assert.equal((html.match(/data-goal-tab="(?:overview|completion|progress|factors|records)"/g) ?? []).length, 5);
  assert.equal((pageHtml.match(/data-goal-panel="(?:overview|completion|progress|factors|records)"/g) ?? []).length, 5);
  assert.match(html, /data-goal-tab="overview"[^>]*aria-selected="true"|aria-selected="true"[^>]*data-goal-tab="overview"/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /setGoalPanel\(goalTab\.dataset\.goalTab, true, true, true\)/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /const goalPanelFromTargetId = \(targetId\) =>/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /targetId\.startsWith\("progress-"\)\) return "progress"/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /targetId\.startsWith\("completion-"\) \|\| targetId\.startsWith\("acceptance-"\)/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /targetId && \(targetElement \|\| targetPanel \|\| targetFactor\)/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /const activateFocusSection = \(trigger\) =>/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /const revealFocusTarget = \(target\) =>/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /revealDeepLinkTarget\(targetElement\)/);
  assert.match(html, /class="focus-section-deck focus-section-deck--context"/);
  assert.match(html, /class="focus-section-card-row" data-focus-section-card-row/);
  assert.match(html, /class="focus-section-stage" data-focus-section-stage/);
  assert.ok(html.indexOf('class="focus-section-card-row"') < html.indexOf('class="focus-section-stage"'));
  assert.equal((html.match(/data-focus-section-card="(?:purpose|completion)"/g) ?? []).length, 2);
  assert.equal((html.match(/data-focus-section-body="(?:purpose|completion)"/g) ?? []).length, 2);
  for (const key of ["state", "blockers", "risks", "checks"]) assert.match(html, new RegExp(`data-focus-section-card="${key}"`));
  assert.match(html, /class="focus-section-deck focus-section-deck--progress progress-overview"/);
  assert.equal((html.match(/data-goal-factor-tab="(?:relations|risks|impacts|rules)"/g) ?? []).length, 4);
  assert.match(html, /class="focus-section-deck goal-factor-nav"/);
  assert.equal((recordsFragment.match(/data-focus-section-card="(?:basics|execution|history|rules)"/g) ?? []).length, 4);
  assert.match(pageHtml, /data-goal-panel="completion"[^>]*data-loaded="false"[^>]*hidden/);
  assert.match(html, /aria-controls="goal-panel-overview-V1"/);
  assert.match(html, /aria-labelledby="goal-tab-overview-V1"/);
  assert.match(html, /下一步/);
  assert.match(html, /class="goal-focus-layout"/);
  assert.ok(html.indexOf('class="goal-hero"') < html.indexOf('class="goal-workspace-panels"'));
  assert.match(html, /\.runtime-grid h3 \{[^}]*background: var\(--rail\);[^}]*color: var\(--ink\);/);
  assert.ok(html.indexOf('class="goal-focus-main"') < html.indexOf('class="goal-focus-aside"'));
  assert.match(html, /<header><h2[^>]*>下一步<\/h2><\/header>/);
  assert.doesNotMatch(html, /<header><h2[^>]*>下一步<\/h2><span class="goal-status"/);
  assert.doesNotMatch(html, /goal-now-mark/);
  assert.match(html, /目标说明/);
  assert.match(html, /完成要求/);
  assert.match(html, /进展与阻塞/);
  assert.match(html, /关联与约束/);
  assert.match(html, /完整记录/);
  assert.ok(html.indexOf('data-goal-panel="overview"') < html.indexOf('data-goal-panel="completion"'));
  assert.ok(html.indexOf('data-goal-panel="completion"') < html.indexOf('data-goal-panel="progress"'));
  assert.ok(html.indexOf('data-goal-panel="progress"') < html.indexOf('data-goal-panel="factors"'));
  assert.ok(html.indexOf('data-goal-panel="factors"') < html.indexOf('data-goal-panel="records"'));
  assert.equal((html.match(/data-goal-factor-tab="(?:relations|risks|impacts|rules)"/g) ?? []).length, 4);
  assert.match(html, /name="direction" required/);
  assert.match(html, /name="type" required/);
  assert.equal((html.match(/data-goal-factor-panel="(?:relations|risks|impacts|rules)"/g) ?? []).length, 4);
  assert.match(html, /class="relation-heading"><strong>/);
  assert.match(html, /class="relation-goal-id">PLATFORM<\/small><\/span><small class="relation-path">/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /data-factor-write-receipt/);
  assert.match(WORKBENCH_STYLES, /\.factor-write-receipt \{/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /showFactorReceipt\(\s*"relations"/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /showFactorReceipt\(\s*"risks"/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /showFactorReceipt\(\s*"impacts"/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /showFactorReceipt\(\s*"rules"/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /请填写解除原因。说明这条关系为什么不再成立。/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /请填写停用原因。说明这条影响范围为什么不再有效。/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /\.replaceAll\("Impact", "影响范围"\)/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /\.replaceAll\("Policy", "工作规则"\)/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /\.replaceAll\("Runtime", "执行工具"\)/);
  assert.match(html, /data-open-quick-record/);
  assert.doesNotMatch(pageHtml, /data-quick-record-type="evidence"/);
  assert.match(html, /data-quick-record-type="evidence"/);
  assert.match(html, /data-quick-record-type="risk"/);
  assert.match(html, /data-quick-record-type="impact"/);
  assert.match(html, /data-quick-record-type="relation"/);
  assert.equal((html.match(/class="goal-primary-action"/g) ?? []).length, 1);
  assert.match(html, /goal-now-body[\s\S]*aria-label="查看等待条件"[^>]*>[\s\S]*?<span>查看等待条件<\/span>/);
  assert.doesNotMatch(html, /<section class="goal-technical"[^>]*>/);
  assert.match(html, /data-goal-records-content data-loaded="false"/);
  assert.match(recordsFragment, /<section class="goal-technical"[^>]*>/);
  assert.doesNotMatch(recordsFragment, /查看执行细节|goal-execution-details/);
  assert.match(recordsFragment, /领取、推进、完成依据和检查记录/);
  assert.match(html, /为什么现在做/);
  assert.match(recordsFragment, /目标标识、负责人、时间、状态和完整工作边界/);
  assert.match(recordsFragment, /当前状态/);
  assert.match(recordsFragment, /class="contract-list"/);
  assert.doesNotMatch(recordsFragment, /class="contract-grid"/);
  assert.match(recordsFragment, /包含什么/);
  assert.match(recordsFragment, /明确不做/);
  assert.match(recordsFragment, /必须遵守/);
  assert.match(recordsFragment, /需要的输入/);
  assert.match(recordsFragment, /承诺的输出/);
  assert.match(html, /Goal 关系/);
  assert.match(html, /上游/);
  assert.match(html, /下游/);
  assert.match(recordsFragment, /Claim 历史/);
  assert.match(recordsFragment, /Run 历史/);
  assert.match(recordsFragment, /风险与影响/);
  const pagedView = structuredClone(view);
  const pagedGoal = pagedView.goals.find((item) => item.goal.goal_id === "V1");
  assert.ok(pagedGoal);
  pagedGoal.events = Array.from({ length: WEB_GOAL_EVENT_PAGE_SIZE * 2 + 5 }, (_, index) => ({
    seq: index + 1,
    event_id: `EVENT-${index + 1}`,
    actor_id: "pagination-test",
    type: `event.type.${index + 1}`,
    object_type: "goal",
    object_id: "V1",
    reason: `事件 ${index + 1}`,
    payload: { index: index + 1 },
    at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
  }));
  const firstEventPage = renderGoalRecordsFragment(pagedView, "V1");
  const secondEventPage = renderGoalRecordEventsFragment(pagedView, "V1", "current", WEB_GOAL_EVENT_PAGE_SIZE);
  const finalEventPage = renderGoalRecordEventsFragment(pagedView, "V1", "current", WEB_GOAL_EVENT_PAGE_SIZE * 2);
  assert.ok(firstEventPage);
  assert.ok(secondEventPage);
  assert.ok(finalEventPage);
  assert.equal((firstEventPage.match(/data-goal-event-seq=/g) ?? []).length, WEB_GOAL_EVENT_PAGE_SIZE);
  assert.match(firstEventPage, new RegExp(`data-next-offset="${WEB_GOAL_EVENT_PAGE_SIZE}"`));
  assert.match(firstEventPage, /加载更早记录/);
  assert.equal((secondEventPage.match(/data-goal-event-seq=/g) ?? []).length, WEB_GOAL_EVENT_PAGE_SIZE);
  assert.match(secondEventPage, new RegExp(`data-next-offset="${WEB_GOAL_EVENT_PAGE_SIZE * 2}"`));
  assert.match(secondEventPage, /data-has-more="true"/);
  assert.equal((finalEventPage.match(/data-goal-event-seq=/g) ?? []).length, 5);
  assert.match(finalEventPage, /data-has-more="false"/);
  const renderedSequences = [firstEventPage, secondEventPage, finalEventPage]
    .flatMap((fragment) => Array.from(fragment.matchAll(/data-goal-event-seq="(\d+)"/g), (match) => Number(match[1])));
  assert.deepEqual(renderedSequences, Array.from({ length: WEB_GOAL_EVENT_PAGE_SIZE * 2 + 5 }, (_, index) => WEB_GOAL_EVENT_PAGE_SIZE * 2 + 5 - index));
  assert.match(html, /工作规则/);
  assert.match(html, /项目默认规则/);
  assert.match(html, /为当前 Goal 增加要求/);
  assert.match(html, /<details class="policy-source policy-source--goal">/);
  assert.match(html, /data-policy-form/);
  assert.doesNotMatch(html, /data-live-form="policy-project_default-/);
  assert.match(html, /data-live-form="policy-goal-/);
  assert.match(html, /name="required_capabilities"/);
  assert.match(html, /name="max_lease_seconds"/);
  assert.doesNotMatch(recordsFragment, /data-(?:relation|risk|impact|evidence|policy)[a-z-]*-form/);
  assert.match(recordsFragment, /基础信息/);
  assert.match(recordsFragment, /执行与检查/);
  assert.match(recordsFragment, /变更历史/);
  assert.match(recordsFragment, /关联与规则记录/);
  assert.match(html, /打开不会自动发送或领取/);
  assert.match(html, /data-tree-root/);
  assert.match(html, /class="goal-tree" data-tree-root/);
  assert.match(html, /class="tree-children"/);
  assert.match(html, /开始前必须等哪些 Goal 完成[\s\S]*让每项工作都有可信的完成依据/);
  assert.match(coreHtml, /验证 corrects 关系的完整呈现/);
  assert.match(coreHtml, /字段过多导致信息过载/);
  assert.match(coreHtml, /fixture-snapshot/);
  assert.match(coreRecordsFragment, /REQ-WEB-COVERAGE/);
  assert.match(coreRecordsFragment, /sha256:web-fixture/);
  assert.match(coreRecordsFragment, /href="https:\/\/example.com\/goalboard-contract"/);
  assert.match(coreRecordsFragment, /data-copy-value/);
  assert.match(html, /data-select-goal/);
  assert.match(html, /class="tree-chrome"/);
  assert.match(html, /class="tree-search"/);
  assert.match(html, /data-global-search/);
  assert.equal((html.match(/<input type="search" data-global-search/g) ?? []).length, 1);
  assert.match(html, /data-settings-link/);
  assert.match(html, /class="navigator-project"/);
  assert.match(projectPageHtml, /class="desktop-project-switcher navigator-project-menu"/);
  assert.match(projectPageHtml, /class="navigator-project-settings"[^>]*aria-label="打开当前项目设置"[^>]*title="项目设置"/);
  assert.match(projectPageHtml, /class="navigator-project-settings"[^>]*>\s*<svg[^>]*><use href="#icon-settings"><\/use><\/svg><\/a>/);
  assert.doesNotMatch(html, /class="project-decisions|class="navigator-project-meta"|class="web-project-switcher"/);
  assert.match(html, /@media \(max-width: 1180px\)[\s\S]*\.top-action span \{ display: none; \}/);
  assert.doesNotMatch(html, /class="tree-heading"|class="global-search"|class="top-filter-control"/);
  assert.equal((html.match(/data-open-create aria-label="新建目标"/g) ?? []).length, 1);
  assert.match(html, /class="tree-filter-control">[\s\S]*data-tree-filter-trigger[\s\S]*id="tree-status-filter"/);
  assert.match(html, /data-tree-filter-trigger aria-expanded="false" aria-controls="tree-status-filter"/);
  assert.match(html, /id="tree-status-filter" data-tree-filter hidden aria-label="按状态筛选"/);
  assert.match(html, /可同时选择多个状态；会与关键词搜索一起生效。/);
  assert.match(html, /data-status-filter/);
  assert.match(html, /data-goal-status="waiting_user"/);
  assert.match(html, /data-clear-status-filter/);
  assert.match(html, /data-clear-tree-filter/);
  assert.match(html, /statuses: \[\.\.\.selectedStatuses\]/);
  assert.match(html, /selectedStatuses\.size === 0 \|\| selectedStatuses\.has\(item\.dataset\.goalStatus\)/);
  assert.match(html, /if \(event\.key === "Escape" && !treeFilter\?\.hidden\)/);
  assert.match(html, /treeFilterTrigger\?\.addEventListener\("click", \(event\) =>/);
  assert.match(html, /event\.stopPropagation\(\);/);
  assert.match(html, /if \(treeFilter\.hidden\) return;/);
  assert.match(html, /firstStatusFilter\.focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(html, /const filterTrigger = target\.closest\("\[data-tree-filter-trigger\]"\)/);
  assert.match(html, /event\.target instanceof Element/);
  assert.doesNotMatch(html, /data-focus-filter/);
  assert.match(html, /data-open-create/);
  assert.match(html, /data-open-create aria-label="新建目标"/);
  assert.match(html, /data-create-dialog/);
  assert.match(html, /它属于哪个更大的 Goal？/);
  assert.match(html, /Goal 应描述一项有限、可验收、最终能完成的改变/);
  assert.match(html, /重复运行产生 Evidence；发现问题后再提出有限的改进 Goal/);
  assert.match(html, /只决定 Tree 中放在哪里，不要求上级 Goal 先完成/);
  assert.match(html, /开始前必须等哪些 Goal 完成？/);
  assert.match(html, /这会成为领取和完成的硬门禁/);
  assert.match(html, /关系预览：新 Goal 将作为独立 Goal/);
  assert.match(html, /关系预览：当前没有执行前置/);
  assert.match(html, /<option value="V1" data-goal-name="让第一次使用的人顺利完成一轮目标协作">让第一次使用的人顺利完成一轮目标协作 · V1<\/option>/);
  assert.match(html, /role="tablist" aria-label="移动端视图"/);
  assert.match(html, /role="tab" aria-selected="true" aria-controls="goal-tree-pane"/);
  assert.match(html, /button\.setAttribute\("aria-selected", String\(active\)\)/);
  assert.doesNotMatch(html, /class="sync-state"/);
  assert.match(html, /setInterval\(refreshBoard, 4000\)/);
  assert.match(html, /fetch\(route\("\/api\/board\/cursor"\)/);
  assert.match(html, /const refreshGoalId = selected/);
  assert.match(html, /selected !== refreshGoalId/);
  assert.match(
    html,
    /if \(decisionView\) \{[\s\S]*nextFeedList[\s\S]*nextRows\.forEach\(\(row\) => feedList\.insertBefore\(row, feedEmpty\)\)[\s\S]*filterFeedItems\(false\)[\s\S]*window\.scrollTo/,
  );
  assert.match(
    html,
    /feedWorkbench\.querySelectorAll\("\[data-feed-detail\]"\)[\s\S]*feedWorkbench\.insertBefore\(detail, feedDetailEmpty\)/,
  );
  assert.match(html, /decisionFeedEntryFromHash\(\)[\s\S]*history\.replaceState\(null, "", location\.pathname \+ location\.search\)/);
  assert.doesNotMatch(
    html,
    /if \(decisionView\) \{\s*saveUiState\(\);\s*location\.reload\(\);/,
  );
  assert.match(
    html,
    /await fetch\(decisionView \? pagePath : compactRefreshPath[\s\S]*const ui = readUiState\(\);[\s\S]*const createDraft/,
  );
  assert.doesNotMatch(html, /const ui = readUiState\(\);\s*const pageBase/);
  assert.match(html, /const currentGoalUiStorageKey = goalUiStorageKey \+ ":current"/);
  assert.match(html, /goalUiStorageKey \+ ":inbox"/);
  assert.match(html, /goalUiStorageKey \+ ":archive"/);
  assert.match(html, /goalUiStorageKey \+ ":trash"/);
  assert.match(html, /sourceSelected: selectedSource/);
  assert.match(html, /sourceQuery: sourceSearch\?\.value \|\| ""/);
  assert.match(html, /sourceFilter: activeSourceFilter/);
  assert.match(html, /sourceDetailTab:/);
  assert.match(html, /data-work-surface-open="feed" data-feed-preset="feed" data-feed-source=/);
  assert.match(html, /const source = surfaceOpen\.dataset\.feedSource;[\s\S]*feedSearch\.value = "";[\s\S]*feedSourceFilter\.value = source;[\s\S]*filterFeedItems\(false\)/);
  assert.match(html, /location\.assign\(result\.authorizationUrl\)/);
  assert.doesNotMatch(html, /globalThis\.open\(result\.authorizationUrl/);
  assert.doesNotMatch(html, /const nextDesktopSurface = decisionView \? "feed"/);
  assert.doesNotMatch(html, /activeFeedPreset = decisionView \? "inbox_message"/);
  assert.match(html, /const movedToCurrent = nextState\.goals\.some/);
  assert.match(html, /const movedToArchive = nextState\.archived_goals\.some/);
  assert.match(html, /const movedToTrash = nextState\.trashed_goals\.some/);
  assert.match(html, /location\.replace\(globalThis\.goalboardNavigationUrl\(route\(movedPath\)\)\)/);
  assert.match(html, /\^\\\/\(\?:archive\\\/\|trash\\\/\)\?goals\\\/\[\^\\\/\]\+\\\/\?\$/);
  assert.match(html, /surface === "goal" && \(decisionView \|\| !available\)/);
  assert.match(
    html,
    /setDesktopDirectory\(decisionView \? "feed" : treePane\?\.dataset\.desktopDirectory \|\| "root", false, false\)/,
  );
  assert.match(html, /\/document\?view=" \+ documentCollection/);
  assert.match(html, /const setGoalDocumentBusy = \(busy\) =>/);
  assert.match(html, /documentPane\.setAttribute\("aria-busy", "true"\)/);
  assert.match(html, /dataset\.goalDocumentLoading = "true"/);
  assert.match(html, /setGoalDocumentBusy\(true\)[\s\S]*fetch\(/);
  assert.match(html, /\.document-pane\[aria-busy="true"\] > \[data-goal-view\]/);
  assert.match(html, /body\[data-navigation-pending="true"\]::before/);
  assert.match(html, /searchComposing = true/);
  assert.match(html, /noteSearchActivity\(\)/);
  assert.doesNotMatch(html, /fetch\(route\("\/api\/board"\)/);
  assert.doesNotMatch(html, /document\.hidden \|\| dialog\.open/);
  assert.match(html, /const createDraft = dialog\.open \? readCreateDraft\(\) : null/);
  assert.match(html, /applyCreateDraft\(createDraft\)/);
  assert.match(html, /const liveUiInteractionActive = \(\) =>/);
  assert.match(html, /active\?\.closest\?\.\("\[data-live-form\]"\)/);
  assert.match(html, /data-live-form\]\[data-live-dirty=/);
  assert.match(html, /setAttribute\("data-live-dirty", "true"\)/);
  assert.match(html, /if \(!force && liveUiInteractionActive\(\)\) return/);
  assert.match(html, /form\?\.addEventListener\("change", updateRelationPreviews\)/);
  assert.match(html, /sessionStorage\.setItem/);
  assert.match(html, /data-tree-scroll/);
  assert.match(html, /data-tree-scroll tabindex="0" aria-label="Goal Tree 目标列表"/);
  assert.match(html, /\.tree-pane \{[^}]*min-height: 0;[^}]*overflow: hidden;/);
  assert.match(html, /\.tree-scroll \{[^}]*overflow-y: auto;[^}]*scrollbar-width: none;[^}]*-ms-overflow-style: none;/);
  assert.match(html, /\.tree-scroll::\-webkit-scrollbar \{ display: none; \}/);
  assert.match(html, /treeScroll\.addEventListener\("keydown"/);
  assert.match(html, /End: treeScroll\.scrollHeight/);
  assert.match(html, /data-tree-resizer/);
  assert.match(html, /role="separator" aria-label="调整 Goal Tree 宽度"/);
  assert.match(html, /treeWidth: parseFloat\(workspace\.style\.getPropertyValue\("--tree-width"\)\) \|\| treePane\.getBoundingClientRect\(\)\.width/);
  assert.match(html, /querySelector\("\[data-tree-resizer\]"\)/);
  assert.match(html, /treeResizer\??\.addEventListener\("pointermove"/);
  assert.match(html, /treeResizer\??\.addEventListener\("keydown"/);
  assert.match(html, /class="tree-entry directory-list-row/);
  assert.match(html, /tree-title-line"><strong title="让第一次使用的人顺利完成一轮目标协作">让第一次使用的人顺利完成一轮目标协作<\/strong><\/span><small title="Goal ID: V1" aria-label="Goal 编号 V1">V1<\/small>/);
  assert.match(html, /class="directory-row-state">[\s\S]*class="goal-status/);
  assert.match(html, /class="feed-list-item directory-list-row/);
  assert.match(html, /class="feed-list-state directory-row-state" data-feed-disposition=/);
  assert.match(html, /body\[data-desktop-shell="true"\] \.feed-source-row \{/);
  assert.match(html, /id="feed-source-dialog-title">来源与连接<\/h2>/);
  assert.match(html, /icon-search/);
  assert.match(html, /data-goal-section="progress"/);
  assert.match(html, /data-goal-section="now"/);
  assert.match(html, /const setGoalPanel =/);
  assert.match(html, /goalPanelFromHash/);
  assert.match(html, /\["ArrowLeft", "ArrowRight", "Home", "End"\]/);
  assert.match(html, /父 Goal 如何完成/);
  assert.match(html, /href="\/goals\/PLATFORM"/);
  assert.match(recordsFragment, /id="execution-V1"/);
  assert.match(html, /id="acceptance-V1"/);
  assert.match(html, /data-collapse-all aria-label="折叠全部"/);
  assert.match(html, /class="tree-dep is-waiting"/);
  assert.match(html, /class="tree-dep is-ready"/);
  assert.match(html, /页面显示必须和不同 Runtime 看到的项目进度一致/);
  assert.match(html, /共享项目进度前，必须先保证每项工作的状态和完成依据可靠/);
  assert.match(html, /还在等它完成/);
  assert.match(html, /已完成，不再挡住/);
  assert.match(html, /data-tree-relations/);
  assert.match(html, /个前置/);
  assert.match(html, /role="tablist" aria-label="Goal 视图"/);
  assert.match(html, /data-navigator-view="list"/);
  assert.match(html, /data-navigator-view="graph"/);
  assert.match(WORKBENCH_STYLES, /body\[data-desktop-shell="true"\] \.navigator-view-switch button::after \{ display: none; \}/);
  assert.match(WORKBENCH_STYLES, /body\[data-desktop-shell="true"\] \.navigator-view-switch button\.is-active \{[^}]*background: color-mix\(in srgb, var\(--blue\) 11%, var\(--paper\)\);[^}]*box-shadow: none;/);
  assert.match(html, /data-goal-momentum/);
  assert.match(pageHtml, /data-goal-momentum data-loaded="false"/);
  assert.doesNotMatch(pageHtml, /data-graph-node|data-graph-edge/);
  assert.match(html, /data-graph-node/);
  assert.match(html, /data-graph-edge/);
  assert.match(html, /data-graph-zoom="in"/);
  assert.match(html, /momentum-node[^\n]*is-group-first-row/);
  assert.match(html, /const fitGoalGraph =/);
  assert.match(html, /availableWidth \/ stage\.offsetWidth/);
  assert.doesNotMatch(html, /availableHeight \/ stage\.offsetHeight/);
  assert.match(html, /const bindGoalGraphViewport =/);
  assert.match(html, /graphResizeObserver = new ResizeObserver/);
  assert.match(html, /graphAutoFit/);
  assert.match(html, /data-desktop-directory="root"/);
  assert.match(projectPageHtml, /class="navigator-directory-toggle"[^>]*data-directory-toggle[^>]*aria-expanded="true"/);
  assert.match(html, /const setDirectoryCollapsed =/);
  assert.match(html, /currentWidth > 44\) workspace\.style\.setProperty\("--tree-width", currentWidth \+ "px"\)/);
  assert.match(html, /directoryCollapsed: workspace\.classList\.contains\("is-directory-collapsed"\)/);
  assert.match(html, /setDirectoryCollapsed\(ui\?\.directoryCollapsed === true, false\)/);
  assert.match(html, /target\.closest\("\[data-directory-toggle\]"\)/);
  assert.match(
    WORKBENCH_STYLES,
    /\.workspace\.is-directory-collapsed[\s\S]*grid-template-columns: 0 0 minmax\(0, 1fr\) !important;[\s\S]*position: relative;/,
  );
  assert.match(
    WORKBENCH_STYLES,
    /\.workspace\.is-directory-collapsed > \.tree-pane \{[^}]*width: max\(44px, calc\(var\(--desktop-project-safe-inline-start\) \+ 44px\)\);[^}]*height: var\(--desktop-titlebar-height\);[^}]*background: transparent;[^}]*position: absolute;/,
  );
  assert.match(
    WORKBENCH_STYLES,
    /\.workspace\.is-directory-collapsed > \.workbench-header \{[^}]*padding-inline-start: max\(54px, calc\(var\(--desktop-project-safe-inline-start\) \+ 50px\)\);/,
  );
  assert.match(
    WORKBENCH_STYLES,
    /\.workspace\.is-directory-collapsed \.navigator-project \{[^}]*padding: 0 0 0 var\(--desktop-project-safe-inline-start\);/,
  );
  assert.match(
    WORKBENCH_STYLES,
    /body\[data-desktop-shell="true"\]\[data-native-desktop="true"\] \.workspace\.is-directory-collapsed \.navigator-project/,
  );
  assert.match(WORKBENCH_STYLES, /\.workspace\.is-directory-collapsed > \.tree-pane > :not\(\.navigator-project\)/);
  assert.match(
    WORKBENCH_STYLES,
    /html\[data-density="compact"\][\s\S]*\.desktop-goal-directory \.directory-row-state > \.goal-status \{[^}]*border: 0;[^}]*background: transparent;/,
  );
  assert.match(html, /data-companion-runtime/);
  assert.match(html, /data-companion-runtime-open/);
  assert.match(html, /target\.closest\("\[data-companion-runtime-open\]"\)\) \{\s*setWorkspaceMode\("runtime"\)/);
  assert.doesNotMatch(coreHtml, /租约还剩 \d+ 分钟/);
  assert.doesNotMatch(coreHtml, /到期前续租可保持当前 Claim 和 Run/);
  assert.match(waitingForHumanHtml, /goal-status--waiting_user/);
  assert.match(waitingForHumanHtml, /<span>等你<\/span>/);
  assert.match(waitingForHumanHtml, /工程检查已经完成，现在只等你的验收/);
  assert.match(html, /desktopCompanionActive && selected \? "document"/);
  assert.match(html, /const setWorkspaceMode =/);
  assert.match(html, /workspace\.dataset\.workspaceMode = nextMode/);
  assert.match(html, /class="goal-mode-switch" role="tablist" aria-label="Goal 工作模式"/);
  assert.match(html, /data-workbench-view="focus"[\s\S]*data-workbench-view="runtime"/);
  assert.match(html, /class="tui-focus-return"[^>]*data-tui-focus-return/);
  assert.match(html, /class="tui-owner-copy"[\s\S]*class="tui-owner-actions"[\s\S]*class="goal-status goal-status--[a-z_]+"[^>]*data-tui-owner-status[\s\S]*data-tui-focus-return/);
  assert.doesNotMatch(html, /<small data-tui-owner-status/);
  assert.match(html, /status: item\.status,[\s\S]*statusIconMarkup: item\.status_icon/);
  assert.match(html, /target\.closest\("\[data-tui-focus-return\]"\)\) \{\s*setWorkspaceMode\("focus"\)/);
  assert.doesNotMatch(html, /class="desktop-workbench-actions"/);
  assert.match(WORKBENCH_STYLES, /\.tui-owner-actions \{[^}]*display: flex;[^}]*align-items: center;/);
  assert.match(WORKBENCH_STYLES, /body\[data-desktop-shell="true"\] \.tui-focus-return \{[^}]*position: static;/);
  assert.match(WORKBENCH_STYLES, /@media \(max-width: 760px\) \{[\s\S]*\.goal-mode-switch,[\s\S]*\.tui-focus-return \{ display: none !important; \}/);
  assert.doesNotMatch(html, /data-workbench-view="graph"/);
  assert.match(html, /marker-end="url\(#momentum-arrow\)"/);
  assert.match(html, /defaultMarker\.cloneNode\(true\)/);
  assert.match(html, /selectedMarker\.id = "momentum-arrow-selected"/);
  assert.match(html, /related \? "url\(#momentum-arrow-selected\)" : "url\(#momentum-arrow\)"/);
  assert.match(html, /class="momentum-level"/);
  assert.match(html, /class="momentum-group"/);
  assert.match(html, /data-momentum-period="7"/);
  assert.match(html, /data-momentum-period="30"/);
  assert.match(html, /class="momentum-queue-item/);
  assert.doesNotMatch(html, /graph-orbit|data-graph-ring=|--graph-x:|marker-start=/);
  assert.doesNotMatch(html, /data-edge-type="part_of"/);
  assert.match(html, /data-edge-type="depends_on"/);
  assert.match(html, /momentumOpenOnly/);
  assert.match(html, /updateMomentumSelection/);
  assert.match(html, /const setNavigatorView =/);
  assert.match(html, /const drawGoalGraph =/);
  assert.match(html, /target\.closest\("button\[data-navigator-view\]"\)/);
  assert.doesNotMatch(html, /api\/goals\/[^"']+\/graph/);
  assert.match(html, /<span class="tree-dep-copy"><strong>让不同 AI 对话看到同一项目进度<\/strong>/);
  assert.match(recordsFragment, /class="scope-gaps"/);
  assert.match(recordsFragment, /还有 \d+ 项未写|范围、输入与输出尚未填写/);
  const webGoal = view.goals.find((item) => item.goal.goal_id === "WEB");
  const v1Goal = view.goals.find((item) => item.goal.goal_id === "V1");
  const interfacesGoal = view.goals.find((item) => item.goal.goal_id === "INTERFACES");
  assert.ok(webGoal && v1Goal && interfacesGoal);
  assert.equal(activeOutgoingDependsOn(webGoal)[0]?.to_goal_id, "INTERFACES");
  assert.deepEqual(
    unsatisfiedOutgoingDependencies(webGoal, view).map((item) => item.goal.goal_id),
    ["INTERFACES"],
  );
  assert.deepEqual(
    unsatisfiedOutgoingDependencies(interfacesGoal, view).map((item) => item.goal.goal_id),
    [],
  );
  const blockedDescendant = firstBlockedDescendant(v1Goal, view);
  assert.ok(blockedDescendant);
  assert.match(blockedDescendant.status, /(?:blocked|invalidated)$/);
  assert.match(html, /class="goal-more"/);
  assert.match(html, /aria-label="更多操作"/);
  assert.ok(html.indexOf("class=\"goal-title-actions\"") < html.indexOf("class=\"goal-more\""));
  assert.doesNotMatch(
    html.slice(html.indexOf("class=\"goal-title-actions\""), html.indexOf("class=\"goal-more\"")),
    /data-open-goal-trash|data-goal-archive/,
  );
  assert.match(html, /data-open-goal-trash/);
  assert.doesNotMatch(html, /EFFECTIVE POLICY/);
  assert.doesNotMatch(html, /class="goal-decision-notice"/);
  assert.match(coreHtml, /href="\/decisions#decision-goal-CORE"/);
  assert.match(coreHtml, /href="\/decisions#decision-goal-CORE"/);
  assert.doesNotMatch(workSurfaceHtml(html, "goal"), /<form class="decision-record rewire-decision"/);
  assert.doesNotMatch(decisionHtml, /USER AUTHORITY/);
  assert.match(decisionHtml, /data-board-view="decisions"/);
  assert.match(decisionHtml, /data-goal-momentum/);
  assert.match(decisionHtml, /href="\/goals\/CORE"><strong>让每项工作都有可信的完成依据<\/strong>/);
  assert.doesNotMatch(decisionHtml, /decision-kind decision-kind--risk/);
  assert.doesNotMatch(decisionHtml, /字段过多导致信息过载/);
  assert.match(decisionHtml, /要调整这些 Goal 的先后或归属关系吗？/);
  assert.match(decisionHtml, /这些决定属于/);
  assert.match(decisionHtml, /为什么现在要决定/);
  assert.match(decisionHtml, /选完会发生什么/);
  assert.match(decisionHtml, /现在没有足够依据给出可靠建议/);
  assert.match(decisionHtml, /data-decision-receipt/);
  assert.match(decisionHtml, /const receiptHost = center \|\| activeFeedDetail/);
  assert.match(decisionHtml, /receiptHost\.querySelector\("\.decision-record"\)/);
  assert.match(decisionHtml, /link\.href = context\.goalHref/);
  assert.doesNotMatch(decisionHtml, /link\.href = route\(context\.goalHref\)/);
  assert.match(decisionHtml, /为什么是这个方向/);
  assert.match(decisionHtml, /CORE 消费 INTERFACES 的调用结果/);
  assert.match(decisionHtml, /可信度 88%/);
  assert.match(decisionHtml, /href="https:\/\/example.com\/contracts\/interfaces"/);
  assert.match(decisionHtml, /href="\/api\/project-references\/tests%2Fmcp.test.ts"[^>]*data-project-reference/);
  assert.match(decisionHtml, /<form class="decision-record rewire-decision"/);
  assert.match(decisionHtml, /name="reason"[\s\S]*决定理由或修改意见|决定理由或修改意见[\s\S]*name="reason"/);
  assert.match(html, /\.decision-record \{ min-width: 0;/);
  assert.match(html, /\.dependency-proposal-list \{ width: 100%; min-width: 0;/);
  assert.match(html, /\.dependency-evidence \.inline-ref span \{[^}]*white-space: normal;[^}]*overflow-wrap: anywhere;/);
  assert.match(html, /\.candidate-contract \{ grid-template-columns: 1fr; \}/);
  assert.match(html, /\.create-dialog \{ width: 100vw; max-width: none; height: 100vh; max-height: none; margin: 0; border-radius: 0; \}/);
  assert.doesNotMatch(html, /track-map|class="signal"|signal-box|railway/i);
  assert.match(html, /class="tui-pane"/);
  assert.match(html, /推进这个 Goal/);
  assert.match(html, /复制命令/);
  assert.match(html, /pty-client\.js/);
  assert.match(html, /class="workspace is-desktop-tui"/);
  assert.doesNotMatch(decisionHtml, /class="tui-pane"|推进这个 Goal|复制命令|pty-client\.js|class="workspace is-desktop-tui"/);
  store.close();
});

test("Web projects an expired Claim and started Run as one stopped lifecycle", () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-expired-lifecycle-"));
  const databasePath = join(directory, "goalboard.db");
  const boardId = "web-expired-lifecycle";
  const goalId = "web-expired-goal";
  let now = new Date("2026-08-30T00:00:00.000Z");
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store, () => now);
  try {
    coordinator.initializeBoard({
      board_id: boardId,
      title: "过期生命周期 Web 复验",
      actor_id: "web-user",
      idempotency_key: "web-expired-board",
    });
    coordinator.createGoal(boardId, {
      goal_id: goalId,
      title: "恢复过期执行",
      outcome: "旧执行停止后可以重新领取",
      why: "不让用户看到冲突状态",
      business_logic: "租约过期后旧 Run 不再运行。",
      promised_outputs: ["一致的过期状态"],
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [{
        criterion_id: "web-expired-criterion",
        statement: "过期生命周期一致",
        decision_method: "automated_check",
        pass_condition: "Claim expired 且 Run abandoned",
        required_evidence: ["test"],
      }],
    }, { actor_id: "web-user", idempotency_key: "web-expired-create" });
    const selected = coordinator.selectGoalAndStart({
      board_id: boardId,
      goal_id: goalId,
      actor_id: "runtime-expired",
      role: "executor",
      lease_seconds: 10,
      idempotency_key: "web-expired-select",
    });
    now = new Date("2026-08-30T00:00:11.000Z");

    const view = buildGoalBoardWebView(store, coordinator, { databasePath, boardId });
    const item = view.goals.find((candidate) => candidate.goal.goal_id === goalId);
    assert.ok(item);
    assert.equal(item.active_claim, null);
    assert.equal(item.claims.find((claim) => claim.claim_id === selected.claim?.claim_id)?.state, "expired");
    assert.equal(item.runs.find((run) => run.run_id === selected.run?.run_id)?.state, "abandoned");

    const html = renderGoalBoardWeb(view, goalId);
    assert.match(html, /最近一次推进已经停止/);
    assert.match(html, /<dd>abandoned<\/dd>/);
    assert.doesNotMatch(html, /最近一次推进正在进行/);
    assert.doesNotMatch(html, /<dd>started<\/dd>/);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Decision Center keeps canonical risk and rewire results visible after pending cards disappear", () => {
  const { databasePath } = webFixture();
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.addRisk(
    DEMO_BOARD_ID,
    {
      risk_id: "RISK-RESULT-VISIBILITY",
      goal_ids: ["CORE"],
      description: "保存决定后用户无法确认结果是否生效",
      probability: "high",
      impact: "用户会重复操作或放弃当前流程",
      affected_surfaces: ["Decision Center"],
      trigger: "待决定卡片消失且没有可核对结果",
      treatment: "accept",
      blocking_mode: "completion",
      revisit_condition: "风险结果能够跨刷新持续显示",
      owner: "test-user",
    },
    { actor_id: "test-user", idempotency_key: "web-result-risk-create" },
  );
  coordinator.setRiskState(
    DEMO_BOARD_ID,
    { risk_id: "RISK-RESULT-VISIBILITY", state: "accepted", reason: "已明确接受影响，继续推进" },
    { actor_id: "test-user", idempotency_key: "web-result-risk-accept" },
  );
  const coreRun = store.snapshot(DEMO_BOARD_ID).runs.find((run) => run.goal_id === "CORE");
  assert.ok(coreRun);
  const rewire = coordinator.submitDependencyProposal({
    board_id: DEMO_BOARD_ID,
    actor_id: coreRun.actor_id,
    discovered_in_run_id: coreRun.run_id,
    dependencies: [
      {
        from_goal_id: "CORE",
        to_goal_id: "RELEASE",
        type: "depends_on",
        action: "add",
        reason: "核心闭环需要先确认发布边界",
        basis: "business_sequence",
        evidence_refs: ["tests/web.test.ts#decision-result-visibility"],
        impact_if_rejected: "核心闭环可能在发布范围不稳定时完成",
        confidence: 0.95,
        direction_reason: "CORE 消费 RELEASE 的发布边界，RELEASE 不消费 CORE 的实现结果",
      },
    ],
    idempotency_key: "web-result-rewire-propose",
  }).rewire;
  const applied = coordinator.confirmRewire({
    board_id: DEMO_BOARD_ID,
    rewire_id: rewire.rewire_id,
    actor_id: "test-user",
    actor_kind: "user",
    decision: "confirmed",
    reason: "关系方向和依据已经核对",
    idempotency_key: "web-result-rewire-confirm",
  }).rewire;
  const relationId = String((applied.impact.added_relation_ids as string[])[0]);
  assert.ok(relationId);
  coordinator.addRisk(
    DEMO_BOARD_ID,
    {
      risk_id: "RISK-RESULT-NOOP",
      goal_ids: ["WEB"],
      description: "风险继续观察，暂时不关闭",
      probability: "medium",
      impact: "后续仍需回来决定",
      affected_surfaces: ["Decision Center"],
      trigger: "观察到新的失败信号",
      treatment: "defer",
      blocking_mode: "none",
      revisit_condition: "下一轮验证完成",
      owner: "test-user",
    },
    { actor_id: "test-user", idempotency_key: "web-result-noop-risk-create" },
  );
  coordinator.setRiskState(
    DEMO_BOARD_ID,
    { risk_id: "RISK-RESULT-NOOP", state: "open", reason: "接受现状，后续再看" },
    { actor_id: "test-user", idempotency_key: "web-result-noop-risk-open" },
  );
  const newRewire = coordinator.submitDependencyProposal({
    board_id: DEMO_BOARD_ID,
    actor_id: coreRun.actor_id,
    discovered_in_run_id: coreRun.run_id,
    dependencies: [
      {
        from_goal_id: "RELEASE",
        to_goal_id: "WEB",
        type: "depends_on",
        action: "add",
        reason: "发布入口需要等待 Web 使用路径稳定",
        basis: "business_sequence",
        evidence_refs: ["tests/web.test.ts#new-decision"],
        impact_if_rejected: "用户可能在页面路径尚未稳定时进入发布流程",
        confidence: 0.9,
        direction_reason: "RELEASE 消费 WEB 的用户操作路径",
      },
    ],
    idempotency_key: "web-result-new-rewire",
  }).rewire;

  const view = buildGoalBoardWebView(store, coordinator, {
    databasePath,
    boardId: DEMO_BOARD_ID,
    routePrefix: "/projects/project-test",
  });
  const feedItemBase = {
    board_id: DEMO_BOARD_ID,
    source_id: "source-test",
    kind: "test",
    title: "测试信息流动作",
    summary: "验证 Inbox 归档与 Feed 忽略不会混用文案",
    body: "正文",
    source_kind: "test",
    source_label: "测试来源",
    external_id: null,
    url: "https://example.com/item",
    origin_status: "open",
    priority: "normal",
    tags: [],
    author: null,
    disposition: "inbox" as const,
    linked_goal_id: null,
    read_at: null,
    revision: 1,
    source_created_at: "2026-08-29T16:00:00.000Z",
    source_updated_at: "2026-08-29T16:00:00.000Z",
    imported_at: "2026-08-29T16:00:00.000Z",
    updated_at: "2026-08-29T16:00:00.000Z",
    materials: [],
  };
  const inboxItem = { ...feedItemBase, item_id: "inbox-item", item_type: "inbox_message" as const, linked_goal_id: "CORE" };
  const feedItem = { ...feedItemBase, item_id: "feed-item", item_type: "feed" as const };
  view.feed.items.push(inboxItem, feedItem);
  view.feed.feed_items.push(
    { ...inboxItem, item_type: "feed" },
    feedItem,
  );
  const manualInboxEntry = {
    board_id: DEMO_BOARD_ID,
    entry_id: "inbox-entry-manual",
    subject_type: "feed_item" as const,
    subject_id: inboxItem.item_id,
    reason: "manual" as const,
    status: "open" as const,
    detail: { added_by: "web_user" },
    revision: 1,
    created_at: feedItemBase.created_at ?? feedItemBase.imported_at,
    updated_at: feedItemBase.updated_at,
    completed_at: null,
  };
  view.feed.inbox_entries.push(
    manualInboxEntry,
    { ...manualInboxEntry, entry_id: "inbox-entry-rule", subject_id: feedItem.item_id, reason: "source_rule" },
    { ...manualInboxEntry, entry_id: "inbox-entry-fault", subject_type: "source_fault", subject_id: "missing-source", reason: "source_fault", detail: { error_code: "connector_needs_auth", user_action: "reconnect" } },
    { ...manualInboxEntry, entry_id: "inbox-entry-decision", subject_type: "goal_decision", subject_id: "CORE", reason: "goal_decision", detail: { obligation_id: "fixture-obligation" } },
  );
  const inboxDetail = renderPersistedFeedItemDetail(view.feed.items.at(-2)!, view.route_prefix, {
    entryId: `inbox:${manualInboxEntry.entry_id}`,
    inboxEntry: manualInboxEntry,
    inboxActive: true,
  });
  const feedDetail = renderPersistedFeedItemDetail(view.feed.items.at(-1)!, view.route_prefix);
  const unsafeDetail = renderPersistedFeedItemDetail({
    ...feedItem,
    title: '<img src=x onerror="globalThis.pwned=true">',
    summary: "",
    body: '<script>globalThis.pwned=true</script><a href="javascript:alert(1)">click</a>',
    url: "javascript:alert(1)",
    materials: [{
      board_id: DEMO_BOARD_ID,
      material_id: "unsafe-material",
      item_id: feedItem.item_id,
      canonical_url: "data:text/html,unsafe",
      title: "<svg onload=alert(1)>",
      source_name: "Unsafe fixture",
      published_at: null,
      preview: "<b>preview</b>",
      content_hash: null,
      content_ref: null,
      content_available: true,
      content: "<iframe src=javascript:alert(1)></iframe>",
      content_type: "text/html",
      character_count: 44,
      captured_at: null,
      provenance: {},
      selected_for_context: false,
      imported_at: feedItem.imported_at,
      updated_at: feedItem.updated_at,
    }],
  }, view.route_prefix);
  const inboxWorkbench = renderFeedWorkbenchFragment(view, "inbox_message");
  const feedWorkbench = renderFeedWorkbenchFragment(view, "feed");
  const orphanedInboxWorkbench = renderFeedWorkbenchFragment({
    ...view,
    goals: view.goals.filter((item) => item.goal.goal_id !== "CORE"),
    archived_goals: view.archived_goals.filter((item) => item.goal.goal_id !== "CORE"),
  }, "inbox_message");
  const decisionHtml = renderGoalBoardWeb(view, undefined, false, true);
  const goalHtml = `${renderGoalBoardWeb(view, "CORE")}${renderGoalPanelFragment(view, "CORE", "factors")}`;
  assert.match(decisionHtml, /data-desktop-directory="feed"/);
  assert.match(decisionHtml, /data-feed-preset="inbox_message"/);
  assert.match(decisionHtml, /Inbox Message · Goal 决定/);
  assert.match(decisionHtml, /data-feed-detail="decision:/);
  assert.match(inboxWorkbench, /data-feed-detail="decision:|data-feed-detail--result/);
  assert.doesNotMatch(feedWorkbench, /data-feed-detail--decision|data-feed-detail--result/);
  assert.match(orphanedInboxWorkbench, /data-feed-detail="decision:CORE"/);
  const orphanedDetailIds = [...orphanedInboxWorkbench.matchAll(/data-feed-detail="([^"]+)"/g)]
    .map((match) => match[1]);
  assert.equal(new Set(orphanedDetailIds).size, orphanedDetailIds.length);
  assert.match(decisionHtml, /class="feed-directory-toolbar"/);
  assert.match(decisionHtml, /data-feed-filter-trigger[^>]*aria-expanded="false"[^>]*aria-controls="feed-filter-panel"/);
  assert.match(decisionHtml, /class="feed-filter-panel"[^>]*data-feed-filter-panel hidden/);
  assert.match(decisionHtml, /data-feed-filter-option="source"[^>]*data-feed-filter-value="all"/);
  assert.match(decisionHtml, /data-feed-filter-option="type"[^>]*data-feed-filter-value="github"/);
  assert.match(decisionHtml, /data-feed-filter-option="time"[^>]*data-feed-filter-value="week"/);
  assert.match(decisionHtml, /data-feed-filter-option="status"[^>]*data-feed-filter-value="active"/);
  assert.match(decisionHtml, /data-feed-filter-option="sort"[^>]*data-feed-filter-value="newest"/);
  assert.match(decisionHtml, /data-feed-source-filter hidden[\s\S]*data-feed-status-filter hidden[\s\S]*data-feed-sort hidden/);
  assert.doesNotMatch(decisionHtml, /class="feed-filter-grid"/);
  assert.match(decisionHtml, /data-feed-type-filter hidden/);
  assert.match(decisionHtml, /data-feed-time-filter hidden/);
  assert.match(decisionHtml, /data-feed-entry-id="feed-item"[^>]*data-feed-entry-read="unread"/);
  assert.match(decisionHtml, /<strong>Feed<\/strong><small>所有来源消息，完整保留<\/small><\/span><svg aria-hidden="true"><use href="#icon-chevron-right"><\/use><\/svg>/);
  const selectedInboxRow = decisionHtml.match(/<button class="feed-list-item[^>]*aria-selected="true"[^>]*>/)?.[0];
  assert.ok(selectedInboxRow);
  assert.match(selectedInboxRow, /tabindex="0"/);
  assert.match(selectedInboxRow, /data-feed-entry-type="inbox_message"/);
  const hiddenFeedRow = decisionHtml.match(/<button class="feed-list-item[^>]*data-feed-entry-id="feed-item"[^>]*>/)?.[0];
  assert.ok(hiddenFeedRow);
  assert.match(hiddenFeedRow, /aria-selected="false"/);
  assert.match(hiddenFeedRow, /tabindex="-1"/);
  assert.match(hiddenFeedRow, / hidden/);
  assert.doesNotMatch(decisionHtml, /data-feed-detail="feed-item"/);
  assert.match(feedDetail, /data-feed-detail="feed-item"[^>]*data-feed-detail-item-type="feed"[\s\S]*data-feed-read-state>未读</);
  assert.match(feedDetail, /data-feed-action="inbox"[\s\S]*加入 Inbox/);
  assert.match(feedDetail, /data-destination-state="feed"[\s\S]*仅保留在 Feed/);
  assert.match(unsafeDetail, /&lt;img src=x onerror=&quot;globalThis\.pwned=true&quot;&gt;/);
  assert.doesNotMatch(unsafeDetail, /&lt;script&gt;|<script\b/);
  assert.doesNotMatch(unsafeDetail, /href="(?:javascript|data):/);
  assert.doesNotMatch(unsafeDetail, /<(?:script|iframe|img)\b/);
  assert.match(unsafeDetail, /&lt;svg onload=alert\(1\)&gt;/);
  assert.match(decisionHtml, /data-feed-empty-title>[\s\S]*data-feed-empty-copy>[\s\S]*data-feed-clear-filters hidden/);
  assert.doesNotMatch(decisionHtml, /data-prototype-feed-(?:restore|empty-state)/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /没有符合当前条件的 Item/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /setFeedDetailPlaceholder\([\s\S]*filteredEmpty \? L\("没有符合当前条件的 Item"\) : L\("这里还没有 Item"\)[\s\S]*接入来源后，消息和 Feed 会出现在这里。/);
  assert.match(WORKBENCH_STYLES, /@media \(min-width: 761px\) and \(max-width: 1180px\) \{[\s\S]*\.session-execution > header \{[^}]*flex-direction: column;[^}]*\}[\s\S]*\.operation-content-controls \{[^}]*width: 100%;[^}]*min-width: 0;/);
  assert.match(decisionHtml, /data-mobile-directory-root data-directory-open="root"/);
  assert.match(decisionHtml, /data-directory-open="sources" data-work-surface-open="sources"[\s\S]*<strong>来源<\/strong>[\s\S]*账号、接入源与拉取计划/);
  assert.match(decisionHtml, /data-directory-panel="sources"[^>]*data-source-directory hidden/);
  assert.match(decisionHtml, /class="source-mobile-add"[^>]*data-feed-sources-open[\s\S]*添加来源/);
  assert.match(decisionHtml, /data-work-surface="sources"[^>]*data-source-workbench hidden/);
  assert.match(decisionHtml, /data-source-detail-empty[\s\S]*还没有可管理的来源[\s\S]*data-feed-sources-open/);
  assert.doesNotMatch(decisionHtml, /data-source-detail="prototype-source-/);
  assert.match(WORKBENCH_STYLES, /\.source-detail-tabs \{[\s\S]*border-radius: 10px;[\s\S]*background: color-mix\(in srgb, var\(--paper\) 54%, transparent\)/);
  assert.match(WORKBENCH_STYLES, /\.source-detail-panel \{[\s\S]*border-radius: 14px;[\s\S]*background: var\(--paper\);[\s\S]*box-shadow:/);
  assert.match(WORKBENCH_STYLES, /\.source-now \{[\s\S]*border-bottom: 1px solid/);
  assert.match(WORKBENCH_STYLES, /@media \(max-width: 760px\)[\s\S]*\.source-detail-panel \{[^}]*padding: 20px 16px 24px;[^}]*border-radius: 12px;/);
  assert.match(WORKBENCH_STYLES, /\.feed-detail \{[\s\S]*width: min\(100%, 920px\);[\s\S]*border-radius: 14px;[\s\S]*background: var\(--paper\);[\s\S]*box-shadow:/);
  assert.match(WORKBENCH_STYLES, /\.feed-destination-strip \{[^}]*border-top: 1px solid[^}]*border-bottom: 1px solid[^}]*border-radius: 0;[^}]*background: transparent;/);
  assert.match(WORKBENCH_STYLES, /@media \(max-width: 760px\)[\s\S]*\.feed-detail \{[^}]*padding: 22px 16px 28px;/);
  assert.match(WORKBENCH_STYLES, /@media \(max-width: 760px\)[\s\S]*\.feed-detail-actions button,[\s\S]*\.feed-linked-goal \{[^}]*min-height: 44px;/);
  assert.doesNotMatch(decisionHtml, /data-feed-entry-prototype="true"/);
  assert.doesNotMatch(inboxWorkbench, /data-prototype-inbox-complete/);
  assert.doesNotMatch(feedWorkbench, /data-prototype-feed-action/);
  assert.match(inboxDetail, /data-feed-detail="inbox:inbox-entry-manual"[\s\S]*data-inbox-open-feed="inbox-item"/);
  assert.match(inboxDetail, /class="feed-detail feed-detail--attention"[^>]*data-feed-detail="inbox:inbox-entry-manual"/);
  assert.match(inboxDetail, /data-inbox-action="done"[\s\S]*data-inbox-action="dismissed"/);
  assert.match(inboxDetail, /为什么进入 Inbox[\s\S]*你手工加入[\s\S]*关联对象[\s\S]*下一步/);
  assert.match(inboxDetail, /这里展示的是原 Feed Item，内容没有复制进 Inbox/);
  assert.doesNotMatch(inboxDetail, /data-feed-action="start"|data-feed-action="archive"/);
  assert.match(WORKBENCH_STYLES, /\.inbox-attention-context dl \{[^}]*display: flex;[^}]*flex-direction: column;/);
  assert.match(WORKBENCH_STYLES, /\.inbox-attention-context dl > div:last-child \{[^}]*order: -1;[^}]*padding: 0 0 18px;/);
  assert.match(feedDetail, /data-feed-detail="feed-item"[\s\S]*data-feed-action="archive"[\s\S]*>忽略<\/button>/);
  assert.match(inboxDetail, /class="feed-linked-goal" href="\/projects\/project-test\/goals\/CORE"/);
  assert.match(decisionHtml, /data-inbox-subject-type="source_fault"[\s\S]*来源需要人工恢复/);
  assert.match(decisionHtml, /data-inbox-reference-detail[\s\S]*Inbox 只保存这条引用和进入原因；原对象内容没有复制到这里/);
  assert.match(decisionHtml, /data-inbox-reason="manual"/);
  assert.match(decisionHtml, /data-inbox-reason="source_rule"/);
  assert.match(decisionHtml, /data-inbox-reason="goal_decision"/);
  assert.match(decisionHtml, /data-inbox-reason="source_fault"/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /type === "inbox_message"[\s\S]*row\.dataset\.feedEntryStatus === "inbox" \|\| row\.dataset\.feedEntryStatus === "processing"/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /semanticType === "inbox_message" \? L\("待处理"\)/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /feedPresets: feedPresetState/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /if \(nextPreset !== activeFeedPreset\) rememberFeedPresetState\(\)/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /const setFeedFilterOpen = \(open, focusFirst = false\)/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /feedFilterBadge\.hidden = activeCount === 0/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /event\.key === "Escape" && !feedFilterPanel\?\.hidden/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /feedWorkbench\.dataset\.loadedPreset === activeFeedPreset/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /feedWorkbench\.dataset\.loadedPreset = requestedPreset/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /row\.tabIndex = active \? 0 : -1/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /const selectSource = \(sourceId, moveToDetail = false\)/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /data-prototype-source-sync/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /模拟计划已保存/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /这件事已处理完成/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /Inbox 已经处理完/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /这是页面内空状态预览，不会修改真实 Item/);
  assert.match(
    WORKBENCH_STYLES,
    /\.feed-directory-toolbar \{[^}]*display: grid;[^}]*grid-template-columns: minmax\(0, 1fr\) 44px;/,
  );
  assert.match(WORKBENCH_STYLES, /\.feed-filter-trigger \{[^}]*width: 44px;[^}]*display: grid;/);
  assert.match(WORKBENCH_STYLES, /tree-pane\[data-desktop-directory="root"\] \.desktop-directory-root/);
  assert.match(decisionHtml, /让每项工作都有可信的完成依据 → 依赖 → 让新用户安装后知道下一步怎么开始/);
  assert.match(decisionHtml, /你的理由：关系方向和依据已经核对/);
  assert.match(
    decisionHtml,
    /href="\/projects\/project-test\/goals\/CORE#risk-RISK-RESULT-VISIBILITY"/,
  );
  assert.match(
    decisionHtml,
    new RegExp(`href="/projects/project-test/goals/CORE#relation-${relationId}"`),
  );
  assert.doesNotMatch(decisionHtml, /\/projects\/project-test\/projects\/project-test/);
  assert.match(goalHtml, new RegExp(`id="relation-${relationId}"`));
  assert.doesNotMatch(decisionHtml, /data-risk-id="RISK-RESULT-VISIBILITY"/);
  assert.doesNotMatch(decisionHtml, new RegExp(`data-rewire-id="${rewire.rewire_id}"`));
  assert.doesNotMatch(decisionHtml, /data-risk-id="RISK-RESULT-NOOP"/);
  const newRewireForm = decisionHtml.match(
    new RegExp(`<form class="decision-record rewire-decision"[^>]*data-rewire-id="${newRewire.rewire_id}"[\\s\\S]*?</form>`),
  )?.[0];
  assert.ok(newRewireForm);
  assert.match(newRewireForm, /新事项/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /保存后仍会留在待决定中。\{effect\}/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /决定已记录，但这次没有新增或解除 Goal 关系，也没有新增风险。/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /风险保持待处理，仍会留在待决定中，并继续按当前规则影响关联 Goal。/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /风险已接受，不再阻止关联 Goal。/);
  store.close();
});

test("Decision Center never presents a Runtime review as user approval", () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-runtime-review-result-"));
  const databasePath = join(directory, "goalboard.db");
  const boardId = "runtime-review-result-board";
  const goalId = "RUNTIME-REVIEW-RESULT";
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.initializeBoard({
    board_id: boardId,
    title: "Runtime 复核主体展示",
    actor_id: "owner",
    idempotency_key: "runtime-review-result-board",
  });
  coordinator.createGoal(boardId, {
    goal_id: goalId,
    title: "工程检查完成后等待用户验收",
    outcome: "工程复核和用户验收不混淆",
    why: "避免把 Runtime 判断写成用户确认",
    business_logic: "Runtime 检查工程事实，用户保留体验决定。",
    definition_state: "accepted",
    decomposition_state: "closed_leaf",
    acceptance_criteria: [{
      criterion_id: "runtime-review-result-check",
      statement: "工程检查通过",
      decision_method: "inspection",
      pass_condition: "Runtime 提交独立检查",
      required_evidence: ["inspection"],
    }],
  }, { actor_id: "owner", idempotency_key: "runtime-review-result-goal" });
  const execution = coordinator.selectGoalAndStart({
    board_id: boardId,
    goal_id: goalId,
    actor_id: "runtime-executor",
    role: "executor",
    idempotency_key: "runtime-review-result-execute",
  });
  coordinator.reportRun({
    board_id: boardId,
    run_id: execution.run!.run_id,
    actor_id: "runtime-executor",
    state: "completed",
    idempotency_key: "runtime-review-result-complete",
  });
  const evidence = coordinator.submitEvidence({
    board_id: boardId,
    goal_id: goalId,
    actor_id: "runtime-executor",
    run_id: execution.run!.run_id,
    criterion_ids: ["runtime-review-result-check"],
    kind: "inspection",
    locator: "review://runtime-review-result",
    result: "passed",
    idempotency_key: "runtime-review-result-evidence",
  }).evidence;
  coordinator.releaseClaim({
    board_id: boardId,
    claim_id: execution.claim!.claim_id,
    actor_id: "runtime-executor",
    reason: "进入复核",
    idempotency_key: "runtime-review-result-release",
  });
  const obligation = store.snapshot(boardId).review_obligations.find(
    (item) => item.goal_id === goalId && item.role === "self_verifier",
  )!;
  coordinator.submitReview({
    board_id: boardId,
    goal_id: goalId,
    obligation_id: obligation.obligation_id,
    actor_id: "runtime-reviewer",
    actor_kind: "runtime",
    verdict: "pass",
    evidence_refs: [evidence.evidence_id],
    reasoning: "工程检查已通过，用户验收尚未发生。",
    idempotency_key: "runtime-review-result-submit",
  });
  const view = buildGoalBoardWebView(store, coordinator, { databasePath, boardId });
  const decisionHtml = renderGoalBoardWeb(view, undefined, false, true);
  assert.match(decisionHtml, /Runtime 复核/);
  assert.match(decisionHtml, /本次 Runtime 复核已通过；它不能代替用户验收/);
  assert.match(decisionHtml, /复核理由：工程检查已通过，用户验收尚未发生。/);
  assert.doesNotMatch(decisionHtml, /本次用户确认已通过；Goal 是否完成仍由全部完成条件共同决定。/);
  store.close();
});

test("Decision Center prioritizes pending human decisions and submits the linked human verdict", async () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-human-decision-inbox-"));
  const databasePath = join(directory, "goalboard.db");
  const boardId = "human-decision-inbox-board";
  const goalId = "HUMAN-DECISION-INBOX";
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.initializeBoard({
    board_id: boardId,
    title: "人工决定 Inbox 闭环",
    actor_id: "owner",
    idempotency_key: "human-decision-inbox-board",
  });
  coordinator.createGoal(boardId, {
    goal_id: goalId,
    title: "工程检查后由用户确认体验",
    outcome: "待用户决定的事项始终可见且一次提交完成审计闭环",
    why: "用户不能被历史 Runtime 结果挡住操作入口",
    business_logic: "Runtime 检查工程事实，用户本人判断真实体验。",
    definition_state: "accepted",
    decomposition_state: "closed_leaf",
    acceptance_criteria: [
      {
        criterion_id: "human-decision-inbox-inspection",
        statement: "工程路径通过检查",
        decision_method: "inspection",
        pass_condition: "Runtime 提交独立检查",
        required_evidence: ["inspection"],
      },
      {
        criterion_id: "human-decision-inbox-owner",
        statement: "用户亲自操作后认可体验",
        decision_method: "human_decision",
        pass_condition: "用户提交本人决定",
        required_evidence: ["human_verdict"],
      },
    ],
  }, { actor_id: "owner", idempotency_key: "human-decision-inbox-goal" });
  const execution = coordinator.selectGoalAndStart({
    board_id: boardId,
    goal_id: goalId,
    actor_id: "runtime-executor",
    role: "executor",
    idempotency_key: "human-decision-inbox-execute",
  });
  coordinator.reportRun({
    board_id: boardId,
    run_id: execution.run!.run_id,
    actor_id: "runtime-executor",
    state: "completed",
    idempotency_key: "human-decision-inbox-execute-complete",
  });
  const inspectionEvidence = coordinator.submitEvidence({
    board_id: boardId,
    goal_id: goalId,
    actor_id: "runtime-executor",
    run_id: execution.run!.run_id,
    criterion_ids: ["human-decision-inbox-inspection"],
    kind: "inspection",
    locator: "review://human-decision-inbox-engineering",
    result: "passed",
    idempotency_key: "human-decision-inbox-inspection-evidence",
  }).evidence;
  coordinator.releaseClaim({
    board_id: boardId,
    claim_id: execution.claim!.claim_id,
    actor_id: "runtime-executor",
    reason: "工程工作已完成",
    idempotency_key: "human-decision-inbox-execute-release",
  });
  const selfObligation = store.snapshot(boardId).review_obligations.find(
    (item) => item.goal_id === goalId && item.role === "self_verifier",
  )!;
  const reviewRun = coordinator.selectGoalAndStart({
    board_id: boardId,
    goal_id: goalId,
    actor_id: "runtime-reviewer",
    role: "self_verifier",
    idempotency_key: "human-decision-inbox-review-select",
  });
  coordinator.submitReview({
    board_id: boardId,
    goal_id: goalId,
    obligation_id: selfObligation.obligation_id,
    actor_id: "runtime-reviewer",
    actor_kind: "runtime",
    verdict: "pass",
    evidence_refs: [inspectionEvidence.evidence_id],
    reasoning: "工程检查已通过；体验由用户本人决定。",
    idempotency_key: "human-decision-inbox-review-pass",
  });
  coordinator.reportRun({
    board_id: boardId,
    run_id: reviewRun.run!.run_id,
    actor_id: "runtime-reviewer",
    state: "completed",
    idempotency_key: "human-decision-inbox-review-complete",
  });
  coordinator.releaseClaim({
    board_id: boardId,
    claim_id: reviewRun.claim!.claim_id,
    actor_id: "runtime-reviewer",
    reason: "Runtime 复核完成",
    idempotency_key: "human-decision-inbox-review-release",
  });

  const view = buildGoalBoardWebView(store, coordinator, { databasePath, boardId });
  const decisionHtml = renderGoalBoardWeb(view, undefined, false, true);
  const decisionRow = decisionHtml.match(
    new RegExp(`<button class="[^"]*"[^>]*data-feed-entry-id="decision:${goalId}"[^>]*>`),
  )?.[0];
  assert.ok(decisionRow);
  assert.match(decisionRow, /is-selected/);
  assert.match(decisionRow, /data-feed-entry-attention-rank="3"/);
  const decisionDetail = decisionHtml.match(
    new RegExp(`<article class="[^"]*"[^>]*data-feed-detail="decision:${goalId}"[^>]*>`),
  )?.[0];
  assert.ok(decisionDetail);
  assert.doesNotMatch(decisionDetail, / hidden/);
  assert.match(decisionHtml, /<form class="human-review-form"/);
  assert.match(decisionHtml, /data-human-review-jump[^>]*>[\s\S]*填写确认结论/);
  assert.match(decisionHtml, /<button class="button-primary" type="submit">提交结果确认<\/button>/);
  assert.match(decisionHtml, /用户亲自操作后认可体验」只能由你根据实际体验判断/);
  assert.match(decisionHtml, /同时记录为该标准的人工结论依据/);
  assert.match(decisionHtml, /Runtime 复核/);
  assert.doesNotMatch(decisionHtml, /本次用户确认已通过；Goal 是否完成仍由全部完成条件共同决定/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /const decisionFeedEntryFromHash = \(\) =>/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /return "decision:" \+ decodeURIComponent\(location\.hash\.slice\(prefix\.length\)\)/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /selected: deepLinkedDecisionEntry/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /feedEntryAttentionRank/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /humanReviewJump\.closest\("\.human-review-list"\)/);
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const obligationStore = new SqliteGoalBoardStore(databasePath);
    const obligationCoordinator = new GoalBoardCoordinator(obligationStore);
    const humanObligation = obligationStore.snapshot(boardId).review_obligations.find(
      (item) => item.goal_id === goalId && item.role === "human_approver",
    )!;
    const attentionToken = String(
      obligationCoordinator.getGoalActionProjection({ board_id: boardId, goal_id: goalId })
        .actions.find((action) => action.target_id === humanObligation.obligation_id)
        ?.reasons[0]?.facts?.attention_token ?? "",
    );
    assert.match(attentionToken, /^attention-/);
    obligationStore.close();
    const exactUserQuote = "我亲自走完主路径，来源、Feed 与 Inbox 的对象边界已经清楚。";
    const requestBody = JSON.stringify({
      verdict: "pass",
      reasoning: exactUserQuote,
      attention_token: attentionToken,
      idempotency_key: "human-decision-inbox-web-pass",
    });
    const submit = await webFetch(
      `${origin}/api/goals/${goalId}/review-obligations/${humanObligation.obligation_id}/review`,
      { method: "POST", headers: { "content-type": "application/json" }, body: requestBody },
    );
    assert.equal(submit.status, 200);
    const submitted = await submit.json() as {
      review: { review_id: string };
      evidence: { evidence_id: string; review_id: string | null; criterion_ids: string[]; locator: string; digest: string | null };
      transition: { projection: { display_status: string } };
    };
    assert.equal(submitted.evidence.review_id, submitted.review.review_id);
    assert.deepEqual(submitted.evidence.criterion_ids, ["human-decision-inbox-owner"]);
    assert.equal(
      submitted.evidence.locator,
      `conversation://web%3A${boardId}/human-decision-inbox-web-pass`,
    );
    assert.equal(submitted.evidence.digest, createHash("sha256").update(exactUserQuote).digest("hex"));
    assert.equal(submitted.transition.projection.display_status, "completed");

    const replay = await webFetch(
      `${origin}/api/goals/${goalId}/review-obligations/${humanObligation.obligation_id}/review`,
      { method: "POST", headers: { "content-type": "application/json" }, body: requestBody },
    );
    assert.equal(replay.status, 200);
    const replayed = await replay.json() as typeof submitted;
    assert.equal(replayed.review.review_id, submitted.review.review_id);
    assert.equal(replayed.evidence.evidence_id, submitted.evidence.evidence_id);

    const verifiedStore = new SqliteGoalBoardStore(databasePath);
    const verifiedCoordinator = new GoalBoardCoordinator(verifiedStore);
    const snapshot = verifiedStore.snapshot(boardId);
    assert.equal(
      snapshot.reviews.filter((item) => item.obligation_id === humanObligation.obligation_id).length,
      1,
    );
    assert.equal(
      snapshot.evidence.filter((item) => item.review_id === submitted.review.review_id && item.kind === "human_verdict").length,
      1,
    );
    assert.equal(
      verifiedCoordinator.getGoalActionProjection({ board_id: boardId, goal_id: goalId }).display_status,
      "completed",
    );
    verifiedStore.close();
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web project catalog switches browser scope without exposing storage or changing Runtime bindings", async () => {
  const fixture = await webProjectCatalogFixture();
  addProjectGoal(fixture.alpha, "ALPHA-ONLY", "仅 Alpha 可见的 Goal");
  addProjectGoal(fixture.beta, "BETA-ONLY", "仅 Beta 可见的 Goal");
  const alphaFeedStore = new SqliteGoalBoardStore(fixture.alpha.database_path);
  alphaFeedStore.db.prepare(`
    INSERT INTO feed_items (
      board_id, item_id, source_id, item_type, kind, title, summary, body,
      source_kind, source_label, external_id, url, origin_status, priority,
      tags_json, author, disposition, linked_goal_id, read_at, revision,
      source_created_at, source_updated_at, imported_at, updated_at
    ) VALUES (?, ?, NULL, 'feed', 'update', ?, ?, ?, 'test', '性能测试来源',
      'alpha-lazy-external', NULL, 'open', 'medium', '[]', NULL, 'inbox', NULL,
      NULL, 1, ?, ?, ?, ?)
  `).run(
    fixture.alpha.board_id,
    "alpha-lazy-feed-item",
    "按需加载 Feed 详情",
    "目录只保留这段摘要",
    "ALPHA-LAZY-BODY-SENTINEL：正文只能从单 Item 详情接口返回。",
    ...Array(4).fill("2026-08-30T00:00:00.000Z"),
  );
  alphaFeedStore.close();
  startProjectClarification(fixture.alpha, "ALPHA-ONLY", "runtime-alpha");
  startProjectClarification(fixture.beta, "BETA-ONLY", "runtime-beta");
  const alphaBeforeSwitch = boardSnapshot(fixture.alpha.database_path, fixture.alpha.board_id);
  const betaBeforeSwitch = boardSnapshot(fixture.beta.database_path, fixture.beta.board_id);

  const server = createGoalBoardWebServer({ homeDirectory: fixture.homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const alphaPrefix = `/projects/${encodeURIComponent(fixture.alpha.project_id)}`;
    const betaPrefix = `/projects/${encodeURIComponent(fixture.beta.project_id)}`;

    const projectIndex = await (await webFetch(`${origin}/`)).text();
    const projectIndexStyles = await (await webFetch(`${origin}/assets/goalboard-project-index.css`)).text();
    assert.match(projectIndex, /选择一个项目/);
    assert.match(projectIndex, /产品 Alpha/);
    assert.match(projectIndex, /产品 Beta/);
    assert.match(projectIndex, new RegExp(`href="${alphaPrefix}"`));
    assert.match(projectIndex, new RegExp(`href="${betaPrefix}"`));
    assert.doesNotMatch(projectIndex, new RegExp(fixture.alpha.database_path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(projectIndex, /数据源:|board_id/);
    assert.match(projectIndex, /href="\/assets\/goalboard-project-index\.css"/);
    assert.doesNotMatch(projectIndex, /class="project-primary-directories"|打开全部 Sessions/);
    assert.match(projectIndex, /class="project-card-grid"/);
    assert.match(projectIndex, /class="project-card" role="listitem"/);
    assert.match(projectIndex, /data-project-search/);
    assert.match(projectIndex, /data-project-search-row="产品 alpha user"/);
    assert.doesNotMatch(projectIndex, /class="project-list"/);
    assert.doesNotMatch(projectIndex, /href="\/sessions"/);
    assert.doesNotMatch(projectIndex, /href="\/workspaces"[^>]*aria-label="打开全部工作目录"/);
    assert.match(projectIndex, /<body class="project-index-page" data-desktop-shell="true">/);
    assert.doesNotMatch(projectIndex, /data-native-desktop="true"|data-tauri-drag-region/);
    assert.match(projectIndexStyles, /\.project-index-page > \.topbar \{ height: 58px; \}/);
    assert.match(projectIndexStyles, /\.project-index \{ min-height: calc\(100dvh - 58px\)/);
    assert.match(projectIndexStyles, /\.project-card-grid \{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);[^}]*gap: 12px;/);
    assert.match(projectIndexStyles, /\.project-card \{[^}]*min-height: 138px;[^}]*padding: 16px;[^}]*border-radius: 12px;/);
    assert.match(projectIndexStyles, /max-width: 1100px[^}]*min-width: 761px[\s\S]*\.project-card-grid \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \}/);
    assert.match(projectIndexStyles, /max-width: 760px[\s\S]*\.project-card-grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
    assert.match(projectIndexStyles, /max-width: 520px[\s\S]*\.project-card-grid \{ grid-template-columns: minmax\(0, 1fr\); \}/);
    assert.doesNotMatch(projectIndexStyles, /\.project-index-create \{[^}]*color: #fff;[^}]*background: var\(--ink\)/);

    const desktopProjectIndex = await (await webFetch(`${origin}/?desktop=1`)).text();
    assert.match(desktopProjectIndex, /<body class="project-index-page" data-desktop-shell="true" data-native-desktop="true">/);
    assert.match(desktopProjectIndex, /<header class="topbar project-directory-topbar">/);
    assert.doesNotMatch(desktopProjectIndex, /<header class="topbar project-directory-topbar" data-tauri-drag-region>/);
    assert.doesNotMatch(desktopProjectIndex, /class="project-primary-directories"|打开全部 Sessions/);
    assert.match(desktopProjectIndex, /class="top-spacer" data-tauri-drag-region/);

    const legacyCookieResponse = await webFetch(`${origin}${alphaPrefix}/`, {
      headers: { cookie: "goalboard_desktop=1" },
    });
    const legacyCookiePage = await legacyCookieResponse.text();
    assert.match(legacyCookiePage, /data-desktop-shell="true"/);
    assert.doesNotMatch(legacyCookiePage, /data-native-desktop="true"|class="navigator-project-meta"/);
    assert.equal(legacyCookieResponse.headers.get("set-cookie"), null);

    const capsulePage = await (await webFetch(`${origin}/desktop/capsule?desktop=1`)).text();
    assert.match(capsulePage, /工作胶囊/);
    assert.match(capsulePage, /产品 Alpha/);
    assert.match(capsulePage, /产品 Beta/);
    assert.match(capsulePage, /data-capsule-project/);
    assert.doesNotMatch(capsulePage, /database_path|goalboard\.db/);
    assertInlineScriptsCompile(capsulePage);

    const missingSelection = await webFetch(`${origin}/api/board`);
    assert.equal(missingSelection.status, 400);
    assert.match(await missingSelection.text(), /请先选择一个 GoalBoard 项目/);

    const alphaPage = await (await webFetch(`${origin}${alphaPrefix}/goals/ALPHA-ONLY`)).text();
    assert.match(alphaPage, /class="navigator-project"[\s\S]*title="产品 Alpha">产品 Alpha<\/strong>/);
    assert.match(alphaPage, /切换项目/);
    assert.match(alphaPage, /class="desktop-project-switcher navigator-project-menu"/);
    assert.match(alphaPage, /class="mobile-project-bar"/);
    assert.match(alphaPage, /class="mobile-project-switcher navigator-project-menu"/);
    assert.match(alphaPage, /class="mobile-project-settings"[^>]*aria-label="打开当前项目设置"/);
    assert.match(alphaPage, /data-desktop-shell="true"/);
    assert.doesNotMatch(alphaPage, /data-native-desktop="true"|class="navigator-project-meta"|class="web-project-switcher"/);
    assert.match(alphaPage, /仅 Alpha 可见的 Goal/);
    assert.doesNotMatch(alphaPage, /仅 Beta 可见的 Goal|数据源:|goalboard\.db/);
    assert.match(alphaPage, /按需加载 Feed 详情/);
    assert.doesNotMatch(alphaPage, /ALPHA-LAZY-BODY-SENTINEL/);
    assert.match(alphaPage, new RegExp(`data-route-prefix="${alphaPrefix}"`));
    assert.match(alphaPage, /data-directory-open="feed"[^>]*data-feed-preset="inbox_message"/);
    assert.match(alphaPage, /data-directory-open="sessions" data-work-surface-open="sessions"/);
    assert.match(alphaPage, /data-directory-panel="sessions"/);
    assert.match(alphaPage, /data-work-surface="sessions"/);
    assert.doesNotMatch(alphaPage, /data-directory-open="workspaces"|data-directory-panel="workspaces"|data-work-surface="workspaces"/);
    assert.doesNotMatch(alphaPage, /sw-page|sw-project-chrome|sw-shell|sw-commandbar/);
    assert.match(alphaPage, /data-feed-workbench/);
    assert.match(alphaPage, /data-feed-workbench[^>]*data-loaded="false"/);
    assert.doesNotMatch(alphaPage, /data-graph-node|data-graph-edge/);
    assert.match(alphaPage, /href="\/assets\/goalboard-workbench\.css"/);
    assert.match(alphaPage, /src="\/assets\/goalboard-workbench\.js"/);
    assert.doesNotMatch(alphaPage, /<style>/);
    assert.doesNotMatch(alphaPage, /const loadGoalDocument = async/);
    assert.match(WORKBENCH_STYLES, /body \{[^}]*height: 100dvh;/);
    assert.match(WORKBENCH_STYLES, /\.app \{[^}]*height: 100dvh;/);
    assert.match(WORKBENCH_STYLES, /\.workspace \{[^}]*height: 100%;/);
    assert.match(WORKBENCH_STYLES, /\.app \{[^}]*grid-template-rows: 58px minmax\(0, 1fr\)/);
    assert.match(WORKBENCH_STYLES, /:not\(\[data-native-desktop="true"\]\) \.mobile-project-bar \{[\s\S]*display: grid;/);
    assert.match(WORKBENCH_STYLES, /\.mobile-project-switcher \.navigator-project-menu-popover \{[\s\S]*z-index: 120;/);
    assert.match(WORKBENCH_STYLES, /\.project-record-directory \{ min-height: 0; grid-template-rows:/);
    assert.match(WORKBENCH_STYLES, /data-desktop-surface="sessions"\] \.project-operation-layout \{ padding-inline: 0;/);
    assert.doesNotMatch(WORKBENCH_STYLES, /\.sw-page|\.sw-project-chrome|\.sw-shell|\.sw-commandbar/);
    assert.equal((alphaPage.match(/data-goal-view=/g) ?? []).length, 1);

    const globalSessions = await webFetch(`${origin}/sessions`, { redirect: "manual" });
    assert.equal(globalSessions.status, 302);
    assert.equal(globalSessions.headers.get("location"), "/");

    const globalWorkspaces = await webFetch(`${origin}/workspaces`, { redirect: "manual" });
    assert.equal(globalWorkspaces.status, 302);
    assert.equal(globalWorkspaces.headers.get("location"), "/");

    const alphaSessions = await webFetch(`${origin}${alphaPrefix}/sessions`, { redirect: "manual" });
    assert.equal(alphaSessions.status, 302);
    assert.equal(alphaSessions.headers.get("location"), `${alphaPrefix}/#sessions`);
    const alphaWorkspaces = await webFetch(`${origin}${alphaPrefix}/workspaces`, { redirect: "manual" });
    assert.equal(alphaWorkspaces.status, 302);
    assert.equal(alphaWorkspaces.headers.get("location"), `${alphaPrefix}/#sessions`);
    const desktopAlphaSessions = await webFetch(`${origin}${alphaPrefix}/sessions?desktop=1`, { redirect: "manual" });
    assert.equal(desktopAlphaSessions.status, 302);
    assert.equal(desktopAlphaSessions.headers.get("location"), `${alphaPrefix}/?desktop=1#sessions`);

    const removedSessionWorkspaceStyles = await webFetch(`${origin}/assets/goalboard-session-workspace.css`);
    assert.equal(removedSessionWorkspaceStyles.status, 404);
    const removedSessionWorkspaceClient = await webFetch(`${origin}/assets/goalboard-session-workspace.js`);
    assert.equal(removedSessionWorkspaceClient.status, 404);

    const nativeAlphaPage = await (await webFetch(`${origin}${alphaPrefix}/goals/ALPHA-ONLY?desktop=1`)).text();
    assert.match(nativeAlphaPage, /data-native-desktop="true"/);
    assert.doesNotMatch(nativeAlphaPage, /class="mobile-project-bar"/);

    const stylesheetResponse = await webFetch(`${origin}/assets/goalboard-workbench.css`);
    assert.equal(stylesheetResponse.status, 200);
    assert.match(stylesheetResponse.headers.get("content-type") ?? "", /text\/css/);
    assert.equal(stylesheetResponse.headers.get("cache-control"), "private, max-age=0, must-revalidate");
    const stylesheetEtag = stylesheetResponse.headers.get("etag");
    assert.ok(stylesheetEtag);
    assert.equal(await stylesheetResponse.text(), WORKBENCH_STYLES);
    assert.match(
      WORKBENCH_STYLES,
      /html\[data-resolved-theme="dark"\] \.risk-resolution-fields,[\s\S]{0,500}background: color-mix\(in srgb, var\(--rail\) 76%, var\(--paper\)\);/,
    );
    const revalidatedStylesheet = await webFetch(`${origin}/assets/goalboard-workbench.css`, {
      headers: { "if-none-match": stylesheetEtag },
    });
    assert.equal(revalidatedStylesheet.status, 304);
    assert.equal(await revalidatedStylesheet.text(), "");

    const clientResponse = await webFetch(`${origin}/assets/goalboard-workbench.js`);
    assert.equal(clientResponse.status, 200);
    assert.match(clientResponse.headers.get("content-type") ?? "", /text\/javascript/);
    assert.ok(clientResponse.headers.get("etag"));
    assert.equal(await clientResponse.text(), WORKBENCH_CLIENT_SCRIPT);
    assert.doesNotThrow(() => new Script(WORKBENCH_CLIENT_SCRIPT));

    const ptyClientResponse = await webFetch(`${origin}/desktop/pty-client.js`);
    assert.equal(ptyClientResponse.status, 200);
    assert.equal(ptyClientResponse.headers.get("cache-control"), "private, max-age=0, must-revalidate");
    const ptyClientEtag = ptyClientResponse.headers.get("etag");
    assert.ok(ptyClientEtag);
    assert.ok((await ptyClientResponse.arrayBuffer()).byteLength > 100_000);
    const revalidatedPtyClient = await webFetch(`${origin}/desktop/pty-client.js`, {
      headers: { "if-none-match": ptyClientEtag },
    });
    assert.equal(revalidatedPtyClient.status, 304);
    assert.equal(await revalidatedPtyClient.text(), "");

    const alphaCursorResponse = await webFetch(`${origin}${alphaPrefix}/api/board/cursor`);
    assert.equal(alphaCursorResponse.status, 200);
    const alphaCursorText = await alphaCursorResponse.text();
    assert.ok(alphaCursorText.length < 100);
    assert.equal(typeof (JSON.parse(alphaCursorText) as { observed_event_cursor: number }).observed_event_cursor, "number");

    const alphaCapsuleResponse = await webFetch(`${origin}${alphaPrefix}/api/capsule`);
    assert.equal(alphaCapsuleResponse.status, 200);
    const alphaCapsule = (await alphaCapsuleResponse.json()) as {
      project: { project_id: string; display_name: string };
      state: { kind: string; action_path: string };
    };
    assert.equal(alphaCapsule.project.project_id, fixture.alpha.project_id);
    assert.equal(alphaCapsule.project.display_name, "产品 Alpha");
    assert.match(alphaCapsule.state.action_path, new RegExp(`^${alphaPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

    const betaCapsuleResponse = await webFetch(`${origin}${betaPrefix}/api/capsule`);
    assert.equal(betaCapsuleResponse.status, 200);
    const betaCapsule = (await betaCapsuleResponse.json()) as {
      project: { project_id: string; display_name: string };
      state: { kind: string; action_path: string };
    };
    assert.equal(betaCapsule.project.project_id, fixture.beta.project_id);
    assert.equal(betaCapsule.project.display_name, "产品 Beta");
    assert.match(betaCapsule.state.action_path, new RegExp(`^${betaPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.deepEqual(
      boardSnapshot(fixture.alpha.database_path, fixture.alpha.board_id),
      alphaBeforeSwitch,
      "reading another Project in the capsule must not change Alpha work",
    );
    assert.deepEqual(
      boardSnapshot(fixture.beta.database_path, fixture.beta.board_id),
      betaBeforeSwitch,
      "reading another Project in the capsule must not change Beta work",
    );

    const alphaDocumentResponse = await webFetch(
      `${origin}${alphaPrefix}/api/goals/ALPHA-ONLY/document?view=current`,
    );
    assert.equal(alphaDocumentResponse.status, 200);
    const alphaDocument = await alphaDocumentResponse.text();
    assert.match(alphaDocument, /data-goal-view="ALPHA-ONLY"/);
    assert.match(alphaDocument, /仅 Alpha 可见的 Goal/);
    assert.doesNotMatch(alphaDocument, /<!doctype html>|仅 Beta 可见的 Goal/);
    assert.doesNotMatch(alphaDocument, /data-goal-section="progress"|data-quick-record-dialog/);
    const alphaCompletion = await (
      await webFetch(`${origin}${alphaPrefix}/api/goals/ALPHA-ONLY/panels/completion?view=current`)
    ).text();
    assert.match(alphaCompletion, /目标上下文/);
    const alphaProgress = await (
      await webFetch(`${origin}${alphaPrefix}/api/goals/ALPHA-ONLY/panels/progress?view=current`)
    ).text();
    assert.match(alphaProgress, /data-goal-section="progress"/);
    const alphaFactors = await (
      await webFetch(`${origin}${alphaPrefix}/api/goals/ALPHA-ONLY/panels/factors?view=current`)
    ).text();
    assert.match(alphaFactors, /data-goal-factor-tab="relations"/);
    const alphaQuickRecord = await (
      await webFetch(`${origin}${alphaPrefix}/api/goals/ALPHA-ONLY/quick-record?view=current`)
    ).text();
    assert.match(alphaQuickRecord, /data-quick-record-dialog/);
    assert.equal((alphaQuickRecord.match(/data-quick-record-type=/g) ?? []).length, 4);
    const alphaRefreshResponse = await webFetch(
      `${origin}${alphaPrefix}/api/board/refresh?view=current&goal_id=ALPHA-ONLY`,
    );
    assert.equal(alphaRefreshResponse.status, 200);
    assert.equal(alphaRefreshResponse.headers.get("cache-control"), "no-store");
    const alphaRefresh = await alphaRefreshResponse.text();
    assert.match(alphaRefresh, /data-refresh-tree-chrome/);
    assert.match(alphaRefresh, /data-goal-view="ALPHA-ONLY"/);
    assert.doesNotMatch(alphaRefresh, /goalboard-workbench\.(?:css|js)|pty-client\.js|data-feed-workbench/);
    const alphaMomentumResponse = await webFetch(
      `${origin}${alphaPrefix}/api/board/momentum?view=current&goal_id=ALPHA-ONLY`,
    );
    assert.equal(alphaMomentumResponse.status, 200);
    assert.equal(alphaMomentumResponse.headers.get("cache-control"), "no-store");
    assert.match(await alphaMomentumResponse.text(), /data-goal-momentum[\s\S]*data-momentum-node/);
    const alphaFeedWorkbenchResponse = await webFetch(
      `${origin}${alphaPrefix}/api/feed/workbench?preset=feed`,
    );
    assert.equal(alphaFeedWorkbenchResponse.status, 200);
    assert.equal(alphaFeedWorkbenchResponse.headers.get("cache-control"), "no-store");
    assert.doesNotMatch(await alphaFeedWorkbenchResponse.text(), /ALPHA-LAZY-BODY-SENTINEL/);
    const alphaFeedDetailResponse = await webFetch(
      `${origin}${alphaPrefix}/api/feed/items/alpha-lazy-feed-item/detail`,
    );
    assert.equal(alphaFeedDetailResponse.status, 200);
    assert.equal(alphaFeedDetailResponse.headers.get("cache-control"), "no-store");
    const alphaFeedDetail = await alphaFeedDetailResponse.text();
    assert.match(alphaFeedDetail, /data-feed-detail="alpha-lazy-feed-item"/);
    assert.match(alphaFeedDetail, /ALPHA-LAZY-BODY-SENTINEL/);
    const alphaEventPage = await webFetch(
      `${origin}${alphaPrefix}/api/goals/ALPHA-ONLY/record-events?view=current&offset=0`,
    );
    assert.equal(alphaEventPage.status, 200);
    assert.match(await alphaEventPage.text(), /data-goal-event-page/);
    assert.equal(
      (await webFetch(`${origin}${alphaPrefix}/api/goals/ALPHA-ONLY/record-events?view=current&offset=-1`)).status,
      400,
    );
    assert.equal(
      (await webFetch(`${origin}${alphaPrefix}/api/goals/ALPHA-ONLY/document?view=trash`)).status,
      404,
    );
    assert.equal(
      (await webFetch(`${origin}${alphaPrefix}/api/goals/ALPHA-ONLY/document?view=unknown`)).status,
      400,
    );

    const betaPage = await (await webFetch(`${origin}${betaPrefix}/goals/BETA-ONLY`)).text();
    assert.match(betaPage, /class="navigator-project"[\s\S]*title="产品 Beta">产品 Beta<\/strong>/);
    assert.match(betaPage, /仅 Beta 可见的 Goal/);
    assert.doesNotMatch(betaPage, /仅 Alpha 可见的 Goal/);

    const alphaBoardResponse = await webFetch(`${origin}${alphaPrefix}/api/board`);
    assert.equal(alphaBoardResponse.status, 200);
    const alphaBoardText = await alphaBoardResponse.text();
    assert.doesNotMatch(alphaBoardText, new RegExp(fixture.alpha.database_path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const alphaBoard = JSON.parse(alphaBoardText) as {
      project: { display_name: string } | null;
      snapshot: { board: { board_id: string } };
      goals: Array<{ goal: { goal_id: string } }>;
    };
    assert.equal(alphaBoard.project?.display_name, "产品 Alpha");
    assert.equal(alphaBoard.snapshot.board.board_id, "");
    assert.ok(alphaBoard.goals.some((item) => item.goal.goal_id === "ALPHA-ONLY"));
    assert.ok(!alphaBoard.goals.some((item) => item.goal.goal_id === "BETA-ONLY"));

    const created = await webFetch(`${origin}${alphaPrefix}/api/goals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        goal_id: "ALPHA-WEB-CREATED",
        title: "只在 Alpha 创建的 Draft",
        outcome: "",
        why: "",
        business_logic: "",
      }),
    });
    assert.equal(created.status, 201);
    const createdPayload = (await created.json()) as { goal_path: string };
    assert.equal(createdPayload.goal_path, `${alphaPrefix}/goals/ALPHA-WEB-CREATED`);

    const betaBoard = (await (await webFetch(`${origin}${betaPrefix}/api/board`)).json()) as {
      goals: Array<{ goal: { goal_id: string } }>;
    };
    assert.ok(!betaBoard.goals.some((item) => item.goal.goal_id === "ALPHA-WEB-CREATED"));
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }

  const catalog = await GoalBoardProjectCatalog.open({ homeDirectory: fixture.homeDirectory });
  try {
    assert.deepEqual(catalog.listRuntimeContextBindingEvents(), fixture.bindingEvents);
    assert.equal(catalog.resolveRuntimeContext(fixture.alphaContext).project?.project_id, fixture.alpha.project_id);
    assert.equal(catalog.resolveRuntimeContext(fixture.betaContext).project?.project_id, fixture.beta.project_id);
  } finally {
    catalog.close();
  }
});

test("Web maintains project guidance as a direct project document with immutable history", async () => {
  const fixture = await webProjectCatalogFixture();
  const server = createGoalBoardWebServer({ homeDirectory: fixture.homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const projectPrefix = `/projects/${encodeURIComponent(fixture.alpha.project_id)}`;
    const longHistoryTail = "LONG_HISTORY_TAIL：这一段必须能在完整版本中核验。";
    const originalLongContent = `上线前必须验证升级和回滚路径。${"这条项目级发布约束需要保留完整原文，不能只显示一个无法核验的摘要。".repeat(10)}${longHistoryTail}`;
    assert.ok(originalLongContent.length > 220);

    const initialPage = await (await webFetch(`${origin}${projectPrefix}/settings/guidance`)).text();
    assert.match(initialPage, /<body class="settings-page project-guidance-page"/);
    assert.match(initialPage, /data-guidance-new/);
    assert.match(initialPage, /Runtime 发现新内容时/);
    assert.match(initialPage, /不会绑定 Goal，也不会占用 Goal 的决策队列/);
    assert.doesNotMatch(initialPage, /data-guidance-pending|待确认建议/);
    assertInlineScriptsCompile(initialPage);

    const rejected = await webFetch(`${origin}${projectPrefix}/api/project-guidance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "constraint",
        content: originalLongContent,
        reason: "不能把未经确认的内容写入项目说明",
      }),
    });
    assert.equal(rejected.status, 400);

    const createdResponse = await webFetch(`${origin}${projectPrefix}/api/project-guidance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "constraint",
        content: originalLongContent,
        reason: "这是整个项目都要遵守的发布底线",
        user_confirmed: true,
      }),
    });
    assert.equal(createdResponse.status, 200);
    const created = await createdResponse.json() as {
      entry: { guidance_id: string; revision: number };
      project_guidance: { entries: unknown[]; revisions: unknown[]; runtime_prompt_prefix: string };
    };
    assert.equal(created.entry.revision, 1);
    assert.equal(created.project_guidance.entries.length, 1);
    assert.equal(created.project_guidance.revisions.length, 1);
    assert.match(created.project_guidance.runtime_prompt_prefix, /上线前必须验证升级和回滚路径/);

    const editedResponse = await webFetch(
      `${origin}${projectPrefix}/api/project-guidance/${encodeURIComponent(created.entry.guidance_id)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "edit",
          kind: "constraint",
          content: "上线前必须验证升级、回滚和安装路径。",
          reason: "补齐安装验证",
          user_confirmed: true,
        }),
      },
    );
    assert.equal(editedResponse.status, 200);

    const deactivatedResponse = await webFetch(
      `${origin}${projectPrefix}/api/project-guidance/${encodeURIComponent(created.entry.guidance_id)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "deactivate", reason: "验证停用", user_confirmed: true }),
      },
    );
    assert.equal(deactivatedResponse.status, 200);
    const deactivated = await deactivatedResponse.json() as {
      project_guidance: { entries: unknown[]; inactive_entries: unknown[]; runtime_prompt_prefix: string };
    };
    assert.equal(deactivated.project_guidance.entries.length, 0);
    assert.equal(deactivated.project_guidance.inactive_entries.length, 1);
    assert.doesNotMatch(deactivated.project_guidance.runtime_prompt_prefix, /安装路径/);

    const restoredResponse = await webFetch(
      `${origin}${projectPrefix}/api/project-guidance/${encodeURIComponent(created.entry.guidance_id)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "restore", reason: "验证恢复", user_confirmed: true }),
      },
    );
    assert.equal(restoredResponse.status, 200);
    const restored = await restoredResponse.json() as {
      project_guidance: {
        entries: Array<{ content: string; revision: number }>;
        inactive_entries: unknown[];
        revisions: unknown[];
        runtime_prompt_prefix: string;
      };
    };
    assert.equal(restored.project_guidance.entries[0]?.revision, 4);
    assert.equal(restored.project_guidance.entries[0]?.content, "上线前必须验证升级、回滚和安装路径。");
    assert.equal(restored.project_guidance.inactive_entries.length, 0);
    assert.equal(restored.project_guidance.revisions.length, 4);
    assert.match(restored.project_guidance.runtime_prompt_prefix, /升级、回滚和安装路径/);

    const updatedPage = await (await webFetch(`${origin}${projectPrefix}/settings/guidance`)).text();
    assert.match(updatedPage, /上线前必须验证升级、回滚和安装路径/);
    assert.match(updatedPage, /版本记录/);
    assert.match(updatedPage, /共 4 次变更/);
    assert.match(updatedPage, /查看完整版本与变更原因/);
    assert.match(updatedPage, new RegExp(longHistoryTail));
    assert.match(updatedPage, /这是整个项目都要遵守的发布底线/);
    assert.match(updatedPage, /web-user/);
    assert.match(updatedPage, /生效版本/);
    assert.match(updatedPage, /停用版本/);
    assert.doesNotMatch(updatedPage, /data-guidance-pending|待确认建议/);
    assertInlineScriptsCompile(updatedPage);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }

  const store = new SqliteGoalBoardStore(fixture.alpha.database_path);
  try {
    assert.equal(
      (store.db.prepare("SELECT COUNT(*) AS count FROM goal_tree_proposal_decisions").get() as { count: number }).count,
      0,
    );
  } finally {
    store.close();
  }
});

test("Web settings use shared Runtime and project services for confirmed setup flows", async () => {
  const fixture = await webProjectCatalogFixture();
  const runtime = webRuntimeIntegrationFixture(fixture.homeDirectory);
  const server = createGoalBoardWebServer({
    homeDirectory: fixture.homeDirectory,
    runtimeIntegrationService: runtime.service,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const settingsStyles = await (await webFetch(`${origin}/assets/goalboard-settings.css`)).text();

    const redirect = await webFetch(`${origin}/settings`, { redirect: "manual" });
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get("location"), "/settings/appearance");

    const appearanceResponse = await webFetch(`${origin}/settings/appearance`);
    assert.match(String(appearanceResponse.headers.get("content-security-policy")), /style-src 'self' 'unsafe-inline'/);
    const appearancePage = await appearanceResponse.text();
    assertInlineScriptsCompile(appearancePage);
    assert.match(appearancePage, /<h1 id="settings-title">界面与语言<\/h1>/);
    assert.match(appearancePage, /href="\/settings\/appearance" aria-current="page"/);
    assert.match(appearancePage, /href="\/locale\?lang=zh/);
    assert.match(appearancePage, /href="\/locale\?lang=en/);
    assert.match(appearancePage, /aria-label="界面语言"/);
    assert.match(appearancePage, /data-density-option="standard" aria-pressed="true"/);
    assert.match(appearancePage, /data-density-option="compact" aria-pressed="false"/);
    assert.match(appearancePage, /data-theme-option="system" aria-pressed="true"/);
    assert.match(appearancePage, /data-terminal-theme-option="auto" aria-pressed="true"/);
    assert.match(appearancePage, /data-terminal-theme-option="light" aria-pressed="false"/);
    assert.match(appearancePage, /data-terminal-theme-option="dark" aria-pressed="false"/);
    assert.match(appearancePage, /语言、主题、终端外观和密度只保存在当前设备/);
    const systemNavigation = appearancePage.slice(
      appearancePage.indexOf('<nav class="settings-navigation"'),
      appearancePage.indexOf('<div class="settings-content">'),
    );
    assert.match(systemNavigation, /系统设置/);
    assert.match(systemNavigation, /界面与语言/);
    assert.match(systemNavigation, /AI 与执行工具/);
    assert.match(systemNavigation, /href="\/settings\/planning"/);
    assert.match(systemNavigation, /<strong>规划方法<\/strong>/);
    assert.match(systemNavigation, /诊断/);
    assert.match(systemNavigation, /class="settings-project-switcher navigator-project-menu"/);
    assert.doesNotMatch(systemNavigation, />\s*<svg[^>]*>.*?<\/svg><span><strong>项目设置/s);
    assert.match(appearancePage, /<body class="settings-page"[^>]*data-desktop-shell="true"/);
    assert.doesNotMatch(appearancePage, /data-native-desktop="true"|data-tauri-drag-region/);

    const contextualAppearancePage = await (await webFetch(
      `${origin}/settings/appearance?project=${fixture.alpha.project_id}`,
    )).text();
    assert.match(contextualAppearancePage, new RegExp(`/settings/runtimes\\?project=${fixture.alpha.project_id}`));
    assert.match(contextualAppearancePage, new RegExp(`/projects/${fixture.alpha.project_id}/`));
    assert.match(contextualAppearancePage, /href="\/settings\/planning"/);
    assert.doesNotMatch(contextualAppearancePage, new RegExp(`/settings/planning\\?project=${fixture.alpha.project_id}`));

    const projectBoardPage = await (await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/`,
    )).text();
    const projectNavigatorLayer = projectBoardPage.slice(
      projectBoardPage.indexOf('<section class="navigator-project"'),
      projectBoardPage.indexOf('<section class="desktop-directory-panel'),
    );
    assert.doesNotMatch(projectBoardPage, /<header class="topbar"|web-project-switcher/);
    assert.match(projectBoardPage, /class="mobile-project-bar"/);
    assert.match(projectNavigatorLayer, /产品 Alpha/);
    assert.match(projectNavigatorLayer, new RegExp(`href="/projects/${fixture.alpha.project_id}/settings/guidance"`));
    assert.match(projectNavigatorLayer, /切换项目/);
    assert.match(projectNavigatorLayer, /项目设置/);
    assert.doesNotMatch(projectNavigatorLayer, /project-decisions|navigator-project-meta/);
    assert.match(projectBoardPage, /class="personal-account" data-settings-link/);
    assert.match(projectBoardPage, new RegExp(`data-settings-link href="/settings/appearance\\?project=${fixture.alpha.project_id}"`));
    assert.doesNotMatch(projectBoardPage, /class="locale-switch"|class="theme-picker"/);

    const runtimePage = await (await webFetch(`${origin}/settings/runtimes`)).text();
    assertInlineScriptsCompile(runtimePage);
    assert.match(runtimePage, /AI 与执行工具/);
    assert.match(runtimePage, /Codex/);
    assert.match(runtimePage, /Claude Code/);
    assert.match(runtimePage, /OpenCode/);
    assert.match(runtimePage, /Pi Agent/);
    assert.match(runtimePage, /Grok Build/);
    assert.match(runtimePage, /未接入/);
    assert.match(runtimePage, /data-runtime-plan="codex"/);
    assert.match(runtimePage, /data-runtime-plan-dialog/);
    assert.match(runtimePage, /我已查看并确认这份变更/);
    assert.doesNotMatch(runtimePage, /已关联的 AI 会话|工作目录关联|data-connection-rebind|data-workspace-default/);
    assert.match(runtimePage, /Session 与运行位置请进入对应项目的 Sessions 管理/);
    assert.match(runtimePage, /不接入也能正常使用 Goal Tree、待决定和记录/);
    assert.match(runtimePage, /href="\/assets\/goalboard-settings\.css"/);
    assert.match(settingsStyles, /.settings-page > \.topbar \{ height: 58px; \}/);
    assert.match(settingsStyles, /@media \(max-width: 760px\)[\s\S]*\.settings-page > \.topbar \{ height: 52px; \}/);
    assert.match(settingsStyles, /@media \(max-width: 760px\)[\s\S]*\.settings-desktop-project,[\s\S]*\.settings-desktop-heading,[\s\S]*\.settings-navigation > \.personal-sidebar-footer \{ display: none !important; \}/);
    assert.match(settingsStyles, /@media \(max-width: 760px\)[\s\S]*\.settings-nav-body \{ display: contents; \}/);
    assert.match(settingsStyles, /@media \(max-width: 760px\)[\s\S]*\.settings-navigation \{[^}]*padding: 6px 8px;[^}]*\}[\s\S]*\.settings-navigation a \{ min-height: 44px; \}/);
    assert.match(settingsStyles, /@media \(max-width: 520px\) \{\s*\.preference-options--density \{ grid-template-columns: 1fr; \}/);
    assert.match(settingsStyles, /\.settings-page \.top-action span \{ display: none; \}/);
    assert.match(settingsStyles, /button:focus-visible[\s\S]*a:focus-visible/);
    assert.match(settingsStyles, /body\.settings-page\[data-desktop-shell="true"\]:has\(\.settings-navigation\) \.settings-navigation \{[^}]*overflow: visible;/);
    assert.match(settingsStyles, /body\.settings-page\[data-desktop-shell="true"\] \.settings-nav-body \{[^}]*overflow-y: auto;/);
    assert.doesNotMatch(runtimePage, /兼容模式|自动启用项目|单数据库工作区/);

    const projectPage = await (await webFetch(`${origin}/settings/projects`)).text();
    assert.match(projectPage, /创建项目/);
    assert.match(projectPage, /产品 Alpha/);
    assert.match(projectPage, /产品 Beta/);
    assert.match(projectPage, /存储信息/);
    assert.match(projectPage, /data-project-rename/);
    assert.match(projectPage, /data-project-migration-form/);
    assert.match(projectPage, new RegExp(`/projects/${fixture.alpha.project_id}/settings/guidance`));
    assert.match(projectPage, new RegExp(`/projects/${fixture.alpha.project_id}/settings/rules`));
    assert.match(projectPage, /普通用户项目不会被示例操作或普通卸载删除/);
    const projectContent = projectPage.slice(projectPage.indexOf('<div class="settings-content">'), projectPage.indexOf("</main>"));
    assert.doesNotMatch(projectContent, /Runtime|Session|MCP|CLI|DB 信息|已关联的 AI 会话|工作目录关联/);
    assert.doesNotMatch(projectContent, /data-connection-row|data-workspace-row/);

    const projectRulesPage = await (await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/settings/rules`,
    )).text();
    assertInlineScriptsCompile(projectRulesPage);
    assert.match(projectRulesPage, /项目工作规则/);
    assert.match(projectRulesPage, /所有 Goal 共同遵守的最低要求/);
    assert.doesNotMatch(projectRulesPage, /data-guidance-form|项目长期说明/);
    const projectRulesNavigation = projectRulesPage.slice(
      projectRulesPage.indexOf('<nav class="settings-navigation'),
      projectRulesPage.indexOf('<div class="settings-content">'),
    );
    assert.match(projectRulesNavigation, /返回 Goal Tree/);
    assert.match(projectRulesNavigation, /项目设置/);
    assert.match(projectRulesNavigation, /产品 Alpha/);
    assert.match(projectRulesNavigation, /项目说明/);
    assert.match(projectRulesNavigation, /工作规则/);
    assert.match(projectRulesNavigation, /工作规划/);
    assert.doesNotMatch(projectRulesNavigation, /<strong>AI 与执行工具<\/strong>|<strong>诊断<\/strong>/);
    const desktopProjectRulesPage = await (await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/settings/rules?desktop=1`,
    )).text();
    assert.match(desktopProjectRulesPage, /<nav class="settings-navigation project-settings-navigation"[\s\S]*?<div class="settings-desktop-project">[\s\S]*?class="settings-project-switcher navigator-project-menu"/);
    assert.doesNotMatch(desktopProjectRulesPage, /desktop-titlebar-safe|项目状态本地保存/);
    assert.doesNotMatch(desktopProjectRulesPage, /<header class="topbar" data-tauri-drag-region/);
    assert.match(desktopProjectRulesPage, /<header class="topbar">[\s\S]*?<div class="project-context" data-tauri-drag-region[\s\S]*?<div class="top-spacer" data-tauri-drag-region>[\s\S]*?<a class="top-action"/);
    const desktopGlobalSettingsPage = await (await webFetch(
      `${origin}/settings/appearance?desktop=1&project=${fixture.alpha.project_id}`,
    )).text();
    assert.match(desktopGlobalSettingsPage, /<nav class="settings-navigation"[\s\S]*?<div class="settings-desktop-project">[\s\S]*?class="settings-project-switcher navigator-project-menu"/);
    assert.match(desktopGlobalSettingsPage, /data-native-desktop="true"/);
    assert.match(desktopGlobalSettingsPage, /data-tauri-drag-region/);
    assert.doesNotMatch(desktopGlobalSettingsPage, /desktop-titlebar-safe|项目状态本地保存/);
    assert.match(projectRulesPage, /data-route-prefix="\/projects\//);
    assert.match(projectRulesPage, /name="scope" value="project_default"/);
    assert.doesNotMatch(projectRulesPage, /name="goal_id"/);
    assert.match(projectRulesPage, /项目先定共同底线/);
    assert.match(projectRulesPage, /<details class="policy-source policy-source--project" open>/);
    assert.match(projectRulesPage, /<details class="factor-advanced policy-advanced" data-progressive-fields>/);
    assert.match(projectRulesPage, /data-project-rules-receipt/);
    assert.match(projectRulesPage, /goalboard-project-rules-receipt:/);
    assert.match(projectRulesPage, /之后开始或重新领取的 Goal 会采用这些规则/);
    assert.match(settingsStyles, /\.policy-source \{[^}]*background: var\(--paper\)/);
    assert.match(settingsStyles, /\.policy-source > summary \{[^}]*background: color-mix\(in srgb, var\(--rail\)/);
    assert.match(settingsStyles, /\.project-rules-intro \{[^}]*background: var\(--rail\)/);
    assert.match(settingsStyles, /\.project-rules-intro li \{[^}]*background: var\(--paper\)/);
    assert.match(settingsStyles, /\.guidance-document \{[^}]*width: min\(100%, 1100px\)/);
    assert.match(settingsStyles, /\.guidance-section \{[^}]*grid-template-columns: 142px minmax\(0, 1fr\)/);
    assert.match(settingsStyles, /\.policy-mode-options label:hover > span \{[^}]*var\(--blue-soft\)/);
    assert.match(settingsStyles, /\.policy-mode-options input:disabled \+ span \{[^}]*background: var\(--rail\)/);
    assert.match(settingsStyles, /\.policy-input input, \.policy-reason textarea \{[^}]*color: var\(--ink\); background: var\(--paper\)/);

    const rejectedGuidance = await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/api/project-guidance`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "quality_bar",
          content: "所有发布 Goal 都必须保留可复现验证记录。",
          reason: "跨 Goal 的完成底线",
          confirmation_summary: "没有确认",
          user_confirmed: false,
        }),
      },
    );
    assert.equal(rejectedGuidance.status, 400);
    const savedGuidance = await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/api/project-guidance`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "quality_bar",
          content: "所有发布 Goal 都必须保留可复现验证记录。",
          reason: "跨 Goal 的完成底线",
          confirmation_summary: "用户在设置页确认精确分类和原文",
          user_confirmed: true,
        }),
      },
    );
    assert.equal(savedGuidance.status, 200, await savedGuidance.clone().text());
    const guidanceApi = await (await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/api/project-guidance`,
    )).json() as { entries: Array<{ kind: string; content: string }>; runtime_prompt_prefix: string };
    assert.deepEqual(guidanceApi.entries.map((entry) => entry.kind), ["quality_bar"]);
    assert.match(guidanceApi.runtime_prompt_prefix, /所有发布 Goal 都必须保留可复现验证记录/);
    const guidancePage = await (await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/settings/guidance`,
    )).text();
    assertInlineScriptsCompile(guidancePage);
    assert.match(guidancePage, /project-guidance-document-v1/);
    assert.match(guidancePage, /<h1 id="guidance-title">项目说明<\/h1>/);
    assert.match(guidancePage, /data-guidance-form/);
    assert.match(guidancePage, /版本记录/);
    assert.match(guidancePage, /不会绑定 Goal，也不会占用 Goal 的决策队列/);
    assert.doesNotMatch(guidancePage, /Runtime 待确认建议|data-project-guidance-form/);
    assert.match(guidancePage, /所有发布 Goal 都必须保留可复现验证记录/);

    const guidanceId = (guidanceApi as unknown as { entries: Array<{ guidance_id: string }> }).entries[0]!.guidance_id;
    const editedGuidance = await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/api/project-guidance/${encodeURIComponent(guidanceId)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "edit",
          kind: "quality_bar",
          content: "所有发布 Goal 都必须保留升级、回滚和可复现验证记录。",
          reason: "补全项目发布质量标准",
          user_confirmed: true,
        }),
      },
    );
    assert.equal(editedGuidance.status, 200, await editedGuidance.clone().text());
    const deactivatedGuidance = await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/api/project-guidance/${encodeURIComponent(guidanceId)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "deactivate", reason: "暂时停用发布标准", user_confirmed: true }),
      },
    );
    assert.equal(deactivatedGuidance.status, 200, await deactivatedGuidance.clone().text());
    const inactiveGuidance = await (await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/api/project-guidance`,
    )).json() as { entries: unknown[]; inactive_entries: unknown[]; revisions: unknown[]; runtime_prompt_prefix: string };
    assert.equal(inactiveGuidance.entries.length, 0);
    assert.equal(inactiveGuidance.inactive_entries.length, 1);
    assert.equal(inactiveGuidance.revisions.length, 3);
    assert.doesNotMatch(inactiveGuidance.runtime_prompt_prefix, /升级、回滚和可复现/);
    const restoredGuidance = await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/api/project-guidance/${encodeURIComponent(guidanceId)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "restore", reason: "恢复发布标准", user_confirmed: true }),
      },
    );
    assert.equal(restoredGuidance.status, 200, await restoredGuidance.clone().text());
    const restoredGuidancePage = await (await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/settings/guidance`,
    )).text();
    assert.match(restoredGuidancePage, /升级、回滚和可复现验证记录/);
    assert.match(restoredGuidancePage, /共 4 次变更/);

    const savedProjectRules = await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/api/policy-bindings`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope: "project_default",
          reason: "验证项目设置页使用同一规则写入入口",
          policy: {
            goal_mode: "preferred",
            required_capabilities: [],
            self_verification: true,
            cross_reviewers: 0,
            adversarial_reviewers: 0,
            human_approval: false,
            max_lease_seconds: 1800,
          },
        }),
      },
    );
    assert.equal(savedProjectRules.status, 200, await savedProjectRules.clone().text());
    const savedProjectRulesPage = await (await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/settings/rules`,
    )).text();
    assert.match(savedProjectRulesPage, /已设置项目基线/);
    assert.match(savedProjectRulesPage, /验证项目设置页使用同一规则写入入口/);

    const workPlanningPage = await (await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/settings/planning`,
    )).text();
    assertInlineScriptsCompile(workPlanningPage);
    assert.match(workPlanningPage, /工作规划/);
    assert.match(workPlanningPage, /浏览完整方法库/);
    assert.match(workPlanningPage, /产品 Alpha/);
    assert.match(workPlanningPage, /当前规划组合/);
    assert.match(workPlanningPage, /尚未建立项目规划组合/);
    assert.match(workPlanningPage, /添加规划方法/);
    assert.match(workPlanningPage, /data-adopt-planning-method="domain-software-development"/);
    assert.match(workPlanningPage, /data-adopt-planning-method="industry-education"/);
    assert.match(workPlanningPage, /data-adopt-planning-method="overlay-minors"/);
    assert.match(workPlanningPage, /data-planning-filter="industry"/);
    assert.match(workPlanningPage, /data-planning-filter="overlay"/);
    assert.match(workPlanningPage, /加入组合/);
    assert.match(workPlanningPage, new RegExp(`/settings/planning/domain-software-development\\?project=${fixture.alpha.project_id}`));
    const workPlanningNavigation = workPlanningPage.slice(
      workPlanningPage.indexOf('<nav class="settings-navigation'),
      workPlanningPage.indexOf('<div class="settings-content">'),
    );
    assert.match(workPlanningNavigation, /返回 Goal Tree/);
    assert.match(workPlanningNavigation, /产品 Alpha/);
    assert.match(workPlanningNavigation, /工作规则/);
    assert.match(workPlanningNavigation, /工作规划/);
    assert.doesNotMatch(workPlanningNavigation, /<strong>AI 与执行工具<\/strong>|<strong>诊断<\/strong>/);
    assert.doesNotMatch(workPlanningPage, /class="planning-layout"|class="planning-editor"/);

    const globalPlanningLibrary = await (await webFetch(`${origin}/settings/planning`)).text();
    const globalPlanningNavigation = globalPlanningLibrary.slice(
      globalPlanningLibrary.indexOf('<nav class="settings-navigation'),
      globalPlanningLibrary.indexOf('<div class="settings-content">'),
    );
    assert.match(globalPlanningNavigation, /系统设置/);
    assert.match(globalPlanningNavigation, /href="\/settings\/planning" aria-current="page"/);
    assert.match(globalPlanningNavigation, /<strong>规划方法<\/strong>/);
    assert.doesNotMatch(globalPlanningLibrary, /settings-shell--standalone/);

    const appliedPlanningMethod = await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/api/settings/planning-methods/apply`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method_id: "domain-software-development", user_confirmed: true }),
      },
    );
    assert.equal(appliedPlanningMethod.status, 200, await appliedPlanningMethod.clone().text());
    const appliedMethodResult = await appliedPlanningMethod.json() as { method: { method_id: string; scope: string } };
    assert.equal(appliedMethodResult.method.method_id, "domain-software-development");
    assert.equal(appliedMethodResult.method.scope, "project");
    const appliedWorkTypeMethod = await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/api/settings/planning-methods/apply`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method_id: "work-build-change", user_confirmed: true }),
      },
    );
    assert.equal(appliedWorkTypeMethod.status, 200, await appliedWorkTypeMethod.clone().text());
    const workPlanningAfterApply = await (await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/settings/planning`,
    )).text();
    assert.match(workPlanningAfterApply, /2 套方法共同生效/);
    assert.match(workPlanningAfterApply, /构建与改变/);
    assert.match(workPlanningAfterApply, /软件开发/);
    assert.doesNotMatch(workPlanningAfterApply, /data-adopt-planning-method="domain-software-development"/);
    assert.doesNotMatch(workPlanningAfterApply, /data-adopt-planning-method="work-build-change"/);

    const projectPlanningDetail = await (await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/settings/planning/domain-software-development`,
    )).text();
    const projectPlanningDetailNavigation = projectPlanningDetail.slice(
      projectPlanningDetail.indexOf('<nav class="settings-navigation'),
      projectPlanningDetail.indexOf('<div class="settings-content">'),
    );
    assert.match(projectPlanningDetailNavigation, /返回 Goal Tree/);
    assert.match(projectPlanningDetailNavigation, /产品 Alpha/);
    assert.match(projectPlanningDetailNavigation, /工作规则/);
    assert.match(projectPlanningDetailNavigation, /工作规划/);
    assert.doesNotMatch(projectPlanningDetailNavigation, /<strong>AI 与执行工具<\/strong>|<strong>诊断<\/strong>/);

    const planningLibrary = await (await webFetch(
      `${origin}/settings/planning?project=${fixture.alpha.project_id}`,
    )).text();
    assertInlineScriptsCompile(planningLibrary);
    assert.match(planningLibrary, /规划方法库/);
    assert.match(planningLibrary, /class="planning-card"/);
    assert.match(planningLibrary, /陌生领域方法包生成/);
    assert.match(planningLibrary, /软件开发/);
    assert.match(planningLibrary, /医疗健康/);
    assert.match(planningLibrary, /AI 人工复核/);
    assert.match(planningLibrary, /data-planning-filter="work_type"/);
    assert.match(planningLibrary, /data-planning-filter="industry"/);
    assert.match(planningLibrary, /data-planning-filter="overlay"/);
    assert.match(planningLibrary, /行业方法/);
    assert.match(planningLibrary, /场景叠加层/);
    assert.doesNotMatch(planningLibrary, /class="planning-layout"|class="planning-editor"|<form class="planning-edit-form"/);
    const planningNavigation = planningLibrary.slice(
      planningLibrary.indexOf('<nav class="settings-navigation'),
      planningLibrary.indexOf('<div class="settings-content">'),
    );
    assert.match(planningNavigation, /项目设置/);
    assert.match(planningNavigation, /产品 Alpha/);
    assert.match(planningNavigation, /返回 Goal Tree/);
    assert.doesNotMatch(planningNavigation, /系统设置|AI 与执行工具|诊断/);

    const planningDetail = await (await webFetch(
      `${origin}/settings/planning/domain-software-development?project=${fixture.alpha.project_id}`,
    )).text();
    assert.match(planningDetail, /Runtime 方法说明/);
    assert.match(planningDetail, /项目级 SSOT/);
    assert.match(planningDetail, /横纵模块地图/);
    assert.match(planningDetail, /并发写入边界/);
    assert.match(planningDetail, /规划路径/);
    assert.match(planningDetail, /拆分时必须回答/);
    assert.match(planningDetail, /依赖判断/);
    assert.match(planningDetail, /创建我的版本/);
    assert.doesNotMatch(planningDetail, /<form class="planning-edit-form"/);

    const planningEditor = await (await webFetch(
      `${origin}/settings/planning/domain-software-development/edit?project=${fixture.alpha.project_id}`,
    )).text();
    assertInlineScriptsCompile(planningEditor);
    assert.match(planningEditor, /<form class="planning-edit-form"[^>]*data-planning-edit-form/);
    assert.match(planningEditor, /保存到我的方法库/);
    assert.match(planningEditor, /name="instructions"/);
    assert.match(planningEditor, /option value="industry"/);
    assert.match(planningEditor, /option value="overlay"/);
    assert.match(planningEditor, /Runtime 方法正文/);
    assert.match(planningEditor, /data-coverage-row/);
    assert.match(planningEditor, /data-dependency-row/);
    assert.doesNotMatch(planningEditor, /name="scope"|只用于当前项目/);

    const contextualSettingsPage = await (await webFetch(
      `${origin}/settings/projects?project=${fixture.alpha.project_id}`,
    )).text();
    assert.match(contextualSettingsPage, /项目设置/);
    assert.match(contextualSettingsPage, /产品 Alpha/);
    assert.match(contextualSettingsPage, /产品 Beta/);
    assert.doesNotMatch(contextualSettingsPage, /当前项目/);
    assert.match(contextualSettingsPage, new RegExp(`/projects/${fixture.alpha.project_id}/settings/guidance`));
    assert.match(contextualSettingsPage, new RegExp(`/projects/${fixture.alpha.project_id}/settings/rules`));
    assert.match(contextualSettingsPage, new RegExp(`/projects/${fixture.alpha.project_id}/settings/planning`));
    assert.doesNotMatch(contextualSettingsPage, new RegExp(`/settings/(planning|runtimes)\\?project=${fixture.alpha.project_id}`));
    const method = {
      method_id: "domain-web-test",
      kind: "custom",
      name: "Web 测试方法",
      summary: "验证用户可以输入并保存新的方法。",
      instructions: "# Web 测试方法\n\n先定义结果，再让结论依赖可复核证据。",
      applies_to: ["Web test"],
      domain_tags: ["test"],
      steps: ["定义结果", "检查证据"],
      required_coverage: [{ area: "test_result", label: "测试结果", question: "如何证明结果？" }],
      dependency_rules: [{ rule_id: "proof-first", statement: "结论依赖证据。", direction_hint: "conclusion depends_on evidence" }],
      evidence_requirements: ["测试记录"],
      completion_checks: ["结果可复核"],
      failure_modes: ["只看过程不看结果"],
      source_refs: ["web-test"],
      confidence: 0.8,
      enabled: true,
    };
    const projectMethodResponse = await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/api/settings/planning-methods`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "project", method }) },
    );
    assert.equal(projectMethodResponse.status, 200, await projectMethodResponse.clone().text());
    const personalMethodResponse = await webFetch(
      `${origin}/api/settings/planning-methods`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "personal", method: { ...method, method_id: "domain-web-personal", name: "个人 Web 方法" } }) },
    );
    assert.equal(personalMethodResponse.status, 200, await personalMethodResponse.clone().text());
    const planningMethods = await (await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/api/settings/planning-methods`,
    )).json() as {
      methods: Array<{ method_id: string; scope: string; instructions: string }>;
      composition: { method_pack_ids: string[]; required_coverage: unknown[] };
    };
    assert.equal(planningMethods.methods.find((item) => item.method_id === "domain-web-test")?.scope, "project");
    assert.equal(
      planningMethods.methods.find((item) => item.method_id === "domain-web-test")?.instructions,
      method.instructions,
    );
    assert.equal(planningMethods.methods.find((item) => item.method_id === "domain-web-personal")?.scope, "personal");
    assert.deepEqual(
      planningMethods.composition.method_pack_ids,
      ["work-build-change", "domain-software-development", "domain-web-test"],
    );
    assert.ok(planningMethods.composition.required_coverage.length > 5);

    const diagnosticsPage = await (await webFetch(`${origin}/settings/diagnostics`)).text();
    assert.match(diagnosticsPage, /安装完整/);
    assert.match(diagnosticsPage, /web-test/);
    assert.match(diagnosticsPage, /启动入口/);
    assert.match(diagnosticsPage, /goalboard-mcp/);
    const diagnostics = (await (await webFetch(`${origin}/api/settings/diagnostics`)).json()) as {
      installation_state: string;
      project_count: number;
    };
    assert.equal(diagnostics.installation_state, "ready");
    assert.equal(diagnostics.project_count, 2);

    const codexConfig = join(runtime.userHomeDirectory, ".codex", "config.toml");
    const planResponse = await webFetch(`${origin}/api/settings/runtimes/codex/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "connect" }),
    });
    assert.equal(planResponse.status, 200);
    const plan = (await planResponse.json()) as { plan_id: string; status: string; changes: unknown[]; next_contents?: unknown };
    assert.equal(plan.status, "ready");
    assert.ok(plan.changes.length >= 2);
    assert.equal(plan.next_contents, undefined);
    assert.equal(existsSync(codexConfig), false);

    const incompleteConfirm = await webFetch(`${origin}/api/settings/runtimes/codex/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "confirmed" }),
    });
    assert.equal(incompleteConfirm.status, 400);
    assert.equal(existsSync(codexConfig), false);

    const declined = await webFetch(`${origin}/api/settings/runtimes/codex/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan_id: plan.plan_id, decision: "declined" }),
    });
    assert.equal(declined.status, 200);
    assert.equal(existsSync(codexConfig), false);

    const confirmed = await webFetch(`${origin}/api/settings/runtimes/codex/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan_id: plan.plan_id, decision: "confirmed" }),
    });
    assert.equal(confirmed.status, 200);
    const confirmedResult = (await confirmed.json()) as { status: string };
    assert.equal(confirmedResult.status, "connected");
    assert.match(readFileSync(codexConfig, "utf8"), /GOALBOARD_RUNTIME_ID = "codex"/);
    assert.equal(readlinkSync(join(runtime.userHomeDirectory, ".codex", "skills", "goal-advance")), runtime.skill);

    const beforeCatalog = await GoalBoardProjectCatalog.open({ homeDirectory: fixture.homeDirectory });
    let beforeBindings: ReturnType<GoalBoardProjectCatalog["listRuntimeContextBindingEvents"]>;
    try {
      beforeBindings = beforeCatalog.listRuntimeContextBindingEvents();
    } finally {
      beforeCatalog.close();
    }
    const unconfirmedProject = await webFetch(`${origin}/api/settings/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ display_name: "网页新项目" }),
    });
    assert.equal(unconfirmedProject.status, 400);

    const createdResponse = await webFetch(`${origin}/api/settings/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ display_name: "网页新项目", user_confirmed: true }),
    });
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json()) as {
      project: { project_id: string; display_name: string };
      project_path: string;
    };
    assert.equal(created.project.display_name, "网页新项目");
    const renamedResponse = await webFetch(
      `${origin}/api/settings/projects/${encodeURIComponent(created.project.project_id)}/rename`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ display_name: "网页项目已改名" }),
      },
    );
    assert.equal(renamedResponse.status, 200);
    assert.match(await renamedResponse.text(), /网页项目已改名/);
    assert.equal((await webFetch(`${origin}${created.project_path}`)).status, 200);

    const afterCatalog = await GoalBoardProjectCatalog.open({ homeDirectory: fixture.homeDirectory });
    try {
      assert.equal(afterCatalog.getProject(created.project.project_id).display_name, "网页项目已改名");
      assert.deepEqual(afterCatalog.listRuntimeContextBindingEvents(), beforeBindings);
    } finally {
      afterCatalog.close();
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("Web diagnostics previews and confirms the same managed Web service lifecycle", async () => {
  const fixture = await webProjectCatalogFixture();
  const userHome = join(fixture.homeDirectory, "service-user");
  mkdirSync(join(fixture.homeDirectory, "bin"), { recursive: true });
  mkdirSync(userHome, { recursive: true });
  writeFileSync(join(fixture.homeDirectory, "bin", "goalboard-web"), "#!/bin/sh\nexit 0\n");
  let loaded = false;
  let healthy = true;
  const service = new GoalBoardWebServiceManager({
    homeDirectory: fixture.homeDirectory,
    userHomeDirectory: userHome,
    platform: "darwin",
    uid: 501,
    async portCheck() { return false; },
    async healthCheck() { return healthy; },
    async runCommand(_file, args) {
      if (args[0] === "print") return { code: loaded ? 0 : 113, stdout: loaded ? "state = running\npid = 4242\n" : "", stderr: loaded ? "" : "not found" };
      if (args[0] === "bootstrap") loaded = true;
      if (args[0] === "bootout") loaded = false;
      return { code: 0, stdout: "", stderr: "" };
    },
  });
  const server = createGoalBoardWebServer({ homeDirectory: fixture.homeDirectory, webServiceManager: service });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const page = await (await webFetch(`${origin}/settings/diagnostics`)).text();
    assertInlineScriptsCompile(page);
    assert.match(page, /Web 常驻服务/);
    assert.match(page, /macOS 用户级 LaunchAgent/);
    assert.match(page, /data-web-service-action="install"/);

    const planResponse = await webFetch(`${origin}/api/settings/web-service/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "install" }),
    });
    assert.equal(planResponse.status, 200);
    const plan = (await planResponse.json()) as { plan_id: string; status: string; changes: unknown[] };
    assert.equal(plan.status, "ready");
    assert.equal(plan.changes.length, 2);
    assert.equal(existsSync(service.plistPath), false);

    const confirmed = await webFetch(`${origin}/api/settings/web-service/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan_id: plan.plan_id, decision: "confirmed" }),
    });
    assert.equal(confirmed.status, 200);
    const result = (await confirmed.json()) as { status: string; detection: { state: string } };
    assert.equal(result.status, "installed");
    assert.equal(result.detection.state, "running");
    assert.equal(existsSync(service.plistPath), true);

    const status = (await (await webFetch(`${origin}/api/settings/web-service`)).json()) as { state: string };
    assert.equal(status.state, "running");

    const outdatedPlist = `${readFileSync(service.plistPath, "utf8")}\n<!-- stale GoalBoard configuration -->\n`;
    writeFileSync(service.plistPath, outdatedPlist);
    const outdatedReceipt = JSON.parse(readFileSync(service.receiptPath, "utf8")) as Record<string, unknown>;
    outdatedReceipt.plist_hash = createHash("sha256").update(outdatedPlist).digest("hex");
    writeFileSync(service.receiptPath, `${JSON.stringify(outdatedReceipt, null, 2)}\n`);
    const needsRepairPage = await (await webFetch(`${origin}/settings/diagnostics`)).text();
    assert.match(needsRepairPage, /需要修复/);
    assert.match(needsRepairPage, /data-web-service-action="install">修复常驻服务/);
    assert.doesNotMatch(needsRepairPage, /data-web-service-action="restart"/);
    const repair = await service.prepare("install");
    await service.confirm({ plan_id: repair.plan_id, decision: "confirmed" });

    healthy = false;
    const unhealthyStatus = (await (await webFetch(`${origin}/api/settings/web-service`)).json()) as { state: string };
    assert.equal(unhealthyStatus.state, "unhealthy");
    const unhealthyPage = await (await webFetch(`${origin}/settings/diagnostics`)).text();
    assert.match(unhealthyPage, /进程运行中，页面不可用/);
    assert.match(unhealthyPage, /data-web-service-action="restart"/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("Web clearly separates regenerable demo data from user projects and shares one lifecycle", async () => {
  const fixture = await webProjectCatalogFixture();
  const server = createGoalBoardWebServer({ homeDirectory: fixture.homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const initialPage = await (await webFetch(`${origin}/settings/projects`)).text();
    assertInlineScriptsCompile(initialPage);
    assert.match(initialPage, /data-demo-action="create"/);
    assert.match(initialPage, /用户数据/);

    const unconfirmed = await webFetch(`${origin}/api/settings/demo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "create" }),
    });
    assert.equal(unconfirmed.status, 400);

    const createdResponse = await webFetch(`${origin}/api/settings/demo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "create", user_confirmed: true }),
    });
    assert.equal(createdResponse.status, 200);
    const created = (await createdResponse.json()) as { project: { project_id: string; data_class: string } };
    assert.equal(created.project.data_class, "regenerable_demo");
    assert.equal((await webFetch(`${origin}/projects/${created.project.project_id}/`)).status, 200);

    const demoPage = await (await webFetch(`${origin}/settings/projects`)).text();
    assert.match(demoPage, /演示数据 · 可随时重建/);
    assert.match(demoPage, /data-demo-action="reset"/);
    assert.match(demoPage, /data-demo-action="remove"/);
    const reset = await webFetch(`${origin}/api/settings/demo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "reset", user_confirmed: true }),
    });
    assert.equal(reset.status, 200);
    const removed = await webFetch(`${origin}/api/settings/demo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "remove", user_confirmed: true }),
    });
    assert.equal(removed.status, 200);

    const catalog = await GoalBoardProjectCatalog.open({ homeDirectory: fixture.homeDirectory });
    try {
      assert.equal(catalog.listProjects().length, 2);
      assert.ok(catalog.listProjects().every((project) => project.data_class === "user"));
    } finally {
      catalog.close();
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("global settings leaves Session and workspace management to project directories", async () => {
  const fixture = await webProjectCatalogFixture();
  const workspacePath = join(fixture.homeDirectory, "..", "ordinary-workspace");
  mkdirSync(workspacePath, { recursive: true });
  const workspaceCatalog = await GoalBoardProjectCatalog.open({ homeDirectory: fixture.homeDirectory });
  try {
    const context = {
      runtime_id: "codex",
      stable_work_context_id: null,
      host_declares_stable: false,
      workspace: { canonical_path: workspacePath, realpath_verified: false },
    };
    workspaceCatalog.bindRuntimeContext({
      context,
      project_id: fixture.alpha.project_id,
      actor_id: "runtime-codex",
      user_confirmed: true,
    });
    workspaceCatalog.bindRuntimeContext({
      context,
      project_id: fixture.beta.project_id,
      actor_id: "runtime-codex",
      user_confirmed: true,
    });
  } finally {
    workspaceCatalog.close();
  }
  const server = createGoalBoardWebServer({ homeDirectory: fixture.homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;

    const projectPage = await (await webFetch(`${origin}/settings/projects`)).text();
    assertInlineScriptsCompile(projectPage);
    assert.doesNotMatch(projectPage.slice(projectPage.indexOf('<div class="settings-content">'), projectPage.indexOf("</main>")), /data-workspace-default|data-connection-rebind|data-connection-unbind/);

    const page = await (await webFetch(`${origin}/settings/runtimes`)).text();
    assertInlineScriptsCompile(page);
    assert.doesNotMatch(page, /已关联的 AI 会话|工作目录关联|ordinary-workspace|data-workspace-default|data-connection-rebind|data-connection-unbind/);
    assert.match(page, /Session 与运行位置请进入对应项目的 Sessions 管理/);
    assert.doesNotMatch(page, /web-project-alpha-session|web-project-beta-session/);

    for (const path of [
      "/api/settings/connections",
      "/api/settings/workspaces",
      "/api/settings/connections/legacy-binding/rebind",
      "/api/settings/connections/legacy-binding/unbind",
      "/api/settings/workspaces/legacy-workspace/default",
      "/api/settings/workspaces/legacy-workspace/projects/legacy-project/unlink",
    ]) {
      const response = await webFetch(`${origin}${path}`, path.includes("/rebind") || path.includes("/unbind") || path.includes("/default") || path.includes("/unlink")
        ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user_confirmed: true }) }
        : undefined);
      assert.ok(response.status >= 400 && response.status < 500, `${path}: ${response.status}`);
    }

    const alphaProject = await webFetch(`${origin}/projects/${encodeURIComponent(fixture.alpha.project_id)}/`);
    assert.equal(alphaProject.status, 200);
    assert.match(await alphaProject.text(), /data-directory-open="sessions"/);
    const betaProject = await webFetch(`${origin}/projects/${encodeURIComponent(fixture.beta.project_id)}/`);
    assert.equal(betaProject.status, 200);
    assert.doesNotMatch(await betaProject.text(), /data-directory-open="workspaces"/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("Web local control gate rejects cross-site, missing-credential, hostile-host, and replayed writes", async () => {
  const fixture = await webProjectCatalogFixture();
  const server = createGoalBoardWebServer({ homeDirectory: fixture.homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const pageResponse = await globalThis.fetch(`${origin}/settings/projects`);
    assert.equal(pageResponse.status, 200);
    const page = await pageResponse.text();
    assert.match(page, new RegExp(`<meta name="goalboard-control-token" content="${WEB_TEST_CONTROL_TOKEN}">`));
    const apiText = await (await globalThis.fetch(`${origin}/api/settings/projects`)).text();
    assert.doesNotMatch(apiText, new RegExp(WEB_TEST_CONTROL_TOKEN));

    const hostileHost = await rawHttpGet(address.port, "/settings/projects", `attacker.example:${address.port}`);
    assert.equal(hostileHost.status, 403);
    assert.doesNotMatch(hostileHost.body, /attacker\.example/);

    const missingToken = await globalThis.fetch(`${origin}/api/settings/projects`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        "x-goalboard-idempotency-key": "security-missing-token",
      },
      body: JSON.stringify({ display_name: "不应创建", user_confirmed: true }),
    });
    assert.equal(missingToken.status, 403);

    const crossSite = await globalThis.fetch(`${origin}/api/settings/projects`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.example",
        "x-goalboard-control-token": WEB_TEST_CONTROL_TOKEN,
        "x-goalboard-idempotency-key": "security-cross-site",
      },
      body: JSON.stringify({ display_name: "不应创建", user_confirmed: true }),
    });
    assert.equal(crossSite.status, 403);
    assert.doesNotMatch(await crossSite.text(), /attacker\.example|goalboard-web-test-control-token/);

    const missingRequestKey = await globalThis.fetch(`${origin}/api/settings/projects`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        "x-goalboard-control-token": WEB_TEST_CONTROL_TOKEN,
      },
      body: JSON.stringify({ display_name: "不应创建", user_confirmed: true }),
    });
    assert.equal(missingRequestKey.status, 400);

    const retryKey = "security-failed-request-retry";
    const invalid = await globalThis.fetch(`${origin}/api/settings/projects`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        "x-goalboard-control-token": WEB_TEST_CONTROL_TOKEN,
        "x-goalboard-idempotency-key": retryKey,
      },
      body: JSON.stringify({ display_name: "安全创建" }),
    });
    assert.equal(invalid.status, 400);

    const confirmedRequest = {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        "x-goalboard-control-token": WEB_TEST_CONTROL_TOKEN,
        "x-goalboard-idempotency-key": retryKey,
      },
      body: JSON.stringify({ display_name: "安全创建", user_confirmed: true }),
    } satisfies RequestInit;
    const confirmed = await globalThis.fetch(`${origin}/api/settings/projects`, confirmedRequest);
    assert.equal(confirmed.status, 201);
    const replayed = await globalThis.fetch(`${origin}/api/settings/projects`, confirmedRequest);
    assert.equal(replayed.status, 409);
    assert.match(await replayed.text(), /不会重复执行/);

    const catalog = await GoalBoardProjectCatalog.open({ homeDirectory: fixture.homeDirectory });
    try {
      assert.equal(catalog.listProjects().filter((project) => project.display_name === "安全创建").length, 1);
    } finally {
      catalog.close();
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("Web first-run onboarding can be skipped without creating a project or Runtime binding", async () => {
  const homeDirectory = mkdtempSync(join(tmpdir(), "goalboard-web-project-empty-"));
  const server = createGoalBoardWebServer({ homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const root = await webFetch(`${origin}/`, { redirect: "manual" });
    assert.equal(root.status, 302);
    assert.equal(root.headers.get("location"), "/onboarding");

    const onboarding = await (await webFetch(`${origin}/onboarding`)).text();
    assertInlineScriptsCompile(onboarding);
    assert.match(onboarding, /你好，我们今天做点什么/);
    assert.match(onboarding, /先不开 TUI/);
    assert.match(onboarding, /只填入提示，不自动发送/);

    const dismissed = await webFetch(`${origin}/api/onboarding/dismiss`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "first_run", user_confirmed: true }),
    });
    assert.equal(dismissed.status, 200);

    const projectIndex = await webFetch(`${origin}/`, { redirect: "manual" });
    assert.equal(projectIndex.status, 200);
    const page = await projectIndex.text();
    assert.match(page, /从一个真实项目开始/);
    assert.match(page, /开始建立第一个项目/);
    assert.match(page, /直接进入项目设置/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }

  const catalog = await GoalBoardProjectCatalog.open({ homeDirectory });
  try {
    assert.deepEqual(catalog.listProjects(), []);
    assert.deepEqual(catalog.listRuntimeContextBindingEvents(), []);
  } finally {
    catalog.close();
  }
});

test("Web onboarding creates one real Project, root Draft Goal, and optional Workspace", async () => {
  const homeDirectory = mkdtempSync(join(tmpdir(), "goalboard-web-onboarding-create-"));
  const workspaceDirectory = join(homeDirectory, "workspace");
  mkdirSync(workspaceDirectory);
  const server = createGoalBoardWebServer({ homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  let projectId = "";
  let goalId = "";
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;

    const invalid = await webFetch(`${origin}/api/onboarding/initialize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_name: "1234",
        outcome: "----",
        workspace_path: null,
        runtime_kind: null,
        user_confirmed: true,
      }),
    });
    assert.equal(invalid.status, 400);

    const initialized = await webFetch(`${origin}/api/onboarding/initialize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_name: "真实首次项目",
        outcome: "让第一次使用 GoalBoard 的人建立可以继续澄清的目标",
        workspace_path: workspaceDirectory,
        runtime_kind: null,
        user_confirmed: true,
      }),
    });
    assert.equal(initialized.status, 201);
    const payload = await initialized.json() as {
      project: { project_id: string };
      goal_id: string;
      goal_path: string;
      workspace: { canonical_path: string } | null;
      runtime_autofill: boolean;
    };
    projectId = payload.project.project_id;
    goalId = payload.goal_id;
    assert.match(payload.goal_path, new RegExp(`^/projects/${projectId}/goals/`));
    assert.equal(payload.workspace?.canonical_path, realpathSync(workspaceDirectory));
    assert.equal(payload.runtime_autofill, false);

    const status = await (await webFetch(`${origin}/api/onboarding/status`)).json() as {
      state: { first_run: string; completed_project_id: string };
      first_run_required: boolean;
    };
    assert.equal(status.state.first_run, "completed");
    assert.equal(status.state.completed_project_id, projectId);
    assert.equal(status.first_run_required, false);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }

  const catalog = await GoalBoardProjectCatalog.open({ homeDirectory });
  try {
    const projects = catalog.listProjects();
    assert.equal(projects.length, 1);
    assert.equal(projects[0]?.project_id, projectId);
    assert.equal(projects[0]?.display_name, "真实首次项目");
    assert.deepEqual(catalog.listWorkspaceDirectory(projectId).map((item) => item.canonical_path), [realpathSync(workspaceDirectory)]);
    const project = catalog.getProject(projectId);
    const store = new SqliteGoalBoardStore(project.database_path);
    try {
      const goals = store.snapshot(project.board_id).goals;
      assert.equal(goals.length, 1);
      assert.equal(goals[0]?.goal_id, goalId);
      assert.equal(goals[0]?.definition_state, "draft");
      assert.equal(goals[0]?.decomposition_state, "abstract");
      assert.equal(goals[0]?.outcome, "让第一次使用 GoalBoard 的人建立可以继续澄清的目标");
    } finally {
      store.close();
    }
  } finally {
    catalog.close();
  }
});

test("Web update onboarding is shown once per installed version", async () => {
  const homeDirectory = mkdtempSync(join(tmpdir(), "goalboard-web-onboarding-update-"));
  mkdirSync(join(homeDirectory, "config"), { recursive: true });
  writeFileSync(join(homeDirectory, "config", "installation.json"), JSON.stringify({
    installer: "goalboard-home-install-v1",
    version: "1.0.0",
    release_path: "releases/1.0.0",
  }));
  const server = createGoalBoardWebServer({ homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const created = await webFetch(`${origin}/api/settings/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ display_name: "已有项目", user_confirmed: true }),
    });
    assert.equal(created.status, 201);

    const firstUpdate = await webFetch(`${origin}/`, { redirect: "manual" });
    assert.equal(firstUpdate.status, 302);
    assert.equal(firstUpdate.headers.get("location"), "/onboarding?mode=update");
    const updatePage = await (await webFetch(`${origin}/onboarding?mode=update`)).text();
    assertInlineScriptsCompile(updatePage);
    assert.match(updatePage, /GoalBoard 已更新 1\.0\.0/);

    const acknowledged = await webFetch(`${origin}/api/onboarding/dismiss`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "update", user_confirmed: true }),
    });
    assert.equal(acknowledged.status, 200);
    assert.equal((await webFetch(`${origin}/`, { redirect: "manual" })).status, 200);

    writeFileSync(join(homeDirectory, "config", "installation.json"), JSON.stringify({
      installer: "goalboard-home-install-v1",
      version: "1.1.0",
      release_path: "releases/1.1.0",
    }));
    const nextUpdate = await webFetch(`${origin}/`, { redirect: "manual" });
    assert.equal(nextUpdate.status, 302);
    assert.equal(nextUpdate.headers.get("location"), "/onboarding?mode=update");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web chrome switches between Chinese and English without translating Goal titles", async () => {
  const fixture = await webProjectCatalogFixture();
  addProjectGoal(fixture.alpha, "GOAL-I18N", "让页面看懂下一步");
  const server = createGoalBoardWebServer({ homeDirectory: fixture.homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const chinese = await (await webFetch(`${origin}/`)).text();
    assert.match(chinese, /lang="zh-CN"/);
    assert.match(chinese, /选择一个项目/);
    assert.doesNotMatch(chinese, /class="locale-switch"|class="theme-picker"/);
    assert.match(chinese, /打开系统设置/);

    const switched = await webFetch(`${origin}/locale?lang=en&next=/`, { redirect: "manual" });
    assert.equal(switched.status, 302);
    assert.match(String(switched.headers.get("set-cookie")), /goalboard_locale=en/);
    assert.equal(switched.headers.get("location"), "/");

    const hostile = await webFetch(`${origin}/locale?lang=en&next=//evil.example`, { redirect: "manual" });
    assert.equal(hostile.headers.get("location"), "/");

    const english = await (await webFetch(`${origin}/`, {
      headers: { cookie: "goalboard_locale=en" },
    })).text();
    assert.match(english, /lang="en"/);
    assert.match(english, /<title>Choose a project · GoalBoard<\/title>/);
    assert.match(english, /<h1 id="project-index-title">Choose a project<\/h1>/);
    assert.match(english, />System settings</);
    assert.doesNotMatch(english, /<h1 id="project-index-title">选择一个项目<\/h1>/);

    const capsuleEnglish = await (await webFetch(`${origin}/desktop/capsule?desktop=1&locale=en`, {
      headers: { cookie: "goalboard_locale=zh" },
    })).text();
    assert.match(capsuleEnglish, /lang="en"/);
    assert.match(capsuleEnglish, /<title>Work capsule · GoalBoard<\/title>/);
    assert.match(capsuleEnglish, />Open GoalBoard</);
    assert.doesNotMatch(capsuleEnglish, /<title>工作胶囊 · GoalBoard<\/title>/);

    const capsuleChinese = await (await webFetch(`${origin}/desktop/capsule?desktop=1&locale=zh`, {
      headers: { cookie: "goalboard_locale=en" },
    })).text();
    assert.match(capsuleChinese, /lang="zh-CN"/);
    assert.match(capsuleChinese, /<title>工作胶囊 · GoalBoard<\/title>/);
    assert.match(capsuleChinese, />打开 GoalBoard</);

    const capsuleApiEnglish = await (await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/api/capsule?locale=en`,
      { headers: { cookie: "goalboard_locale=zh" } },
    )).text();
    assert.match(capsuleApiEnglish, /Continue clarifying/);
    assert.match(capsuleApiEnglish, /"label":"Continue"/);
    assert.doesNotMatch(capsuleApiEnglish, /目标待澄清|待澄清/);

    const capsuleApiChinese = await (await webFetch(
      `${origin}/projects/${fixture.alpha.project_id}/api/capsule?locale=zh`,
      { headers: { cookie: "goalboard_locale=en" } },
    )).text();
    assert.match(capsuleApiChinese, /继续澄清/);
    assert.match(capsuleApiChinese, /"label":"可继续"/);
    assert.doesNotMatch(capsuleApiChinese, /Needs clarification/);

    const accepted = await (await webFetch(`${origin}/`, {
      headers: { "accept-language": "en-US,en;q=0.9" },
    })).text();
    assert.match(accepted, /lang="en"/);
    assert.match(accepted, /Choose a project/);

    const board = await (await webFetch(`${origin}/projects/${fixture.alpha.project_id}/`, {
      headers: { cookie: "goalboard_locale=en" },
    })).text();
    assert.match(board, /lang="en"/);
    assert.match(board, /让页面看懂下一步/);
    assert.match(board, /New Goal/);
    assert.match(board, /aria-label="Filter Goals"/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /L\("筛选目标，已选择 \{count\} 种状态"/);
    assert.match(board, /System settings/);
    assert.doesNotMatch(board, /href="\/locale\?lang=zh/);
    const englishAppearance = await (await webFetch(`${origin}/settings/appearance`, {
      headers: { cookie: "goalboard_locale=en" },
    })).text();
    assert.match(englishAppearance, /Interface &amp; language|Interface & language/);
    assert.match(englishAppearance, /href="\/locale\?lang=zh/);
    assert.match(englishAppearance, /Use GoalBoard in English/);
    assertInlineScriptsCompile(english);
    assertInlineScriptsCompile(board);
    assertInlineScriptsCompile(englishAppearance);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("Web command only starts from the project catalog", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "src/web/server.ts", "--db", "/tmp/legacy-goalboard.db"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /只按项目启动/);
  assert.match(result.stderr, /--db 已不支持/);
});

test("Web command still starts when its entrypoint is reached through a symlink", () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-entrypoint-"));
  const entrypoint = join(directory, "goalboard-web.ts");
  symlinkSync(join(process.cwd(), "src", "web", "server.ts"), entrypoint);
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", entrypoint, "--db", "/tmp/legacy-goalboard.db"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /只按项目启动/);
  assert.match(result.stderr, /--db 已不支持/);
});

test("Web migrates an explicitly confirmed legacy DB into one project without changing Runtime bindings", async () => {
  const homeDirectory = mkdtempSync(join(tmpdir(), "goalboard-web-project-migration-"));
  const legacyDirectory = join(homeDirectory, "legacy-source");
  const legacyDatabasePath = join(legacyDirectory, "goalboard.db");
  mkdirSync(legacyDirectory, { recursive: true });
  seedDemoBoard(legacyDatabasePath);
  const before = boardSnapshot(legacyDatabasePath, DEMO_BOARD_ID);
  const server = createGoalBoardWebServer({ homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;

    const firstRunResponse = await webFetch(`${origin}/`, { redirect: "manual" });
    assert.equal(firstRunResponse.status, 302);
    assert.equal(firstRunResponse.headers.get("location"), "/onboarding");
    const onboarding = await (await webFetch(`${origin}/onboarding`)).text();
    assert.match(onboarding, /迁移已有数据/);
    assert.match(onboarding, /href="\/settings\/projects"/);

    const indexResponse = await webFetch(`${origin}/settings/projects`);
    assert.match(indexResponse.headers.get("content-security-policy") ?? "", /script-src(?: 'self')? 'unsafe-inline'/);
    assert.match(indexResponse.headers.get("content-security-policy") ?? "", /connect-src 'self'/);
    const index = await indexResponse.text();
    assert.match(index, /迁移已有 GoalBoard 数据/);
    assert.match(index, /data-project-migration-form/);
    assert.match(index, /data-open-project-migration/);
    assert.match(index, /不会绑定或切换任何 Runtime Session/);
    assert.doesNotMatch(index, /兼容模式|单数据库工作区|显式 --db/);

    const withoutConfirmation = await webFetch(`${origin}/api/projects/migrate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ legacy_database_path: legacyDatabasePath }),
    });
    assert.equal(withoutConfirmation.status, 400);
    assert.match(await withoutConfirmation.text(), /明确确认/);
    assert.equal(existsSync(legacyDatabasePath), true);

    const unconfirmedCatalog = await GoalBoardProjectCatalog.open({ homeDirectory });
    try {
      assert.deepEqual(unconfirmedCatalog.listProjects(), []);
      assert.deepEqual(unconfirmedCatalog.listRuntimeContextBindingEvents(), []);
    } finally {
      unconfirmedCatalog.close();
    }

    const migratedResponse = await webFetch(`${origin}/api/projects/migrate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        legacy_database_path: legacyDatabasePath,
        display_name: "迁移后的产品",
        user_confirmed: true,
      }),
    });
    assert.equal(migratedResponse.status, 201);
    const migrated = (await migratedResponse.json()) as {
      project: { project_id: string; display_name: string };
      project_path: string;
    };
    assert.equal(migrated.project.display_name, "迁移后的产品");
    assert.equal(migrated.project_path, `/projects/${encodeURIComponent(migrated.project.project_id)}/`);
    assert.equal(existsSync(legacyDatabasePath), false);

    const catalog = await GoalBoardProjectCatalog.open({ homeDirectory });
    try {
      const project = catalog.getProject(migrated.project.project_id);
      assert.equal(project.display_name, "迁移后的产品");
      assert.deepEqual(boardSnapshot(project.database_path, project.board_id), before);
      assert.deepEqual(catalog.listRuntimeContextBindingEvents(), []);
    } finally {
      catalog.close();
    }

    const migratedPage = await (await webFetch(`${origin}${migrated.project_path}`)).text();
    assert.match(migratedPage, /class="navigator-project"[\s\S]*title="迁移后的产品">迁移后的产品<\/strong>/);
    assert.match(migratedPage, /让第一次使用的人顺利完成一轮目标协作/);
    assert.doesNotMatch(migratedPage, new RegExp(legacyDatabasePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web leaves an invalid legacy DB and the project catalog unchanged when migration fails", async () => {
  const homeDirectory = mkdtempSync(join(tmpdir(), "goalboard-web-project-migration-failure-"));
  const invalidDatabasePath = join(homeDirectory, "invalid-goalboard.db");
  writeFileSync(invalidDatabasePath, "not a GoalBoard SQLite database");
  const server = createGoalBoardWebServer({ homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await webFetch(`http://127.0.0.1:${address.port}/api/projects/migrate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        legacy_database_path: invalidDatabasePath,
        user_confirmed: true,
      }),
    });
    assert.equal(response.status, 400);
    assert.match(await response.text(), /GoalBoard DB|数据库|迁移/);
    assert.equal(existsSync(invalidDatabasePath), true);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }

  const catalog = await GoalBoardProjectCatalog.open({ homeDirectory });
  try {
    assert.deepEqual(catalog.listProjects(), []);
    assert.deepEqual(catalog.listRuntimeContextBindingEvents(), []);
  } finally {
    catalog.close();
  }
});

test("Web lets a user set an accepted Goal as the current Goal without starting Runtime work", async () => {
  const { databasePath } = webFixture();
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.createGoal(
    DEMO_BOARD_ID,
    {
      goal_id: "ACTIVE-GOAL-WEB",
      title: "从 Web 设为当前 Goal",
      outcome: "用户可以聚焦一条已接受 Goal",
      why: "当前 Goal 应由用户在 Board 中维护",
      business_logic: "用户选择当前聚焦 Goal，不会代替 Runtime 领取或启动执行。",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [
        {
          criterion_id: "ACTIVE-GOAL-WEB-C1",
          statement: "页面可设为当前 Goal",
          decision_method: "automated_check",
          pass_condition: "Board 保存选择且保持待执行状态",
          required_evidence: ["test"],
        },
      ],
    },
    { actor_id: "test-user", idempotency_key: "create-active-goal-web" },
  );
  coordinator.createGoal(
    DEMO_BOARD_ID,
    {
      goal_id: "ACTIVE-GOAL-DRAFT",
      title: "不能设为当前 Goal 的 Draft",
      outcome: "",
      why: "",
      business_logic: "",
      definition_state: "draft",
      decomposition_state: "abstract",
      acceptance_criteria: [],
    },
    { actor_id: "test-user", idempotency_key: "create-active-goal-draft" },
  );
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId: DEMO_BOARD_ID });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const initialPage = await (await webFetch(`${origin}/goals/ACTIVE-GOAL-WEB`)).text();
    const goalDocument = (page: string, goalId: string): string => {
      const marker = `<article class="goal-document" data-goal-view="${goalId}"`;
      const start = page.indexOf(marker);
      assert.ok(start >= 0, `missing Goal document: ${goalId}`);
      const headerEnd = page.indexOf("</header>", start);
      assert.ok(headerEnd >= 0, `missing Goal header: ${goalId}`);
      return page.slice(start, headerEnd);
    };
    const initialDocument = goalDocument(initialPage, "ACTIVE-GOAL-WEB");
    assert.match(initialDocument, /data-set-active-goal/);
    assert.match(initialDocument, /设为当前 Goal/);

    const activate = await webFetch(`${origin}/api/goals/ACTIVE-GOAL-WEB/active`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "用户把这条已接受 Goal 设为当前聚焦" }),
    });
    assert.equal(activate.status, 200);
    const activated = (await activate.json()) as {
      active_goal_id: string;
      replayed: boolean;
      observed_event_cursor: number;
    };
    assert.equal(activated.active_goal_id, "ACTIVE-GOAL-WEB");
    assert.equal(activated.replayed, false);
    assert.ok(activated.observed_event_cursor > 0);

    const board = (await (await webFetch(`${origin}/api/board`)).json()) as {
      active_goal_id: string;
      snapshot: { board: { active_goal_id: string } };
      events: Array<{ type: string; object_id: string }>;
      goals: Array<{ goal: { goal_id: string }; work_state: string }>;
    };
    assert.equal(board.active_goal_id, "ACTIVE-GOAL-WEB");
    assert.equal(board.snapshot.board.active_goal_id, "ACTIVE-GOAL-WEB");
    assert.equal(board.goals.find((item) => item.goal.goal_id === "ACTIVE-GOAL-WEB")?.work_state, "execution_pending");
    assert.ok(
      board.events.some(
        (event) => event.type === "board.active_goal_changed" && event.object_id === "ACTIVE-GOAL-WEB",
      ),
    );
    const currentPage = await (await webFetch(`${origin}/goals/ACTIVE-GOAL-WEB`)).text();
    const currentDocument = goalDocument(currentPage, "ACTIVE-GOAL-WEB");
    assert.match(currentDocument, /当前 Goal/);
    assert.match(currentDocument, /当前产品聚焦 Goal；不表示 Runtime 正在执行/);
    assert.doesNotMatch(currentDocument, /data-set-active-goal/);

    const draftPage = await (await webFetch(`${origin}/goals/ACTIVE-GOAL-DRAFT`)).text();
    assert.doesNotMatch(goalDocument(draftPage, "ACTIVE-GOAL-DRAFT"), /data-set-active-goal/);
    const draftActivation = await webFetch(`${origin}/api/goals/ACTIVE-GOAL-DRAFT/active`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "不能绕过 accepted 校验" }),
    });
    assert.equal(draftActivation.status, 400);
    assert.match(await draftActivation.text(), /只有已接受的 Goal 可以成为当前产品目标/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web uses the named Goal Tree decision page for atomic whole confirmation", async () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-tree-decision-"));
  const databasePath = join(directory, "goalboard.db");
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.initializeBoard({
    board_id: "web-tree-board",
    title: "Web Tree Decision",
    actor_id: "web-user",
    idempotency_key: "web-tree-init",
  });
  const dialogue = coordinator.startDraftDialogue({
    board_id: "web-tree-board",
    actor_id: "runtime-clarifier",
    goal_id: "web-tree-root",
    rough_idea: "用户可以在当前 Runtime 或 Web 选择确认 Goal Tree 项。",
    idempotency_key: "web-tree-dialogue",
  });
  const proposal = coordinator.submitGoalTreeProposal({
    board_id: "web-tree-board",
    actor_id: "runtime-clarifier",
    discovered_in_run_id: dialogue.run!.run_id,
    root_goal_id: "web-tree-root",
    summary: "新增一条仍需继续澄清的子 Goal。",
    narrative: {
      why_now: "用户已经确认要保留这条新分支，现在需要决定它在 Goal Tree 中的位置。",
      problem: "当前父 Goal 没有表达这条仍需澄清的工作，后续对话会失去稳定归属。",
      main_path: ["先创建待澄清子 Goal", "再把它归入当前父 Goal", "之后由 Runtime 继续澄清"],
      expected_effect: "用户能在一个审批面理解新分支的来源、归属和下一步。",
      non_goals: ["本次不自动接受子 Goal Contract", "本次不开始执行"],
    },
    items: [
      {
        item_id: "web-tree-child",
        kind: "goal",
        operation: "create",
        payload: { goal_id: "web-tree-child", title: "Web 可选确认的 Draft 子 Goal" },
        source_refs: ["conversation://web-tree"],
        reason: "用户希望保留这个分支，之后继续在 Runtime 里澄清。",
        explanation: {
          problem: "新分支还没有稳定 Goal 可承接后续澄清",
          expected_effect: "创建一条仍为 Draft 的子 Goal，后续对话不再丢失归属",
          non_goals: ["不把 Draft 误写成已接受 Goal"],
          depends_on_item_ids: [],
        },
        confidence: 1,
        affected_objects: [{ object_type: "goal", object_id: "web-tree-child" }],
      },
      {
        item_id: "web-tree-child-relation",
        kind: "relation",
        operation: "create",
        payload: {
          from_goal_id: "web-tree-child",
          to_goal_id: "web-tree-root",
          type: "part_of",
          reason: "这条新工作属于当前正在澄清的 Goal。",
        },
        source_refs: ["conversation://web-tree"],
        reason: "把新工作放回当前 Goal 的范围中。",
        explanation: {
          problem: "只创建子 Goal 会留下没有父级归属的孤立节点",
          expected_effect: "用户能看到这条工作属于当前父 Goal，后续进度按同一结果链解释",
          non_goals: ["不建立额外执行依赖"],
          depends_on_item_ids: ["web-tree-child"],
        },
        confidence: 1,
        affected_objects: [
          { object_type: "relation", object_id: "web-tree-child-part-of-root" },
          { object_type: "goal", object_id: "web-tree-child" },
          { object_type: "goal", object_id: "web-tree-root" },
        ],
      },
    ],
    idempotency_key: "web-tree-propose",
  }).proposal;
  const otherDialogue = coordinator.startDraftDialogue({
    board_id: "web-tree-board",
    actor_id: "runtime-other-clarifier",
    goal_id: "web-tree-other-root",
    rough_idea: "另一份同时等待决定的方案不能让当前 Web 页面确认变得含糊。",
    idempotency_key: "web-tree-other-dialogue",
  });
  const otherProposal = coordinator.submitGoalTreeProposal({
    board_id: "web-tree-board",
    actor_id: "runtime-other-clarifier",
    discovered_in_run_id: otherDialogue.run!.run_id,
    root_goal_id: "web-tree-other-root",
    summary: "另一份独立等待决定的方案。",
    items: [{
      item_id: "web-tree-other-child",
      kind: "goal",
      operation: "create",
      payload: { goal_id: "web-tree-other-child", title: "另一份方案里的 Draft" },
      source_refs: ["conversation://web-tree-other"],
      reason: "验证 Web 页面按明确 proposal_id 原子确认，而不是依赖全局唯一提案。",
      confidence: 1,
      affected_objects: [{ object_type: "goal", object_id: "web-tree-other-child" }],
    }],
    idempotency_key: "web-tree-other-propose",
  }).proposal;
  store.close();
  const server = createGoalBoardWebServer({ databasePath, boardId: "web-tree-board" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const decisionPage = await (await webFetch(`${origin}/decisions`)).text();
    const rootPage = await (await webFetch(`${origin}/goals/web-tree-root`)).text();
    assert.match(decisionPage, /data-goal-tree-decision-form/);
    assert.match(decisionPage, /这份 Goal 方案要采用，还是退回修改/);
    assert.match(decisionPage, /data-goal-tree-proposal-id=/);
    assert.match(decisionPage, /采用整份方案/);
    assert.match(decisionPage, /这次变更主要解决什么/);
    assert.match(decisionPage, /当前父 Goal 没有表达这条仍需澄清的工作/);
    assert.match(decisionPage, /先创建待澄清子 Goal/);
    assert.match(decisionPage, /本次不自动接受子 Goal Contract/);
    assert.match(decisionPage, /主要解决[\s\S]*新分支还没有稳定 Goal 可承接后续澄清/);
    assert.match(decisionPage, /会改变什么[\s\S]*创建一条仍为 Draft 的子 Goal/);
    assert.match(decisionPage, /明确不改变[\s\S]*不把 Draft 误写成已接受 Goal/);
    assert.match(decisionPage, /关联变更[\s\S]*新增 Goal「Web 可选确认的 Draft 子 Goal」/);
    assert.match(decisionPage, /name="item_id" value="web-tree-child"/);
    assert.match(decisionPage, /放到当前方案里看/);
    assert.match(decisionPage, /goal-tree-proposal-decision[\s\S]*<section class="decision-scenario"[\s\S]*<details class="decision-details goal-tree-proposal-changes"/);
    assert.match(decisionPage, /如果采用[\s\S]*会新增 Goal「Web 可选确认的 Draft 子 Goal」/);
    assert.match(decisionPage, /它会成为「用户可以在当前 Runtime 或 Web 选择确认 Goal Tree 项。」的子 Goal/);
    assert.match(decisionPage, /随后仍是草稿，需要继续澄清，不能开始/);
    assert.match(decisionPage, /如果退回[\s\S]*当前 Goal Tree 保持不变/);
    assert.match(decisionPage, /<details class="decision-details goal-tree-proposal-changes"><summary><span>查看采用后的 2 项变化/);
    assert.match(decisionPage, /展开查看每项变化/);
    assert.match(decisionPage, /data-goal-tree-decision-form[\s\S]*novalidate/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /goalTreeDecisionForm[\s\S]*请填写决定理由或修改意见/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /decision === "confirm"[\s\S]*confirm_all_pending: true/);
    assert.match(rootPage, /href="\/decisions#decision-goal-web-tree-root"/);
    assert.match(rootPage, /处理待确认事项/);
    assert.match(rootPage, /goal-status--waiting_user[^>]*[\s\S]*?<span>等你<\/span>/);
    assert.match(rootPage, /draft-gaps draft-gaps--decision[\s\S]*方案已经整理好/);
    assert.match(rootPage, /这条 Goal 不是还要继续澄清，而是在等你确认整理后的结果、范围和子 Goal/);
    assert.doesNotMatch(rootPage, /<div class="draft-gaps"><div><strong>这条 Goal 还没说清楚/);
    assert.doesNotMatch(rootPage, /<div class="goal-purpose">/);
    const blankSubjectiveRejection = await webFetch(
      `${origin}/api/goal-tree-proposals/${encodeURIComponent(proposal.proposal_id)}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decisions: [{ item_id: "web-tree-child", decision: "reject", reason: "" }],
          reason: "",
          idempotency_key: "web-tree-blank-reject",
        }),
      },
    );
    assert.equal(blankSubjectiveRejection.status, 400);
    assert.match(await blankSubjectiveRejection.text(), /需要说明理由或修改意见/);
    const decision = await webFetch(
      `${origin}/api/goal-tree-proposals/${encodeURIComponent(proposal.proposal_id)}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirm_all_pending: true,
          reason: "用户在这份方案的 Web 决定页采用整份变更。",
          idempotency_key: "web-tree-decide",
        }),
      },
    );
    assert.equal(decision.status, 200, await decision.text());
    const board = (await (await webFetch(`${origin}/api/board`)).json()) as {
      snapshot: {
        goals: Array<{ goal_id: string; definition_state: string }>;
        relations: Array<{ from_goal_id: string; to_goal_id: string; type: string; state: string }>;
        goal_tree_proposals: Array<{
          proposal_id: string;
          items: Array<{ item_id: string; decision: { authority_source: string; actor_id: string } | null }>;
        }>;
      };
    };
    assert.equal(board.snapshot.goals.find((goal) => goal.goal_id === "web-tree-child")?.definition_state, "draft");
    assert.ok(board.snapshot.relations.some((relation) =>
      relation.from_goal_id === "web-tree-child" &&
      relation.to_goal_id === "web-tree-root" &&
      relation.type === "part_of" &&
      relation.state === "active"));
    const persisted = board.snapshot.goal_tree_proposals.find((item) => item.proposal_id === proposal.proposal_id);
    assert.equal(persisted?.items[0]?.decision?.authority_source, "web");
    assert.equal(persisted?.items[0]?.decision?.actor_id, "web-user");
    const otherPersisted = board.snapshot.goal_tree_proposals.find(
      (item) => item.proposal_id === otherProposal.proposal_id,
    );
    assert.ok(otherPersisted?.items.every((item) => item.decision === null));
    const updatedRootPage = await (await webFetch(`${origin}/goals/web-tree-root`)).text();
    const updatedRootStart = updatedRootPage.indexOf('<article class="goal-document" data-goal-view="web-tree-root"');
    assert.ok(updatedRootStart >= 0);
    const updatedRootHeaderEnd = updatedRootPage.indexOf("</header>", updatedRootStart);
    assert.ok(updatedRootHeaderEnd >= 0);
    const updatedRootDocument = updatedRootPage.slice(updatedRootStart, updatedRootHeaderEnd);
    assert.match(updatedRootDocument, /goal-status--continue[^>]*[\s\S]*?<span>可继续<\/span>/);
    assert.doesNotMatch(updatedRootDocument, /goal-status--waiting_user/);
    const resultPage = await (await webFetch(`${origin}/decisions`)).text();
    assert.match(resultPage, /最近处理结果/);
    assert.match(resultPage, /Goal 方案/);
    assert.match(resultPage, /已采用 2 项变化/);
    assert.match(resultPage, /用户在这份方案的 Web 决定页采用整份变更/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web explains a materialization conflict before the user confirms a whole Goal Tree proposal", async () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-tree-preflight-"));
  const databasePath = join(directory, "goalboard.db");
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.initializeBoard({
    board_id: "web-tree-preflight-board",
    title: "Web Tree Preflight",
    actor_id: "web-user",
    idempotency_key: "web-tree-preflight-init",
  });
  coordinator.createGoal(
    "web-tree-preflight-board",
    {
      goal_id: "web-tree-accepted-parent",
      title: "已经接受的父 Goal",
      outcome: "保留已经确认的业务承诺",
      why: "避免历史执行和验收对应的 Contract 被静默改写",
      business_logic: "需求变化需要 successor，原 Goal 只允许明确的拆分收口。",
      in_scope: ["保留已接受 Contract"],
      out_of_scope: ["不原地重写业务承诺"],
      required_inputs: ["用户已经接受的 Contract"],
      promised_outputs: ["可追溯的原业务承诺"],
      definition_state: "accepted",
      decomposition_state: "abstract",
      acceptance_criteria: [{
        criterion_id: "web-tree-accepted-parent-contract",
        statement: "原业务承诺保持可追溯",
        decision_method: "inspection",
        pass_condition: "已接受 Contract 不被原地改写",
      }],
    },
    { actor_id: "web-user", idempotency_key: "web-tree-accepted-parent-create" },
  );
  coordinator.createGoal(
    "web-tree-preflight-board",
    {
      goal_id: "web-tree-existing-child",
      title: "已经属于父目标的子 Goal",
      outcome: "提供父目标需要的现有结果",
      why: "验证 Contract revision 不会偷偷删除 Goal Tree 关系",
      business_logic: "子 Goal 继续保留自己的 Contract 和历史。",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [{
        criterion_id: "web-tree-existing-child-done",
        statement: "子 Goal 结果可检查",
        decision_method: "inspection",
        pass_condition: "现有 part_of 关系保持可追溯",
      }],
    },
    { actor_id: "web-user", idempotency_key: "web-tree-existing-child-create" },
  );
  coordinator.addRelation(
    "web-tree-preflight-board",
    {
      from_goal_id: "web-tree-existing-child",
      to_goal_id: "web-tree-accepted-parent",
      type: "part_of",
      reason: "这是已经生效的父子结构",
    },
    { actor_id: "web-user", idempotency_key: "web-tree-existing-child-link" },
  );
  const dialogue = coordinator.startDraftDialogue({
    board_id: "web-tree-preflight-board",
    actor_id: "runtime-tree-preflight",
    goal_id: "web-tree-preflight-context",
    rough_idea: "需求变化后尝试改写一个已经接受的父 Goal。",
    idempotency_key: "web-tree-preflight-dialogue",
  });
  const proposal = coordinator.submitGoalTreeProposal({
    board_id: "web-tree-preflight-board",
    actor_id: "runtime-tree-preflight",
    discovered_in_run_id: dialogue.run!.run_id,
    root_goal_id: "web-tree-preflight-context",
    summary: "错误示例：原地改写已接受父 Goal，而不是创建 successor。",
    items: [
      {
        item_id: "web-tree-safe-child",
        kind: "goal",
        operation: "create",
        payload: {
          goal_id: "web-tree-safe-child",
          title: "不能被半途创建的安全子 Goal",
        },
        source_refs: ["conversation://web-tree-preflight"],
        reason: "验证整份确认失败时安全条目也不会单独落地。",
        confidence: 1,
        affected_objects: [{ object_type: "goal", object_id: "web-tree-safe-child" }],
      },
      {
        item_id: "web-tree-invalid-accepted-update",
        kind: "contract",
        operation: "update",
        payload: {
          goal_id: "web-tree-accepted-parent",
          title: "试图覆盖的全新业务承诺",
          outcome: "把新需求写回旧 Goal",
          why: "错误示例",
          business_logic: "错误示例",
          in_scope: ["新需求"],
          out_of_scope: ["不更改现有父子关系"],
          required_inputs: ["新需求"],
          promised_outputs: ["新结果"],
          definition_state: "accepted",
          decomposition_state: "closed_leaf",
          acceptance_criteria: [{
            criterion_id: "web-tree-accepted-parent-contract",
            statement: "新需求已经覆盖旧承诺",
            decision_method: "inspection",
            pass_condition: "错误示例",
            required_evidence: ["inspection"],
          }],
          leaf_readiness: {
            verdict: "ready",
            primary_deliverable: "新结果",
            output_coverage: [{
              promised_output: "新结果",
              role: "primary",
              reason: "这是错误修订声称的唯一交付结果。",
            }],
            split_candidates: [],
            rationale: "让用例继续进入结构冲突预检，而不是被叶子完整性校验提前拦截。",
            unresolved_decisions: [],
            independent_deliverables: [],
            acceptance_criterion_ids: ["web-tree-accepted-parent-contract"],
          },
        },
        source_refs: ["conversation://web-tree-preflight"],
        reason: "验证用户确认前能看到不可应用原因。",
        confidence: 1,
        affected_objects: [{ object_type: "goal", object_id: "web-tree-accepted-parent" }],
      },
    ],
    idempotency_key: "web-tree-preflight-propose",
  }).proposal;
  const checked = coordinator.checkGoalTreeProposal({
    board_id: "web-tree-preflight-board",
    proposal_id: proposal.proposal_id,
    actor_id: "runtime-tree-preflight",
    idempotency_key: "web-tree-preflight-check",
  });
  assert.deepEqual(checked.conflict_item_ids, ["web-tree-invalid-accepted-update"]);
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId: "web-tree-preflight-board" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const page = await (await webFetch(`${origin}/decisions`)).text();
    assert.match(page, /这份方案暂时不能采用/);
    assert.match(page, /当前有内容不满足 GoalBoard 的写入规则，修正前不会写入 Goal Tree/);
    assert.doesNotMatch(page, /其中有风险信息或 Goal 拆解需要 Runtime 修正/);
    assert.match(page, /这个 Goal 仍有生效的子 Goal，不能把新版本改成叶子 Goal/);
    assert.match(page, /保留 compound 结构，或在同一份 Proposal 中显式调整 part_of 关系后再确认/);
    assert.match(page, /value="confirm" disabled aria-disabled="true"/);
    assert.match(page, /value="reject">退回修正/);
    const directWholeConfirmation = await webFetch(
      `${origin}/api/goal-tree-proposals/${encodeURIComponent(proposal.proposal_id)}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirm_all_pending: true,
          reason: "即使直接调用 Web 接口，也必须保证整份方案原子落地。",
          idempotency_key: "web-tree-preflight-atomic-decision",
        }),
      },
    );
    assert.equal(directWholeConfirmation.status, 400);
    const directError = await directWholeConfirmation.text();
    assert.match(directError, /本次整份确认没有写入任何变更/);
    assert.match(directError, /不能把新版本改成叶子 Goal/);
    const board = (await (await webFetch(`${origin}/api/board`)).json()) as {
      snapshot: {
        goals: Array<{ goal_id: string }>;
        goal_tree_proposals: Array<{
          proposal_id: string;
          state: string;
          items: Array<{ state: string; decision: unknown }>;
        }>;
      };
    };
    assert.equal(board.snapshot.goals.some((goal) => goal.goal_id === "web-tree-safe-child"), false);
    const stored = board.snapshot.goal_tree_proposals.find((item) => item.proposal_id === proposal.proposal_id);
    assert.equal(stored?.state, "pending");
    assert.equal(stored?.items.some((item) => item.decision != null), false);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web shows and confirms one existing Candidate promotion without a duplicate decision", async () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-candidate-promotion-"));
  const databasePath = join(directory, "goalboard.db");
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.initializeBoard({
    board_id: "web-candidate-board",
    title: "Web Candidate Promotion",
    actor_id: "web-user",
    idempotency_key: "web-candidate-init",
  });
  const dialogue = coordinator.startDraftDialogue({
    board_id: "web-candidate-board",
    actor_id: "runtime-candidate-planner",
    goal_id: "web-candidate-root",
    rough_idea: "把已有 Candidate 修订后纳入当前 Goal Tree。",
    idempotency_key: "web-candidate-dialogue",
  });
  const output = "已有 Candidate 成为唯一正式 Goal";
  const finalGoal = {
    goal_id: "web-candidate-child",
    title: "在 Web 核对并晋升已有 Candidate",
    outcome: output,
    why: "避免用户分别处理 Candidate、Goal 和关系",
    business_logic: "用户在一份统一提案中确认最终 Contract 和父子关系，系统原子完成晋升。",
    in_scope: [output],
    out_of_scope: ["不自动开始执行"],
    constraints: ["保留 Candidate 历史"],
    required_inputs: ["pending Candidate"],
    promised_outputs: [output],
    definition_state: "accepted" as const,
    decomposition_state: "closed_leaf" as const,
    acceptance_criteria: [{
      criterion_id: "web-candidate-child-c1",
      statement: "晋升后没有重复待决定项",
      decision_method: "inspection" as const,
      pass_condition: "Candidate approved 且正式 Goal 只有一条",
    }],
    leaf_readiness: {
      verdict: "ready",
      primary_deliverable: output,
      output_coverage: [{ promised_output: output, role: "primary", reason: "这是唯一独立结果。" }],
      split_candidates: [],
      rationale: "只有一条晋升结果。",
      unresolved_decisions: [],
      independent_deliverables: [],
      acceptance_criterion_ids: ["web-candidate-child-c1"],
    },
  };
  const candidate = coordinator.submitCandidate({
    board_id: "web-candidate-board",
    actor_id: "runtime-candidate-planner",
    discovered_in_run_id: dialogue.run!.run_id,
    proposed_goal: { ...finalGoal, title: "晋升前的 Candidate 标题" },
    idempotency_key: "web-candidate-submit",
  }).candidate;
  const proposal = coordinator.submitGoalTreeProposal({
    board_id: "web-candidate-board",
    actor_id: "runtime-candidate-planner",
    discovered_in_run_id: dialogue.run!.run_id,
    root_goal_id: "web-candidate-root",
    summary: "采用修订后的 Candidate Contract 和父子关系。",
    items: [{
      item_id: "web-candidate-promote",
      kind: "candidate",
      operation: "update",
      payload: {
        candidate_id: candidate.candidate_id,
        proposed_goal: finalGoal,
        proposed_relations: [{
          from_goal_id: "$new_goal",
          to_goal_id: "web-candidate-root",
          type: "part_of",
          reason: "晋升后的 Goal 属于当前根 Goal。",
        }],
      },
      source_refs: ["conversation://web-candidate-promotion"],
      reason: "让用户一次核对最终 Goal 与位置。",
      confidence: 1,
      affected_objects: [
        { object_type: "candidate", object_id: candidate.candidate_id },
        { object_type: "goal", object_id: "web-candidate-child" },
      ],
    }],
    idempotency_key: "web-candidate-proposal",
  }).proposal;
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId: "web-candidate-board" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const decisionPage = await (await webFetch(`${origin}/decisions`)).text();
    assert.match(decisionPage, /晋升已有 Candidate 为 Goal「在 Web 核对并晋升已有 Candidate」/);
    assert.match(decisionPage, new RegExp(`原 Candidate：${candidate.candidate_id}`));
    assert.match(decisionPage, /在 Web 核对并晋升已有 Candidate → 属于 → 把已有 Candidate 修订后纳入当前 Goal Tree/);
    assert.match(decisionPage, /会把已有 Candidate 晋升为 Goal「在 Web 核对并晋升已有 Candidate」，并关闭原 Candidate 的待决定状态/);

    const decision = await webFetch(
      `${origin}/api/goal-tree-proposals/${encodeURIComponent(proposal.proposal_id)}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decisions: [{
            item_id: "web-candidate-promote",
            decision: "confirm",
            reason: "用户在 Web 确认晋升这条 Candidate。",
          }],
          idempotency_key: "web-candidate-decide",
        }),
      },
    );
    assert.equal(decision.status, 200, await decision.text());
    const board = (await (await webFetch(`${origin}/api/board`)).json()) as {
      snapshot: {
        candidates: Array<{ candidate_id: string; state: string }>;
        goals: Array<{ goal_id: string }>;
        relations: Array<{ from_goal_id: string; to_goal_id: string; type: string; state: string }>;
      };
    };
    assert.equal(
      board.snapshot.candidates.find((entry) => entry.candidate_id === candidate.candidate_id)?.state,
      "approved",
    );
    assert.equal(board.snapshot.goals.filter((goal) => goal.goal_id === "web-candidate-child").length, 1);
    assert.equal(board.snapshot.candidates.filter((entry) => entry.state === "pending").length, 0);
    assert.ok(board.snapshot.relations.some((relation) =>
      relation.from_goal_id === "web-candidate-child" &&
      relation.to_goal_id === "web-candidate-root" &&
      relation.type === "part_of" &&
      relation.state === "active"));
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web lets the user repair a historical Goal Tree Risk without rewriting the proposal", async () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-invalid-tree-risk-"));
  const databasePath = join(directory, "goalboard.db");
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.initializeBoard({
    board_id: "web-invalid-risk-board",
    title: "Invalid Risk Proposal",
    actor_id: "web-user",
    idempotency_key: "web-invalid-risk-init",
  });
  const dialogue = coordinator.startDraftDialogue({
    board_id: "web-invalid-risk-board",
    actor_id: "runtime-clarifier",
    goal_id: "web-invalid-risk-root",
    rough_idea: "为发布方案补充一条需要确认的风险。",
    idempotency_key: "web-invalid-risk-dialogue",
  });
  const invalidRiskCases = [
    ["复杂动画可能让低配设备掉帧", "低配设备帧率低于 30", "先接受，后续观察掉帧情况再决定怎么优化"],
    ["自动生成内容可能偏离设计边界", "生成结果连续两次不符合规则", "先限制生成范围，再由用户抽查结果"],
    ["本地存档可能与新版本不兼容", "升级后无法读取旧存档", "发布前验证两个历史版本的迁移"],
    ["多 Runtime 同步可能覆盖用户修改", "同一字段出现不同版本", "逐条确认冲突后再写入"],
  ] as const;
  const proposal = coordinator.submitGoalTreeProposal({
    board_id: "web-invalid-risk-board",
    actor_id: "runtime-clarifier",
    discovered_in_run_id: dialogue.run!.run_id,
    root_goal_id: "web-invalid-risk-root",
    summary: "补充发布后的性能风险。",
    narrative: {
      why_now: "发布方案已进入用户确认前，需要先决定四类风险如何处理。",
      problem: "当前方案只列目标，没有把风险选择与完整产品目标放在同一个审批上下文中。",
      main_path: ["确认完整产品目标", "逐条决定性能、生成、兼容和同步风险", "再决定是否采用整份方案"],
      expected_effect: "用户能看清每条风险解决的问题与处理边界，不会把风险字段误当成已完成措施。",
      non_goals: ["不在本次确认中执行风险措施"],
    },
    items: [
      {
        item_id: "web-invalid-risk-child",
        kind: "goal",
        operation: "create",
        payload: { goal: { goal_id: "web-invalid-risk-child", title: "第一个子 Goal", outcome: "这是子目标，不是整份方案的标题" } },
        source_refs: ["conversation://web-invalid-risk"],
        reason: "验证页面不会把第一个子 Goal 当成整份方案。",
        explanation: {
          problem: "首个子 Goal 容易被误当作整份方案标题",
          expected_effect: "页面仍以根 Goal 表达整份审批对象",
          non_goals: ["不改变子 Goal Contract"],
          depends_on_item_ids: [],
        },
        confidence: 0.9,
        affected_objects: [{ object_type: "goal", object_id: "web-invalid-risk-child" }],
      },
      {
        item_id: "web-invalid-risk-root-contract",
        kind: "contract",
        operation: "update",
        payload: { goal: { goal_id: "web-invalid-risk-root", title: "完整产品目标", outcome: "这是整份方案真正要确认的目标" } },
        source_refs: ["conversation://web-invalid-risk"],
        reason: "补全根 Goal 的目标说明。",
        explanation: {
          problem: "根 Goal 缺少整份方案的可读结果说明",
          expected_effect: "用户先理解完整产品目标，再处理风险",
          non_goals: ["不自动接受风险处理"],
          depends_on_item_ids: [],
        },
        confidence: 0.9,
        affected_objects: [{ object_type: "goal", object_id: "web-invalid-risk-root" }],
      },
      ...invalidRiskCases.map(([description, trigger], index) => ({
        item_id: `web-invalid-risk-item-${index + 1}`,
        kind: "risk" as const,
        operation: "create" as const,
        payload: {
          risk_id: `web-invalid-risk-${index + 1}`,
          goal_ids: ["web-invalid-risk-root"],
          description,
          probability: "medium",
          impact: "high",
          trigger,
          treatment: "mitigate",
          blocking_mode: "none",
          revisit_condition: "首轮验证后复查",
          owner: "runtime-clarifier",
        },
        source_refs: ["conversation://web-invalid-risk"],
        reason: "需要在采用方案前明确如何处理这条风险。",
        explanation: {
          problem: description,
          expected_effect: "用户在采用前明确这条风险的处理选择与触发边界",
          non_goals: ["不把处理计划当成已经执行"],
          depends_on_item_ids: ["web-invalid-risk-root-contract"],
        },
        confidence: 0.9,
        affected_objects: [{ object_type: "risk" as const, object_id: `web-invalid-risk-${index + 1}` }],
      })),
    ],
    idempotency_key: "web-invalid-risk-propose",
  }).proposal;
  for (const [, , treatmentPlan] of invalidRiskCases) {
    const index = invalidRiskCases.findIndex((item) => item[2] === treatmentPlan) + 1;
    const itemId = `web-invalid-risk-item-${index}`;
    const storedPayload = JSON.parse((store.db.prepare(
      "SELECT payload_json FROM goal_tree_proposal_items WHERE item_id = ?",
    ).get(itemId) as { payload_json: string }).payload_json) as Record<string, unknown>;
    store.db.prepare("UPDATE goal_tree_proposal_items SET payload_json = ? WHERE item_id = ?").run(
      JSON.stringify({ ...storedPayload, treatment: treatmentPlan }),
      itemId,
    );
  }
  const storedRootPayload = JSON.parse((store.db.prepare(
    "SELECT payload_json FROM goal_tree_proposal_items WHERE item_id = ?",
  ).get("web-invalid-risk-root-contract") as { payload_json: string }).payload_json) as { goal: Record<string, unknown> };
  store.db.prepare("UPDATE goal_tree_proposal_items SET payload_json = ? WHERE item_id = ?").run(
    JSON.stringify({ ...storedRootPayload, goal: { ...storedRootPayload.goal, decomposition_state: "closed_compound" } }),
    "web-invalid-risk-root-contract",
  );
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId: "web-invalid-risk-board" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const decisionPage = await (await webFetch(`${origin}/decisions`)).text();
    assert.match(decisionPage, /这份方案暂时不能采用/);
    assert.match(decisionPage, /准备确认的 Goal[\s\S]*完整产品目标[\s\S]*这是整份方案真正要确认的目标/);
    assert.match(decisionPage, /这份方案有 4 条风险需要你选择，另有 1 项需要补全/);
    assert.match(decisionPage, /你需要决定：这条风险怎么处理/);
    assert.match(decisionPage, /value="mitigate"[\s\S]*降低风险/);
    assert.match(decisionPage, /value="avoid"[\s\S]*避开风险/);
    assert.match(decisionPage, /value="defer"[\s\S]*延后处理/);
    assert.match(decisionPage, /value="accept"[\s\S]*接受风险/);
    assert.match(decisionPage, /data-risk-treatment-plan[\s\S]*先接受，后续观察掉帧情况再决定怎么优化/);
    assert.match(decisionPage, /补充说明[\s\S]*可选/);
    assert.match(decisionPage, /保存 4 条风险处理/);
    assert.match(decisionPage, /采用整份方案（当前不可用）/);
    assert.match(decisionPage, /复杂动画可能让低配设备掉帧/);
    assert.match(decisionPage, /“处理方式”必须选择“接受风险、降低风险、避开风险、延后处理”之一/);
    assert.match(decisionPage, /goal-tree-proposal-changes" open/);
    assert.match(decisionPage, /goal-tree-proposal-item is-invalid/);
    assert.match(decisionPage, /退回修正/);
    assert.match(decisionPage, /value="confirm" disabled aria-disabled="true">还需补全其余问题/);

    const decision = await webFetch(
      `${origin}/api/goal-tree-proposals/${encodeURIComponent(proposal.proposal_id)}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decisions: [
            {
              item_id: "web-invalid-risk-item-1",
              decision: "confirm",
              reason: "直接请求也不能绕过页面校验。",
            },
          ],
          idempotency_key: "web-invalid-risk-confirm",
        }),
      },
    );
    assert.equal(decision.status, 400);
    const error = await decision.text();
    assert.match(error, /复杂动画可能让低配设备掉帧/);
    assert.match(error, /处理方式/);
    assert.match(error, /当前 Goal Tree 没有改变/);

    const repair = await webFetch(
      `${origin}/api/goal-tree-proposals/${encodeURIComponent(proposal.proposal_id)}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          risk_repairs: invalidRiskCases.map(([, , treatmentPlan], index) => ({
            item_id: `web-invalid-risk-item-${index + 1}`,
            treatment: (["mitigate", "avoid", "defer", "accept"] as const)[index],
            treatment_plan: treatmentPlan,
          })),
          idempotency_key: "web-invalid-risk-repair",
        }),
      },
    );
    assert.equal(repair.status, 200, await repair.text());

    const board = (await (await webFetch(`${origin}/api/board`)).json()) as {
      snapshot: {
        risks: Array<{ risk_id: string }>;
        goal_tree_proposals: Array<{
          proposal_id: string;
          version: number;
          state: string;
          items: Array<{
            item_id: string;
            kind: string;
            state: string;
            payload: Record<string, unknown>;
            decision: unknown;
          }>;
        }>;
      };
    };
    assert.equal(board.snapshot.risks.some((risk) => risk.risk_id.startsWith("web-invalid-risk-")), false);
    const superseded = board.snapshot.goal_tree_proposals.find((item) => item.proposal_id === proposal.proposal_id);
    assert.equal(superseded?.items.every((item) => item.state === "superseded"), true);
    const revision = board.snapshot.goal_tree_proposals.find((item) => item.version === 2);
    assert.equal(revision?.items.length, 6);
    assert.equal(revision?.items.every((item) => item.state === "pending"), true);
    const revisedRisk = revision?.items.find((item) => item.kind === "risk");
    assert.equal(revisedRisk?.payload.treatment, "mitigate");
    assert.equal(revisedRisk?.payload.treatment_plan, "先接受，后续观察掉帧情况再决定怎么优化");

    const revisedPage = await (await webFetch(`${origin}/decisions`)).text();
    assert.doesNotMatch(revisedPage, /风险需要你选择/);
    assert.match(revisedPage, /这份方案有 1 个 Goal 的拆解还不完整/);
    assert.match(revisedPage, /value="confirm" disabled aria-disabled="true">先补全 Goal 拆解/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web explains incomplete product decomposition and shows who owns each product path", async () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-incomplete-decomposition-"));
  const databasePath = join(directory, "goalboard.db");
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.initializeBoard({
    board_id: "web-decomposition-board",
    title: "Product Decomposition",
    actor_id: "web-user",
    idempotency_key: "web-decomposition-init",
  });
  const dialogue = coordinator.startDraftDialogue({
    board_id: "web-decomposition-board",
    actor_id: "runtime-game-planner",
    goal_id: "web-footballnia",
    rough_idea: "做一款内容、玩法和交互都完整的足球游戏。",
    idempotency_key: "web-footballnia-dialogue",
  });
  const productAreas = [
    "core_gameplay",
    "game_systems_content",
    "player_journey",
    "interaction_ui",
    "audiovisual",
    "technology_data",
    "quality",
    "delivery_release",
  ];
  const decompositionProposal = coordinator.submitGoalTreeProposal({
    board_id: "web-decomposition-board",
    actor_id: "runtime-game-planner",
    discovered_in_run_id: dialogue.run!.run_id,
    root_goal_id: "web-footballnia",
    summary: "交代完整游戏需要的关键路径以及负责它们的子 Goal。",
    items: [
      {
        item_id: "web-footballnia-parent",
        kind: "contract",
        operation: "update",
        payload: {
          goal_id: "web-footballnia",
          title: "交付完整可玩的 Footballnia",
          outcome: "玩家可以从进入游戏到完成一轮核心玩法，并获得完整反馈。",
          why: "避免足球资料很详细，但游戏本身无法操作或交付。",
          business_logic: "先确认完整玩家旅程，再让玩法、内容、交互、视听、质量和发布共同支撑它。",
          definition_state: "accepted",
          decomposition_state: "closed_compound",
          acceptance_criteria: [{
            criterion_id: "web-footballnia-complete",
            statement: "完整游戏路径可以体验",
            decision_method: "inspection",
            pass_condition: "玩家可以完成一轮端到端体验",
            required_evidence: ["playtest"],
          }],
          decomposition_review: {
            status: "complete",
            product_context: "game",
            coverage: productAreas.map((area) => ({
              area,
              disposition: "owned",
              goal_ids: ["web-footballnia-product-slice"],
              reason: "这条子 Goal 负责交付完整游戏闭环。",
            })),
            open_goal_ids: [],
            next_step: "等待子 Goal 完成。",
            contract_coverage: {
              promised_outputs: [],
              acceptance_criteria: [{
                parent_criterion_id: "web-footballnia-complete",
                status: "complete",
                child_criteria: [{
                  goal_id: "web-footballnia-product-slice",
                  criterion_id: "web-footballnia-slice-complete",
                }],
                reason: "端到端子 Goal 的试玩检查覆盖父级完整路径验收。",
              }],
            },
          },
        },
        source_refs: ["conversation://web-footballnia"],
        reason: "把原始游戏需求整理为完整产品目标。",
        confidence: 0.95,
        affected_objects: [{ object_type: "goal", object_id: "web-footballnia" }],
      },
      {
        item_id: "web-footballnia-child",
        kind: "goal",
        operation: "create",
        payload: {
          goal_id: "web-footballnia-product-slice",
          title: "完成 Footballnia 的完整游戏闭环",
          outcome: "产出可独立体验和验收的游戏闭环。",
          why: "让产品路径有明确的执行和验收归属。",
          business_logic: "一次交付串起玩法、交互、反馈和质量检查。",
          in_scope: ["从进入游戏到完成一轮核心玩法的端到端体验"],
          out_of_scope: ["独立扩展第二套玩法模式"],
          required_inputs: ["已经确认的核心玩法规则"],
          promised_outputs: ["可独立体验和验收的游戏闭环"],
          definition_state: "accepted",
          decomposition_state: "closed_leaf",
          acceptance_criteria: [{
            criterion_id: "web-footballnia-slice-complete",
            statement: "游戏闭环可以独立体验",
            decision_method: "inspection",
            pass_condition: "试玩者可以完成核心流程",
            required_evidence: ["playtest"],
          }],
          leaf_readiness: {
            verdict: "ready",
            primary_deliverable: "可独立体验和验收的游戏闭环",
            output_coverage: [{
              promised_output: "可独立体验和验收的游戏闭环",
              role: "primary",
              reason: "这是本 Goal 唯一独立交付和验收的结果。",
            }],
            split_candidates: [],
            rationale: "玩法、交互和反馈共同组成同一次端到端试玩验收。",
            unresolved_decisions: [],
            independent_deliverables: [],
            acceptance_criterion_ids: ["web-footballnia-slice-complete"],
          },
        },
        source_refs: ["conversation://web-footballnia"],
        reason: "由一个范围合理的子 Goal 承担多条紧密相关的产品路径。",
        confidence: 0.9,
        affected_objects: [{ object_type: "goal", object_id: "web-footballnia-product-slice" }],
      },
      {
        item_id: "web-footballnia-relation",
        kind: "relation",
        operation: "create",
        payload: {
          from_goal_id: "web-footballnia-product-slice",
          to_goal_id: "web-footballnia",
          type: "part_of",
          reason: "整款游戏消费这条子 Goal 的可玩闭环结果。",
        },
        source_refs: ["conversation://web-footballnia"],
        reason: "说明子 Goal 为什么属于父 Goal。",
        confidence: 0.95,
        affected_objects: [{ object_type: "relation", object_id: "web-footballnia-part-of" }],
      },
    ],
    idempotency_key: "web-footballnia-proposal",
  }).proposal;
  const storedChildPayload = JSON.parse((store.db.prepare(
    "SELECT payload_json FROM goal_tree_proposal_items WHERE item_id = ?",
  ).get("web-footballnia-child") as { payload_json: string }).payload_json) as Record<string, unknown>;
  store.db.prepare("UPDATE goal_tree_proposal_items SET payload_json = ? WHERE item_id = ?").run(
    JSON.stringify({ ...storedChildPayload, definition_state: "draft", decomposition_state: "abstract" }),
    "web-footballnia-child",
  );
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId: "web-decomposition-board" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const decisionPage = await (await webFetch(`${origin}/decisions`)).text();
    assert.match(decisionPage, /这份方案有 1 个 Goal 的拆解还不完整/);
    assert.match(decisionPage, /还没有交代通用结果链、当前任务的必要路径，或下面仍有目标没有拆完/);
    assert.match(decisionPage, /完整可玩的 Footballnia[\s\S]*仍有 1 条目标没拆完：完成 Footballnia 的完整游戏闭环/);
    assert.match(decisionPage, /核心玩法：由 「完成 Footballnia 的完整游戏闭环」 负责/);
    assert.match(decisionPage, /交互与 UI：由 「完成 Footballnia 的完整游戏闭环」 负责/);
    assert.match(decisionPage, /交付与发布：由 「完成 Footballnia 的完整游戏闭环」 负责/);
    assert.match(decisionPage, /完成 Footballnia 的完整游戏闭环 → 属于 → 交付完整可玩的 Footballnia/);
    assert.match(decisionPage, /请继续拆这些目标，或把父 Goal 保持为“仍需拆分”/);
    assert.match(decisionPage, /补充说明[\s\S]*可选/);
    assert.match(decisionPage, /GoalBoard 会自动附上上方问题；只有想补充时才填写/);
    assert.match(decisionPage, /value="reject">退回修正/);
    assert.match(decisionPage, /value="confirm" disabled aria-disabled="true">先补全 Goal 拆解/);

    const rejected = await webFetch(
      `${origin}/api/goal-tree-proposals/${encodeURIComponent(decompositionProposal.proposal_id)}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decisions: decompositionProposal.items.map((item) => ({
            item_id: item.item_id,
            decision: "reject",
            reason: "",
          })),
          reason: "",
          idempotency_key: "web-footballnia-auto-reject",
        }),
      },
    );
    assert.equal(rejected.status, 200, await rejected.text());
    const board = (await (await webFetch(`${origin}/api/board`)).json()) as {
      snapshot: {
        goal_tree_proposals: Array<{
          proposal_id: string;
          state: string;
          items: Array<{ decision: { reason: string } | null }>;
        }>;
      };
    };
    const storedProposal = board.snapshot.goal_tree_proposals.find((item) =>
      item.proposal_id === decompositionProposal.proposal_id);
    assert.equal(storedProposal?.state, "rejected");
    assert.equal(storedProposal?.items.every((item) =>
      item.decision?.reason.includes("GoalBoard 自动退回修正")), true);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web explains why a historical pseudo-leaf must be split before the user can adopt it", async () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-leaf-readiness-"));
  const databasePath = join(directory, "goalboard.db");
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.initializeBoard({
    board_id: "web-leaf-readiness-board",
    title: "Leaf Readiness",
    actor_id: "web-user",
    idempotency_key: "web-leaf-readiness-init",
  });
  const dialogue = coordinator.startDraftDialogue({
    board_id: "web-leaf-readiness-board",
    actor_id: "runtime-clarifier",
    goal_id: "web-pseudo-leaf",
    rough_idea: "把一组仍然混在一起的工作误当成叶子。",
    idempotency_key: "web-leaf-readiness-dialogue",
  });
  const proposal = coordinator.submitGoalTreeProposal({
    board_id: "web-leaf-readiness-board",
    actor_id: "runtime-clarifier",
    discovered_in_run_id: dialogue.run!.run_id,
    root_goal_id: "web-pseudo-leaf",
    summary: "验证决定中心会阻止没有粒度说明的历史叶子方案。",
    items: [{
      item_id: "web-pseudo-leaf-contract",
      kind: "contract",
      operation: "update",
      payload: {
        goal_id: "web-pseudo-leaf",
        title: "交付一项可以直接验收的结果",
        outcome: "用户拿到一个范围清楚、可直接验收的结果。",
        why: "执行前必须知道唯一主要结果和完成依据。",
        business_logic: "先确认唯一结果，再围绕同一次验收完成必要配套工作。",
        in_scope: ["交付唯一主要结果"],
        out_of_scope: ["可单独交付的第二项结果"],
        required_inputs: ["已经确认的目标边界"],
        promised_outputs: ["可直接验收的主要结果"],
        definition_state: "accepted",
        decomposition_state: "closed_leaf",
        acceptance_criteria: [{
          criterion_id: "web-pseudo-leaf-result",
          statement: "主要结果可以独立验收",
          decision_method: "inspection",
          pass_condition: "用户能根据完成依据确认结果",
          required_evidence: ["inspection"],
        }],
        leaf_readiness: {
          verdict: "ready",
          primary_deliverable: "可直接验收的主要结果",
          output_coverage: [{
            promised_output: "可直接验收的主要结果",
            role: "primary",
            reason: "这是唯一独立交付和验收的结果。",
          }],
          split_candidates: [],
          rationale: "当前只有一个主要结果。",
          unresolved_decisions: [],
          independent_deliverables: [],
          acceptance_criterion_ids: ["web-pseudo-leaf-result"],
        },
      },
      source_refs: ["conversation://web-leaf-readiness"],
      reason: "形成一条可直接执行的 Goal。",
      confidence: 0.9,
      affected_objects: [{ object_type: "goal", object_id: "web-pseudo-leaf" }],
    }],
    idempotency_key: "web-leaf-readiness-proposal",
  }).proposal;
  const storedPayload = JSON.parse((store.db.prepare(
    "SELECT payload_json FROM goal_tree_proposal_items WHERE item_id = ?",
  ).get("web-pseudo-leaf-contract") as { payload_json: string }).payload_json) as Record<string, unknown>;
  const { leaf_readiness: _historicalMissingReadiness, ...historicalPayload } = storedPayload;
  store.db.prepare("UPDATE goal_tree_proposal_items SET payload_json = ? WHERE item_id = ?").run(
    JSON.stringify(historicalPayload),
    "web-pseudo-leaf-contract",
  );
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId: "web-leaf-readiness-board" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const decisionPage = await (await webFetch(`http://127.0.0.1:${address.port}/decisions`)).text();
    assert.match(decisionPage, /这份方案有 1 个 Goal 还没拆到可以直接执行/);
    assert.match(decisionPage, /还没有说明唯一要交付的结果，也没有检查哪些工作应该另拆/);
    assert.match(decisionPage, /一条可执行 Goal 只能交付一个主要结果/);
    assert.match(decisionPage, /先拆成可执行 Goal/);
    assert.match(decisionPage, /value="confirm" disabled aria-disabled="true"/);
    assert.doesNotMatch(decisionPage, /采用整份方案<\/button>/);
    assert.ok(proposal.proposal_id);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web presents the shared result chain, AI-specific checks, and foundation dependency in plain language", async () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-task-chain-"));
  const databasePath = join(directory, "goalboard.db");
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.initializeBoard({
    board_id: "web-task-chain-board",
    title: "Task Chain",
    actor_id: "web-user",
    idempotency_key: "web-task-chain-init",
  });
  const dialogue = coordinator.startDraftDialogue({
    board_id: "web-task-chain-board",
    actor_id: "runtime-task-planner",
    goal_id: "web-ai-parent",
    rough_idea: "做一套能持续运行和评测的 AI 能力。",
    idempotency_key: "web-task-chain-dialogue",
  });
  const coreGoalId = "web-ai-core";
  const foundationGoalId = "web-ai-foundation";
  const taskAreas = [
    "final_outcome",
    "operating_flow",
    "core_capabilities",
    "foundation_infrastructure",
    "quality_continuous_delivery",
    "ai_data_sources_quality",
    "ai_evaluation",
    "ai_runtime_cost",
    "ai_safety_governance",
  ];
  const leafPayload = (goalId: string, title: string, output: string) => ({
    goal_id: goalId,
    title,
    outcome: `${output}可以独立交付和检查。`,
    why: "让整项 AI 工作有清楚的执行归属。",
    business_logic: "围绕一个主要结果完成必要工作，并用同一组依据验收。",
    in_scope: [output],
    out_of_scope: ["另一条可独立交付的结果"],
    required_inputs: ["已确认的 AI 任务边界"],
    promised_outputs: [output],
    definition_state: "accepted",
    decomposition_state: "closed_leaf",
    acceptance_criteria: [{
      criterion_id: `${goalId}-criterion`,
      statement: `${output}可检查`,
      decision_method: "inspection",
      pass_condition: "用户能根据约定依据判断通过或不通过",
      required_evidence: ["inspection"],
    }],
    leaf_readiness: {
      verdict: "ready",
      primary_deliverable: output,
      output_coverage: [{ promised_output: output, role: "primary", reason: "这是唯一主要结果。" }],
      split_candidates: [],
      rationale: "只有一个主要结果。",
      unresolved_decisions: [],
      independent_deliverables: [],
      acceptance_criterion_ids: [`${goalId}-criterion`],
    },
  });
  coordinator.submitGoalTreeProposal({
    board_id: "web-task-chain-board",
    actor_id: "runtime-task-planner",
    discovered_in_run_id: dialogue.run!.run_id,
    root_goal_id: "web-ai-parent",
    summary: "把 AI 最终结果、核心能力、支撑基础、质量交付和专属检查交代完整。",
    narrative: {
      why_now: "AI 目标已经拆分到可以确认的结果链，需要用户在执行前理解核心工作与基础能力的消费方向。",
      problem: "原父 Goal 没有说明最终结果、AI 专属检查和基础能力分别由谁负责。",
      main_path: ["准备 AI 数据与运行基础", "核心 Goal 消费基础结果并交付 AI 能力", "父 Goal 汇总完整结果链与验收"],
      expected_effect: "用户能按业务结果而非技术层次理解两条子 Goal 及其先后依赖。",
      non_goals: ["不按每个检查项额外创建 Goal", "不在确认时自动开始执行"],
    },
    items: [
      {
        item_id: "web-ai-parent-contract",
        kind: "contract",
        operation: "update",
        payload: {
          goal_id: "web-ai-parent",
          title: "交付可持续运行和评测的 AI 能力",
          outcome: "使用者能稳定获得 AI 结果，并知道效果、成本和安全边界。",
          why: "不能只确认模型功能而省略数据、评测、运行和治理。",
          business_logic: "核心能力消费准备好的数据与运行基础，再通过评测、监控和治理持续交付。",
          definition_state: "accepted",
          decomposition_state: "closed_compound",
          acceptance_criteria: [{
            criterion_id: "web-ai-parent-complete",
            statement: "AI 结果链可以完整推进",
            decision_method: "inspection",
            pass_condition: "所有承担 Goal 和依赖都清楚",
            required_evidence: ["Goal Tree"],
          }],
          decomposition_review: {
            status: "complete",
            task_context: "ai_data",
            coverage: taskAreas.map((area) => ({
              area,
              disposition: "owned",
              goal_ids: [area === "foundation_infrastructure" ? foundationGoalId : coreGoalId],
              reason: area === "foundation_infrastructure"
                ? "这条 Goal 提供数据、工具和运行环境。"
                : "这条 Goal 负责用户结果、核心能力和 AI 专属检查。",
            })),
            open_goal_ids: [],
            next_step: "按依赖顺序推进基础能力和核心能力。",
            contract_coverage: {
              promised_outputs: [],
              acceptance_criteria: [{
                parent_criterion_id: "web-ai-parent-complete",
                status: "complete",
                child_criteria: [
                  { goal_id: coreGoalId, criterion_id: `${coreGoalId}-criterion` },
                  { goal_id: foundationGoalId, criterion_id: `${foundationGoalId}-criterion` },
                ],
                reason: "核心与基础 Goal 的检查共同覆盖完整 AI 结果链。",
              }],
            },
          },
        },
        source_refs: ["conversation://web-task-chain"],
        reason: "把通用结果链和 AI 专属检查放回同一方案。",
        explanation: {
          problem: "父 Goal 没有覆盖通用结果链和 AI 专属验收",
          expected_effect: "父 Contract 明确哪些子结果共同证明完整 AI 能力",
          non_goals: ["不把每项检查拆成独立 Goal"],
          depends_on_item_ids: [],
        },
        confidence: 0.95,
        affected_objects: [{ object_type: "goal", object_id: "web-ai-parent" }],
      },
      ...[
        [coreGoalId, "交付用户直接使用的 AI 核心能力", "可评测的 AI 核心能力"],
        [foundationGoalId, "准备 AI 运行需要的数据和基础环境", "可供核心能力消费的数据与运行基础"],
      ].flatMap(([goalId, title, output]) => [
        {
          item_id: `${goalId}-goal`,
          kind: "goal" as const,
          operation: "create" as const,
          payload: leafPayload(goalId, title, output),
          source_refs: ["conversation://web-task-chain"],
          reason: "形成一个边界清楚的执行结果。",
          explanation: {
            problem: `${title}还没有独立、可验收的执行归属`,
            expected_effect: `${title}成为边界清楚的可执行结果`,
            non_goals: ["不承担另一条可独立交付的结果"],
            depends_on_item_ids: ["web-ai-parent-contract"],
          },
          confidence: 0.9,
          affected_objects: [{ object_type: "goal" as const, object_id: goalId }],
        },
        {
          item_id: `${goalId}-part-of`,
          kind: "relation" as const,
          operation: "create" as const,
          payload: { from_goal_id: goalId, to_goal_id: "web-ai-parent", type: "part_of" },
          source_refs: ["conversation://web-task-chain"],
          reason: "这条结果属于完整 AI 目标。",
          explanation: {
            problem: `${title}若无父子关系会成为孤立 Goal`,
            expected_effect: `${title}在完整 AI 结果链中有明确归属`,
            non_goals: ["不改变该 Goal 的执行先后"],
            depends_on_item_ids: [`${goalId}-goal`],
          },
          confidence: 0.95,
          affected_objects: [{ object_type: "relation" as const, object_id: `relation:${goalId}:web-ai-parent` }],
        },
      ]),
      {
        item_id: "web-ai-core-depends-on-foundation",
        kind: "dependency",
        operation: "create",
        payload: {
          from_goal_id: coreGoalId,
          to_goal_id: foundationGoalId,
          type: "depends_on",
          reason: "AI 核心能力要使用基础 Goal 提供的数据和运行环境。",
        },
        source_refs: ["conversation://web-task-chain"],
        reason: "说明核心工作消费哪项基础结果。",
        explanation: {
          problem: "核心工作与基础能力虽已拆开，但没有表达消费者到提供者的方向",
          expected_effect: "核心 Goal 会等待并消费基础 Goal 的数据与运行环境",
          non_goals: ["不把基础 Goal 变成用户最终结果"],
          depends_on_item_ids: [`${coreGoalId}-goal`, `${foundationGoalId}-goal`],
        },
        confidence: 0.98,
        affected_objects: [{ object_type: "relation", object_id: "relation:web-ai-core:web-ai-foundation" }],
      },
    ],
    idempotency_key: "web-task-chain-proposal",
  });
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId: "web-task-chain-board" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const page = await (await webFetch(`http://127.0.0.1:${address.port}/decisions`)).text();
    assert.match(page, /任务类型：AI \/ 数据/);
    assert.match(page, /最终结果：由 「交付用户直接使用的 AI 核心能力」 负责/);
    assert.match(page, /核心能力：由 「交付用户直接使用的 AI 核心能力」 负责/);
    assert.match(page, /基础能力与基建：由 「准备 AI 运行需要的数据和基础环境」 负责/);
    assert.match(page, /数据来源与质量：由 「交付用户直接使用的 AI 核心能力」 负责/);
    assert.match(page, /运行方式与成本：由 「交付用户直接使用的 AI 核心能力」 负责/);
    assert.match(page, /交付用户直接使用的 AI 核心能力 → 依赖 → 准备 AI 运行需要的数据和基础环境/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web lets the user add and deactivate every supported Goal relation with explicit direction", async () => {
  const { databasePath } = webFixture();
  const server = createGoalBoardWebServer({ databasePath, boardId: DEMO_BOARD_ID, demo: true });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const initialPage = await goalPageWithLazyContent(origin, "CORE", ["factors"]);
    assert.match(initialPage, /data-relation-editor/);
    assert.match(initialPage, /你正在直接修改 Goal 关系/);
    assert.match(initialPage, /执行工具提出的关系变化仍会先进入/);
    assert.match(initialPage, /name="relation_intent"/);
    assert.match(initialPage, /当前 Goal 开始前需要它完成/);
    assert.match(initialPage, /<select name="direction" required><option value="">请选择方向<\/option><option value="outgoing" selected>/);
    assert.match(initialPage, /<select name="type" required><option value="">请选择关系类型<\/option>/);
    assert.match(initialPage, /<option value="incoming">/);
    assert.match(initialPage, /data-relation-live-preview/);
    for (const type of [
      "part_of",
      "depends_on",
      "conflicts_with",
      "mitigates",
      "extends",
      "replaces",
      "corrects",
      "invalidates",
      "migrates_from",
    ]) {
      assert.match(initialPage, new RegExp(`<option value="${type}"`));
    }

    const missingReason = await webFetch(`${origin}/api/goals/CORE/relations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        direction: "incoming",
        type: "corrects",
        target_goal_id: "INTERFACES",
      }),
    });
    assert.equal(missingReason.status, 400);
    assert.match(await missingReason.text(), /为什么要建立这条关系/);

    const createResponse = await webFetch(`${origin}/api/goals/CORE/relations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        direction: "incoming",
        type: "corrects",
        target_goal_id: "INTERFACES",
        reason: "接口 Goal 修正当前执行闭环中的协议偏差",
        idempotency_key: "web-relation-maintenance-add",
      }),
    });
    assert.equal(createResponse.status, 201);
    const created = (await createResponse.json()) as { relation_id: string };
    const afterCreate = (await (await webFetch(`${origin}/api/board`)).json()) as {
      snapshot: {
        relations: Array<{
          relation_id: string;
          from_goal_id: string;
          to_goal_id: string;
          type: string;
          state: string;
          reason: string;
          deactivated_at: string | null;
        }>;
      };
    };
    const relation = afterCreate.snapshot.relations.find(
      (item) => item.relation_id === created.relation_id,
    );
    assert.deepEqual(
      relation && {
        from_goal_id: relation.from_goal_id,
        to_goal_id: relation.to_goal_id,
        type: relation.type,
        state: relation.state,
        reason: relation.reason,
      },
      {
        from_goal_id: "INTERFACES",
        to_goal_id: "CORE",
        type: "corrects",
        state: "active",
        reason: "接口 Goal 修正当前执行闭环中的协议偏差",
      },
    );
    const activePage = await goalPageWithLazyContent(origin, "CORE", ["factors"]);
    assert.match(activePage, new RegExp(`data-relation-id="${created.relation_id}"`));
    assert.match(activePage, /让不同 AI 对话看到同一项目进度 → 修正 → 当前 Goal/);
    assert.match(activePage, /接口 Goal 修正当前执行闭环中的协议偏差/);
    assert.match(activePage, /data-relation-deactivate-open/);

    const missingDeactivateReason = await webFetch(
      `${origin}/api/relations/${encodeURIComponent(created.relation_id)}/deactivate`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    assert.equal(missingDeactivateReason.status, 400);
    assert.match(await missingDeactivateReason.text(), /必须说明原因/);

    const deactivateResponse = await webFetch(
      `${origin}/api/relations/${encodeURIComponent(created.relation_id)}/deactivate`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reason: "修正工作已经独立完成，这条关系不再成立",
          idempotency_key: "web-relation-maintenance-deactivate",
        }),
      },
    );
    assert.equal(deactivateResponse.status, 200);
    const deactivated = (await deactivateResponse.json()) as {
      relation: { state: string; deactivated_at: string | null };
    };
    assert.equal(deactivated.relation.state, "inactive");
    assert.ok(deactivated.relation.deactivated_at);
    const inactivePage = await goalPageWithLazyContent(origin, "CORE", ["factors"]);
    assert.match(inactivePage, /已解除关系/);
    assert.match(inactivePage, /解除原因：修正工作已经独立完成，这条关系不再成立/);
    assert.doesNotMatch(
      inactivePage.match(
        new RegExp(`<div class="relation-record relation-record--inactive" data-relation-id="${created.relation_id}"[\\s\\S]*?<\\/div>`),
      )?.[0] ?? "",
      /data-relation-deactivate-open/,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web server keeps Candidate and Rewire as separate user decisions", async () => {
  const { databasePath } = webFixture();
  const server = createGoalBoardWebServer({ databasePath, boardId: DEMO_BOARD_ID, demo: true });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const goalPageResponse = await webFetch(`${origin}/goals/CORE`);
    assert.equal(goalPageResponse.status, 200);
    const goalPage = await goalPageResponse.text();
    assert.match(goalPage, /<title>让每项工作都有可信的完成依据 · GoalBoard<\/title>/);
    assert.match(goalPage, /data-goal-view="CORE"/);
    const missingGoalResponse = await webFetch(`${origin}/goals/DOES-NOT-EXIST`);
    assert.equal(missingGoalResponse.status, 404);

    const createResponse = await webFetch(`${origin}/api/goals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        goal_id: "WEB-CREATED",
        title: "从 Web 手动录入 Goal",
        outcome: "新 Goal 进入同一真相源",
        why: "用户需要直接记录新需求",
        business_logic: "用户先录入草稿，再由澄清者补全 Contract；Runtime 不会被自动启动。",
        priority: 55,
        parent_goal_id: "V1",
        dependency_goal_ids: ["CORE"],
        acceptance_criteria: ["页面可以打开新 Goal"],
        idempotency_key: "web-create-test",
      }),
    });
    assert.equal(createResponse.status, 201);
    const created = (await createResponse.json()) as {
      goal: { goal_id: string; definition_state: string; decomposition_state: string };
      goal_path: string;
    };
    assert.equal(created.goal.goal_id, "WEB-CREATED");
    assert.equal(created.goal.definition_state, "draft");
    assert.equal(created.goal.decomposition_state, "abstract");
    assert.equal(created.goal_path, "/goals/WEB-CREATED");
    const createdPage = await webFetch(`${origin}${created.goal_path}`);
    assert.equal(createdPage.status, 200);
    assert.match(await createdPage.text(), /从 Web 手动录入 Goal/);

    const boardResponse = await webFetch(`${origin}/api/board`);
    assert.equal(boardResponse.status, 200);
    const board = (await boardResponse.json()) as {
      snapshot: {
        candidates: Array<{
          candidate_id: string;
          state: string;
          proposed_goal: { title: string };
        }>;
        relations: Array<{ from_goal_id: string; to_goal_id: string; type: string }>;
      };
    };
    assert.ok(
      board.snapshot.relations.some(
        (relation) =>
          relation.from_goal_id === "WEB-CREATED" &&
          relation.to_goal_id === "V1" &&
          relation.type === "part_of",
      ),
    );
    assert.ok(
      board.snapshot.relations.some(
        (relation) =>
          relation.from_goal_id === "WEB-CREATED" &&
          relation.to_goal_id === "CORE" &&
          relation.type === "depends_on",
      ),
    );
    const candidate = board.snapshot.candidates.find((item) => item.state === "pending");
    assert.ok(candidate);

    const decisionCenter = await (await webFetch(`${origin}/decisions`)).text();
    assert.match(decisionCenter, /<title>等待你的决定 · GoalBoard<\/title>/);
    assert.match(decisionCenter, /data-feed-workbench/);
    assert.match(decisionCenter, /data-feed-detail="decision:/);
    assert.match(decisionCenter, /这些决定属于/);
    assert.match(decisionCenter, /<form class="decision-record candidate-decision"/);
    assert.match(decisionCenter, /为什么现在做/);
    assert.match(decisionCenter, /它会怎样运转/);
    assert.match(decisionCenter, /为什么要单独拆出来/);
    assert.match(decisionCenter, /这次会做/);
    assert.match(decisionCenter, /这次不做/);
    assert.match(decisionCenter, /完成标准/);
    assert.match(decisionCenter, /影响范围/);
    assert.match(decisionCenter, /风险/);
    assert.match(decisionCenter, /完成前需要的检查/);
    assert.match(decisionCenter, /放到当前方案里看/);
    assert.match(decisionCenter, /candidate-decision[\s\S]*<section class="decision-scenario"[\s\S]*<details class="decision-details"/);
    assert.match(decisionCenter, /如果加入[\s\S]*会新建独立 Goal「让旧数据升级前先看到安全说明」/);
    assert.match(decisionCenter, /不会自动成为「让不同 AI 对话看到同一项目进度」的子 Goal/);
    assert.match(decisionCenter, /不会自动开始执行/);
    assert.match(decisionCenter, /如果暂不加入[\s\S]*不会创建 Goal「让旧数据升级前先看到安全说明」/);
    assert.match(decisionCenter, /决定理由或修改意见/);
    const unrelatedGoalPage = await (await webFetch(`${origin}/goals/WEB`)).text();
    assert.doesNotMatch(workSurfaceHtml(unrelatedGoalPage, "goal"), /<form class="decision-record candidate-decision"/);

    const unsafeReferenceResponse = await webFetch(`${origin}/api/reference?value=/etc/passwd`);
    assert.equal(unsafeReferenceResponse.status, 404);

    const missingCandidateReason = await webFetch(
      `${origin}/api/candidates/${encodeURIComponent(candidate.candidate_id)}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "approved" }),
      },
    );
    assert.equal(missingCandidateReason.status, 400);
    assert.match(await missingCandidateReason.text(), /请填写决定理由或修改意见/);

    const decisionResponse = await webFetch(
      `${origin}/api/candidates/${encodeURIComponent(candidate.candidate_id)}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision: "approved",
          reason: "自动化测试接受示例 Candidate",
          idempotency_key: "web-candidate-test",
        }),
      },
    );
    assert.equal(decisionResponse.status, 200);
    const result = (await decisionResponse.json()) as {
      candidate: { state: string; decision: { reason: string } };
    };
    assert.equal(result.candidate.state, "approved");
    assert.equal(result.candidate.decision.reason, "自动化测试接受示例 Candidate");

    const afterCandidateResponse = await webFetch(`${origin}/api/board`);
    const afterCandidate = (await afterCandidateResponse.json()) as {
      snapshot: {
        rewires: Array<{ rewire_id: string; state: string }>;
        relations: Array<{ from_goal_id: string; to_goal_id: string; type: string }>;
        candidates: Array<{ candidate_id: string; discovered_in_run_id: string | null }>;
        runs: Array<{ run_id: string; goal_id: string }>;
      };
    };
    const rewire = afterCandidate.snapshot.rewires.find((item) => item.state === "pending");
    assert.ok(rewire);
    const pendingDecisionPage = await (await webFetch(`${origin}/decisions`)).text();
    assert.match(pendingDecisionPage, /最近处理结果/);
    assert.match(pendingDecisionPage, /新发现的工作/);
    assert.match(pendingDecisionPage, /这项工作已经成为独立 Goal/);
    assert.match(pendingDecisionPage, /自动化测试接受示例 Candidate/);
    assert.match(pendingDecisionPage, /保持现有关系/);
    assert.match(pendingDecisionPage, /<form class="decision-record rewire-decision"/);
    assert.match(pendingDecisionPage, /name="decision" value="confirmed"/);
    assert.match(pendingDecisionPage, /name="decision" value="rejected"/);
    assert.match(pendingDecisionPage, /已经在运行的终端和工作不会被改到别的 Goal/);
    const rewireForm = pendingDecisionPage.match(
      /<form class="decision-record rewire-decision"[\s\S]*?<\/form>/,
    )?.[0];
    assert.ok(rewireForm);
    assert.doesNotMatch(rewireForm, /active_runs_protected/);
    const candidateAfterApproval = afterCandidate.snapshot.candidates.find(
      (item) => item.candidate_id === candidate.candidate_id,
    );
    const ownerGoalId = afterCandidate.snapshot.runs.find(
      (run) => run.run_id === candidateAfterApproval?.discovered_in_run_id,
    )?.goal_id;
    assert.ok(ownerGoalId);
    const ownerPageWithDecision = await (await webFetch(`${origin}/goals/${encodeURIComponent(ownerGoalId)}`)).text();
    assert.match(ownerPageWithDecision, new RegExp(`href="/decisions#decision-goal-${ownerGoalId}"`));
    assert.doesNotMatch(workSurfaceHtml(ownerPageWithDecision, "goal"), /<form class="decision-record rewire-decision"/);
    const relationCountBefore = afterCandidate.snapshot.relations.length;
    const missingRewireReason = await webFetch(
      `${origin}/api/rewires/${encodeURIComponent(rewire.rewire_id)}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "rejected" }),
      },
    );
    assert.equal(missingRewireReason.status, 400);
    assert.match(await missingRewireReason.text(), /请填写决定理由或修改意见/);
    const rewireResponse = await webFetch(
      `${origin}/api/rewires/${encodeURIComponent(rewire.rewire_id)}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision: "rejected",
          reason: "保留新 Goal，但拒绝这次关系调整",
          idempotency_key: "web-rewire-reject-test",
        }),
      },
    );
    assert.equal(rewireResponse.status, 200);
    const rewireResult = (await rewireResponse.json()) as {
      rewire: { state: string; impact: Record<string, unknown> };
    };
    assert.equal(rewireResult.rewire.state, "rejected");
    assert.equal(rewireResult.rewire.impact.proposed_changes_applied, false);
    const afterRewire = (await (await webFetch(`${origin}/api/board`)).json()) as {
      snapshot: { relations: unknown[] };
    };
    assert.equal(afterRewire.snapshot.relations.length, relationCountBefore);
    const finalDecisionPage = await (await webFetch(`${origin}/decisions`)).text();
    assert.match(finalDecisionPage, /Goal 关系调整未采用/);
    assert.match(finalDecisionPage, /这次调整未采用，现有 Goal 关系没有改变/);
    assert.match(finalDecisionPage, /保留新 Goal，但拒绝这次关系调整/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web lets a user save a minimal Draft and confirm a readable Contract Proposal", async () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-contract-"));
  const databasePath = join(directory, "goalboard.db");
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.initializeBoard({
    board_id: "contract-board",
    title: "Draft Contract",
    actor_id: "web-user",
    idempotency_key: "contract-board-init",
  });
  const draft = coordinator.createGoal(
    "contract-board",
    {
      goal_id: "FIRST-DRAFT",
      title: "记录第一次使用的问题",
      outcome: "",
      why: "",
      business_logic: "",
      definition_state: "draft",
      decomposition_state: "abstract",
      priority: 30,
      acceptance_criteria: [],
    },
    { actor_id: "web-user", idempotency_key: "minimal-draft" },
  ).goal;
  const claim = coordinator.claimGoal({
    board_id: "contract-board",
    goal_id: draft.goal_id,
    actor_id: "clarifier-runtime",
    role: "clarifier",
    idempotency_key: "clarifier-claim",
  }).claim;
  assert.ok(claim);
  const run = coordinator.startRun({
    board_id: "contract-board",
    claim_id: claim.claim_id,
    actor_id: "clarifier-runtime",
    idempotency_key: "clarifier-run",
  }).run;
  coordinator.createGoal(
    "contract-board",
    {
      goal_id: "PRODUCT-ROOT",
      title: "交付完整产品",
      outcome: "产品具备完整可用体验",
      why: "为下游工作提供产品方向",
      business_logic: "各个子 Goal 共同促成产品完成，产品本身不是这些子 Goal 的执行前置。",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [
        {
          criterion_id: "product-root-complete",
          statement: "产品完整交付",
          decision_method: "inspection",
          pass_condition: "所有必要体验已经完成",
        },
      ],
    },
    { actor_id: "web-user", idempotency_key: "product-root" },
  );
  coordinator.addRelation(
    "contract-board",
    {
      from_goal_id: draft.goal_id,
      to_goal_id: "PRODUCT-ROOT",
      type: "depends_on",
      reason: "创建 Draft 时误把所属产品选成执行前置",
    },
    { actor_id: "web-user", idempotency_key: "draft-product-dependency" },
  );
  const dependencyRewire = coordinator.submitDependencyProposal({
    board_id: "contract-board",
    actor_id: "clarifier-runtime",
    discovered_in_run_id: run.run_id,
    dependencies: [
      {
        from_goal_id: draft.goal_id,
        to_goal_id: "PRODUCT-ROOT",
        type: "depends_on",
        action: "deactivate",
        reason: "Draft 是产品的一部分，不应等待整个产品先完成",
        basis: "business_sequence",
        evidence_refs: ["contract://FIRST-DRAFT", "contract://PRODUCT-ROOT"],
        impact_if_rejected: "Draft 会被产品根 Goal 持续阻塞",
        confidence: 0.98,
        direction_reason: "Draft 不消费完整产品的输出，因此解除当前方向而不是反转它",
      },
    ],
    idempotency_key: "draft-dependency-proposal",
  }).rewire;
  const sourceFields = [
    "title",
    "outcome",
    "why",
    "business_logic",
    "in_scope",
    "out_of_scope",
    "required_inputs",
    "promised_outputs",
    "priority",
    "acceptance_criteria",
    "review_policy",
  ] as const;
  const proposal = coordinator.submitContractProposal({
    board_id: "contract-board",
    goal_id: draft.goal_id,
    actor_id: "clarifier-runtime",
    discovered_in_run_id: run.run_id,
    proposed_goal: {
      goal_id: draft.goal_id,
      title: "让新用户看懂第一次 Goal 领取",
      outcome: "新用户可以确认 Contract 并看到同一个 Goal 进入可执行状态",
      why: "第一次使用需要建立对 Goal 真相源的信任",
      business_logic: "用户先保存粗略想法，澄清者依据事实补全；用户确认后，执行者才可以领取同一个 Goal。",
      in_scope: ["Draft 补全", "用户确认"],
      out_of_scope: ["自动启动 Runtime"],
      constraints: [],
      required_inputs: ["已经保存的首次 Goal 想法"],
      promised_outputs: ["可确认并进入执行状态的首次 Goal Contract"],
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      priority: 70,
      acceptance_criteria: [
        {
          criterion_id: "first-draft-confirmed",
          statement: "确认后同一个 Goal 成为 accepted",
          decision_method: "automated_check",
          pass_condition: "FIRST-DRAFT 的 definition_state 为 accepted",
          required_evidence: ["test"],
        },
      ],
      leaf_readiness: {
        verdict: "ready",
        primary_deliverable: "可确认并进入执行状态的首次 Goal Contract",
        output_coverage: [{
          promised_output: "可确认并进入执行状态的首次 Goal Contract",
          role: "primary",
          reason: "这是新用户本次流程唯一需要独立确认和验收的结果。",
        }],
        split_candidates: [],
        rationale: "保存、补全和确认共同形成同一份首次 Goal Contract。",
        unresolved_decisions: [],
        independent_deliverables: [],
        acceptance_criterion_ids: ["first-draft-confirmed"],
      },
    },
    field_sources: sourceFields.map((field) => ({
      field,
      source_kind:
        field === "outcome" || field === "why" ? "user_answer" as const : "document_fact" as const,
      source_refs: ["specs/draft-contract-clarification/spec.md"],
      confidence: field === "business_logic" ? 0.82 : 0.95,
      rationale: `${field} 来自用户确认方向和产品需求书`,
      status: "proposed" as const,
      requires_user_confirmation: true as const,
    })),
    review_policy: {
      goal_mode: "required",
      required_capabilities: [],
      self_verification: true,
      cross_reviewers: 0,
      adversarial_reviewers: 0,
      human_approval: false,
      max_lease_seconds: 1800,
    },
    proposed_impacts: [
      { surface: "src/web", access: "write", reason: "补全 Draft 确认入口" },
    ],
    proposed_risks: [],
    dependency_rewire_ids: [dependencyRewire.rewire_id],
    idempotency_key: "contract-proposal",
  }).proposal;
  coordinator.reportRun({
    board_id: "contract-board",
    run_id: run.run_id,
    actor_id: "clarifier-runtime",
    state: "completed",
    output_refs: [proposal.proposal_id],
    idempotency_key: "clarifier-run-completed",
  });
  coordinator.releaseClaim({
    board_id: "contract-board",
    claim_id: claim.claim_id,
    actor_id: "clarifier-runtime",
    reason: "方案已提交，等待用户决定",
    idempotency_key: "clarifier-claim-released",
  });
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId: "contract-board" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const page = await (await webFetch(`${origin}/goals/FIRST-DRAFT`)).text();
    assert.match(page, /goal-status--waiting_user[^>]*[\s\S]*?<span>等你<\/span>/);
    assert.match(page, /方案已经整理好/);
    assert.match(page, /确认新要求/);
    assert.match(page, /新的目标说明等待你的确认/);
    assert.doesNotMatch(page, /clarifier 已提交 Contract/);
    assert.match(page, /href="\/decisions#decision-goal-FIRST-DRAFT"/);
    assert.match(page, /href="\/decisions#decision-goal-FIRST-DRAFT"/);
    assert.doesNotMatch(workSurfaceHtml(page, "goal"), /<form class="decision-record contract-proposal"/);
    const decisionPage = await (await webFetch(`${origin}/decisions`)).text();
    assert.match(decisionPage, /这条 Goal 已经说清楚，可以开始了吗？/);
    assert.match(decisionPage, /目标、范围和完成标准会成为正式依据/);
    assert.match(decisionPage, /用户回答 · 可信度 95% · 待你确认/);
    assert.match(decisionPage, /文档事实 · 可信度 82% · 待你确认/);
    assert.match(decisionPage, /<form class="decision-record contract-proposal"/);
    assert.match(decisionPage, /放到当前方案里看/);
    assert.match(decisionPage, /contract-proposal[\s\S]*<section class="decision-scenario"[\s\S]*<details class="decision-details"/);
    assert.match(decisionPage, /如果确认[\s\S]*不会新建另一条 Goal/);
    assert.match(decisionPage, /现有 Goal「记录第一次使用的问题」会更新为「让新用户看懂第一次 Goal 领取」/);
    assert.match(decisionPage, /随后进入“待执行”，但仍要由 Runtime 领取后才会开始/);
    assert.match(decisionPage, /如果退回[\s\S]*Goal「记录第一次使用的问题」仍保持当前草稿/);
    assert.match(decisionPage, /请先处理上方的 Goal 关系调整；完成后才能确认这份目标说明/);
    assert.match(decisionPage, /决定理由或修改意见/);
    assert.match(
      decisionPage,
      /name="decision" value="approved"[^>]*disabled[^>]*>先处理 Goal 关系<\/button>/,
    );
    assert.ok(
      decisionPage.indexOf(`data-rewire-id="${dependencyRewire.rewire_id}"`) <
        decisionPage.indexOf(`data-contract-proposal-id="${proposal.proposal_id}"`),
    );

    const rewireDecision = await webFetch(
      `${origin}/api/rewires/${encodeURIComponent(dependencyRewire.rewire_id)}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision: "confirmed",
          reason: "先完成 Contract 引用的依赖决定",
          idempotency_key: "web-contract-rewire-confirm",
        }),
      },
    );
    assert.equal(rewireDecision.status, 200, await rewireDecision.text());
    const resolvedPage = await (await webFetch(`${origin}/decisions`)).text();
    assert.match(resolvedPage, /关联的 Goal 关系已经决定，现在可以确认目标说明/);
    assert.match(resolvedPage, /确认并允许开始/);
    assert.doesNotMatch(
      resolvedPage,
      /name="decision" value="approved"[^>]*disabled/,
    );

    const missingContractReason = await webFetch(
      `${origin}/api/contract-proposals/${encodeURIComponent(proposal.proposal_id)}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "approved" }),
      },
    );
    assert.equal(missingContractReason.status, 400);
    assert.match(await missingContractReason.text(), /请填写决定理由或修改意见/);

    const decision = await webFetch(
      `${origin}/api/contract-proposals/${encodeURIComponent(proposal.proposal_id)}/decision`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision: "approved",
          reason: "测试确认完整 Contract",
          idempotency_key: "web-contract-approve",
        }),
      },
    );
    assert.equal(decision.status, 200, await decision.text());
    const board = (await (await webFetch(`${origin}/api/board`)).json()) as {
      snapshot: { goals: Array<{ goal_id: string; definition_state: string; outcome: string }> };
    };
    const accepted = board.snapshot.goals.find((goal) => goal.goal_id === "FIRST-DRAFT");
    assert.equal(accepted?.definition_state, "accepted");
    assert.equal(accepted?.outcome, "新用户可以确认 Contract 并看到同一个 Goal 进入可执行状态");
    const acceptedPage = await (await webFetch(`${origin}/goals/FIRST-DRAFT`)).text();
    assert.doesNotMatch(acceptedPage, /<form class="decision-record contract-proposal"/);
    assert.match(acceptedPage, /让新用户看懂第一次 Goal 领取/);
    const acceptedDecisionPage = await (await webFetch(`${origin}/decisions`)).text();
    assert.match(acceptedDecisionPage, /最近处理结果/);
    assert.match(acceptedDecisionPage, /目标、范围和完成标准已成为正式依据/);
    assert.match(acceptedDecisionPage, /测试确认完整 Contract/);

    const minimalCreate = await webFetch(`${origin}/api/goals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "只先记录一个想法", idempotency_key: "title-only-web" }),
    });
    const minimalText = await minimalCreate.text();
    assert.equal(minimalCreate.status, 201, minimalText);
    const minimal = JSON.parse(minimalText) as {
      goal: { outcome: string; why: string; business_logic: string; definition_state: string };
    };
    assert.equal(minimal.goal.definition_state, "draft");
    assert.equal(minimal.goal.outcome, "");
    assert.equal(minimal.goal.why, "");
    assert.equal(minimal.goal.business_logic, "");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web maintains a structured Draft Contract and initial Risk and Impact without editing accepted Goals", async () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-draft-editor-"));
  const databasePath = join(directory, "goalboard.db");
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.initializeBoard({
    board_id: "draft-editor-board",
    title: "Draft Editor",
    actor_id: "web-user",
    idempotency_key: "draft-editor-board-init",
  });
  coordinator.createGoal(
    "draft-editor-board",
    {
      goal_id: "EDIT-ME",
      title: "先记录一个模糊想法",
      outcome: "",
      why: "",
      business_logic: "",
      definition_state: "draft",
      decomposition_state: "abstract",
      acceptance_criteria: [],
    },
    { actor_id: "web-user", idempotency_key: "edit-me-create" },
  );
  coordinator.createGoal(
    "draft-editor-board",
    {
      goal_id: "LOCKED",
      title: "已经接受的 Goal",
      outcome: "Contract 已经固定",
      why: "验证不可变边界",
      business_logic: "新需求创建新 Goal，不原地重写 accepted Contract。",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [
        {
          criterion_id: "locked-c1",
          statement: "accepted Goal 无编辑入口",
          decision_method: "automated_check",
          pass_condition: "页面不存在 Draft 编辑表单",
          required_evidence: ["test"],
        },
      ],
    },
    { actor_id: "web-user", idempotency_key: "locked-create" },
  );
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId: "draft-editor-board" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const draftPage = await goalPageWithLazyContent(origin, "EDIT-ME", ["completion", "factors"]);
    assert.match(draftPage, /data-draft-editor data-goal-id="EDIT-ME"/);
    assert.match(draftPage, /修改目标说明和完成标准/);
    assert.match(draftPage, /href="#acceptance-EDIT-ME">查看完成标准<\/a>/);
    assert.match(draftPage, /value="abstract"/);
    assert.match(draftPage, /value="frontier_open"/);
    assert.match(draftPage, /value="closed_leaf"/);
    assert.match(draftPage, /value="closed_compound"/);
    assert.match(draftPage, /data-criterion-field="decision_method"/);
    assert.match(draftPage, /href="#goal-factor-panel-risks-EDIT-ME"/);
    assert.match(draftPage, /data-risk-create-form/);
    assert.match(draftPage, /href="#goal-factor-panel-impacts-EDIT-ME"/);
    assert.match(draftPage, /data-impact-create-form/);
    assert.match(draftPage, /href="#goal-factor-panel-rules-EDIT-ME"/);
    assert.match(draftPage, /data-policy-form/);
    assert.ok(draftPage.indexOf("完成要求") < draftPage.indexOf("修改目标说明和完成标准"));

    const updateResponse = await webFetch(`${origin}/api/goals/EDIT-ME/draft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "把完整工作拆成一组闭环子 Goal",
        outcome: "用户可以确认每个子 Goal 的独立交付结果",
        why: "多个结果可以分别失败和 Review",
        business_logic: "复合父 Goal 组织一组最小闭环子 Goal，每个叶子有自己的可观察验收。",
        in_scope: ["Draft Contract 全字段", "结构化验收"],
        out_of_scope: ["自动接受 Runtime 提案"],
        constraints: ["accepted Contract 不原地修改"],
        required_inputs: ["用户确认的业务边界"],
        promised_outputs: ["可执行子 Goal 族"],
        decomposition_state: "closed_compound",
        priority: 72,
        acceptance_criteria: [
          {
            criterion_id: "edit-me-c1",
            statement: "子 Goal 可以分别交付",
            decision_method: "measurement",
            pass_condition: "每个子 Goal 都有独立输出",
            target: { value: "100%" },
            required_evidence: ["test", "inspection"],
          },
          {
            statement: "用户可以确认拆分完成",
            decision_method: "human_decision",
            pass_condition: "用户给出明确通过结论",
            target: null,
            required_evidence: ["review"],
          },
        ],
        reason: "用户补全范围、拆分状态和验收方式",
        idempotency_key: "web-draft-structured-update",
      }),
    });
    assert.equal(updateResponse.status, 200, await updateResponse.text());

    const riskResponse = await webFetch(`${origin}/api/goals/EDIT-ME/risks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        description: "子 Goal 边界仍可能重叠",
        probability: "中",
        impact: "高",
        affected_surfaces: ["src/web", "Goal Tree"],
        trigger: "两个子 Goal 同时修改同一业务决策",
        treatment: "accept",
        blocking_mode: "completion",
        revisit_condition: "子 Goal 关系确认后复查",
        owner: "product-owner",
        reason: "Draft 阶段先记录影响拆分的风险",
        idempotency_key: "web-draft-risk",
      }),
    });
    assert.equal(riskResponse.status, 201, await riskResponse.text());

    const impactResponse = await webFetch(`${origin}/api/goals/EDIT-ME/impacts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        surface: "src/web",
        access: "write",
        input_snapshot: "contract://EDIT-ME",
        reason: "Draft 编辑器会写入 Web 工作区",
        idempotency_key: "web-draft-impact",
      }),
    });
    assert.equal(impactResponse.status, 201, await impactResponse.text());

    const board = (await (await webFetch(`${origin}/api/board`)).json()) as {
      snapshot: {
        goals: Array<{
          goal_id: string;
          title: string;
          definition_state: string;
          decomposition_state: string;
          acceptance_criteria: Array<{
            decision_method: string;
            target: Record<string, unknown> | null;
            required_evidence: string[];
          }>;
        }>;
        risks: Array<{ description: string; state: string }>;
        impacts: Array<{ goal_id: string; surface: string; state: string }>;
      };
    };
    const edited = board.snapshot.goals.find((goal) => goal.goal_id === "EDIT-ME");
    assert.equal(edited?.title, "把完整工作拆成一组闭环子 Goal");
    assert.equal(edited?.definition_state, "draft");
    assert.equal(edited?.decomposition_state, "closed_compound");
    const structuredCriterion = edited?.acceptance_criteria.find(
      (criterion) => criterion.decision_method === "measurement",
    );
    assert.deepEqual(structuredCriterion?.target, { value: "100%" });
    assert.deepEqual(structuredCriterion?.required_evidence, ["test", "inspection"]);
    assert.ok(board.snapshot.risks.some((risk) => risk.description === "子 Goal 边界仍可能重叠" && risk.state === "open"));
    assert.ok(board.snapshot.impacts.some((impact) => impact.goal_id === "EDIT-ME" && impact.surface === "src/web" && impact.state === "confirmed"));

    const updatedPage = await goalPageWithLazyContent(origin, "EDIT-ME", ["factors"]);
    const updatedRecords = await (
      await webFetch(`${origin}/api/goals/EDIT-ME/records?view=current`)
    ).text();
    assert.match(updatedRecords, /目标：100%/);
    assert.match(updatedRecords, /证据：test、inspection/);
    assert.match(updatedPage, /子 Goal 边界仍可能重叠/);
    assert.match(updatedPage, /contract:\/\/EDIT-ME/);

    const lockedPage = await (await webFetch(`${origin}/goals/LOCKED`)).text();
    assert.doesNotMatch(lockedPage, /data-draft-editor data-goal-id="LOCKED"/);
    const lockedUpdate = await webFetch(`${origin}/api/goals/LOCKED/draft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "不允许修改",
        outcome: "不应写入",
        why: "验证边界",
        business_logic: "accepted Contract 不可变。",
        decomposition_state: "closed_leaf",
        priority: 0,
        acceptance_criteria: [
          {
            statement: "接口拒绝",
            decision_method: "inspection",
            pass_condition: "返回 400",
          },
        ],
        reason: "测试不可变边界",
      }),
    });
    assert.equal(lockedUpdate.status, 400);
    assert.match(await lockedUpdate.text(), /accepted Contract 不能原地修改/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web maintains complete Risk facts, linked Goals, lifecycle states, and their visible effect", async () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-risk-workbench-"));
  const databasePath = join(directory, "goalboard.db");
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.initializeBoard({
    board_id: "risk-workbench-board",
    title: "Risk Workbench",
    actor_id: "web-user",
    idempotency_key: "risk-workbench-init",
  });
  for (const [goalId, title] of [["RISK-A", "交付风险工作台"], ["RISK-B", "验证关联 Goal"]] as const) {
    coordinator.createGoal(
      "risk-workbench-board",
      {
        goal_id: goalId,
        title,
        outcome: `${title}有明确结果`,
        why: "验证 Risk 真相源",
        business_logic: "用户维护事实和状态，GoalBoard 根据阻塞方式解释影响。",
        definition_state: "accepted",
        decomposition_state: "closed_leaf",
        acceptance_criteria: [
          {
            criterion_id: `${goalId}-C1`,
            statement: "Risk 可以完整维护",
            decision_method: "automated_check",
            pass_condition: "页面和接口保存完整 Risk",
            required_evidence: ["test"],
          },
        ],
      },
      { actor_id: "web-user", idempotency_key: `create-${goalId}` },
    );
  }
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId: "risk-workbench-board" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const emptyPage = await goalPageWithLazyContent(origin, "RISK-A", ["factors"]);
    assert.match(emptyPage, /data-risk-create-form/);
    assert.match(emptyPage, /name="description"/);
    assert.match(emptyPage, /name="affected_surfaces"/);
    assert.match(emptyPage, /name="blocking_mode"/);
    assert.match(emptyPage, /name="treatment_plan"/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /需要确认处理结果时，请到待决定/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /这次修改没有改变它的处理结果/);
    assert.match(emptyPage, /name="goal_ids" value="RISK-A" checked/);
    assert.match(emptyPage, /验证关联 Goal/);
    assert.match(WORKBENCH_STYLES, /\.risk-facts, \.risk-form, \.risk-state-form \{ grid-template-columns: 1fr; \}/);
    assert.match(WORKBENCH_STYLES, /\.risk-form input:not\(\[type=checkbox\]\).*font-size: 16px/);

    const createResponse = await webFetch(`${origin}/api/goals/RISK-A/risks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        goal_ids: ["RISK-A", "RISK-B"],
        description: "外部规则可能在交付前改变",
        probability: "35%",
        impact: "高",
        affected_surfaces: ["src/web", "Contract"],
        trigger: "规则正式发布新版本",
        treatment: "accept",
        treatment_plan: "提前核对外部规则，并保留兼容路径",
        blocking_mode: "completion",
        revisit_condition: "每次规则发布后复查",
        owner: "product-owner",
        reason: "两个 Goal 共享同一个外部规则",
        idempotency_key: "web-risk-create-complete",
      }),
    });
    const created = (await createResponse.json()) as { risk: { risk_id: string } };
    assert.equal(createResponse.status, 201, JSON.stringify(created));

    const populatedPage = await goalPageWithLazyContent(origin, "RISK-A", ["factors"]);
    assert.match(populatedPage, /外部规则可能在交付前改变/);
    assert.match(populatedPage, /35%/);
    assert.match(populatedPage, /具体措施[\s\S]*提前核对外部规则，并保留兼容路径/);
    assert.match(populatedPage, /阻止完成/);
    assert.match(populatedPage, /当前会阻止所有关联 Goal 被标记为完成/);
    assert.match(populatedPage, /data-risk-edit-form/);
    assert.doesNotMatch(populatedPage, /<form class="risk-state-form"/);
    assert.match(populatedPage, /去待决定处理这个风险/);
    const riskDecisionPage = await (await webFetch(`${origin}/decisions`)).text();
    assert.match(riskDecisionPage, /<form class="decision-record risk-decision" data-risk-state-form/);
    assert.match(riskDecisionPage, /<option value="" selected disabled>请选择处理结果<\/option>/);
    assert.match(riskDecisionPage, /name="resolution_summary"/);
    assert.match(riskDecisionPage, /name="resolution_evidence_refs"/);
    assert.match(riskDecisionPage, /name="resolution_residual_gaps"/);
    assert.match(riskDecisionPage, /风险保持开放，并继续按照当前规则影响关联 Goal/);
    assert.match(riskDecisionPage, /option value="accepted"/);
    assert.match(riskDecisionPage, /option value="rejected"/);
    for (const state of ["open", "triggered", "resolved", "expired"]) {
      assert.doesNotMatch(riskDecisionPage, new RegExp(`option value="${state}"`));
    }

    const acceptedResponse = await webFetch(`${origin}/api/risks/${encodeURIComponent(created.risk.risk_id)}/state`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        state: "accepted",
        reason: "用户明确接受当前残余风险",
        idempotency_key: "web-risk-state-accepted",
      }),
    });
    assert.equal(acceptedResponse.status, 200, await acceptedResponse.text());

    const updateResponse = await webFetch(`${origin}/api/risks/${encodeURIComponent(created.risk.risk_id)}/update`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        goal_ids: ["RISK-B"],
        description: "外部规则已经进入确认窗口",
        probability: "60%",
        impact: "中高",
        affected_surfaces: ["Contract", "tests"],
        trigger: "规则负责人确认变更",
        treatment: "avoid",
        treatment_plan: "在规则冻结前不接入新的外部字段",
        blocking_mode: "claim",
        revisit_condition: "负责人给出最终版本后复查",
        owner: "risk-owner",
        reason: "缩小影响 Goal，并更新处理责任",
        idempotency_key: "web-risk-update-complete",
      }),
    });
    assert.equal(updateResponse.status, 200, await updateResponse.text());

    const riskEvidenceResponse = await webFetch(`${origin}/api/goals/RISK-B/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        criterion_ids: ["RISK-B-C1"],
        kind: "test",
        locator: "conversation://rule-owner-confirmation",
        digest: "负责人确认外部规则版本已经冻结。",
        result: "passed",
        idempotency_key: "web-risk-resolution-evidence",
      }),
    });
    const riskEvidenceText = await riskEvidenceResponse.text();
    assert.equal(riskEvidenceResponse.status, 201, riskEvidenceText);
    const riskEvidence = JSON.parse(riskEvidenceText) as { evidence: { evidence_id: string } };

    for (const state of ["triggered", "expired", "open", "resolved"] as const) {
      const stateResponse = await webFetch(`${origin}/api/risks/${encodeURIComponent(created.risk.risk_id)}/state`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          state,
          reason: `用户确认进入 ${state}`,
          ...(state === "resolved"
            ? {
                resolution_basis: {
                  summary: "负责人确认外部规则版本已经冻结。",
                  evidence_refs: [riskEvidence.evidence.evidence_id],
                  residual_gaps: ["下一次规则发布后仍需重新检查"],
                },
              }
            : {}),
          idempotency_key: `web-risk-state-${state}`,
        }),
      });
      assert.equal(stateResponse.status, 200, await stateResponse.text());
    }
    const missingReason = await webFetch(`${origin}/api/risks/${encodeURIComponent(created.risk.risk_id)}/state`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: "resolved", reason: "" }),
    });
    assert.equal(missingReason.status, 400);
    assert.match(await missingReason.text(), /必须说明原因/);

    const updatedPage = await goalPageWithLazyContent(origin, "RISK-B", ["factors"]);
    assert.match(updatedPage, /外部规则已经进入确认窗口/);
    assert.match(updatedPage, /60%/);
    assert.match(updatedPage, /规避 \/ 阻止领取/);
    assert.match(updatedPage, /已解决/);
    assert.match(updatedPage, /解决依据/);
    assert.match(updatedPage, /负责人确认外部规则版本已经冻结/);
    assert.match(updatedPage, new RegExp(riskEvidence.evidence.evidence_id));
    assert.match(updatedPage, /下一次规则发布后仍需重新检查/);
    assert.match(updatedPage, /交付风险工作台/);
    const verify = new SqliteGoalBoardStore(databasePath);
    try {
      assert.deepEqual(
        (verify.db.prepare("SELECT goal_id FROM goal_risks WHERE risk_id = ? ORDER BY goal_id").all(created.risk.risk_id) as Array<{ goal_id: string }>).map((row) => row.goal_id),
        ["RISK-B"],
      );
      const stored = verify.snapshot("risk-workbench-board").risks.find((risk) => risk.risk_id === created.risk.risk_id);
      assert.equal(stored?.description, "外部规则已经进入确认窗口");
      assert.deepEqual(stored?.affected_surfaces, ["Contract", "tests"]);
      assert.equal(stored?.owner, "risk-owner");
      assert.equal(stored?.treatment_plan, "在规则冻结前不接入新的外部字段");
      assert.deepEqual(stored?.resolution_basis, {
        summary: "负责人确认外部规则版本已经冻结。",
        evidence_refs: [riskEvidence.evidence.evidence_id],
        residual_gaps: ["下一次规则发布后仍需重新检查"],
      });
      assert.ok(verify.db.prepare("SELECT 1 FROM events WHERE object_id = ? AND type = 'risk.updated'").get(created.risk.risk_id));
    } finally {
      verify.close();
    }
    const historical = new SqliteGoalBoardStore(databasePath);
    try {
      historical.db
        .prepare("UPDATE risks SET resolution_basis_json = NULL WHERE risk_id = ?")
        .run(created.risk.risk_id);
      const historicalCoordinator = new GoalBoardCoordinator(historical);
      const historicalView = buildGoalBoardWebView(historical, historicalCoordinator, {
        boardId: "risk-workbench-board",
      });
      const historicalPage = renderGoalPanelFragment(historicalView, "RISK-B", "factors") ?? "";
      assert.match(historicalPage, /未记录解决依据（历史数据）/);
    } finally {
      historical.close();
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web maintains Impact facts, access state, deactivation, and retained history", async () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-impact-workbench-"));
  const databasePath = join(directory, "goalboard.db");
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.initializeBoard({
    board_id: "impact-workbench-board",
    title: "Impact Workbench",
    actor_id: "web-user",
    idempotency_key: "impact-workbench-init",
  });
  coordinator.createGoal(
    "impact-workbench-board",
    {
      goal_id: "IMPACT-A",
      title: "维护并发影响面",
      outcome: "Impact Binding 可以持续维护",
      why: "验证并行领取边界",
      business_logic: "用户记录区域和访问方式，停用后保留历史但不再形成门禁。",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [
        {
          criterion_id: "IMPACT-A-C1",
          statement: "Impact 可维护",
          decision_method: "automated_check",
          pass_condition: "页面和接口保存完整 Impact",
          required_evidence: ["test"],
        },
      ],
    },
    { actor_id: "web-user", idempotency_key: "impact-workbench-goal" },
  );
  coordinator.createGoal(
    "impact-workbench-board",
    {
      goal_id: "IMPACT-B",
      title: "另一条 Impact Goal",
      outcome: "用于验证 HTTP 归属边界",
      why: "URL 中的 Goal 必须是新增绑定的唯一归属",
      business_logic: "不能通过请求正文把 Impact 写入另一个 Goal。",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [
        {
          criterion_id: "IMPACT-B-C1",
          statement: "可作为边界验证目标",
          decision_method: "inspection",
          pass_condition: "请求正文不能覆盖 URL Goal",
          required_evidence: ["test"],
        },
      ],
    },
    { actor_id: "web-user", idempotency_key: "impact-workbench-second-goal" },
  );
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId: "impact-workbench-board" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const emptyPage = await goalPageWithLazyContent(origin, "IMPACT-A", ["factors"]);
    assert.match(emptyPage, /data-impact-create-form/);
    assert.match(emptyPage, /name="surface"/);
    for (const access of ["read", "write", "decide", "exclusive"]) {
      assert.match(emptyPage, new RegExp(`option value="${access}"`));
    }
    assert.match(emptyPage, /option value="confirmed"/);
    assert.match(emptyPage, /option value="proposed"/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /并按保存的确认状态参与工作冲突判断/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /旧值和修改说明已进入完整记录/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /不再参与工作冲突判断；原记录和停用原因仍会保留/);
    assert.match(WORKBENCH_STYLES, /\.impact-facts, \.impact-form \{ grid-template-columns: 1fr; \}/);
    assert.match(WORKBENCH_STYLES, /\.impact-form input.*font-size: 16px/);

    const createResponse = await webFetch(`${origin}/api/goals/IMPACT-A/impacts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        goal_id: "IMPACT-B",
        surface: "src/web/render.ts",
        access: "read",
        input_snapshot: "https://example.com/render-contract",
        state: "confirmed",
        reason: "读取当前渲染 Contract",
        idempotency_key: "web-impact-create-complete",
      }),
    });
    const created = (await createResponse.json()) as { binding_id: string };
    assert.equal(createResponse.status, 201, JSON.stringify(created));
    const afterCreate = new SqliteGoalBoardStore(databasePath);
    try {
      const createdImpact = afterCreate.snapshot("impact-workbench-board").impacts.find((impact) => impact.binding_id === created.binding_id);
      assert.equal(createdImpact?.goal_id, "IMPACT-A", "the URL Goal owns a newly created Impact");
    } finally {
      afterCreate.close();
    }

    const populatedPage = await goalPageWithLazyContent(origin, "IMPACT-A", ["factors"]);
    assert.match(populatedPage, /src\/web\/render\.ts/);
    assert.match(populatedPage, /读取当前渲染 Contract/);
    assert.match(populatedPage, /只读取该区域，并已固定输入快照/);
    assert.match(populatedPage, /data-impact-edit-form/);
    assert.match(populatedPage, /data-impact-deactivate-form/);
    assert.match(populatedPage, /href="https:\/\/example\.com\/render-contract"/);

    const updateResponse = await webFetch(`${origin}/api/impacts/${encodeURIComponent(created.binding_id)}/update`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        goal_id: "IMPACT-A",
        surface: "src/domain/goal.ts",
        access: "exclusive",
        input_snapshot: "contract://IMPACT-A",
        state: "proposed",
        reason: "准备独占修改 Goal 领域模型",
        audit_reason: "实际影响范围从读取渲染改为修改领域模型",
        idempotency_key: "web-impact-update-complete",
      }),
    });
    assert.equal(updateResponse.status, 200, await updateResponse.text());
    const proposedPage = await goalPageWithLazyContent(origin, "IMPACT-A", ["factors"]);
    assert.match(proposedPage, /src\/domain\/goal\.ts/);
    assert.match(proposedPage, /独占 \/ 提议中/);
    assert.match(proposedPage, /尚未确认，不会阻止其他工作开始/);

    const missingAuditReason = await webFetch(`${origin}/api/impacts/${encodeURIComponent(created.binding_id)}/update`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        goal_id: "IMPACT-A",
        surface: "src/domain/goal.ts",
        access: "exclusive",
        state: "confirmed",
        reason: "确认独占修改",
        audit_reason: "",
      }),
    });
    assert.equal(missingAuditReason.status, 400);
    assert.match(await missingAuditReason.text(), /必须说明修改原因/);

    const deactivateResponse = await webFetch(`${origin}/api/impacts/${encodeURIComponent(created.binding_id)}/deactivate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reason: "领域修改已迁移到后续 Goal",
        idempotency_key: "web-impact-deactivate-complete",
      }),
    });
    assert.equal(deactivateResponse.status, 200, await deactivateResponse.text());
    const historyPage = await goalPageWithLazyContent(origin, "IMPACT-A", ["factors"]);
    assert.match(historyPage, /已停用记录/);
    assert.match(historyPage, /领域修改已迁移到后续 Goal/);
    assert.match(historyPage, /只作为历史保留，不再参与工作冲突判断/);
    assert.doesNotMatch(historyPage, /data-impact-edit-form data-live-form=/);

    const verify = new SqliteGoalBoardStore(databasePath);
    try {
      const stored = verify.snapshot("impact-workbench-board").impacts.find((impact) => impact.binding_id === created.binding_id);
      assert.equal(stored?.surface, "src/domain/goal.ts");
      assert.equal(stored?.access, "exclusive");
      assert.equal(stored?.input_snapshot, "contract://IMPACT-A");
      assert.equal(stored?.state, "inactive");
      assert.equal(stored?.deactivation_reason, "领域修改已迁移到后续 Goal");
      assert.ok(verify.db.prepare("SELECT 1 FROM events WHERE object_id = ? AND type = 'impact.updated'").get(created.binding_id));
      assert.ok(verify.db.prepare("SELECT 1 FROM events WHERE object_id = ? AND type = 'impact.deactivated'").get(created.binding_id));
    } finally {
      verify.close();
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web edits project and Goal Policy and submits a user-only Human Review", async (context) => {
  const { databasePath, homeDirectory } = webFixture();
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.createGoal(
    DEMO_BOARD_ID,
    {
      goal_id: "POLICY-WEB",
      title: "维护 Runtime 与 Review Policy",
      outcome: "用户可以配置规则并完成最终确认",
      why: "验证 Policy 和 Human Review 的 Web 闭环",
      business_logic: "项目默认提供基线，当前 Goal 只能增加要求，用户 Review 记录最终判断。",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [
        {
          criterion_id: "POLICY-WEB-C1",
          statement: "Policy 与 Review 可以保存",
          decision_method: "automated_check",
          pass_condition: "Web API 和页面均可使用",
          required_evidence: ["test"],
        },
      ],
    },
    { actor_id: "test-user", idempotency_key: "create-policy-web" },
  );
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId: DEMO_BOARD_ID, homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const projectPolicy = await webFetch(`${origin}/api/policy-bindings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scope: "project_default",
        reason: "设置项目默认规则",
        policy: {
          goal_mode: "required",
          required_capabilities: [],
          self_verification: true,
          cross_reviewers: 0,
          adversarial_reviewers: 0,
          human_approval: false,
          max_lease_seconds: 1800,
        },
      }),
    });
    assert.equal(projectPolicy.status, 200, await projectPolicy.text());
    const goalPolicy = await webFetch(`${origin}/api/policy-bindings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scope: "goal",
        goal_id: "POLICY-WEB",
        reason: "当前 Goal 需要独立验证和用户最终确认",
        policy: {
          goal_mode: "required",
          required_capabilities: ["browser"],
          self_verification: true,
          cross_reviewers: 1,
          adversarial_reviewers: 1,
          human_approval: true,
          max_lease_seconds: 900,
        },
      }),
    });
    assert.equal(goalPolicy.status, 200, await goalPolicy.text());

    const runtimeStore = new SqliteGoalBoardStore(databasePath);
    const runtimeCoordinator = new GoalBoardCoordinator(runtimeStore);
    const claim = runtimeCoordinator.claimGoal({
      board_id: DEMO_BOARD_ID,
      goal_id: "POLICY-WEB",
      actor_id: "runtime-policy-web",
      role: "executor",
      capabilities: ["browser"],
      goal_mode_attestation: true,
      idempotency_key: "claim-policy-web",
    }).claim;
    assert.ok(claim);
    const run = runtimeCoordinator.startRun({
      board_id: DEMO_BOARD_ID,
      goal_id: "POLICY-WEB",
      claim_id: claim.claim_id,
      actor_id: "runtime-policy-web",
      contract_cursor: runtimeStore.eventCursor(DEMO_BOARD_ID),
      idempotency_key: "run-policy-web",
    }).run;
    const evidence = runtimeCoordinator.submitEvidence({
      board_id: DEMO_BOARD_ID,
      goal_id: "POLICY-WEB",
      actor_id: "runtime-policy-web",
      criterion_ids: ["POLICY-WEB-C1"],
      run_id: run.run_id,
      kind: "test",
      locator: "tests/web.test.ts#policy-review",
      result: "passed",
      idempotency_key: "evidence-policy-web",
    }).evidence;
    runtimeCoordinator.reportRun({
      board_id: DEMO_BOARD_ID,
      run_id: run.run_id,
      actor_id: "runtime-policy-web",
      state: "completed",
      idempotency_key: "run-policy-web-completed",
    });
    const handoffPage = await (await webFetch(`${origin}/goals/POLICY-WEB`)).text();
    assert.match(handoffPage, /goal-status--continue[^>]*[\s\S]*?<span>可继续<\/span>/);
    assert.match(handoffPage, /<strong>开始复核<\/strong>/);
    assert.equal(
      runtimeStore.snapshot(DEMO_BOARD_ID).claims.find((item) => item.claim_id === claim.claim_id)?.state,
      "released",
    );
    assert.doesNotMatch(handoffPage, /goalboard_v1_release/);
    assert.doesNotMatch(handoffPage, /这个 Claim 没有未结束的 Run/);
    assert.doesNotMatch(handoffPage, /由领取 Runtime 启动 Run/);
    const runtimeObligations = runtimeStore.snapshot(DEMO_BOARD_ID).review_obligations.filter(
      (item) => item.goal_id === "POLICY-WEB" && item.role !== "human_approver",
    );
    for (const [index, runtimeObligation] of runtimeObligations.entries()) {
      const projection = runtimeCoordinator.getGoalActionProjection({ board_id: DEMO_BOARD_ID, goal_id: "POLICY-WEB" });
      const reviewAction = projection.actions.find((action) => action.target_id === runtimeObligation.obligation_id);
      assert.ok(reviewAction);
      const reviewerId = `runtime-policy-reviewer-${index}`;
      runtimeCoordinator.selectGoalAndStart({
        board_id: DEMO_BOARD_ID,
        goal_id: "POLICY-WEB",
        actor_id: reviewerId,
        role: runtimeObligation.role,
        action_id: reviewAction.action_id,
        action_token: projection.action_token,
        idempotency_key: `policy-review-select-${index}`,
      });
      runtimeCoordinator.submitReview({
        board_id: DEMO_BOARD_ID,
        goal_id: "POLICY-WEB",
        obligation_id: runtimeObligation.obligation_id,
        actor_id: reviewerId,
        actor_kind: "runtime",
        verdict: "pass",
        evidence_refs: [evidence.evidence_id],
        reasoning: `第 ${index + 1} 项 Runtime 复核通过`,
        contract_revision: projection.contract_revision,
        idempotency_key: `policy-review-submit-${index}`,
      });
    }
    const obligation = runtimeStore
      .snapshot(DEMO_BOARD_ID)
      .review_obligations.find(
        (item) => item.goal_id === "POLICY-WEB" && item.role === "human_approver",
      );
    assert.ok(obligation);
    runtimeStore.close();

    const boardRisk = await webFetch(`${origin}/api/goals/POLICY-WEB/risks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        goal_ids: ["POLICY-WEB", "CORE"],
        description: "共享规则需要用户决定，但不应抢走具体 Goal 的深链焦点",
        probability: "low",
        impact: "low",
        affected_surfaces: ["Decision Center"],
        trigger: "用户打开待决定页面",
        treatment: "accept",
        treatment_plan: "保留为独立的项目级待决定事项",
        blocking_mode: "none",
        revisit_condition: "规则发生变化",
        owner: "product-owner",
        reason: "制造一个比目标 Goal 更新的项目级 Inbox 项，验证深链不会默认停在第一项",
        idempotency_key: "policy-web-cross-goal-risk",
      }),
    });
    assert.equal(boardRisk.status, 201, await boardRisk.text());

    const page = await goalPageWithLazyContent(origin, "POLICY-WEB", ["factors"]);
    assert.match(page, /当前最终生效规则/);
    assert.match(page, /项目默认规则/);
    assert.match(page, /当前 Goal 额外规则/);
    assert.doesNotMatch(page, /EFFECTIVE POLICY/);
    assert.match(page, /class="policy-effective"/);
    assert.match(page, /aria-label="工作规则继承关系"/);
    assert.doesNotMatch(page, /PROJECT DEFAULT/);
    assert.match(page, /GOAL OVERRIDE/);
    assert.doesNotMatch(page, /data-live-form="policy-project_default-POLICY-WEB"/);
    assert.match(page, /data-live-form="policy-goal-POLICY-WEB"/);
    assert.doesNotMatch(page, /policy-source policy-source--project/);
    assert.match(page, /policy-source policy-source--goal/);
    assert.match(page, /项目默认规则在项目设置中维护/);
    assert.match(page, /name="goal_mode" value="required" checked/);
    assert.match(page, /name="goal_mode" value="disabled" disabled/);
    assert.match(page, /name="goal_mode" value="preferred" disabled/);
    assert.doesNotMatch(page, /<select name="goal_mode"/);
    assert.match(page, /执行者自我验证/);
    assert.match(page, /用户最终确认/);
    assert.match(page, /name="self_verification" checked disabled/);
    assert.match(page, /低于项目共同规则，不能选择/);
    assert.match(page, /name="cross_reviewers"/);
    assert.match(page, /name="adversarial_reviewers"/);
    assert.match(page, /name="max_lease_seconds"[^>]*max="1800"[^>]*data-policy-max="1800"/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /最终生效：按 Goal 工作/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /const loadGoalDocument = async \(goalId\) =>/);
    assert.match(
      WORKBENCH_CLIENT_SCRIPT,
      /const paneHeader = goalSurface \? null : documentPane\.querySelector\(":scope > \.desktop-pane-header"\)/,
    );
    assert.match(WORKBENCH_CLIENT_SCRIPT, /documentPane\.replaceChildren\(\.\.\.\(paneHeader \? \[paneHeader, nextView\] : \[nextView\]\)\)/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /\/api\/goals\/" \+ encodeURIComponent\(goalId\) \+ "\/document\?view=/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /\/api\/goals\/" \+ encodeURIComponent\(goalId\) \+ "\/records\?view=/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /\/record-events\?view=" \+ documentCollection \+ "&offset=" \+ offset/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /goalDocumentRequest\?\.abort\(\)/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /goalRecordsRequest\?\.abort\(\)/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /\{ cache: "no-store", signal: controller\.signal \}/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /isAbortError\(error\) \|\| goalDocumentRequest !== controller/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /if \(goalRecordsRequest === controller\)/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /if \(workspace\.dataset\.workspaceMode === "graph"\) void loadGoalGraph\(true\)/);
    assert.match(
      WORKBENCH_CLIENT_SCRIPT,
      /ensureWorkTab\(goalId\);\s+document\.dispatchEvent\(new CustomEvent\("goalboard:goal-document-loaded"/,
    );
    assert.match(WORKBENCH_CLIENT_SCRIPT, /history\.replaceState\(\{ \.\.\.initialHistoryState, goalId: selected \}/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /event\.state\?\.goalId \|\| state\.active_goal_id/);
    assert.doesNotMatch(WORKBENCH_CLIENT_SCRIPT, /documentPane\.innerHTML = nextDocument\.innerHTML/);
    assert.match(WORKBENCH_STYLES, /policy-mode-options, \.policy-control--split, \.policy-toggle-list, \.policy-review-counts \{ grid-template-columns: 1fr; \}/);
    assert.match(page, /value="browser"/);
    assert.match(page, /href="\/decisions#decision-goal-POLICY-WEB"/);
    assert.match(page, /href="\/decisions#decision-goal-POLICY-WEB"/);
    assert.doesNotMatch(workSurfaceHtml(page, "goal"), /<form class="human-review-form"/);
    const policyRecords = await (
      await webFetch(`${origin}/api/goals/POLICY-WEB/records?view=current`)
    ).text();
    assert.match(policyRecords, new RegExp(evidence.evidence_id));
    assert.match(page, /data-directory-open="feed"[^>]*data-work-surface-open="feed"[^>]*data-feed-preset="inbox_message"/);
    assert.doesNotMatch(page, /class="project-decisions|class="navigator-project-meta"/);
    assert.match(page, /class="tree-chrome"/);

    const reviewDecisionPage = await (await webFetch(`${origin}/decisions`)).text();
    assert.match(reviewDecisionPage, /等待你的决定/);
    assert.match(reviewDecisionPage, /维护 Runtime 与 Review Policy/);
    assert.match(reviewDecisionPage, /确认工作结果/);
    assert.match(reviewDecisionPage, /<form class="human-review-form"/);
    assert.match(reviewDecisionPage, /<option value="" selected disabled>请选择结论<\/option>/);
    assert.match(reviewDecisionPage, /<option value="pass">通过<\/option>/);
    assert.match(reviewDecisionPage, /<option value="needs_changes">需要修改<\/option>/);
    assert.match(reviewDecisionPage, new RegExp(evidence.evidence_id));
    assert.match(reviewDecisionPage, /拿当前完成标准和依据来说/);
    assert.match(reviewDecisionPage, /完成标准「Policy 与 Review 可以保存」已有一条通过依据「tests\/web\.test\.ts#policy-review」/);
    assert.match(reviewDecisionPage, /这份记录支持该标准，但不等于你已经确认通过/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /requireDecisionText\(reviewForm, errorBox, "verdict", "请先选择结论。"\)/);
    assert.match(reviewDecisionPage, /如果选择通过[\s\S]*GoalBoard 会立即再核对全部门槛[\s\S]*Goal「维护 Runtime 与 Review Policy」才会完成/);
    assert.match(reviewDecisionPage, /如果需要修改或依据不足[\s\S]*两种情况都不会完成这条 Goal/);
    assert.match(reviewDecisionPage, /human-review-list[\s\S]*<section class="decision-scenario"[\s\S]*<details class="decision-details"/);
    assert.doesNotMatch(reviewDecisionPage, /已找到当前对话中的明确验收/);
    assert.doesNotMatch(reviewDecisionPage, /conversation:\/\/policy-web\/current-user-message/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /const revealDeepLinkTarget = \(target\) =>/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /disclosure\.open = true/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /scrollTarget = decisionDetail\.querySelector\([\s\S]*data-human-review-form/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /deepLinkScrollTarget\.scrollIntoView/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /const deepLinkTargetFromId = \(targetId\) =>/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /const itemId = "decision:" \+ goalId/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /const revealDeepLinkFromId = async \(targetId/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /await ensureFeedWorkbenchLoaded\(\)/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /scrollTarget\.focus\(\{ preventScroll: true \}\)/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /if \(!restoredUi && initialHashTargetId\) void revealDeepLinkFromId/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /sessionStorage\.setItem\("goalboard-decision-receipt"/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /await refreshBoardWithDecisionReceipt\(receiptMessage, receiptContext\)/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /sessionStorage\.getItem\("goalboard-decision-receipt"\)/);
    assert.match(WORKBENCH_CLIENT_SCRIPT, /showDecisionReceipt\(storedDecisionReceipt\.message/);

    const deepLinkState = await readDecisionDeepLinkBrowserState(
      reviewDecisionPage,
      "POLICY-WEB",
    );
    if (!deepLinkState) return context.skip("Headless Chrome is unavailable");
    assert.equal(deepLinkState.selectedEntryId, "decision:POLICY-WEB");
    assert.equal(deepLinkState.targetDetailHidden, false);
    assert.equal(deepLinkState.formVisible, true);
    assert.equal(deepLinkState.submitVisible, true);
    assert.equal(deepLinkState.formFocused, true);

    const recoveredDeepLinkState = await readDecisionDeepLinkBrowserState(
      reviewDecisionPage,
      "POLICY-WEB",
      { scenario: "after_feed_switch" },
    );
    assert.ok(recoveredDeepLinkState);
    assert.equal(recoveredDeepLinkState.selectedEntryId, "decision:POLICY-WEB");
    assert.equal(recoveredDeepLinkState.targetDetailHidden, false);
    assert.equal(recoveredDeepLinkState.formVisible, true);
    assert.equal(recoveredDeepLinkState.searchValue, "");

    const mobileDeepLinkState = await readDecisionDeepLinkBrowserState(
      reviewDecisionPage,
      "POLICY-WEB",
      { width: 720, scenario: "restored_mobile_tree" },
    );
    assert.ok(mobileDeepLinkState);
    assert.equal(mobileDeepLinkState.mobileView, "document");
    assert.equal(mobileDeepLinkState.formVisible, true);

    const missingReason = await webFetch(
      `${origin}/api/goals/POLICY-WEB/review-obligations/${obligation.obligation_id}/review`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ verdict: "pass", evidence_refs: [evidence.evidence_id] }),
      },
    );
    assert.equal(missingReason.status, 400);
    assert.match(await missingReason.text(), /对话验收必须保留用户原话/);

    const decisionStore = new SqliteGoalBoardStore(databasePath);
    const decisionCoordinator = new GoalBoardCoordinator(decisionStore);
    const decisionProjection = decisionCoordinator.getGoalActionProjection({
      board_id: DEMO_BOARD_ID,
      goal_id: "POLICY-WEB",
    });
    const attentionToken = String(
      decisionProjection.actions.find((action) => action.target_id === obligation.obligation_id)
        ?.reasons[0]?.facts?.attention_token ?? "",
    );
    decisionStore.close();
    assert.match(attentionToken, /^attention-/);

    const reviewed = await webFetch(
      `${origin}/api/goals/POLICY-WEB/review-obligations/${obligation.obligation_id}/review`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          verdict: "needs_changes",
          reasoning: "测试已通过，但人工检查发现说明文案仍需修改",
          attention_token: attentionToken,
        }),
      },
    );
    assert.equal(reviewed.status, 200, await reviewed.text());
    const verifiedStore = new SqliteGoalBoardStore(databasePath);
    const savedReview = verifiedStore
      .snapshot(DEMO_BOARD_ID)
      .reviews.find((item) => item.obligation_id === obligation.obligation_id);
    assert.equal(savedReview?.actor_id, "web-user");
    assert.equal(savedReview?.verdict, "needs_changes");
    assert.equal(savedReview?.evidence_refs.length, 1);
    const savedHumanEvidence = verifiedStore.snapshot(DEMO_BOARD_ID).evidence.find(
      (item) => item.evidence_id === savedReview?.evidence_refs[0],
    );
    assert.equal(savedHumanEvidence?.kind, "human_verdict");
    assert.equal(savedHumanEvidence?.review_id, savedReview?.review_id);
    verifiedStore.close();
    const reviewResultPage = await (await webFetch(`${origin}/decisions`)).text();
    assert.match(reviewResultPage, /最近处理结果/);
    assert.match(reviewResultPage, /结果确认/);
    assert.match(reviewResultPage, /需要修改/);
    assert.match(reviewResultPage, /本次结果没有确认通过/);
    assert.match(reviewResultPage, /测试已通过，但人工检查发现说明文案仍需修改/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web result confirmation names the criterion that still lacks passing evidence", async () => {
  const { databasePath } = webFixture();
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.createGoal(
    DEMO_BOARD_ID,
    {
      goal_id: "REVIEW-NO-EVIDENCE",
      title: "让没有依据的结果不会被误判为完成",
      outcome: "用户能看出当前还缺哪条完成依据",
      why: "结果确认不能把 Runtime 的提交冒充用户结论",
      business_logic: "工作结果提交后，用户对照完成标准和依据作出判断；没有通过依据时继续等待补充。",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [
        {
          criterion_id: "REVIEW-NO-EVIDENCE-C1",
          statement: "用户能看到保存后的实际结果",
          decision_method: "inspection",
          pass_condition: "页面显示保存回执和结果去向",
        },
      ],
    },
    { actor_id: "test-user", idempotency_key: "create-review-no-evidence" },
  );
  coordinator.setPolicy(
    DEMO_BOARD_ID,
    {
      goal_id: "REVIEW-NO-EVIDENCE",
      policy: {
        goal_mode: "preferred",
        required_capabilities: [],
        self_verification: true,
        cross_reviewers: 0,
        adversarial_reviewers: 0,
        human_approval: true,
        max_lease_seconds: 1800,
      },
      reason: "验证没有通过依据时的结果确认说明",
    },
    { actor_id: "test-user", idempotency_key: "policy-review-no-evidence" },
  );
  const claim = coordinator.claimGoal({
    board_id: DEMO_BOARD_ID,
    goal_id: "REVIEW-NO-EVIDENCE",
    actor_id: "runtime-no-evidence",
    role: "executor",
    goal_mode_attestation: true,
    idempotency_key: "claim-review-no-evidence",
  }).claim;
  assert.ok(claim);
  const run = coordinator.startRun({
    board_id: DEMO_BOARD_ID,
    goal_id: "REVIEW-NO-EVIDENCE",
    claim_id: claim.claim_id,
    actor_id: "runtime-no-evidence",
    contract_cursor: store.eventCursor(DEMO_BOARD_ID),
    idempotency_key: "run-review-no-evidence",
  }).run;
  coordinator.reportRun({
    board_id: DEMO_BOARD_ID,
    run_id: run.run_id,
    actor_id: "runtime-no-evidence",
    state: "completed",
    idempotency_key: "complete-run-review-no-evidence",
  });
  coordinator.releaseClaim({
    board_id: DEMO_BOARD_ID,
    claim_id: claim.claim_id,
    actor_id: "runtime-no-evidence",
    reason: "等待用户检查结果",
    idempotency_key: "release-review-no-evidence",
  });
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId: DEMO_BOARD_ID });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const decisionsPage = await (await webFetch(`${origin}/decisions`)).text();
    assert.doesNotMatch(decisionsPage, /decision:REVIEW-NO-EVIDENCE/);
    const goalPage = await (await webFetch(`${origin}/goals/REVIEW-NO-EVIDENCE`)).text();
    assert.match(goalPage, /goal-status--continue[^>]*[\s\S]*?<span>可继续<\/span>/);
    assert.match(goalPage, /<strong>补齐完成依据<\/strong>/);
    assert.match(goalPage, /执行已经完成，还需要补齐完成依据/);
    assert.doesNotMatch(goalPage, /<form class="human-review-form"/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web records manual Evidence, safely opens project references, and exposes its full event ledger", async () => {
  const directory = mkdtempSync(join(tmpdir(), "goalboard-web-evidence-"));
  const databasePath = join(directory, "goalboard.db");
  const projectRoot = join(directory, "project");
  const notesDirectory = join(projectRoot, "notes");
  mkdirSync(notesDirectory, { recursive: true });
  writeFileSync(join(notesDirectory, "evidence.txt"), "用户手工检查：页面可以记录并打开人工 Evidence。\n");
  writeFileSync(join(notesDirectory, "binary.bin"), Buffer.from([0, 1, 2]));
  writeFileSync(join(notesDirectory, "large.txt"), "x".repeat(512 * 1024 + 1));
  writeFileSync(join(directory, "outside.txt"), "这个文件不属于项目引用根目录。\n");
  symlinkSync(join(directory, "outside.txt"), join(notesDirectory, "outside-link.txt"));
  seedDemoBoard(databasePath);
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.createGoal(
    DEMO_BOARD_ID,
    {
      goal_id: "EVIDENCE-WEB",
      title: "用户可以提交人工 Evidence",
      outcome: "人工验收事实和 Runtime Evidence 使用同一完成门禁",
      why: "用户需要记录自己验证过的事实，而不是通过伪造 Runtime Run 来绕过模型。",
      business_logic: "Web 只提交 Evidence 事实；GoalBoard 仍依据相同 Criterion、Review 和完成规则判断状态。",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [
        {
          criterion_id: "EVIDENCE-WEB-C1",
          statement: "人工 Evidence 可以被记录并回看",
          decision_method: "inspection",
          pass_condition: "用户能在页面提交 Evidence，并从记录打开安全的项目内文本引用",
          required_evidence: ["attestation"],
        },
      ],
    },
    { actor_id: "test-user", idempotency_key: "create-evidence-web" },
  );
  coordinator.addRelation(
    DEMO_BOARD_ID,
    {
      from_goal_id: "EVIDENCE-WEB",
      to_goal_id: "CORE",
      type: "extends",
      reason: "人工 Evidence 使用既有的同一完成门禁",
    },
    { actor_id: "test-user", idempotency_key: "evidence-web-relation" },
  );
  coordinator.addRisk(
    DEMO_BOARD_ID,
    {
      risk_id: "RISK-EVIDENCE-WEB",
      goal_ids: ["EVIDENCE-WEB"],
      description: "项目外文件不能经 Evidence 引用暴露",
      probability: "low",
      impact: "high",
      affected_surfaces: ["Evidence 引用"],
      trigger: "定位引用包含跳出项目目录的路径",
      treatment: "mitigate",
      blocking_mode: "none",
      revisit_condition: "新增引用协议时重新检查路径边界",
      owner: "test-user",
    },
    { actor_id: "test-user", idempotency_key: "evidence-web-risk" },
  );
  coordinator.setPolicy(
    DEMO_BOARD_ID,
    {
      goal_id: "EVIDENCE-WEB",
      policy: { goal_mode: "preferred", self_verification: true },
      reason: "人工 Evidence 不替代现有验证规则",
    },
    { actor_id: "test-user", idempotency_key: "evidence-web-policy" },
  );
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId: DEMO_BOARD_ID, projectRoot });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const beforeSubmit = await goalPageWithLazyContent(origin, "EVIDENCE-WEB", [], true);
    assert.match(beforeSubmit, /data-evidence-form/);
    assert.match(beforeSubmit, /保存完成依据/);
    assert.match(beforeSubmit, /data-goal-records-content data-loaded="false"/);
    assert.doesNotMatch(beforeSubmit, /完整事件账本/);
    const recordsBeforeSubmit = await (
      await webFetch(`${origin}/api/goals/EVIDENCE-WEB/records?view=current`)
    ).text();
    assert.match(recordsBeforeSubmit, /完整事件账本/);

    const missingCriterion = await webFetch(`${origin}/api/goals/EVIDENCE-WEB/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "attestation", result: "passed", locator: "notes/evidence.txt" }),
    });
    assert.equal(missingCriterion.status, 400);
    assert.match(await missingCriterion.text(), /至少选择一条验收条件/);

    const submitted = await webFetch(`${origin}/api/goals/EVIDENCE-WEB/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        criterion_ids: ["EVIDENCE-WEB-C1"],
        kind: "attestation",
        result: "passed",
        locator: "notes/evidence.txt",
        digest: "用户在页面中完成检查，并留下可复核的项目内引用。",
      }),
    });
    assert.equal(submitted.status, 201, await submitted.clone().text());
    const submittedResult = (await submitted.json()) as {
      evidence: { evidence_id: string; producer_actor_id: string; run_id: string | null };
    };
    assert.equal(submittedResult.evidence.producer_actor_id, "web-user");
    assert.equal(submittedResult.evidence.run_id, null);

    const externalEvidence = await webFetch(`${origin}/api/goals/EVIDENCE-WEB/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        criterion_ids: ["EVIDENCE-WEB-C1"],
        kind: "inspection",
        result: "passed",
        locator: "https://example.com/manual-evidence",
      }),
    });
    assert.equal(externalEvidence.status, 201, await externalEvidence.clone().text());
    const externalResult = (await externalEvidence.json()) as { evidence: { evidence_id: string } };

    const externalLocalEvidence = await webFetch(`${origin}/api/goals/EVIDENCE-WEB/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        criterion_ids: ["EVIDENCE-WEB-C1"],
        kind: "artifact",
        result: "inconclusive",
        locator: "file:///private/goalboard-casebook/local-artifact.md",
        digest: "sha256:consumer-supplied-external-local-digest",
      }),
    });
    assert.equal(externalLocalEvidence.status, 201, await externalLocalEvidence.clone().text());
    const externalLocalResult = (await externalLocalEvidence.json()) as {
      evidence: {
        evidence_id: string;
        locator_status: string;
        locator_validation_reason: string;
        digest: string | null;
      };
    };
    assert.equal(externalLocalResult.evidence.locator_status, "unverified");
    assert.equal(externalLocalResult.evidence.digest, "sha256:consumer-supplied-external-local-digest");
    assert.match(externalLocalResult.evidence.locator_validation_reason, /不会读取或确认文件存在/);

    const largeEvidence = await webFetch(`${origin}/api/goals/EVIDENCE-WEB/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        criterion_ids: ["EVIDENCE-WEB-C1"],
        kind: "artifact",
        result: "inconclusive",
        locator: "project://notes/large.txt",
        digest: "sha256:consumer-supplied-large-file-digest",
      }),
    });
    assert.equal(largeEvidence.status, 201, await largeEvidence.clone().text());
    const largeResult = (await largeEvidence.json()) as {
      evidence: {
        evidence_id: string;
        locator_status: string;
        locator_validation_reason: string;
        digest: string | null;
      };
    };
    assert.equal(largeResult.evidence.locator_status, "unverified");
    assert.equal(largeResult.evidence.digest, "sha256:consumer-supplied-large-file-digest");
    assert.match(largeResult.evidence.locator_validation_reason, /512 KiB/);
    assert.match(largeResult.evidence.locator_validation_reason, /内容未全文预检/);

    const correctionStore = new SqliteGoalBoardStore(databasePath);
    const correctionCoordinator = new GoalBoardCoordinator(correctionStore);
    correctionCoordinator.correctEvidence({
      board_id: DEMO_BOARD_ID,
      goal_id: "EVIDENCE-WEB",
      actor_id: "web-user",
      target_evidence_id: submittedResult.evidence.evidence_id,
      action: "supersede",
      replacement_evidence_id: externalResult.evidence.evidence_id,
      reason: "项目内 locator 已失效，使用仍可访问的外部检查记录替代。",
      idempotency_key: "evidence-web-supersede",
    });
    correctionStore.close();

    const board = (await (await webFetch(`${origin}/api/board`)).json()) as {
      goals: Array<{
        goal: { goal_id: string };
        evidence: Array<{
          evidence_id: string;
          lifecycle_state: string;
          locator_status: string;
          locator_validation_reason: string;
        }>;
        passed_criteria: string[];
        events: Array<{ type: string }>;
      }>;
    };
    const evidenceGoal = board.goals.find((item) => item.goal.goal_id === "EVIDENCE-WEB");
    assert.ok(evidenceGoal);
    assert.ok(evidenceGoal.evidence.some((item) => item.evidence_id === submittedResult.evidence.evidence_id));
    assert.equal(
      evidenceGoal.evidence.find((item) => item.evidence_id === submittedResult.evidence.evidence_id)?.lifecycle_state,
      "superseded",
    );
    assert.equal(
      evidenceGoal.evidence.find((item) => item.evidence_id === submittedResult.evidence.evidence_id)?.locator_status,
      "verified",
    );
    assert.equal(
      evidenceGoal.evidence.find((item) => item.evidence_id === externalResult.evidence.evidence_id)?.locator_status,
      "unverified",
    );
    assert.deepEqual(evidenceGoal.passed_criteria, ["EVIDENCE-WEB-C1"]);
    for (const type of ["evidence.submitted", "risk.created", "relation.added", "policy.added"]) {
      assert.ok(evidenceGoal.events.some((event) => event.type === type), `missing ${type}`);
    }

    const goalPage = await (await webFetch(`${origin}/goals/EVIDENCE-WEB`)).text();
    assert.doesNotMatch(goalPage, /完整事件账本/);
    const goalRecords = await (
      await webFetch(`${origin}/api/goals/EVIDENCE-WEB/records?view=current`)
    ).text();
    assert.match(goalRecords, new RegExp(submittedResult.evidence.evidence_id));
    assert.match(goalRecords, /已被替代/);
    assert.match(goalRecords, /项目内 locator 已失效/);
    assert.match(goalRecords, new RegExp(externalResult.evidence.evidence_id));
    assert.match(goalRecords, /已验证/);
    assert.match(goalRecords, /UNVERIFIED/);
    assert.match(goalRecords, /不会发起网络请求/);
    assert.match(goalRecords, new RegExp(externalLocalResult.evidence.evidence_id));
    assert.match(goalRecords, /file:\/\/\/private\/goalboard-casebook\/local-artifact\.md/);
    assert.match(goalRecords, /机器本地 locator/);
    assert.doesNotMatch(goalRecords, /href="file:/);
    assert.ok(
      !goalRecords.includes(`/api/project-references/${encodeURIComponent("file:///private/goalboard-casebook/local-artifact.md")}?evidence_id=${externalLocalResult.evidence.evidence_id}`),
      "an external local locator must never render as an openable project reference",
    );
    assert.match(goalRecords, new RegExp(largeResult.evidence.evidence_id));
    assert.match(goalRecords, /文件路径已确认/);
    assert.match(goalRecords, /内容未全文预检/);
    assert.ok(
      !goalRecords.includes(`/api/project-references/${encodeURIComponent("project://notes/large.txt")}?evidence_id=${largeResult.evidence.evidence_id}`),
      "a large unverified artifact must not render as an openable project reference",
    );
    assert.match(
      goalRecords,
      new RegExp(`href="/api/project-references/notes%2Fevidence\\.txt\\?evidence_id=${submittedResult.evidence.evidence_id}"`),
    );
    assert.match(goalRecords, /data-project-reference/);
    assert.match(goalRecords, /href="https:\/\/example\.com\/manual-evidence"/);
    assert.match(goalRecords, /evidence\.submitted/);
    assert.match(goalRecords, /risk\.created/);
    assert.match(goalRecords, /relation\.added/);
    assert.match(goalRecords, /policy\.added/);

    const opened = await webFetch(
      `${origin}/api/project-references/${encodeURIComponent("notes/evidence.txt")}?evidence_id=${submittedResult.evidence.evidence_id}`,
    );
    assert.equal(opened.status, 200, await opened.clone().text());
    assert.match(opened.headers.get("content-type") ?? "", /text\/plain/);
    assert.match(await opened.text(), /用户手工检查/);

    const largeEvidenceOpen = await webFetch(
      `${origin}/api/project-references/${encodeURIComponent("project://notes/large.txt")}?evidence_id=${largeResult.evidence.evidence_id}`,
    );
    assert.equal(largeEvidenceOpen.status, 409);
    assert.match(await largeEvidenceOpen.text(), /只有已验证的项目内 Evidence 引用可以直接打开/);

    const escaped = await webFetch(`${origin}/api/project-references/${encodeURIComponent("project://../outside.txt")}`);
    assert.equal(escaped.status, 400);
    assert.match(await escaped.text(), /不能跳出项目目录/);
    const absolute = await webFetch(`${origin}/api/project-references/${encodeURIComponent("project:///etc/passwd")}`);
    assert.equal(absolute.status, 400);
    assert.match(await absolute.text(), /必须是相对路径/);
    const directoryReference = await webFetch(`${origin}/api/project-references/${encodeURIComponent("notes")}`);
    assert.equal(directoryReference.status, 400);
    assert.match(await directoryReference.text(), /普通文件/);
    const symlinkEscape = await webFetch(`${origin}/api/project-references/${encodeURIComponent("notes/outside-link.txt")}`);
    assert.equal(symlinkEscape.status, 400);
    assert.match(await symlinkEscape.text(), /不能通过链接跳出项目目录/);
    const binary = await webFetch(`${origin}/api/project-references/${encodeURIComponent("notes/binary.bin")}`);
    assert.equal(binary.status, 415);
    assert.match(await binary.text(), /文本引用/);
    const large = await webFetch(`${origin}/api/project-references/${encodeURIComponent("notes/large.txt")}`);
    assert.equal(large.status, 413);
    assert.match(await large.text(), /文件过大/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web opens a verified Evidence locator from its recorded Runtime workspace, not an arbitrary project membership", async () => {
  const fixture = await webProjectCatalogFixture();
  const sourceWorkspace = join(fixture.homeDirectory, "source-workspace");
  const unrelatedWorkspace = join(fixture.homeDirectory, "newer-unrelated-workspace");
  mkdirSync(sourceWorkspace, { recursive: true });
  mkdirSync(unrelatedWorkspace, { recursive: true });
  writeFileSync(join(sourceWorkspace, "contract.md"), "# Correct source\n\nRuntime verified this file.\n");
  writeFileSync(join(unrelatedWorkspace, "contract.md"), "# Wrong source\n\nWeb must not open this file.\n");

  const sourceContext = {
    runtime_id: "codex",
    stable_work_context_id: "locator-source-session",
    host_declares_stable: true,
    workspace: { canonical_path: sourceWorkspace, realpath_verified: true },
  };
  const unrelatedContext = {
    runtime_id: "codex",
    stable_work_context_id: "locator-unrelated-session",
    host_declares_stable: true,
    workspace: { canonical_path: unrelatedWorkspace, realpath_verified: true },
  };
  const catalog = await GoalBoardProjectCatalog.open({ homeDirectory: fixture.homeDirectory });
  try {
    catalog.bindRuntimeContext({
      context: sourceContext,
      project_id: fixture.alpha.project_id,
      actor_id: "runtime-codex",
      user_confirmed: true,
    });
    catalog.bindRuntimeContext({
      context: unrelatedContext,
      project_id: fixture.alpha.project_id,
      actor_id: "runtime-codex",
      user_confirmed: true,
    });
  } finally {
    catalog.close();
  }

  const store = new SqliteGoalBoardStore(fixture.alpha.database_path);
  let evidenceId: string;
  try {
    const coordinator = new GoalBoardCoordinator(store);
    coordinator.createGoal(
      fixture.alpha.board_id,
      {
        goal_id: "LOCATOR-WORKSPACE",
        title: "从原始 Runtime 工作区打开 Evidence",
        outcome: "Web 使用提交 Evidence 时记录的工作区身份",
        why: "同一项目可关联多个工作区，不能任意选择另一个目录。",
        business_logic: "工作区身份是不透明路由信息，不向浏览器暴露文件系统路径。",
        definition_state: "accepted",
        decomposition_state: "closed_leaf",
        acceptance_criteria: [{
          criterion_id: "LOCATOR-WORKSPACE-C1",
          statement: "打开原始工作区中的文件",
          decision_method: "inspection",
          pass_condition: "内容来自提交 Evidence 的 Runtime 工作区",
          required_evidence: ["artifact"],
        }],
      },
      { actor_id: "test-user", idempotency_key: "locator-workspace-goal" },
    );
    const normalized = normalizeRuntimeWorkContext(sourceContext);
    assert.ok(normalized.workspace);
    evidenceId = coordinator.submitEvidence({
      board_id: fixture.alpha.board_id,
      goal_id: "LOCATOR-WORKSPACE",
      actor_id: "runtime-codex",
      criterion_ids: ["LOCATOR-WORKSPACE-C1"],
      kind: "artifact",
      locator: "project://contract.md",
      result: "passed",
      locator_context: {
        project_root: sourceWorkspace,
        workspace_id: normalized.workspace.workspace_id,
      },
      idempotency_key: "locator-workspace-evidence",
    }).evidence.evidence_id;
  } finally {
    store.close();
  }

  const server = createGoalBoardWebServer({ homeDirectory: fixture.homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const prefix = `/projects/${encodeURIComponent(fixture.alpha.project_id)}`;
    const records = await (
      await webFetch(`${origin}${prefix}/api/goals/LOCATOR-WORKSPACE/records?view=current`)
    ).text();
    assert.match(records, new RegExp(`evidence_id=${evidenceId}`));
    const opened = await webFetch(
      `${origin}${prefix}/api/project-references/${encodeURIComponent("project://contract.md")}?evidence_id=${evidenceId}`,
    );
    assert.equal(opened.status, 200, await opened.clone().text());
    const content = await opened.text();
    assert.match(content, /Correct source/);
    assert.doesNotMatch(content, /Wrong source/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web opens verified Evidence from the recorded root of a registered Git worktree", async () => {
  const fixture = await webProjectCatalogFixture();
  const repositoryRoot = join(fixture.homeDirectory, "canonical-repository");
  const worktreeRoot = join(fixture.homeDirectory, "isolated-worktree");
  mkdirSync(repositoryRoot, { recursive: true });
  const git = (args: string[]) => {
    const result = spawnSync("git", args, { encoding: "utf8" });
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  };
  git(["-C", repositoryRoot, "init"]);
  git(["-C", repositoryRoot, "config", "user.name", "GoalBoard Test"]);
  git(["-C", repositoryRoot, "config", "user.email", "goalboard-test@example.invalid"]);
  writeFileSync(join(repositoryRoot, "README.md"), "# Canonical repository\n");
  git(["-C", repositoryRoot, "add", "README.md"]);
  git(["-C", repositoryRoot, "commit", "-m", "test: initialize canonical repository"]);
  git([
    "-C",
    repositoryRoot,
    "worktree",
    "add",
    "-b",
    "goalboard-web-evidence-worktree",
    worktreeRoot,
  ]);
  const worktreeFile = join(worktreeRoot, "fresh-review.txt");
  writeFileSync(worktreeFile, "reviewed from the registered isolated worktree\n");

  const store = new SqliteGoalBoardStore(fixture.alpha.database_path);
  let evidenceId: string;
  try {
    const coordinator = new GoalBoardCoordinator(store);
    coordinator.createGoal(
      fixture.alpha.board_id,
      {
        goal_id: "WORKTREE-EVIDENCE-WEB",
        title: "打开隔离 worktree 的验证证据",
        outcome: "Web 使用提交时记录的真实 worktree 根",
        why: "隔离实现不能因为路径位于 canonical checkout 外就失去可追溯性。",
        business_logic: "只信任 canonical Git 仓库正式登记且未越界的 worktree。",
        definition_state: "accepted",
        decomposition_state: "closed_leaf",
        acceptance_criteria: [{
          criterion_id: "WORKTREE-EVIDENCE-WEB-C1",
          statement: "打开 worktree 中的未提交文本证据",
          decision_method: "inspection",
          pass_condition: "内容来自提交 Evidence 时的 worktree",
          required_evidence: ["artifact"],
        }],
      },
      { actor_id: "test-user", idempotency_key: "worktree-evidence-web-goal" },
    );
    const evidence = coordinator.submitEvidence({
      board_id: fixture.alpha.board_id,
      goal_id: "WORKTREE-EVIDENCE-WEB",
      actor_id: "runtime-codex",
      criterion_ids: ["WORKTREE-EVIDENCE-WEB-C1"],
      kind: "artifact",
      locator: worktreeFile,
      result: "passed",
      locator_context: {
        project_root: repositoryRoot,
        workspace_id: "canonical-workspace-id",
      },
      idempotency_key: "worktree-evidence-web-submit",
    }).evidence;
    assert.equal(evidence.locator_status, "verified");
    assert.equal(evidence.locator, "project://fresh-review.txt");
    assert.equal(evidence.locator_workspace_id, null);
    evidenceId = evidence.evidence_id;
  } finally {
    store.close();
  }

  const server = createGoalBoardWebServer({ homeDirectory: fixture.homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const prefix = `/projects/${encodeURIComponent(fixture.alpha.project_id)}`;
    const records = await (
      await webFetch(`${origin}${prefix}/api/goals/WORKTREE-EVIDENCE-WEB/records?view=current`)
    ).text();
    assert.match(records, /同一 Git 仓库正式登记的隔离 worktree/);
    assert.match(records, new RegExp(`evidence_id=${evidenceId}`));

    const referenceUrl = `${origin}${prefix}/api/project-references/${encodeURIComponent("project://fresh-review.txt")}?evidence_id=${evidenceId}`;
    const opened = await webFetch(referenceUrl);
    assert.equal(opened.status, 200, await opened.clone().text());
    assert.match(await opened.text(), /reviewed from the registered isolated worktree/);

    git(["-C", repositoryRoot, "worktree", "remove", "--force", worktreeRoot]);
    const removed = await webFetch(referenceUrl);
    assert.equal(removed.status, 404);
    assert.match(await removed.text(), /项目引用根目录不可用/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web normal Tree excludes trashed Goals while the coordinator retains their facts", () => {
  const { databasePath } = webFixture();
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  coordinator.createGoal(
    DEMO_BOARD_ID,
    {
      goal_id: "TRASHED-WEB",
      title: "不会出现在普通 Tree 的 Goal",
      outcome: "回收站 Goal 不干扰当前工作列表",
      why: "普通导航只应该展示可继续处理的工作",
      business_logic: "移入回收站会保留全部事实，但普通 Web Tree 和 Archive 都不显示它。",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [
        {
          criterion_id: "trashed-web-criterion",
          statement: "普通 Tree 不显示回收站 Goal",
          decision_method: "automated_check",
          pass_condition: "Web view goals 与 archived_goals 都没有该 Goal",
        },
      ],
    },
    { actor_id: "test-user", idempotency_key: "create-trashed-web" },
  );
  coordinator.setGoalTrashed(
    DEMO_BOARD_ID,
    { goal_id: "TRASHED-WEB", trashed: true, reason: "验证正常 Web 读取过滤" },
    { actor_id: "test-user", idempotency_key: "trash-web-goal" },
  );
  const view = buildGoalBoardWebView(store, coordinator, {
    databasePath,
    boardId: DEMO_BOARD_ID,
    demo: true,
  });
  assert.equal(view.goals.some((item) => item.goal.goal_id === "TRASHED-WEB"), false);
  assert.equal(view.archived_goals.some((item) => item.goal.goal_id === "TRASHED-WEB"), false);
  assert.equal(view.trashed_goals.some((item) => item.goal.goal_id === "TRASHED-WEB"), true);
  assert.equal(store.snapshot(DEMO_BOARD_ID).goals.find((goal) => goal.goal_id === "TRASHED-WEB")?.trashed_at == null, false);
  assert.deepEqual(coordinator.listTrashedGoals(DEMO_BOARD_ID).map((goal) => goal.goal_id), ["AUTO-CONNECT", "TRASHED-WEB"]);
  store.close();
});

test("Web provides confirmed recoverable trash, blocked-work feedback, and restore", async () => {
  const { databasePath } = webFixture();
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  const createGoal = (goalId: string, title: string) =>
    coordinator.createGoal(
      DEMO_BOARD_ID,
      {
        goal_id: goalId,
        title,
        outcome: "用户可以完成回收站 UI 流程",
        why: "可恢复删除不能干扰日常 Goal Tree",
        business_logic: "用户确认后移入回收站；系统保留历史和安全恢复所需的 Relation 事实。",
        definition_state: "accepted",
        decomposition_state: "closed_leaf",
        acceptance_criteria: [
          {
            criterion_id: `${goalId}-criterion`,
            statement: "回收站流程可验证",
            decision_method: "automated_check",
            pass_condition: "确认、阻止、移入和恢复都走共享服务",
          },
        ],
      },
      { actor_id: "test-user", idempotency_key: `create-${goalId}` },
    );
  createGoal("TRASH-UI-READY", "可移入回收站的 UI Goal");
  createGoal("TRASH-UI-ACTIVE", "有运行中工作的 UI Goal");
  const relationId = coordinator.addRelation(
    DEMO_BOARD_ID,
    {
      from_goal_id: "TRASH-UI-READY",
      to_goal_id: "CORE",
      type: "extends",
      reason: "验证回收站会复用共享 Relation 迁移",
    },
    { actor_id: "test-user", idempotency_key: "trash-ui-relation" },
  ).relation_id;
  const activeDecision = coordinator.selectGoalAndStart({
    board_id: DEMO_BOARD_ID,
    goal_id: "TRASH-UI-ACTIVE",
    actor_id: "runtime-trash-ui",
    goal_mode_attestation: true,
    idempotency_key: "trash-ui-active-work",
  });
  assert.equal(activeDecision.allowed, true);
  assert.ok(activeDecision.claim);
  assert.ok(activeDecision.run);
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId: DEMO_BOARD_ID });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const goalPage = await (await webFetch(`${origin}/goals/TRASH-UI-READY`)).text();
    assert.match(goalPage, /data-open-goal-trash/);
    assert.match(goalPage, /移入回收站/);
    assert.match(goalPage, /操作可恢复/);
    assert.match(goalPage, /href="\/trash" aria-label="查看回收站"/);

    const missingConfirmation = await webFetch(`${origin}/api/goals/TRASH-UI-READY/trash`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trashed: true, reason: "没有确认不应修改" }),
    });
    assert.equal(missingConfirmation.status, 400);
    assert.match(await missingConfirmation.text(), /请先在 GoalBoard 中确认此操作/);

    const blocked = await webFetch(`${origin}/api/goals/TRASH-UI-ACTIVE/trash`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trashed: true, user_confirmed: true, reason: "验证活跃工作提示" }),
    });
    assert.equal(blocked.status, 200);
    const blockedResult = (await blocked.json()) as {
      status: string;
      blocking_claim_ids: string[];
      blocking_run_ids: string[];
    };
    assert.equal(blockedResult.status, "blocked");
    assert.deepEqual(blockedResult.blocking_claim_ids, [activeDecision.claim!.claim_id]);
    assert.deepEqual(blockedResult.blocking_run_ids, [activeDecision.run!.run_id]);

    const trashed = await webFetch(`${origin}/api/goals/TRASH-UI-READY/trash`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trashed: true, user_confirmed: true, reason: "暂时从日常列表移出" }),
    });
    assert.equal(trashed.status, 200);
    const trashedResult = (await trashed.json()) as {
      status: string;
      deactivated_relation_ids: string[];
    };
    assert.equal(trashedResult.status, "trashed");
    assert.deepEqual(trashedResult.deactivated_relation_ids, [relationId]);

    const board = (await (await webFetch(`${origin}/api/board`)).json()) as {
      goals: Array<{ goal: { goal_id: string } }>;
      archived_goals: Array<{ goal: { goal_id: string } }>;
      trashed_goals: Array<{ goal: { goal_id: string; trashed_at: string | null } }>;
    };
    assert.equal(board.goals.some((item) => item.goal.goal_id === "TRASH-UI-READY"), false);
    assert.equal(board.archived_goals.some((item) => item.goal.goal_id === "TRASH-UI-READY"), false);
    assert.equal(board.trashed_goals.find((item) => item.goal.goal_id === "TRASH-UI-READY")?.goal.trashed_at == null, false);

    const currentTree = await (await webFetch(`${origin}/`)).text();
    assert.doesNotMatch(currentTree, /data-tree-item data-goal-id="TRASH-UI-READY"/);
    const trashPage = await (await webFetch(`${origin}/trash/goals/TRASH-UI-READY`)).text();
    assert.match(trashPage, /data-board-view="trash"/);
    assert.doesNotMatch(trashPage, /class="tree-heading"/);
    assert.match(trashPage, /data-tree-item data-goal-id="TRASH-UI-READY"/);
    assert.match(trashPage, /data-open-goal-restore/);
    assert.match(trashPage, /Goal 的 Contract、Run、Evidence 与事件历史都已保留/);
    assert.match(trashPage, /class="goal-hero trash-goal-hero"/);
    assert.match(trashPage, /class="goal-workspace-panels trash-goal-workspace"/);
    assert.match(trashPage, /class="trash-goal-panel trash-goal-panel--state"/);
    assert.match(WORKBENCH_STYLES, /\.trash-goal-workspace \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(WORKBENCH_STYLES, /@media \(max-width: 760px\)[\s\S]*\.trash-goal-workspace \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
    assert.match(WORKBENCH_STYLES, /\.trash-goal-document \.goal-title-actions \.document-action \{ min-height: 44px; \}/);
    const trashFragment = await (
      await webFetch(`${origin}/api/goals/TRASH-UI-READY/document?view=trash`)
    ).text();
    assert.match(trashFragment, /data-goal-view="TRASH-UI-READY"/);
    assert.match(trashFragment, /data-open-goal-restore/);
    assert.doesNotMatch(trashFragment, /<!doctype html>/);

    const restored = await webFetch(`${origin}/api/goals/TRASH-UI-READY/trash`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trashed: false, user_confirmed: true, reason: "重新纳入日常工作" }),
    });
    assert.equal(restored.status, 200);
    const restoredResult = (await restored.json()) as {
      status: string;
      restored_relation_ids: string[];
    };
    assert.equal(restoredResult.status, "restored");
    assert.deepEqual(restoredResult.restored_relation_ids, [relationId]);
    const restoredGoal = await (await webFetch(`${origin}/goals/TRASH-UI-READY`)).text();
    assert.match(restoredGoal, /data-tree-item data-goal-id="TRASH-UI-READY"/);
    assert.match(restoredGoal, /data-open-goal-trash/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web archives only completed Goals and provides a reversible archive view", async () => {
  const { databasePath } = webFixture();
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  for (const [goalId, title] of [
    ["ARCHIVE-WEB", "可归档的已完成 Goal"],
    ["ARCHIVE-UNMET", "尚未完成的 Goal"],
  ]) {
    coordinator.createGoal(
      DEMO_BOARD_ID,
      {
        goal_id: goalId,
        title,
        outcome: "用户可以验证归档行为",
        why: "保持当前 Tree 简洁且历史可恢复",
        business_logic: "完成 Goal 可以归档，归档只影响日常导航并保留全部事实。",
        definition_state: "accepted",
        decomposition_state: "closed_leaf",
        acceptance_criteria: [
          {
            criterion_id: `${goalId}-criterion`,
            statement: "归档行为可验证",
            decision_method: "automated_check",
            pass_condition: "归档视图和恢复操作可用",
            required_evidence: ["test"],
          },
        ],
      },
      { actor_id: "test-user", idempotency_key: `create-${goalId}` },
    );
  }
  store.db
    .prepare("UPDATE goals SET fulfillment_state = 'satisfied' WHERE goal_id = ?")
    .run("ARCHIVE-WEB");
  store.close();

  const server = createGoalBoardWebServer({ databasePath, boardId: DEMO_BOARD_ID });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const completedPage = await (await webFetch(`${origin}/goals/ARCHIVE-WEB`)).text();
    assert.match(completedPage, /data-goal-archive="true"/);
    assert.match(completedPage, /href="\/archive" aria-label="查看已归档 Goal"/);

    const rejected = await webFetch(`${origin}/api/goals/ARCHIVE-UNMET/archive`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: true, reason: "不应允许" }),
    });
    assert.equal(rejected.status, 400);
    assert.match(await rejected.text(), /只有已完成的 Goal 可以归档/);

    const archived = await webFetch(`${origin}/api/goals/ARCHIVE-WEB/archive`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: true, reason: "整理已完成 Goal" }),
    });
    assert.equal(archived.status, 200, await archived.text());
    const board = (await (await webFetch(`${origin}/api/board`)).json()) as {
      goals: Array<{ goal: { goal_id: string } }>;
      archived_goals: Array<{ goal: { goal_id: string; fulfillment_state: string } }>;
    };
    assert.equal(board.goals.some((item) => item.goal.goal_id === "ARCHIVE-WEB"), false);
    assert.equal(board.archived_goals[0]?.goal.fulfillment_state, "satisfied");
    assert.ok(board.archived_goals.some((item) => item.goal.goal_id === "ARCHIVE-WEB"));

    const currentTree = await (await webFetch(`${origin}/`)).text();
    assert.doesNotMatch(currentTree, /data-tree-item data-goal-id="ARCHIVE-WEB"/);
    const archivePage = await (await webFetch(`${origin}/archive/goals/ARCHIVE-WEB`)).text();
    assert.match(archivePage, /data-board-view="archive"/);
    assert.doesNotMatch(archivePage, /class="tree-heading"/);
    assert.match(archivePage, /data-tree-item data-goal-id="ARCHIVE-WEB"/);
    assert.match(archivePage, /data-goal-archive="false"/);
    assert.match(archivePage, /可归档的已完成 Goal/);
    const archiveFragment = await (
      await webFetch(`${origin}/api/goals/ARCHIVE-WEB/document?view=archive`)
    ).text();
    assert.match(archiveFragment, /data-goal-view="ARCHIVE-WEB"/);
    assert.match(archiveFragment, /data-goal-archive="false"/);
    assert.doesNotMatch(archiveFragment, /<!doctype html>/);

    const restored = await webFetch(`${origin}/api/goals/ARCHIVE-WEB/archive`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: false, reason: "恢复到当前 Tree" }),
    });
    assert.equal(restored.status, 200, await restored.text());
    const restoredTree = await (await webFetch(`${origin}/goals/ARCHIVE-WEB`)).text();
    assert.match(restoredTree, /data-tree-item data-goal-id="ARCHIVE-WEB"/);
    assert.match(restoredTree, /data-goal-archive="true"/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

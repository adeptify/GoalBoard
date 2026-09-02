import type {
  UiRenderRequest,
  UiSlotDescriptor,
  WorkbenchDocumentRenderRequest,
} from "@adeptify/goalboard-contracts/platform/ui";
import type { GoalsApplicationApi } from "@adeptify/goalboard-contracts/modules/goals";
import type { ExecutionValidationApplicationApi } from "@adeptify/goalboard-plugin-goals";
import {
  FEED_UI_CONTRIBUTION_ID,
  feedUiContribution,
  type FeedUiSurface,
  type FeedUiModel,
  type PersistedFeedDetailModel,
} from "@adeptify/goalboard-plugin-feed";
import { UiHost } from "@adeptify/goalboard-ui-host";

export {
  CLIENT_SCRIPT,
  CONTROL_CLIENT_SCRIPT,
  MORE_STYLES,
  ONBOARDING_CLIENT_SCRIPT,
  PROJECT_GUIDANCE_CLIENT_SCRIPT,
  PROJECT_GUIDANCE_SETTINGS_STYLES,
  PROJECT_INDEX_CLIENT_SCRIPT,
  PROJECT_INDEX_STYLES,
  PROJECT_RULES_CLIENT_SCRIPT,
  PROJECT_RULES_SETTINGS_STYLES,
  RESPONSIVE_STYLES,
  SETTINGS_CLIENT_SCRIPT,
  SETTINGS_STYLES,
  STYLES,
  WORK_TAB_VISIBILITY_CLIENT_SCRIPT,
} from "./browser-assets.js";
export { EN } from "./i18n/en.js";
export {
  createWorkbenchExecutionValidationRenderer,
  EXECUTION_EVIDENCE_KIND_LABELS,
  EXECUTION_EVIDENCE_RESULT_LABELS,
  type WorkbenchExecutionGoalView,
  type WorkbenchExecutionValidationRenderer,
  type WorkbenchExecutionValidationUiDependencies,
} from "./execution-validation-ui.js";

export const packageDescriptor = {
  packageName: "@adeptify/goalboard-app-workbench",
  packagePath: "apps/workbench",
  kind: "app",
  maturity: "partial",
  contract: "@adeptify/goalboard-contracts/platform/app-host",
  migrationGoals: ["goal-reorg-f2", "goal-reorg-fd4", "goal-reorg-ap3", "goal-reorg-gw4", "goal-reorg-ex4"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [
    "workbench.shell.v1",
    "workbench.ui-slots.v1",
    "workbench.feed-composition.v1",
    "workbench.goals-command-adapter.v1",
    "workbench.execution-validation-adapter.v1",
  ],
} as const;

export type GoalBoardPackageDescriptor = typeof packageDescriptor;

export type WorkbenchGoalsAdapter<TTransition = unknown> = GoalsApplicationApi<TTransition>;

export const WORKBENCH_UI_SLOTS = {
  directory: { slot_id: "workbench.directory", version: 1, accepts: ["declarative-html"] },
  main: { slot_id: "workbench.main", version: 1, accepts: ["declarative-html"] },
  overlay: { slot_id: "workbench.overlay", version: 1, accepts: ["declarative-html"] },
} as const satisfies Record<string, UiSlotDescriptor>;

const FEED_SURFACE_SLOTS: Readonly<Record<FeedUiSurface, UiSlotDescriptor>> = {
  directory: WORKBENCH_UI_SLOTS.directory,
  workbench: WORKBENCH_UI_SLOTS.main,
  "workbench-fragment": WORKBENCH_UI_SLOTS.main,
  "source-directory": WORKBENCH_UI_SLOTS.directory,
  "source-workbench": WORKBENCH_UI_SLOTS.main,
  overlays: WORKBENCH_UI_SLOTS.overlay,
  "persisted-detail": WORKBENCH_UI_SLOTS.main,
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderAttributes(attributes: WorkbenchDocumentRenderRequest["body_attributes"]): string {
  return Object.entries(attributes ?? {})
    .filter((entry): entry is [string, string | boolean] => entry[1] !== null && entry[1] !== undefined && entry[1] !== false)
    .map(([name, value]) => value === true ? ` ${name}` : ` ${name}="${escapeHtml(String(value))}"`)
    .join("");
}

/** Own the stable HTML document shell while product Plugins own their rendered surfaces. */
export function renderWorkbenchDocument(request: WorkbenchDocumentRenderRequest): string {
  return `${request.preamble_html ?? ""}<!doctype html>
<html lang="${escapeHtml(request.lang)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${request.head_before_title_html ?? ""}
  <title>${escapeHtml(request.title)}</title>
  ${request.head_html ?? ""}
</head>
  <body${renderAttributes(request.body_attributes)}>
${request.body_html}
</body>
</html>`;
}

/** Bind Workbench routes to the public Goals Contract without copying Module rules. */
export function createWorkbenchGoalsAdapter<TTransition>(
  goals: GoalsApplicationApi<TTransition>,
): WorkbenchGoalsAdapter<TTransition> {
  return {
    commands: goals.commands,
    lifecycle: goals.lifecycle,
    planning: goals.planning,
  };
}

export type WorkbenchExecutionValidationAdapter<TSnapshot = unknown> =
  ExecutionValidationApplicationApi<TSnapshot>;

/** Bind Workbench routes and projections to one execution/review application port. */
export function createWorkbenchExecutionValidationAdapter<TSnapshot>(
  application: ExecutionValidationApplicationApi<TSnapshot>,
): WorkbenchExecutionValidationAdapter<TSnapshot> {
  return { query: application.query, commands: application.commands };
}

/** Shared Workbench composition root. Product renderers never import a Plugin implementation directly. */
export function createWorkbenchUiHost(): UiHost {
  const host = new UiHost();
  host.register(feedUiContribution);
  return host;
}

const workbenchUiHost = createWorkbenchUiHost();

export function renderFeedContribution(
  surface: UiRenderRequest<FeedUiModel | PersistedFeedDetailModel>["surface"],
  model: FeedUiModel | PersistedFeedDetailModel,
): string {
  return workbenchUiHost.mount({
    slot: FEED_SURFACE_SLOTS[surface as FeedUiSurface],
    contribution: {
      contribution_id: FEED_UI_CONTRIBUTION_ID,
      surface,
      model,
    },
  }).html;
}

export function listWorkbenchUiContributions() {
  return workbenchUiHost.list();
}

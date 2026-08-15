---
name: GoalBoard Goal Workbench
description: A light IDE Goal Tree paired with a continuous, policy-aware Goal document workbench.
colors:
  page: "#f6f7f9"
  paper: "#fff"
  ink: "#171a21"
  muted: "#68707d"
  faint: "#9299a4"
  line: "#dfe3e8"
  line-strong: "#cdd3da"
  blue: "#1677ff"
  blue-dark: "#0d63d8"
  blue-soft: "#eaf3ff"
  green: "#168a4b"
  green-soft: "#eaf7ef"
  amber: "#b66a00"
  amber-soft: "#fff4dc"
  red: "#c63838"
  red-soft: "#fff0f0"
typography:
  display:
    fontFamily: 'Inter, "SF Pro Text", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
    fontSize: "clamp(22px, 2.1vw, 29px)"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.03em"
  headline:
    fontFamily: 'Inter, "SF Pro Text", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "-0.015em"
  title:
    fontFamily: 'Inter, "SF Pro Text", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
    fontSize: "19px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "-0.02em"
  body:
    fontFamily: 'Inter, "SF Pro Text", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  mobile-form:
    fontFamily: 'Inter, "SF Pro Text", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: 'Inter, "SF Pro Text", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
    fontSize: "12px"
    fontWeight: 650
    lineHeight: 1.55
rounded:
  priority: "3px"
  compact: "4px"
  control: "5px"
  icon: "6px"
  dialog: "8px"
spacing:
  xxs: "4px"
  xs: "8px"
  compact: "10px"
  sm: "14px"
  md: "18px"
  lg: "20px"
  xl: "30px"
  document-gutter: "38px"
components:
  topbar:
    backgroundColor: "rgba(250, 251, 252, .97)"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    height: "58px"
    padding: "0"
  search-field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    height: "34px"
    padding: "0 12px 0 35px"
  tree-node-selected:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.paper}"
    typography: "{typography.body}"
    rounded: "{rounded.compact}"
    height: "34px"
    padding: "3px 8px"
  runtime-grid:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0"
  contract-list:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "0"
    padding: "11px 0"
  policy-workbench:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "0"
    padding: "0"
  human-review-form:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "0"
    padding: "14px 0"
  inline-reference:
    backgroundColor: "transparent"
    textColor: "{colors.blue-dark}"
    typography: "{typography.body}"
    padding: "0"
  mobile-view-switch:
    backgroundColor: "#f7f8fa"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    height: "42px"
    padding: "4px"
  create-dialog:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.dialog}"
    padding: "0"
    width: "min(680px, calc(100vw - 32px))"
---

# Design System: GoalBoard Goal Workbench

## Overview

**Creative North Star: "The Continuous Goal File"**

The interface should feel like opening a precise project file, not entering a collection of detached widgets. A quiet, light toolbar establishes global context; a searchable Goal Tree keeps hierarchy and dependency scan-friendly; the selected Goal opens as one continuous paper document where Outcome, Why, business closure, contract, execution, proof, risk, policy, history, and pending user decisions can be read in order.

The visual character is compact, calm, and operational. Hairline borders and small radii structure dense information without turning every section into a separate object. Blue marks the current path and available action; semantic green, amber, and red always travel with text or icons so status never depends on color alone.

**Key Characteristics:**

- Light 58px toolbar over a two-pane desktop workspace.
- Searchable, resizable IDE-style Goal Tree with Goal names primary and IDs secondary.
- Continuous white document surface with strong reading order and minimal ornament.
- Continuous Policy and Human Review rows that keep authority, evidence, and submission state in the same reading flow.
- Compact controls, hairline separators, and restrained corner radii.
- Lucide line icons paired with explicit labels for actions and statuses.
- Stateful live updates that preserve the reader's place instead of resetting the interface.

## Colors

The palette uses cool near-whites and graphite text as the working material, with one decisive blue and semantic green, amber, and red reserved for operational meaning.

### Primary

- **Action Blue:** The current Goal, primary actions, links, focus treatment, claimed work, and ready state. Its darker companion carries readable inline references, while the soft wash supports selected or informational backgrounds.

### Secondary

- **Completion Green:** Synced and satisfied states, paired with direct status wording; the soft wash supports completed or positive context.
- **Review Amber:** Priority, review, proposed relations, warnings, and inconclusive evidence; the soft wash separates caution without escalating it to failure.

### Tertiary

- **Blocker Red:** Blocked, offline, destructive, or failed states; the soft wash gives critical messages a readable field.

### Neutral

- **Cool Page:** The application canvas and quiet control regions.
- **Paper White:** The continuous Goal document and input surfaces.
- **Graphite Ink:** Primary reading text and decisive labels.
- **Muted Slate:** Secondary descriptions, metadata, and inactive controls.
- **Faint Slate:** Low-priority counts, placeholders, and supporting timestamps.
- **Hairline Gray:** Section dividers and ordinary boundaries.
- **Strong Hairline:** Emphasized input and container boundaries.

### Named Rules

**The Blue Selection Rule.** Use blue for the current path and available action; use green for completion, amber for review or warning, red for blocked or failed states, and neutral gray for waiting.

**The Status Pairing Rule.** Every operational status combines color with readable text and, where present, a Lucide icon; color is reinforcement, never the only carrier.

## Typography

**Display Font:** Inter with SF Pro Text, PingFang SC, Microsoft YaHei, and system-ui fallbacks
**Body Font:** Inter with SF Pro Text, PingFang SC, Microsoft YaHei, and system-ui fallbacks

**Character:** One system-oriented sans-serif stack carries both Chinese and English UI with compact, familiar proportions. Hierarchy comes from weight, size, spacing, and document position rather than decorative type changes.

### Hierarchy

- **Display** (700, responsive 22px–29px, 1.3): Selected Goal title at the top of the document.
- **Headline** (700, 17px, 1.35): Major document section headings.
- **Title** (700, 19px, 1.4): Dialog and high-level workbench titles.
- **Body** (400, 14px, 1.55): Narrative, contract values, history, and execution details.
- **Mobile Form** (400, 16px, 1.55): Inputs, selects, and textareas below 760px, avoiding browser focus zoom while keeping dense reading text unchanged.
- **Label** (650, 12px, 1.55): Toolbar controls, tabs, statuses, metadata labels, and compact actions.

### Named Rules

**The Human-First Reading Rule.** Keep prose readable as a document: use short labels to locate facts, but let Outcome, Why, business logic, and decisions remain complete sentences rather than compressing them into badge language.

## Layout

The desktop workspace starts beneath a 58px toolbar and divides into a resizable Goal Tree, a 5px separator, and a flexible document pane. The Tree defaults to `clamp(280px, 22vw, 360px)`. Pointer dragging or Left/Right Arrow keys in 16px steps adjust it within the shipped viewport-aware 260px–520px bounds, and the chosen width persists in session storage. The Goal document centers within the available pane at a maximum width of 1080px with 38px side gutters, 30px top space, and 80px of finishing space below the last section. Tree rows use a 38px minimum rhythm around 34px selectable nodes; the Goal name is the primary line and its ID is a smaller secondary line.

The selected Goal is itself an inline-size container. When its usable width falls to 660px, Policy and Human Review labels stack above their controls, their footers become vertical, and Policy summaries allow their saved-state text to wrap. This document-local rule responds to a narrow resizable work area even when the browser viewport is still wide, preventing label columns from squeezing content into one-character lines.

At 1180px and below, the Tree fallback becomes 280px while a saved width remains respected, four-part execution content reduces to two columns, and relationship and safety content use two-column internal layouts. Contract content stays a continuous row list with a 138px label column and flexible content. At 900px and below, source context, global search, and secondary view actions leave the toolbar so the brand and Create action remain usable. At 760px and below, the toolbar becomes 52px, the separator disappears, a 42px Tree / Goal正文 switch appears, and only the selected view is shown. The document uses 18px side gutters, 20px top space, and single-column internal layouts; Contract labels stack above their content, form controls become 16px, and the create dialog fills the viewport.

**The Continuous Document Rule.** The Tree chooses the file; all selected-Goal truth remains in one continuous reading surface ordered from intent through execution, evidence, risk, history, and unresolved decisions.

**The Stable Workspace Rule.** A cursor-driven refresh updates only changed Tree and document regions, preserving selection, collapsed branches, searches, scroll positions, mobile view, Tree width, in-progress create form values, and URL history whenever their context remains valid. If a Policy or Human Review form owns focus, background refresh defers and reports “编辑中”; a successful submission forces the authoritative refresh.

## Elevation & Depth

The system is flat by default. Page, Tree, and paper are separated primarily by background tone and hairline borders. The create dialog is the only sustained interactive surface that floats above the workspace; transient toasts share its ambient shadow only while reporting an action. The toolbar and active mobile tab use much lighter structural shadows, and the selected Tree node uses an inset edge rather than lifted depth.

### Shadow Vocabulary

- **Dialog and Toast Ambient** (`0 8px 28px rgba(26, 38, 52, .12)`): Dialog elevation and short-lived toast feedback.
- **Toolbar Structure** (`0 1px 2px rgba(18, 28, 40, .06)`): A hairline-depth cue beneath the global toolbar.
- **Selected Tree Edge** (`inset 0 0 0 1px rgba(14, 94, 199, .22)`): Definition inside the blue selected row without lifting it.
- **Active Mobile Tab** (`0 1px 3px rgba(22, 31, 43, .1)`): Small separation for the chosen Tree or Goal正文 tab.

The Goal document enters over `.24s` with a `cubic-bezier(.16, 1, .3, 1)` easing, toast feedback transitions over `.16s`, and the syncing indicator pulses on a `1s` cycle. Live refresh suppresses document re-entry animation. Reduced-motion mode shortens all animation and transition timing to `.01ms`.

**The Modal Elevation Rule.** Keep normal work surfaces flat; reserve sustained floating depth and backdrop treatment for the create dialog.

## Shapes

Shapes are compact and engineered: 3px priority markers, 4px Tree selections and inline references, 5px controls and bordered information groups, 6px dialog icons, and an 8px dialog. Borders are thin and cool gray; large rounded containers are not part of the shipped language. The selected Tree node is a compact blue rectangle with a subtle vertical gradient, while the document remains a continuous paper field rather than a stack of containers.

## Components

### Global Toolbar

- **Structure:** Fixed 58px desktop band with nearly opaque cool-white fill, bottom boundary, and a very light structural shadow.
- **Behavior:** Holds brand, source context, sync state, global search, view action, and Create Goal; lower-priority controls disappear on narrow screens.
- **Icons:** Uses the shipped Lucide sprite and keeps icon strokes rounded and legible at compact sizes.

### Search Fields

- **Style:** White 34px field, 5px corners, compact horizontal padding, search icon, and a gray boundary.
- **Focus:** Blue boundary and restrained blue focus ring; global and Tree search values stay synchronized.
- **Keyboard:** Command/Ctrl+F focuses global search without displacing the native page flow.

### Goal Tree

- **Default:** Dense rows with disclosure control, Goal name as the 13px primary line, 9px Goal ID below it, and text-and-icon status.
- **Selected:** Blue vertical gradient, white text and icons, 4px corners, and an inset blue edge.
- **Behavior:** Selection opens the Goal at a stable URL; collapsed branches, search, and Tree scroll survive live updates.

### Tree Resizer

- **Structure:** A 5px separator with a one-pixel center line between Tree and document.
- **Behavior:** Pointer drag adjusts continuously; Left/Right Arrow adjusts by 16px; hover, keyboard focus, and active drag thicken the line to 2px and turn it blue.
- **Persistence:** The width is restored from session storage and remains stable through live cursor updates; the separator is hidden below 760px.

### Buttons

- **Primary:** Blue 34px action with white label, 5px corners, and compact 13px horizontal padding.
- **Hover / Focus:** Darker blue on hover; visible blue focus ring for keyboard navigation.
- **Icon Actions:** Small 6px rounded controls retain an accessible label even when only the icon is visible.

### Goal Status

- **Style:** Compact text-and-icon status treatment. Ready and claimed are blue, satisfied is green, blocked is red, and waiting is neutral gray.
- **Rule:** Amber belongs to priority, Review, proposed relations, warnings, and inconclusive evidence rather than waiting.

### Runtime Work Loop

- **Structure:** One bordered 5px group containing Claim, Run, Evidence, and Review as a single sequence.
- **Responsive:** Four columns on wide screens, two below 1180px, and one below 760px.
- **State:** Each phase carries its own label and semantic condition without becoming a detached tile.

### Human Review

- **Entry condition:** Appears only for pending `human_approver` obligations and explicitly states that the user entry point owns this decision.
- **Form:** A 170px label column leads the verdict, existing Evidence choices, optional external references, and required reasoning. Verdict options are written in Chinese; evidence locators wrap instead of truncating.
- **Submit / Error:** The primary button disables during the request. Failure appears inline as a red-on-soft-red `role="alert"` and re-enables submission; success forces a refresh and confirms with a toast.
- **Narrow document:** At 660px of document width, labels stack, footer metadata wraps above the action, and the button remains right-aligned.

### Relationship and Contract Rows

- **Structure:** Upstream, downstream, and other relations share a bordered group. Goal Contract is a continuous hairline-divided list with a 138px label column, not a set of separate containers; safety uses a compact bordered group, while Policy continues the document's row grammar.
- **Interaction:** Relation rows remain compact and scannable, with state text and action where applicable. Names, reasons, history text, and non-HTTP references wrap naturally in the document instead of hiding decision-critical content behind ellipsis.

### Draft Contract Proposals

- **Structure:** The selected Draft shows its missing fields first, then one continuous current-to-proposed document. Each row keeps the business field, current value, proposed value, source type, confidence, rationale, and references readable without exposing protocol JSON.
- **Authority:** The header says that approval updates the same Goal rather than creating another one. Repository and document facts remain visibly proposed; only the user-facing actions can reject the Proposal or confirm it as executable.
- **Prerequisites:** Pending Dependency Rewires render before their linked Contract Proposal. While any linked Rewire still awaits a user decision, the approval action is disabled, says `先处理依赖调整`, and explains that resolving the dependency decision restores Contract approval; rejecting the Contract remains available.
- **Responsive:** Wide layouts use label, value, and source columns. Below 760px they stack in that order, with source evidence separated by a dashed hairline rather than another card.

### Dependency Proposals

- **Structure:** A continuous bordered list, not a dashboard card grid. Each proposal leads with Goal names, keeps IDs secondary, shows the dependency direction between them, then presents reason, direction rationale, rejection impact, basis, confidence, and evidence as readable rows.
- **State:** Add/deactivate and pending/applied/rejected labels always use words as well as semantic color. Pending proposals live in the user-decision section; resolved proposals remain in relation history so later revalidation can reuse their evidence.
- **Interaction:** Goal endpoints navigate to their document. HTTP(S) evidence opens externally; repository or test references copy directly. On mobile the rationale becomes one column and the direction remains readable without horizontal overflow.

### Policy Workbench

- **Reading order:** Always show the current final effective rule first, then the `project_default` source and the current Goal's additional rule. The effective summary uses a 190px lead column and auto-fitting value rows; sources are continuous disclosure rows rather than isolated panels.
- **Authority:** The project default is the shared baseline. Current-Goal rules may add requirements but cannot weaken that baseline; saved reason, actor, and time remain visible in the source summary.
- **Form:** Each source edits Goal Mode, self-verification, human approval, reviewer counts, Runtime capabilities, lease duration, and a required change reason. Rows use a 190px label column and 4px controls; current-Goal rules are open by default.
- **Value language:** The shipped effective summary keeps the canonical Goal Mode value (`disabled`, `preferred`, or `required`), while the edit options add Chinese explanations. Do not add inheritance or “new requirement” badges until those states exist in code.
- **Submit / Error:** Submission disables its button, reports failures inline through `role="alert"`, and forces an authoritative refresh plus toast after success. While the form owns focus, background cursor refresh defers rather than replacing the edit.
- **Narrow document:** At 660px of document width, lead labels, effective values, reviewer counts, summaries, and footers stack without changing the overall document flow.

### Inline References

- **HTTP(S):** Open as a real external link in a new context and include the external-link icon.
- **Other References:** Copy the exact value using a button with a Copy icon and transient toast confirmation.
- **Style:** Transparent, blue-dark, and integrated into prose instead of presented as a decorative badge. Long repository and protocol references wrap at safe break points so their exact value remains readable.

### Mobile View Switch

- **Structure:** A 42px two-option switch immediately below the 52px mobile toolbar.
- **Behavior:** Tree and Goal正文 are mutually exclusive views with accurate selected semantics; switching preserves local reading state.

### Create Goal Dialog

- **Structure:** White dialog up to 680px wide, 8px corners, 22px inner space, dimmed blurred backdrop, and viewport-safe scrolling. The relationship portion is split into two continuous, plainly labeled sections: `目录层级` asks which larger Goal this work belongs to, while `执行前置` asks which Goal must finish first.
- **Behavior:** Goal names lead every option and IDs remain secondary. Each relationship section shows a live direction preview and explains whether it only changes Tree placement or creates a hard Claim/completion gate. Cursor polling continues while the dialog is open; refreshed Goal options preserve every entered field, selected parent, selected dependencies, and the focused control. On mobile the dialog fills the viewport with square outer corners and 16px form controls.

## Do's and Don'ts

### Do:

- **Do** keep Goal hierarchy and dependency scanning in the searchable Tree while keeping the selected Goal's complete truth in one continuous document.
- **Do** preserve selection, collapsed branches, query, scroll, mobile view, Tree width, create-form values, and history across cursor-driven partial updates.
- **Do** pair semantic status colors with explicit words and Lucide icons.
- **Do** open HTTP(S) references as external links and make other references directly copyable.
- **Do** preserve the evidence and user decision behind dependency changes, including why the direction is A → B rather than B → A.
- **Do** show Draft gaps and field provenance before asking the user to confirm a Contract Proposal.
- **Do** collapse internal grids at the shipped 1180px and 760px breakpoints, then use the mobile Tree / Goal正文 switch.
- **Do** let the 660px document-container rule stack Policy and Human Review even when a wide viewport contains a narrow resized document pane.
- **Do** keep the final effective Policy above its project-default and Goal-specific sources, and require a reason for every edit.
- **Do** defer background refresh while a focused Policy or Human Review form is being edited, then force-refresh after a successful submission.
- **Do** suppress nonessential motion during live refresh and honor reduced-motion timing.
- **Do** expose the 5px Tree separator as a keyboard-operable resize control and retain the chosen width.

### Don't:

- **Don't** fragment one Goal into detached modules when a continuous reading order communicates its contract and history more clearly.
- **Don't** use amber for waiting or use any semantic hue as a color-only status signal.
- **Don't** add heavy shadows or large radii to ordinary work surfaces; depth is exceptional and borders do most of the structural work.
- **Don't** replace the shipped Lucide line language with mixed icon families, emoji, or unlabeled glyphs.
- **Don't** reset the reader to the top or discard open branches when live data changes.
- **Don't** show both Tree and Goal正文 simultaneously below 760px.
- **Don't** turn Goal Contract into a matrix of detached boxes; keep its 138px label and flexible content rows continuous.
- **Don't** present Contract Proposal fields as raw JSON or let a Runtime-facing control imply that it can approve its own proposal.
- **Don't** compress Policy or Human Review into a fixed desktop label grid when the document container is narrower than 660px.
- **Don't** invent inheritance or “new requirement” indicators that are not present in the shipped Policy Workbench.

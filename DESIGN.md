---
name: GoalBoard Goal Workbench
description: A light IDE Goal Tree paired with continuous Goal documents and one user-owned Decision Center.
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
  rewire-violet: "#6b4eb6"
  red: "#c63838"
  red-soft: "#fff0f0"
typography:
  display:
    fontFamily: 'Inter, "SF Pro Text", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
    fontSize: "clamp(22px, 2.1vw, 29px)"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.03em"
  decision-display:
    fontFamily: 'Inter, "SF Pro Text", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
    fontSize: "clamp(25px, 2.3vw, 32px)"
    fontWeight: 700
    lineHeight: 1.25
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
  tree-node-selected:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.paper}"
    typography: "{typography.body}"
    rounded: "{rounded.compact}"
    height: "34px"
    padding: "3px 8px"
  tree-status-filter:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "0"
    padding: "13px 14px 12px"
  runtime-grid:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0"
  decision-center:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "0"
    padding: "34px 38px 80px"
    width: "min(100%, 1080px)"
  draft-contract-editor:
    backgroundColor: "#fbfcfd"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "0"
    padding: "0"
  policy-workbench:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "0"
    padding: "0"
  impact-binding-workbench:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "0"
    padding: "0"
  relationship-workbench:
    backgroundColor: "#fbfcfd"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.icon}"
    padding: "0"
  risk-register:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "0"
    padding: "0"
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

The interface should feel like opening a precise project file, not entering a collection of detached widgets. A quiet, light toolbar establishes global context; a searchable Goal Tree keeps hierarchy and dependency scan-friendly; the selected Goal opens as one continuous paper document for its durable truth, while `/decisions` is the one user-owned place for pending Contract, Candidate, Rewire, Human Review, and Risk judgment.

The visual character is compact, calm, and operational. Hairline borders and small radii structure dense information without turning every section into a separate object. Blue marks the current path and available action; semantic green, amber, violet, and red always travel with text or icons so status never depends on color alone.

**Key Characteristics:**

- Light 58px toolbar over a two-pane desktop workspace.
- Searchable, resizable IDE-style Goal Tree with Goal names primary, IDs secondary, and a compact multi-state filter.
- Continuous white document surface with strong reading order and minimal ornament.
- Draft-only Contract authoring, structured acceptance, full Risk and Impact registers, and Policy remain in the Goal document; Human Review belongs to the Decision Center.
- One Decision Center groups every pending user-owned judgment by its Goal instead of repeating full decision forms in Goal documents.
- Compact controls, hairline separators, and restrained corner radii.
- Lucide line icons paired with explicit labels for actions and statuses.
- Stateful live updates that preserve the reader's place instead of resetting the interface.

## Colors

The palette uses cool near-whites and graphite text as the working material, with one decisive blue and small semantic green, amber, violet, and red accents reserved for operational meaning.

### Primary

- **Action Blue:** The current Goal, primary actions, links, focus treatment, claimed work, and ready state. Its darker companion carries readable inline references, while the soft wash supports selected or informational backgrounds.

### Secondary

- **Completion Green:** Synced and satisfied states, paired with direct status wording; the soft wash supports completed or positive context.
- **Review Amber:** Priority, review, proposed relations, warnings, and inconclusive evidence; the soft wash separates caution without escalating it to failure.

### Tertiary

- **Rewire Violet:** Relationship-change records use `#6b4eb6` only beside the explicit `Rewire` label, separating structural decisions from primary blue actions and amber Risk.
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

**The Blue Selection Rule.** Use blue for the current path and available action; use green for completion, amber for review or Risk, violet for Rewire, red for blocked or failed states, and neutral gray for waiting.

**The Status Pairing Rule.** Every operational status combines color with readable text and, where present, a Lucide icon; color is reinforcement, never the only carrier.

## Typography

**Display Font:** Inter with SF Pro Text, PingFang SC, Microsoft YaHei, and system-ui fallbacks
**Body Font:** Inter with SF Pro Text, PingFang SC, Microsoft YaHei, and system-ui fallbacks

**Character:** One system-oriented sans-serif stack carries both Chinese and English UI with compact, familiar proportions. Hierarchy comes from weight, size, spacing, and document position rather than decorative type changes.

### Hierarchy

- **Display** (700, responsive 22px–29px, 1.3): Selected Goal title at the top of the document.
- **Decision Display** (700, responsive 25px–32px, 1.25): The `等待你的决定` heading at the top of the Decision Center.
- **Headline** (700, 17px, 1.35): Major document section headings.
- **Title** (700, 19px, 1.4): Dialog and high-level workbench titles.
- **Body** (400, 14px, 1.55): Narrative, contract values, history, and execution details.
- **Mobile Form** (400, 16px, 1.55): Inputs, selects, and textareas below 760px, avoiding browser focus zoom while keeping dense reading text unchanged.
- **Label** (650, 12px, 1.55): Toolbar controls, tabs, statuses, metadata labels, and compact actions.

### Named Rules

**The Human-First Reading Rule.** Keep prose readable as a document: use short labels to locate facts, but let Outcome, Why, business logic, and decisions remain complete sentences rather than compressing them into badge language.

## Layout

The desktop workspace starts beneath a 58px toolbar and divides into a resizable Goal Tree, a 5px separator, and a flexible document pane. The Tree defaults to `clamp(280px, 22vw, 360px)`. Pointer dragging or Left/Right Arrow keys in 16px steps adjust it within the shipped viewport-aware 260px–520px bounds, and the chosen width persists in session storage. The Goal document centers within the available pane at a maximum width of 1080px with 38px side gutters, 30px top space, and 80px of finishing space below the last section. Tree rows use a 38px minimum rhythm around 34px selectable nodes; the Goal name is the primary line and its ID is a smaller secondary line. The Tree filter icon opens a local status panel below search rather than silently moving focus: users may select several currently present work states, combine them with the keyword query, and still see the ancestor path of each direct match.

The selected Goal is itself an inline-size container. Its stable core order begins with `业务逻辑 → 阻塞项 → 验收清单 → 补全 Draft Contract`; the editor is omitted unless the Goal is still a Draft. When that Goal has pending user-owned work, a short blue-edged notice appears between business logic and blockers with a count and deep link to its `/decisions` group; the full forms do not appear in the Goal document. When the usable document width falls to 660px, Draft and acceptance fields, Risk fact and lifecycle forms, Impact forms, and Human Review labels stack above their controls. Policy keeps its effective summary at two columns, turns the inheritance path vertical, hides source descriptions and saved subtext, and moves every editing control to one column. Footers become vertical. This document-local rule responds to a narrow resizable work area even when the browser viewport is still wide, preventing label columns from squeezing content into one-character lines.

The Decision Center occupies the same 1080px continuous-paper work area with 38px side gutters. Its header combines the total count with a five-type summary, then groups records by owner Goal. Multi-Goal or ambiguously owned Risks appear once under `Board 级事项` while listing every associated Goal. Within each group, Rewire precedes a linked Contract Proposal so prerequisites can be resolved before approval; Candidate, Human Review, and Risk follow in the same vertical stack.

At 1360px and below, the toolbar tightens brand/source padding, truncates the source label, reduces search width, and compacts action padding. At 1180px and below, the Tree fallback becomes 280px while a saved width remains respected, four-part execution content reduces to two columns, and relationship and Risk records remain one-column ledgers; only the fact fields inside an open Risk editor use two columns. Contract content stays a continuous row list with a 138px label column and flexible content. At 900px and below, source context, global search, and secondary view actions leave the toolbar, but Create Goal and the counted Decision Center entry remain visible. At 760px and below, the toolbar becomes 52px, the Decision Center entry keeps its Lucide user icon while its label collapses, the separator disappears, and a 42px Tree / Goal正文-or-决定中心 switch exposes one pane at a time. Goal documents use 18px side gutters; the Decision Center uses 24px side gutters and stacks its header, Candidate context, reason fields, Contract diffs, and relationship evidence into one column. Relation direction, type, target, reason, and action also stack without losing the readable A → B preview. Form controls become 16px, and the create dialog fills the viewport.

**The Continuous Document Rule.** The Tree chooses the file; all selected-Goal truth remains in one continuous reading surface ordered from intent through execution, evidence, risk, and history, while unresolved user authority remains in the Decision Center.

**The Stable Workspace Rule.** A cursor-driven refresh updates the Tree and atomically replaces prepared Goal views instead of clearing the document pane, including the Decision Center and its toolbar count, while preserving selection, collapsed branches, keyword and status filters, scroll positions, mobile view, Tree width, in-progress create form values, and URL history whenever their context remains valid. If any `data-live-form` owns focus, background refresh defers and reports “编辑中”; a successful submission forces the authoritative refresh without a white frame.

**The Single Decision Door Rule.** `/decisions` is the only place where users approve, reject, return, or review pending work. A Goal document may show its own short count-and-link notice, but it never duplicates the full Contract Proposal, Candidate, Rewire, Human Review, or Risk decision context.

**The Draft Authority Rule.** Only a Goal whose `definition_state` is `draft` exposes the inline Contract editor. An accepted Contract remains readable but cannot be edited in place; changing it proceeds through a new Goal and Rewire decision so accepted truth and its history are not silently rewritten.

**The Directed Relationship Rule.** Every maintained relationship keeps its two Goal endpoints, A → B direction, type, written reason, and state visible. A user may write or deactivate an active relationship here; a Runtime-discovered change still enters as a Rewire proposal and cannot bypass the Decision Center.

## Elevation & Depth

The system is flat by default. Page, Tree, and paper are separated primarily by background tone and hairline borders. The create dialog is the only sustained interactive surface that floats above the workspace; transient toasts and the local Tree filter disclosure use controlled ambient shadows only while open. The toolbar and active mobile tab use much lighter structural shadows, and the selected Tree node uses an inset edge rather than lifted depth.

### Shadow Vocabulary

- **Dialog and Toast Ambient** (`0 8px 28px rgba(26, 38, 52, .12)`): Dialog elevation and short-lived toast feedback.
- **Toolbar Structure** (`0 1px 2px rgba(18, 28, 40, .06)`): A hairline-depth cue beneath the global toolbar.
- **Selected Tree Edge** (`inset 0 0 0 1px rgba(14, 94, 199, .22)`): Definition inside the blue selected row without lifting it.
- **Active Mobile Tab** (`0 1px 3px rgba(22, 31, 43, .1)`): Small separation for the chosen Tree or Goal正文 tab.
- **Policy Switch Thumb** (`0 1px 2px rgba(20, 30, 42, .2)`): Local definition inside compact Policy switch rows, not surface elevation.
- **Tree Filter Disclosure** (`0 9px 24px rgba(25, 34, 45, .14)`): Brief local depth for the status selector while it is open; it never changes the document layout or becomes a persistent card.

The Goal document and Decision Center enter over `.24s` with a `cubic-bezier(.16, 1, .3, 1)` easing, toast feedback transitions over `.16s`, Policy source chevrons and switches respond over `.16s ease`, and the syncing indicator pulses on a `1s` cycle. Live refresh suppresses Goal-document re-entry animation. Reduced-motion mode shortens all animation and transition timing to `.01ms`.

**The Modal Elevation Rule.** Keep normal work surfaces flat; reserve sustained floating depth and backdrop treatment for the create dialog.

## Shapes

Shapes are compact and engineered: 3px priority markers, 4px Tree selections and inline references, 5px controls and bordered information groups, 6px dialog icons, and an 8px dialog. Borders are thin and cool gray; large rounded containers are not part of the shipped language. The selected Tree node is a compact blue rectangle with a subtle vertical gradient, while the document remains a continuous paper field rather than a stack of containers.

## Components

### Global Toolbar

- **Structure:** Fixed 58px desktop band with nearly opaque cool-white fill, bottom boundary, and a very light structural shadow.
- **Behavior:** Holds brand, source context, sync state, global search, Create Goal, counted Decision Center entry, archive, and Tree actions. The Decision Center link receives `aria-current` on `/decisions`, remains visible when lower-priority controls disappear at 900px, and becomes a labeled user icon for assistive technology while its visible text hides below 760px.
- **Icons:** Uses the shipped Lucide sprite and keeps icon strokes rounded and legible at compact sizes.

### Search Fields

- **Style:** White 34px field, 5px corners, compact horizontal padding, search icon, and a gray boundary.
- **Focus:** Blue boundary and restrained blue focus ring; global and Tree search values stay synchronized.
- **Keyboard:** Command/Ctrl+F focuses global search without displacing the native page flow.

### Goal Tree

- **Default:** Dense rows with disclosure control, Goal name as the 13px primary line, 9px Goal ID below it, and text-and-icon status.
- **Selected:** Blue vertical gradient, white text and icons, 4px corners, and an inset blue edge.
- **Behavior:** Selection opens the Goal at a stable URL; collapsed branches, keyword and status filters, and Tree scroll survive live updates. A filtered child keeps its ancestor path visible and expanded, while the footer counts direct matches rather than inflating the result with context nodes.

### Goal Tree Status Filter

- **Entry:** The funnel icon is an explicit disclosure trigger with `aria-expanded` and `aria-controls`; it opens the panel and focuses the first status instead of silently changing the search-field focus.
- **Selection:** Native compact checkboxes allow several currently present derived work states. Selection is OR-based and combines with the existing keyword query; a clear action removes only status choices, while the empty result action clears both filters.
- **Feedback:** The panel states how many status kinds are selected; the Tree footer reports direct matches as `显示 N / 总数`. No matching Goal receives a readable empty state rather than a frozen-looking pane.
- **Keyboard:** Escape closes the disclosure and returns focus to its trigger. Clicking outside closes it without losing the current selection.

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

### Decision Center

- **Authority and entry:** `/decisions` is the only full user-decision surface. The toolbar exposes its live pending count; Goal documents show only a Goal-specific count, explanation, and deep link to that Goal group.
- **Header and grouping:** A 25px–32px heading, large tabular total, and one hairline summary report Contract, Candidate, Rewire, Human Review, and open/triggered Risk counts. Records are grouped under the owning Goal name and ID; archived owners link to archived documents.
- **Record order:** Each Goal group presents Rewire first, then Contract Proposal, Candidate, Human Review, and Risk. This preserves dependency prerequisites before Contract approval without turning the surface into columns or a dashboard grid.
- **Candidate context:** A Candidate includes its title, Outcome, blocking mode, Why, business logic, why it falls outside the source Goal, in/out scope, structured acceptance, proposed impacts, proposed risks, and current project Review Policy before the user decides.
- **Decision forms:** Contract Proposal, Candidate, and Rewire all require `决定理由或修改意见`. Both actions disable during submission; failures render inline through `role="alert"`, and success force-refreshes the Decision Center plus its toolbar count before showing a toast.
- **Risk ownership:** Open and triggered Risks participate in the type summary. A Risk associated with exactly one Goal belongs to that group; a Risk associated with zero or multiple Goals renders once under Board-level ownership and lists every associated Goal, avoiding duplicate decisions. The Center links a uniquely owned Risk back to its Goal for full treatment and lifecycle maintenance.
- **Responsive:** The right work area keeps its continuous-paper grammar. Below 760px the header, Candidate context, reason row, Contract diff, and relationship evidence stack; the mobile tab names the right pane `决定中心`.

### Human Review

- **Entry condition:** Appears only for pending `human_approver` obligations, inside the owning Goal group in the Decision Center, and explicitly states that the user entry point owns this decision.
- **Form:** A 170px label column leads the verdict, existing Evidence choices, optional external references, and required reasoning. Verdict options are written in Chinese; evidence locators wrap instead of truncating.
- **Submit / Error:** The primary button disables during the request. Failure appears inline as a red-on-soft-red `role="alert"` and re-enables submission; success forces a refresh and confirms with a toast.
- **Narrow document:** At 660px of document width, labels stack, footer metadata wraps above the action, and the button remains right-aligned.

### Relationship and Contract Rows

- **Relationship ledger:** Upstream, downstream, and other relations form one vertical, hairline-divided ledger. Each row leads with the other Goal's name, keeps its ID secondary, spells out the full `A → relation → B` path, and shows the establishment reason plus a worded active, proposed, or inactive state.
- **User maintenance:** A 6px disclosure below the ledger opens the user-authority editor. Two accessible direction radios establish which Goal sits on the left; relation type and target selectors feed a live plain-language path preview; the required reason asks why A → B is correct rather than B → A. The authority notice links to `/decisions` and states that Runtime-discovered changes still require Rewire confirmation.
- **Reversible change:** Active rows expose a quiet `解除` action. Deactivation requires a written reason, uses a contained red confirmation state, and retains the inactive relationship, original direction, establishment reason, and deactivation reason in collapsible history.
- **Continuity:** Background refresh defers while either relationship form owns focus. The editor and inactive-history disclosure states survive cursor updates and page reloads; successful writes force an authoritative refresh before the toast appears.
- **Contract rows:** Goal Contract remains a continuous hairline-divided list with a 138px label column, not a set of separate containers. Names, reasons, history text, and non-HTTP references wrap naturally instead of hiding decision-critical content behind ellipsis.
- **Narrow document:** At 660px of document width, direction radios, relation selectors, reason, and footer stack to one column. At 760px form controls use 16px type and no relation path creates horizontal overflow.

### Draft Contract Editor

- **Entry and authority:** Appears immediately after the Draft's business logic, blockers, and acceptance checklist. A Goal-specific Decision Center notice may appear after business logic, but full pending decision forms never interrupt the document. The editor is rendered only while `definition_state` is `draft`; accepted Contracts never expose this in-place editor.
- **Contract fields:** One continuous form edits Goal name, priority, Outcome, Why, business logic, in-scope and out-of-scope items, constraints, required inputs, and promised outputs. List fields use one item per line instead of nested chips or cards.
- **Structured acceptance:** Each criterion keeps its own statement, decision method (`automated_check`, `measurement`, `inspection`, or `human_decision`), explicit pass condition, optional target, required Evidence types, and optional criterion ID. Criteria can be added or removed without collapsing them into one prose textarea.
- **Decomposition:** A bordered two-column radio group presents all four shipped states with plain-language explanations: `abstract` / 仍需拆分, `frontier_open` / Frontier 开放, `closed_leaf` / 最小可执行叶子, and `closed_compound` / 拆分完成的复合 Goal.
- **Risk and Impact entry:** The Draft editor links to the complete Risk Register and Impact Binding Workbench later in the Goal document rather than duplicating partial forms. The two workbenches own all ongoing lifecycle changes.
- **Submit / Error:** Saving the Draft requires a modification reason, disables its action during the request, reports failure inline through `role="alert"`, and force-refreshes plus toasts on success. Background live refresh defers while the form owns focus, protecting active input.
- **Narrow document:** At 660px, title and priority, list fields, decomposition choices, criterion fields, and auxiliary forms all become one column; at 760px form controls use 16px type.

### Risk Register

- **Continuous ledger:** Risks form one hairline-divided section in the Goal document instead of a card grid. Each record leads with its description and worded lifecycle state, keeps the Risk ID secondary, and shows probability, impact, trigger, treatment, blocking mode, revisit condition, owner, affected areas, and updated time without truncating decision-critical text.
- **Goal ownership:** Every affected Goal is shown name-first as a navigable link with its ID secondary. The create and edit forms use a searchable multi-Goal picker, defaulting to the open Goal, so one Risk can truthfully affect more than one Goal without being duplicated.
- **Visible effect:** Each record explains the current operational consequence in plain language. A triggered `invalidate_on_trigger` Risk invalidates its linked Goals; leaving the triggered state or changing its scope requires revalidation rather than silently restoring readiness.
- **Fact and lifecycle authority:** `新增风险`, `编辑事实`, and `变更状态` are separate disclosures. Fact edits cover all canonical fields and linked Goals; lifecycle changes expose exactly `open`, `triggered`, `resolved`, `accepted`, and `expired`. Every change requires a written audit reason, and archived Goals remain readable but not editable.
- **Continuity:** Successful writes force one authoritative cursor refresh and toast. Background refresh defers while a Risk form owns focus; disclosure state and reading position survive ordinary refreshes.
- **Narrow document:** At 660px, Risk fact fields, Goal picker, lifecycle control, impact preview, and action footer become one column. At 760px, form controls use 16px type and long Goal or Evidence references wrap without horizontal overflow.

### Impact Binding Workbench

- **Continuous ledger:** The Goal-owned Impact Binding Workbench is one hairline-ledger, not a cluster of cards. Active bindings lead with the human-readable surface; the opaque binding ID is supporting metadata. `新增 Impact` and `已停用记录` continue on the same vertical rule, so the reader can scan current constraints and their history in one place.
- **Facts and effect:** Each active record exposes its access (`read`, `write`, `decide`, or `exclusive`), confirmation state, input snapshot, reason, creator, and last update. A plain-language `当前影响` explains exactly how that combination affects concurrent Runtime claims; HTTP snapshots open as links and project references remain copyable.
- **User maintenance:** `新增 Impact` stores the complete facts. `编辑绑定` requires a written modification reason and records both the prior and current facts in the event history. A binding remains attached to its original Goal during edits; moving the work means adding a new binding to the target Goal and then stopping the old one.
- **History, not deletion:** `停用绑定` requires a reason, changes the binding to `inactive`, removes it from active claim-conflict evaluation, and retains its surface, original reason, snapshot, stop reason, and timestamp in the collapsible history ledger. Inactive records use neutral treatment so they cannot be mistaken for current constraints, while keyboard focus remains visible.
- **Continuity and responsive behavior:** Background refresh defers while any Impact form owns focus; successful create, edit, or stop forces one authoritative refresh and toast without clearing the document. At 660px fact rows and forms become one column; at 760px every Impact control uses 16px type and long surfaces or snapshots wrap instead of overflowing.

### Draft Contract Proposals

- **Structure:** The Decision Center shows one continuous current-to-proposed document. Each row keeps the business field, current value, proposed value, source type, confidence, rationale, and references readable without exposing protocol JSON.
- **Authority:** The header says that approval updates the same Goal rather than creating another one. Repository and document facts remain visibly proposed; the user must write a reason or modification request before rejecting the Proposal or confirming it as executable.
- **Prerequisites:** Pending Dependency Rewires render before their linked Contract Proposal in the same Goal group. While any linked Rewire still awaits a user decision, the approval action is disabled, says `先处理依赖调整`, and explains that resolving the dependency decision restores Contract approval; rejecting the Contract remains available.
- **Responsive:** Wide layouts use label, value, and source columns. Below 760px they stack in that order, with source evidence separated by a dashed hairline rather than another card.

### Dependency Proposals

- **Structure:** A continuous bordered list, not a dashboard card grid. Each proposal leads with Goal names, keeps IDs secondary, shows the dependency direction between them, then presents reason, direction rationale, rejection impact, basis, confidence, and evidence as readable rows.
- **State:** Add/deactivate and pending/applied/rejected labels always use words as well as semantic color. Pending proposals live only in the Decision Center; resolved proposals remain in relation history so later revalidation can reuse their evidence.
- **Decision:** Confirmation or rejection requires a written reason or modification request. Rewire uses its restrained violet label while primary confirm actions remain blue.
- **Interaction:** Goal endpoints navigate to their document. HTTP(S) evidence opens externally; repository or test references copy directly. On mobile the rationale becomes one column and the direction remains readable without horizontal overflow.

### Policy Workbench

- **Effective first:** A blue-edged 6px panel leads with `EFFECTIVE POLICY`, `当前最终生效规则`, and a text-bearing `已生效` state. Its six gates summarize localized Goal Mode, self-verification, independent Review with cross/adversarial breakdown, user confirmation, maximum lease, and required capabilities in a three-column definition list.
- **Inheritance:** A visible strip explains `01 · 项目默认 → 02 · 当前 Goal → 结果`. Each step names whether the project baseline is saved or system-provided, whether the Goal adds rules or fully inherits, and that the result is the final effective gate.
- **Source details:** Project Default and Goal Override are separate 6px disclosure surfaces with source index, English eyebrow, Chinese title, source-specific status, and saved actor/time when present. Project uses quiet gray; Goal uses a blue wash and is open by default. Goal rules may add requirements but cannot weaken the project minimum.
- **Runtime entry:** Goal Mode is three accessible radio choices—关闭, 建议, 强制—with a plain-language consequence under each label. Required capabilities and maximum lease share their own Runtime group instead of appearing as unlabeled row values.
- **Verification and Review:** Self-verification and user confirmation use labeled switch rows. Cross Review and adversarial Review use numeric people controls paired with explanations, making each count's purpose visible before editing.
- **Audit:** Capabilities and lease remain grouped with Runtime entry; a separate `变更说明` group requires an audit reason. The footer explains whether the Goal rule merges with the project baseline or the project baseline is being replaced while history remains available.
- **Submit / Error:** Submission disables its button, reports failures inline through `role="alert"`, and forces an authoritative refresh plus toast after success. While the form owns focus, background cursor refresh defers rather than replacing the edit.
- **Narrow document:** At both the 660px document-container boundary and the 760px mobile viewport boundary, the effective gates become two columns, inheritance turns vertical, source descriptions and saved subtext hide, Goal Mode / capability / switch / reviewer controls become one column, and the audit reason and footer stack without leaving the continuous document flow.

### Inline References

- **HTTP(S):** Open as a real external link in a new context and include the external-link icon.
- **Other References:** Copy the exact value using a button with a Copy icon and transient toast confirmation.
- **Style:** Transparent, blue-dark, and integrated into prose instead of presented as a decorative badge. Long repository and protocol references wrap at safe break points so their exact value remains readable.

### Mobile View Switch

- **Structure:** A 42px two-option switch immediately below the 52px mobile toolbar.
- **Behavior:** Tree and Goal正文 are mutually exclusive views on Goal routes; on `/decisions`, the second tab is labeled `决定中心`. Switching preserves local reading state.

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
- **Do** make user-maintained relationships explicit and reversible: show both endpoints, direction, type, reason, state, and retained deactivation history.
- **Do** route every full pending Contract Proposal, Candidate, Rewire, Human Review, and Risk context through `/decisions`, grouped by owner Goal.
- **Do** require a written reason or modification request for Contract Proposal, Candidate, and Rewire actions before submitting.
- **Do** show full Candidate context—including source separation, scope, acceptance, impacts, risks, and project Review Policy—before asking for a decision.
- **Do** count a multi-Goal Risk once under Board-level ownership while preserving links to every associated Goal.
- **Do** show Draft gaps and field provenance before asking the user to confirm a Contract Proposal.
- **Do** keep the Draft-only editor after business logic, blockers, and the acceptance checklist, and keep accepted Contracts read-only in place.
- **Do** preserve each acceptance criterion's decision method, pass condition, target, and Evidence requirements as structured fields.
- **Do** use the four shipped decomposition choices, the full Risk Register, and the complete Impact Binding Workbench to make execution boundaries explicit before acceptance.
- **Do** keep active Impact bindings, creation, and inactive history in one continuous ledger; require reasons for updates and stopping a binding, and retain history instead of erasing it.
- **Do** collapse internal grids at the shipped 1180px and 760px breakpoints, then use the mobile Tree / route-specific Goal正文-or-决定中心 switch.
- **Do** let the 660px document-container rule stack Draft, Risk, Impact, and Human Review fields while turning Policy inheritance vertical and Policy controls into one column, even inside a wide viewport.
- **Do** read Policy as final effective gates → 01 Project Default → 02 Goal Override, preserving each source's status, saved provenance, and required audit reason.
- **Do** present Goal Mode as three labeled radio choices, self/human requirements as switches, and reviewer counts with their purpose beside them.
- **Do** defer background refresh while any focused live form is being edited, then force-refresh after a successful submission.
- **Do** suppress nonessential motion during live refresh and honor reduced-motion timing.
- **Do** expose the 5px Tree separator as a keyboard-operable resize control and retain the chosen width.

### Don't:

- **Don't** fragment one Goal into detached modules when a continuous reading order communicates its contract and history more clearly.
- **Don't** use amber for waiting or use any semantic hue as a color-only status signal.
- **Don't** add heavy shadows or large radii to ordinary work surfaces; depth is exceptional and borders do most of the structural work.
- **Don't** replace the shipped Lucide line language with mixed icon families, emoji, or unlabeled glyphs.
- **Don't** reset the reader to the top or discard open branches when live data changes.
- **Don't** duplicate full decision forms inside Goal documents; keep only the short Goal-specific notice and link there.
- **Don't** hide the Decision Center entry with secondary toolbar actions at 900px or remove its accessible label when it becomes icon-only below 760px.
- **Don't** show both Tree and the Goal正文-or-决定中心 work area simultaneously below 760px.
- **Don't** turn Goal Contract into a matrix of detached boxes; keep its 138px label and flexible content rows continuous.
- **Don't** present Contract Proposal fields as raw JSON or let a Runtime-facing control imply that it can approve its own proposal.
- **Don't** let Runtime proposals write active relationships directly or let user relation maintenance erase the historical reason for a prior direction.
- **Don't** expose the Draft editor for an accepted Contract or silently rewrite accepted truth without the new-Goal and Rewire path.
- **Don't** flatten structured acceptance into one undifferentiated textarea or invent decomposition states beyond the shipped four.
- **Don't** compress Draft, Risk, Impact, Policy controls, or Human Review into a fixed desktop label grid when the document container is narrower than 660px.
- **Don't** use an edit request to move an Impact silently between Goals, or let an inactive record look like an active Runtime-claim constraint.
- **Don't** collapse Policy into anonymous label/value rows; keep localized modes, switches, reviewer purpose, and audit context visible.
- **Don't** hide the inheritance chain or blur Project Default and Goal Override into one unsourced rule.
- **Don't** make the Tree filter an invisible focus jump or a single-select status badge; it is a visible, multi-select local disclosure that preserves the reader’s Tree context.

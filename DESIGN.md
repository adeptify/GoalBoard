---
name: GoalBoard Quiet Intent Workspace
description: A quiet Goal truth workspace that keeps one selected Goal continuous across Navigator, Focus, and Runtime.
colors:
  light-page: "#f2f3f5"
  light-paper: "#ffffff"
  light-ink: "#1a1c21"
  light-ink-soft: "#3f4652"
  light-muted: "#6c7380"
  light-faint: "#9aa0aa"
  light-line: "#e5e7eb"
  light-line-strong: "#d7dae0"
  light-rail: "#f5f6f8"
  light-mineral-blue: "#4f6ff7"
  light-mineral-blue-strong: "#3654d8"
  light-mineral-blue-soft: "#eef1ff"
  light-green: "#2b8a57"
  light-green-soft: "#edf8f1"
  light-amber: "#a76513"
  light-amber-soft: "#fff6e7"
  light-red: "#bf4545"
  light-red-soft: "#fff0f0"
  light-terminal: "#11141a"
  light-terminal-ink: "#eef1f5"
  dark-page: "#111318"
  dark-paper: "#191c22"
  dark-ink: "#f1f3f6"
  dark-ink-soft: "#c7ccd4"
  dark-muted: "#9ba2ae"
  dark-faint: "#747c89"
  dark-line: "#2a2e36"
  dark-line-strong: "#363b45"
  dark-rail: "#15181e"
  dark-mineral-blue: "#7189ff"
  dark-mineral-blue-strong: "#9bafff"
  dark-mineral-blue-soft: "#242c4b"
  dark-green: "#61c58b"
  dark-green-soft: "#183326"
  dark-amber: "#e0a553"
  dark-amber-soft: "#382b18"
  dark-red: "#f07575"
  dark-red-soft: "#3a2024"
  dark-terminal: "#0c0f14"
  dark-terminal-ink: "#eef1f5"
  rewire-violet: "#6b4eb6"
typography:
  display:
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
    fontSize: "clamp(21px, 2vw, 27px)"
    fontWeight: 700
    lineHeight: 1.18
    letterSpacing: "-0.035em"
  decision-display:
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
    fontSize: "clamp(25px, 2.3vw, 32px)"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.03em"
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "-0.015em"
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.003em"
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.5
  micro:
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
    fontSize: "10px"
    fontWeight: 650
    lineHeight: 1.5
rounded:
  compact: "4px"
  item: "5px"
  control: "6px"
  runtime: "7px"
  popover: "8px"
spacing:
  xxs: "4px"
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "12px"
  section: "18px"
  pane: "32px"
components:
  topbar:
    backgroundColor: "{colors.light-paper}"
    textColor: "{colors.light-ink}"
    typography: "{typography.label}"
    rounded: "0"
    height: "48px"
    padding: "0"
  tree-node-selected:
    backgroundColor: "{colors.light-mineral-blue-soft}"
    textColor: "{colors.light-mineral-blue-strong}"
    typography: "{typography.label}"
    rounded: "{rounded.item}"
    height: "31px"
    padding: "3px 7px"
  goal-document:
    backgroundColor: "{colors.light-paper}"
    textColor: "{colors.light-ink}"
    typography: "{typography.body}"
    rounded: "0"
    padding: "22px 32px 56px"
    width: "min(100%, 940px)"
  primary-action:
    backgroundColor: "{colors.light-mineral-blue}"
    textColor: "{colors.light-paper}"
    typography: "{typography.label}"
    rounded: "{rounded.item}"
    height: "40px"
    padding: "0 15px"
  status-tag:
    textColor: "{colors.light-muted}"
    typography: "{typography.micro}"
    rounded: "{rounded.compact}"
    height: "19px"
    padding: "1px 5px"
  theme-menu:
    backgroundColor: "{colors.light-paper}"
    textColor: "{colors.light-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.popover}"
    padding: "6px"
    width: "166px"
  runtime-terminal:
    backgroundColor: "{colors.light-terminal}"
    textColor: "{colors.light-terminal-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.runtime}"
    padding: "10px"
  mobile-surface-switch:
    backgroundColor: "{colors.light-rail}"
    textColor: "{colors.light-mineral-blue-strong}"
    typography: "{typography.micro}"
    rounded: "0"
    height: "40px"
    padding: "5px 8px"
---

# Design System: GoalBoard Quiet Intent Workspace

## Overview

**Creative North Star: "Quiet Intent Workspace"**

GoalBoard should feel like a quiet place where intent stays legible while work moves between people and AI Runtimes. It is the cross-Runtime truth source for long-running Goals, not a Dashboard and not an Agent Orchestration console. The selected Goal is the continuous thread: users locate it in Navigator, understand and decide in Focus, then act through its Goal-bound Runtime without losing ownership or context.

The world combines graphite and cool-paper materials, one mineral-blue current path, dense native system type, Lucide line icons, one-pixel seams, restrained 4–8px corners, and a dark terminal well. Wide workstation and narrow Harness-companion layouts are two responsive expressions of the same world. Light, Dark, and Follow System are first-class presentation preferences and do not change domain truth.

This document carbonizes the shipped visual foundation, Navigator, action-led Focus, responsive Runtime workbench, and the read-only Goal Graph. The approved promotional workstation screenshots remain separate acceptance artifacts; they must not be mistaken for permission to replace real GoalBoard behavior with a decorative mock.

**Key Characteristics:**

- One selected Goal remains continuous across Navigator, Focus, and Runtime.
- A quiet 48px app bar sits above a seam-built three-pane workstation.
- Cool rail, paper, and graphite surfaces create hierarchy without dashboard cards.
- Mineral blue marks current path and available action; semantic colors remain sparse.
- Native system typography and Lucide line icons keep the interface compact and familiar.
- Light, Dark, and System themes preserve identical structure and meaning.
- Narrow layouts expose Goals, Focus, and Runtime one at a time through an underline switch.
- Cursor-driven refresh preserves selection, reading position, open controls, and in-progress input.

## Colors

The palette is a paired Light/Dark token set. Each `light-*` token maps to the same semantic CSS custom property as its `dark-*` counterpart; System resolves that pair from `prefers-color-scheme` while preserving the user's explicit preference.

### Primary

- **Mineral Blue:** The selected Goal path, active navigation line, primary action, links, and keyboard focus. The stronger value carries readable text; the soft value carries selection and informational washes.

### Secondary

- **Operational Green:** Satisfied, connected, and successful states, always paired with a worded label.
- **Review Amber:** Review, caution, unresolved Risk, and inconclusive evidence; it does not mean passive waiting.

### Tertiary

- **Rewire Violet:** A narrow semantic exception for relationship-change records, always shown beside the explicit Rewire label.
- **Blocker Red:** Blocked, failed, offline, destructive, or triggered-risk states, supported by a soft field when the message needs a container.

### Neutral

- **Cool Page:** The seam between working regions and the application canvas around paper.
- **Paper:** The Focus reading surface, controls, menus, and active TUI tab.
- **Graphite Ink:** Primary content and decisive labels; the soft, muted, and faint steps establish metadata hierarchy.
- **Quiet Rail:** Navigator and Runtime chrome, deliberately distinct from the paper Focus pane.
- **Hairlines:** Ordinary and strong one-pixel seams; structure comes from these boundaries rather than elevation.
- **Terminal Graphite:** A deliberately stable dark viewport inside both themes; terminal ink remains high contrast.

### Named Rules

**The Mineral Path Rule.** Mineral blue marks the selected path and an available action; it does not flood whole work surfaces.

**The Semantic Pairing Rule.** Green, amber, violet, and red always travel with readable text and, where helpful, a Lucide icon; color is never the only status carrier.

**The Theme Parity Rule.** Light, Dark, and Follow System change presentation only. They preserve hierarchy, component state, focus visibility, and Goal meaning.

## Typography

**Display Font:** Native system sans-serif with SF Pro Text, PingFang SC, Microsoft YaHei, system-ui, and sans-serif fallbacks

**Body Font:** The same native system stack

**Character:** Compact, calm, and tool-native. Chinese and English share one hierarchy; meaning comes from weight, scale, spacing, and position rather than a decorative display face.

### Hierarchy

- **Display:** `typography.display` names the selected Goal at the top of Focus.
- **Decision Display:** `typography.decision-display` is reserved for the Decision Center's user-owned judgment heading.
- **Headline:** `typography.headline` introduces major Goal sections.
- **Body:** `typography.body` carries descriptions, contracts, history, and Runtime context.
- **Label:** `typography.label` carries toolbar actions, tabs, inputs, and compact controls.
- **Micro:** `typography.micro` carries Goal IDs, status tags, supporting counts, and timestamps.

### Named Rules

**The Native Tool Rule.** Do not add a brand font merely to make GoalBoard look designed; precision, density, and hierarchy carry the identity.

**The Human-First Reading Rule.** Keep Outcome, Why, business logic, decisions, and failure explanations as readable sentences; protocol nouns and opaque IDs are supporting metadata.

## Layout

The wide workstation is one dynamic-viewport grid. A 48px app bar establishes project context, pending decisions, locale, theme, and settings. Below it, Navigator defaults to `clamp(292px, 22vw, 380px)`, a 5px keyboard-operable seam separates each region, Focus receives the flexible center, and Runtime defaults to `min(36vw, 600px)`. The Goal document itself stays centered at a maximum of 940px with 32px horizontal working space. Tree and TUI widths remain independently resizable and persist; the shipped interaction bounds remain 260–520px for Navigator and 280–720px for Runtime.

Navigator is a searchable Goal Tree, not a list of jobs assigned by the Board. Goal names lead, IDs recede, selected rows use a soft mineral wash plus a 2px inset path marker, and ancestors remain visible when a descendant matches. Keyword search and the multi-select status filter compose without destroying the user's collapsed state or reading position.

Navigator offers List and Graph as two readings of the same Goal facts. List remains the default for daily scanning. Graph expands into the work area, keeps Focus on the right, and renders only active `part_of` and `depends_on` relations using their stored direction. Its default focus shows the selected Goal and directly related nodes; users may reveal the full network or isolate either relationship type. Selecting a graph node changes the same Focus without writing Goal or Relation state.

Focus belongs to one selected Goal. Its stable five-tab navigator exposes `概览`, `完成要求`, `进展与阻塞`, `关联与约束`, and `完整记录`, with one panel visible at a time. Overview owns the single primary next action. Completion owns acceptance, scope, child progress, and dependencies. Progress owns current worker, Runs, Evidence, Reviews, blockers, and active Risks. Relationships & Constraints owns relationship, Risk, Impact, and work-rule maintenance. Full Record is read-only. `快速记录` stays at title level for Goal-scoped Evidence, Risk, Impact, or relationship input. Tabs support Left/Right/Home/End, persist through refresh, and open the right panel for deep links.

The Decision Center uses the same continuous-paper reading model. It groups user-owned Contract, Candidate, Rewire, Human Review, and Risk decisions by Goal; Board-level or multi-Goal Risks appear once with every affected Goal linked. Each item leads with the user's question, why it matters now, supported recommendation or explicit evidence gap, and the outcome of each choice. Recent canonical outcomes remain visible after a pending record closes. Internal type names and IDs stay secondary.

Runtime is a Goal-bound viewport beside Focus, not another truth surface. Its owner Goal and human-readable state remain visible. Terminal tabs never rebind when the user selects another Goal; parent and child Goals do not inherit one another's tabs. A `closed_compound` parent cannot create, reopen, write to, or close execution terminals and instead routes the user to an executable child. Opening a terminal does not claim work or send input; any fill or advance action requires an explicit click.

At 1180px, dense internal grids reduce before core panes disappear. At 1120px, the shell compacts Navigator, Focus, and Runtime defaults. At 900px, lower-priority toolbar actions yield space while the primary Goal and decision entry remain reachable. At 760px, the app becomes a 48px toolbar plus a 40px Goals / Focus / Runtime switch; exactly one surface is visible, separators disappear, Focus uses 18px side space, Decision Center uses 24px, and forms use 16px controls. At 660px of document container width, labels, ledgers, policy controls, relationship editors, Risk forms, Impact forms, Human Review, and footers stack even when the outer window is wide.

**The Selected Goal Thread Rule.** Selecting a Goal changes Focus while preserving the Goal-owned Runtime relationship; Navigator, Focus, and Runtime always name the same context explicitly when they offer an action.

**The Stable Workspace Rule.** Cursor-driven refresh atomically replaces authoritative Goal content while preserving selection, collapsed branches, filters, scroll, mobile surface, resizer widths, disclosures, URL history, and valid in-progress form state. Focused live forms defer background replacement; a successful submission forces one authoritative refresh without a white frame.

**The Single Decision Door Rule.** `/decisions` is the only full user-decision surface. Goal detail may show a count and deep link, but it never duplicates the complete decision form or implies that a Runtime can approve its own proposal.

## Elevation & Depth

The workspace is flat by default. Page, rail, paper, and terminal are separated by tonal contrast and one-pixel seams. The top bar has no shadow. A selected Tree row stays flat and uses an inset mineral edge. Runtime depth is an inset terminal boundary. Sustained ambient elevation belongs to temporary menus and dialogs only.

### Shadow Vocabulary

- **Light Floating Surface** (`0 18px 48px rgba(23, 27, 35, .14)`): Theme menus and dialogs in Light.
- **Dark Floating Surface** (`0 20px 56px rgba(0, 0, 0, .32)`): The same temporary surfaces in Dark.
- **Selected Path Edge** (`inset 2px 0 0 var(--blue)`): Navigator selection without lifted-card depth.
- **Terminal Inner Edge** (`inset 0 1px 0 rgba(255,255,255,.025)`): Minimal definition inside the graphite Runtime well.

Theme-menu state transitions use a short 160ms ease. Live refresh avoids re-entry motion, and reduced-motion preference removes the remaining nonessential transition.

### Named Rules

**The Seam-First Rule.** Use tonal layering and 1px seams for persistent structure; reserve shadow for a temporary surface that truly overlaps the workspace.

## Shapes

The form language is restrained and engineered. Status tags and tiny inline states use 4px corners; rows and ordinary actions use 5px; controls use 6px; the Runtime well uses 7px; menus and dialogs stop at 8px. Full panes, document regions, tab rails, and mobile surface navigation stay square. Curves support touch and grouping but never turn work areas into floating cards.

**The Small-Radius Rule.** Ordinary interface geometry stays within the shipped 4–8px range; larger radii require a new, explicit product reason.

## Components

### Global Toolbar and Theme Picker

- **Structure:** A quiet 48px full-width band with one bottom seam; brand, project context, decision entry, locale, theme, and settings share this line.
- **Theme:** Light, Dark, and System are equal options. The preference is local presentation state; System follows `prefers-color-scheme` and responds to OS changes.
- **Narrow:** Lower-priority text collapses before the primary Goal context. Icon-only controls retain accessible labels.

### Goal Navigator

- **Tree:** Rows follow a compact 34px rhythm around 31px selectable items. Goal title is primary, Goal ID is micro metadata, and dependencies remain visually attached to their Goal.
- **Selected:** Soft mineral-blue surface, strong blue text, and an inset 2px current-path edge; never a saturated full-row fill.
- **Tools:** Search and multi-select status filtering preserve ancestors, expansion, and direct-match counts. The 5px separator is draggable and keyboard operable.
- **Scope:** These rules describe the shipped Navigator, including List / Graph choice, search, status filtering, progressive dependency disclosure, and the selected Goal thread.

### Goal Focus and Detail Tabs

- **Document:** A paper reading surface with continuous hairline sections rather than a stack of dashboard cards.
- **Tabs:** Five 40px task tabs use a 1px mineral underline for the active panel and preserve keyboard and deep-link behavior.
- **Action hierarchy:** Overview carries one primary next action. Full Record remains read-only; writes live in their owned panel or `快速记录`.
- **Scope:** These rules describe the shipped action-led Focus with its result, next step, blocker, acceptance, context, progress, relationship, and record surfaces.

### Buttons, Inputs, and Status

- **Primary:** Mineral blue, white label, 5px corners, compact padding, and a stronger-blue hover state.
- **Secondary:** Paper or transparent, one-pixel boundary where containment matters, graphite text, and a quiet rail or blue-soft hover.
- **Inputs:** Paper background, 1px strong seam, 5–6px corners, and the shared focus outline. Narrow form controls become 16px without inflating reading text.
- **Status:** A compact icon-and-word label on a soft current-color wash. Waiting stays neutral; semantic colors remain tied to meaning.

### Decision Center

- **Authority:** The only complete confirmation and review surface; it never reads like an orchestration dashboard.
- **Order:** Within each Goal, Rewire precedes linked Contract work, followed by Candidate, Human Review, and Risk.
- **Context:** Each decision preserves full consequence, Evidence, reason, and historical result. Invalid executable structure routes to correction rather than presenting a false approval path.
- **Continuity:** Submission disables actions, reports inline errors with `role="alert"`, refreshes authoritative state, and leaves recent outcomes visible.

### Runtime Dock and TUI

- **Structure:** Quiet rail chrome around a deliberately dark terminal well. Tabs, persistent Goal owner, state, actions, and parent guard remain outside terminal content.
- **Ownership:** Every tab is bound to the Goal where it opened. Cross-Goal and waiting-parent writes are refused; historical parent terminals can remain readable without becoming executable again.
- **Narrow:** Runtime becomes the third exclusive surface, never a squeezed column below 760px.

### Dialogs and Menus

- **Menus:** 8px paper popovers with one strong seam and theme-aware ambient shadow; rows use 5px corners.
- **Dialogs:** The only sustained floating surface. Keep viewport-safe scrolling, explicit headings, keyboard focus, and a dim backdrop; mobile dialogs fill the viewport with square outer corners.
- **No glass:** A dimmed backdrop may separate a modal, but the surface itself remains opaque paper.

### Accessibility Baseline

- **Keyboard:** All actions, tabs, disclosures, theme choices, and resizers are operable without a pointer. Tabs expose their selected state and support conventional arrow-key movement.
- **Focus:** Interactive elements use the shared 2px mineral-blue focus outline with 2px offset; focus is never removed for aesthetic reasons.
- **Meaning:** State uses words plus color and optional Lucide icon. Icon-only buttons retain names, long IDs and references wrap, and HTTP(S) references remain links while local references remain copyable.
- **Motion and themes:** Reduced motion is honored. Light, Dark, and System each preserve contrast, focus visibility, and terminal legibility.
- **Live updates:** Search input, IME composition, focused live forms, disclosures, scroll position, and mobile surface are protected from background refresh replacement.

## Do's and Don'ts

### Do:

- **Do** keep the selected Goal explicit across Navigator, Focus, and Runtime.
- **Do** preserve Goal Tree selection, collapsed branches, filters, scroll, mobile surface, resizer widths, disclosures, and valid form input across live refresh.
- **Do** keep the five Goal Detail tabs stable, keyboard operable, single-panel, and deep-link aware.
- **Do** keep `/decisions` as the sole full decision surface and lead each decision with the user's question, timing, evidence, and consequences.
- **Do** keep Runtime tabs bound to their owner Goal and route non-executable parents to concrete child Goals.
- **Do** pair every semantic color with readable state text and, where useful, one Lucide icon.
- **Do** use the same semantic hierarchy and behavior in Light, Dark, and Follow System.
- **Do** let the document-container rule stack complex fields at 660px and the shell switch surfaces at 760px.
- **Do** use 1px seams, opaque tonal surfaces, compact system type, and restrained 4–8px corners.
- **Do** keep pending and recent decision outcomes grounded in canonical events, Evidence, and user reasons.

### Don't:

- **Don't** turn GoalBoard into a Dashboard, Kanban, or Agent Orchestration control room.
- **Don't** fragment continuous Goal truth into a grid of decorative cards.
- **Don't** use gradients, glass surfaces, decorative glow, heavy persistent shadows, or oversized radii.
- **Don't** use mineral blue as ambient decoration; reserve it for current path, focus, links, and available action.
- **Don't** use color alone for Ready, Blocked, Risk, Review, connection, or completion state.
- **Don't** mix icon families, emoji, or unlabeled glyphs into the Lucide line language.
- **Don't** duplicate full decisions inside Goal detail or expose internal protocol nouns as the only explanation.
- **Don't** rebind, reopen, write to, or close a Runtime terminal from the wrong Goal or an execution-ineligible parent.
- **Don't** show Goals, Focus, and Runtime simultaneously below 760px.
- **Don't** treat the approved workstation screenshots as global page templates or replace the shipped Navigator, Focus, Graph, or Runtime behaviors with decorative mock content.

---
name: GoalBoard Calm Desktop
description: A calm single-directory desktop workbench with project-scoped Goal tabs and softly layered work surfaces.
colors:
  accent: "#5068b7"
  accent-strong: "#344b9b"
  accent-soft: "#e9edfb"
  app-canvas: "#f3f3f5"
  goal-canvas: "#ffffff"
  navigator: "#f1f1f3"
  ink: "#19191b"
  ink-soft: "#424247"
  muted: "#62626b"
  line: "#e7e7ea"
  line-strong: "#d9d9de"
  action: "#202023"
  action-ink: "#fbfbfc"
  terminal-dark: "#101012"
  terminal-light: "#fbfbfc"
  semantic-green: "#347759"
  semantic-amber: "#936b2d"
  semantic-red: "#a64e51"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "clamp(27px, 2.25vw, 34px)"
    fontWeight: 710
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "-0.015em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.52
    letterSpacing: "normal"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  item: "6px"
  control: "8px"
  transient: "10px"
  surface: "14px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-ink}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
    height: "38px"
  search-field:
    backgroundColor: "{colors.goal-canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 31px"
    height: "34px"
  goal-row-selected:
    backgroundColor: "{colors.goal-canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.item}"
    padding: "5px 8px"
---

# Design System: GoalBoard Calm Desktop

## Overview

**Creative North Star: "Calm Desktop"**

GoalBoard is a high-frequency personal workbench, not a dashboard, a lightweight home screen, a stack of paper cards, or an AI chat homepage. Its desktop workspace has two stable regions: one graphite directory that owns project and work navigation, and one flexible tabbed work surface that keeps several Goals from the current project open without duplicating domain state.

The design is quiet because hierarchy comes from deep and light versions of the same cool palette, restrained spacing, soft local shadows, and clear scope—not a grid of borders. The directory changes in place only when the user enters Goals; Inbox and planned modules leave the root directory visible and open in the right work surface as reusable utility contexts. The right work surface preserves the existing Goal Detail content, but groups it into soft paper panels so the first viewport can explain the Goal and expose its next meaningful work.

**Key Characteristics:**

- One desktop directory instead of parallel navigation columns.
- Project-scoped, persistent Goal tabs above the main work surface.
- A dense first viewport that explains and advances the current Goal.
- Soft tonal surfaces and calibrated shadows instead of pervasive structure lines.
- Cool monochrome surfaces with a restrained cobalt focus color.
- Editorial Goal sections organized by a narrow label column and a readable content column.
- Compact information density in navigation, with calm reading density in the selected Goal.
- Runtime application chrome follows GoalBoard; only the terminal canvas becomes a distinct execution environment.

## Colors

The palette uses cool neutrals for structure and one low-saturation cobalt for focus, links, and progress. Green, amber, and red are reserved for true semantic state.

### Primary

- **Cobalt Focus**: used for keyboard focus, progress, links, and the rare selected control.
- **Deep Cobalt**: used where the accent must remain legible on pale surfaces.

### Neutral

- **App Canvas**: the outer desktop and landing-page field.
- **Goal Canvas**: the primary reading, decision, settings, and dialog surface.
- **Navigator Gray**: the Project and Goal directory surface.
- **Desktop Ink**: primary titles and actions.
- **Soft Ink**: explanations and secondary facts.
- **Quiet Line**: persistent structural separators.
- **Terminal Dark / Terminal Light**: curated execution-canvas palettes, independent from the surrounding Runtime application chrome.

**The One Accent Rule.** Cobalt appears only for focus, links, progress, and selected intent. It never becomes a decorative field or a general-purpose card tint.

**The Semantic Color Rule.** Green, amber, and red always describe real application state and appear with text, never as decoration.

## Typography

**Display Font:** native system UI stack with Chinese-first fallbacks.

**Body Font:** the same native system stack.

**Character:** direct, compact, and platform-native. Hierarchy comes from weight and scale rather than mixing type families or adding tracked micro-labels.

### Hierarchy

- **Display** (710, 27-34px, 1.2): selected Goal titles; the desktop Goal Detail uses a compact 21-28px expression.
- **Headline** (700, 17px, 1.35): the current next action and important section statements.
- **Title** (700, 13-14px): Project names, section labels, and settings headings.
- **Body** (400, 13px, 1.52): explanations and document content, normally held below 68 characters per line.
- **Label** (650, 10-12px): tabs, metadata, compact controls, and status text.

**The Native Clarity Rule.** Do not introduce display fonts or monospace styling for atmosphere. Monospace remains limited to commands, identifiers, and measured values.

## Layout

On Desktop at 761px and above, the workspace has two regions: a single resizable directory approximately 286-334px wide, and the remaining width as the main workbench. The directory is the only persistent navigation column. A narrow resize affordance sits between the regions without becoming another visual pane.

In macOS Overlay mode, `--desktop-titlebar-height` reserves a 48px native-chrome band. The Goal workspace puts the project selector and project-settings control directly in that band, to the right of the traffic lights, instead of consuming a second project row. Their shared 32px control row is derived from `trafficLightPosition.y = 16px`, so the project icon, label, chevron, settings control, and native buttons share one vertical center. The remaining left-side titlebar space and an elastic right workbench track with a 72px minimum may drag the window; interactive controls explicitly remain no-drag.

Project and Global Settings use the same titlebar rhythm: 48px safe region, 50px project layer, and 50px scope heading in the directory, aligned with a 48px work-surface topbar. Settings and project-index topbars do not make their outer containers draggable; only plain-text context or otherwise empty spacer regions may drag the window. The directory resizer starts at grid row 2, below the titlebar band, and utility tabs stay on one line. These Overlay rules do not change ordinary Web or the Companion at 760px and below.

The titlebar contains the current project selector, its real project dropdown, and a separate project-settings control. The directory root begins immediately below it with Inbox, Goals, Feed, Promotion, and Visual Workspace, without permanent group headings or a resident search field. Inbox exposes real pending decisions in a right-side tab while future synchronized input and promotion flows remain planned. Feed, Promotion, and Visual Workspace select the same-named utility tab and an honest reserved right work surface, but they never fabricate items, counts, or working flows. Switching back to a Goal restores its detail subtab, scroll position, open Goal tabs, and Focus or Runtime mode.

Entering Goals replaces the root directory in the same column with the original Goal Tree. Parent-child expansion, status filtering, creation, list/relationship views, archive, and trash remain available through a compact heading and on-demand tools. A visible back action returns to the root. Inbox is the exception: selecting it preserves the root directory and opens or reuses the `Inbox` tab, where compact typed rows expand into the existing decision workflow.

The directory footer stays pinned to the bottom and shows the local identity and local-space state. Its Settings control always enters global settings. Project settings remain beside the project selector at the top, so project scope and device scope cannot be mistaken for one another.

The right workbench begins with project-scoped work tabs. Opening a Goal creates or reuses its tab; the current project may retain at most eight Goal tabs in local device storage. Closing an inactive tab only removes it, while closing the active tab selects an adjacent Goal and preserves at least one displayable Goal. Switching projects restores that project's own tab set. Goal selection continues to use the existing asynchronous document loading, history, write actions, and Goal-bound Runtime.

The Goal work surface retains the existing Detail blocks: status and facts, title, the three-part Contract, overview, completion requirements, progress and blockers, relations and constraints, and record history. Next Step, completion requirements, execution context, and the Runtime companion remain first-viewport priorities. The composition uses softly tinted panels and low diffuse shadows, with structural lines reserved for places where they clarify state or reading order.

Project Settings and Global Settings reuse the same single-directory / work-surface language. Project Settings contains the current project's Work Rules and Work Planning; Global Settings contains device-level Appearance & Language, AI & Execution Tools, and Diagnostics. Headers, directory labels, close/return behavior, and explanatory copy state the active scope.

At 760px and below, Desktop returns to the established Goals / Focus / Runtime Companion and does not force the directory or work-tab strip into the narrow layout. Ordinary browser Web retains its existing information architecture and does not render the Desktop single-directory shell.

Context, Progress, Relationships, and Record share one two-layer section-deck grammar. Equal-width summary cards form a stable selector row and never move when selection changes. The tallest real title or description sets the whole row height; summaries are never line-clamped or clipped to simulate uniformity. Icon, count, and caret align to the first content line. One full-width detail stage below the row reveals the selected body. At narrow widths the selector row wraps to two columns, then one only when necessary; the stage remains beneath it. Main-tab changes return the document to its readable top inset, and deep links reveal the owning stage before scrolling.

**The One Directory Rule.** The root modules, Goals, the Goal Tree, and settings navigation all use one left directory; project context belongs to the titlebar, while Inbox and planned modules keep the root visible and open in the work surface. Never add a second persistent navigation column.

**The Project Tabs Rule.** Work tabs belong to one project, reuse existing Goals, persist locally, and never become a second source of Goal truth.

**The Native Chrome Safe-Zone Rule.** In macOS Overlay mode, reserve the 48px titlebar band and align its left project controls to the native `y=16px` traffic-light center. Only empty or plain-text titlebar regions may drag; tabs, buttons, interactive containers, and the resizer never overlap the traffic lights or inherit drag behavior.

**The First-Viewport Rule.** The desktop Goal screen must show Goal Contract and actionable work in its first viewport. Large empty hero space, a lightweight home composition, or a chat-first opening fails this rule.

## Elevation & Depth

The system uses shallow, persistent layering. The single directory casts a soft lateral shadow against the workbench; active directory items, selected Goal tabs, Contract panels, Next Step, completion, context, Runtime companion, and settings sections may use low diffuse shadows over tonal surfaces. Larger ambient elevation remains reserved for menus and dialogs. Light and Dark use the same hierarchy with theme-appropriate shadow color.

**The Soft Layer Rule.** Use a low shadow to separate one meaningful navigation or content level, not to make every row float.

**The Line Rationing Rule.** A border must explain state, grouping, or interaction. Do not outline every item or split the entire workspace into a management-grid skeleton.

## Shapes

Compact controls use 6-8px corners. The project selector, directory items, selected work tabs, and settings navigation use approximately 9-11px corners; Goal Contract and current-work panels use 14px corners. The two structural regions remain rectangular, while the interactive and reading surfaces inside them are softly rounded.

Goal state is always a compact bounded tag: 5–6px corners, a one-pixel semantic border, a quiet semantic tint, a Lucide icon, and readable text. Tags are labels rather than pills; they never use a full-radius capsule and never rely on color alone.

Relationship records use one stable reading grid: bounded relation type, leading Goal title with quiet ID/path/reason text, compact lifecycle state, then the secondary action. The metadata remains ordinary text—not a stack of full-width chips—and every repeated row shares the same title, state, and action columns. At the narrowest content width the action moves below without changing semantic order.

## Components

### Buttons

- **Primary:** near-black fill in Light, near-white fill in Dark, 8px corners, 34-38px height, and a short stable one-line label. Dynamic Goal titles belong in surrounding copy, `title`, and accessible names, never in the visible button.
- **Hover:** a small opacity change and one-pixel upward translation.
- **Ghost:** transparent at rest, cool-gray tonal hover, no persistent outline.
- **Focus:** a two-pixel cobalt outline with a two-pixel offset.

### Inputs / Fields

- **Style:** white or dark-canvas fill, one-pixel structural border, 8px corners, no inset shadow.
- **Focus:** cobalt outline independent of the border so keyboard focus remains obvious.
- **Placeholder:** visibly secondary but still readable.

### Navigation

- The Desktop titlebar begins with project selection and project settings; the directory below changes in place between root and Goals, and ends with the pinned local identity / global-settings entry.
- The root order is Inbox, Goals, Feed, Promotion, and Visual Workspace. It has no permanent group labels or search bar.
- Inbox owns the real pending-decisions destination. It keeps the root directory visible, opens or reuses a right-side utility tab, and distinguishes real decision types with compact icons and labels. Planned inbox sources and promotion entries remain unavailable.
- Feed, Promotion, and Visual Workspace are reserved locations only. Their empty states explain that entities and workflows must be defined before real content appears.
- Goals opens the existing Goal Tree in the same directory. Its heading owns the back action and compact tools; the tree retains its real hierarchy and state.
- Selected and hovered items use paper-toned surfaces, slight lift, and stronger text rather than row dividers.
- In ordinary Web, the established project layer above Goal navigation remains in place because the single-directory shell is Desktop-only.
- Goal titles, child progress, dependency health, and status tags form four distinct reading levels; no metadata uses an inaccessible faint tone.
- Compact parent progress uses a short accessible line instead of another text badge.

### Project Goal Tabs

- Tabs are isolated by project, restored from local device storage, and capped at eight.
- Opening the same Goal focuses its existing tab. Opening a ninth Goal retires an older inactive tab rather than overflowing indefinitely.
- The selected tab uses a paper surface and soft shadow; status remains readable through its dot and the Goal content itself.
- The close action is separate from the tab button. Closing the active tab selects a neighbor and never removes the last displayable Goal.
- The tab strip uses complete tab semantics and disappears in the narrow Companion.

### Native Window Chrome

- macOS Overlay uses a fixed 48px titlebar band. The Goal workspace places a 32px project-control row at its top so every project control centers at the native traffic-light `y=16px`; there is no second project row. Settings retains its scoped heading rhythm and aligns to a 48px work-surface topbar.
- The workbench bar contains tabs, one dedicated empty 48px drag slot, and actions. Utility tabs stay on one line.
- Whole workbench, project-index, and Settings topbars are never drag regions. Only empty spacers or plain-text context may carry window drag behavior.
- The directory resizer begins below the native titlebar at grid row 2 so resizing and macOS traffic-light interaction never compete.
- Ordinary Web and the Companion at 760px and below retain their existing chrome and structure.

### Goal Focus

The selected Goal remains the main work document. Its compact header reads status and facts → title → three-part Goal Contract → detail navigation. The facts line shows owner, priority, and update time without competing with the title. Contract content states result, reason, and operating logic directly beneath the title; it is not hidden behind a tab or replaced by a repeated outcome subtitle.

The current panel then reads Next Step → completion requirements, with context and bound Runtime state in a visibly subordinate supporting rail. Contract, current-work, context, and Runtime blocks use related paper tones, 14px corners, and low shadows rather than a page-wide mesh of divider lines. Status appears once in the header, not again inside Next Step. The primary action appears once and uses stable short copy so the layout never bends around a dynamic title.

The detail tabs use a reusable section deck. Summary cards only select; they remain equal-width and stationary. The selected card changes border, icon tone, and bottom selection line, while its preserved body appears in one shared full-width stage below the entire row. Stage height, clip, opacity, and a small vertical translation animate over roughly 480ms using exponential ease-out. Reduced-motion removes the transition while retaining the same selected state, focus order, and content. Context has two cards; Progress, Relationships, and Record each have four.

On Desktop, every non-overview detail panel owns the full work-canvas width and a viewport-responsive minimum height. Its summary row remains compact while the selected stage stretches beneath it; long records grow naturally. The Relationships deck explicitly resets inherited legacy columns so both selector row and selected body remain full width. Dark record tables use `Rail`, `Ink`, `Muted`, and `Line` tokens throughout—never a hardcoded light header surface.

### Runtime

Runtime has two explicit layers. The owner header, tabs, parent-Goal guidance, child choices, and action controls are GoalBoard application UI, so they use `Goal Canvas`, `Navigator Gray`, normal Ink, Muted, and Line tokens in both Light and Dark. Parent-Goal guidance and child choices remain flat rows separated by lines, not nested warning cards.

A `closed_compound` parent Goal has no executable Runtime surface. Its Runtime view keeps only the owner context, one short explanation, and real child-Goal rows. Terminal tabs, add/open controls, action chrome, empty terminal canvas, and Runtime menus leave layout and the accessibility tree. The dormant elements may remain in the DOM solely so an in-place switch to an executable leaf Goal can restore the existing Runtime without rebuilding the shell; the presence of the read-only attribute is authoritative whether rendered initially or toggled dynamically.

Only the bounded terminal canvas uses terminal tokens. The local terminal appearance preference offers Follow interface, Light, and Dark. It is applied before first paint and updates live xterm background, foreground, cursor, selection, and ANSI colors without reloading. Terminal Dark uses `#101012`, `#f0f0f2`, `#b5b5bd`, and `#92929b`; Terminal Light uses `#fbfbfc`, `#202023`, `#65656e`, and `#7b7b84`.

### Settings

Desktop settings reuse the same single directory, local-identity footer, selected-work-surface treatment, and soft section panels as the Goal workspace. Project Settings is reached beside the project selector and only contains Work Rules and Work Planning for that project. Global Settings is reached from the pinned footer and only contains Appearance & Language, AI & Execution Tools, and Diagnostics for the current device. Ordinary Web settings retain their existing shell.

## Do's and Don'ts

### Do:

- **Do** establish hierarchy with proportion, alignment, and whitespace before adding a container.
- **Do** keep project, module, Goal Tree, and settings navigation in one replaceable directory.
- **Do** preserve project-local Goal tabs as UI state, never canonical Goal state.
- **Do** reserve the 48px macOS Overlay safe zone and limit window dragging to empty or plain-text titlebar regions.
- **Do** distinguish project settings from global device settings at their entry, directory, header, and content.
- **Do** use tonal surfaces and low shadows to reduce the need for structure lines.
- **Do** use the first viewport to explain the current Goal and expose its next work.
- **Do** keep one selected Goal visually continuous across Navigator, Focus, and Runtime.
- **Do** preserve the cool-neutral palette and reserve cobalt for interaction and focus.
- **Do** keep planned modules visibly labeled “规划中” and limited to honest reserved views until their real entities and flows exist.
- **Do** test Light, Dark, Standard, Compact, Runtime-open, narrow states, and both terminal palettes together.
- **Do** keep every mobile workspace surface full width and free of horizontal viewport escapes.
- **Do** let users scan section summaries before expanding one body, and reveal the correct card before honoring a deep link.

### Don't:

- **Don't** add a second persistent navigation column or repeat project context across the shell.
- **Don't** restore permanent search, group headings, and tool blocks at the root directory.
- **Don't** let open Goal tabs grow without limit or leak across projects.
- **Don't** place tabs, buttons, or the directory resizer in the traffic-light safe zone, or mark an interactive topbar container as draggable.
- **Don't** use a lightweight home screen with large empty regions where current Goal facts and work should be.
- **Don't** present reserved placeholder views as working modules or fill them with fake content, counts, or activity.
- **Don't** treat the Goal Tree or an AI chat homepage as the entire application.
- **Don't** blur project-setting and global-setting scope.
- **Don't** assume the Desktop directory or work tabs apply to ordinary Web or the narrow Companion.
- **Don't** turn unrelated filters and navigation into segmented pills; grouped selection surfaces are reserved for compact Goal Detail and Runtime switches.
- **Don't** stack unrelated detail sections into one unbroken page or give every nested content block another decorative border.
- **Don't** make status colors decorative or rely on color without text.
- **Don't** copy YouMind's product IA, content cards, branding, or imagery.

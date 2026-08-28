---
name: GoalBoard Calm Desktop
description: A cool, continuous desktop workbench that keeps one Goal connected from navigation to execution.
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

GoalBoard is a high-frequency workbench, not a dashboard and not a stack of paper cards. Its visual system makes one selected Goal continuous across a cool-gray Project and Goal navigator, a full-bleed white decision canvas, and a Runtime whose application shell follows the interface while its terminal canvas has an independent palette.

The design is quiet because the frame is structural. Persistent regions are square, shadows are absent, and hierarchy comes from typography, column width, alignment, and whitespace. The supplied YouMind references establish the craft bar for restraint and clarity, while GoalBoard keeps its own product structure.

**Key Characteristics:**

- Continuous desktop regions instead of floating pane cards.
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

- **Display** (710, 27-34px, 1.2): selected Goal titles only.
- **Headline** (700, 17px, 1.35): the current next action and important section statements.
- **Title** (700, 13-14px): Project names, section labels, and settings headings.
- **Body** (400, 13px, 1.52): explanations and document content, normally held below 68 characters per line.
- **Label** (650, 10-12px): tabs, metadata, compact controls, and status text.

**The Native Clarity Rule.** Do not introduce display fonts or monospace styling for atmosphere. Monospace remains limited to commands, identifiers, and measured values.

## Layout

Desktop uses a 52px application header, an approximately 292-324px navigator, a 4px draggable separator, and a flexible Goal canvas. When Runtime opens, it is added as the final structural region without changing Goal semantics. Its owner header, tabs, guidance, child choices, and controls use the current application theme; the bounded terminal canvas alone uses terminal colors.

The Focus pane is a quiet canvas around two sibling surfaces: an independent Goal Hero/navigation block and a work-content block below it. The canvas keeps 12-20px around the composition and 12-14px between the two surfaces. Both use a faint line, a 14px corner, and no shadow. The separation creates reading rhythm rather than floating-card decoration.

The Goal document is centered within the canvas at a readable measure. Its overview uses a flexible work column and a 220-250px supporting rail when the document itself has at least 720px of content width. The work column carries Next Step and completion requirements; the rail carries compact context facts and bound Runtime state. Below that container width, the rail follows the work content in one column without changing DOM order.

Compact reduces the navigator to approximately 276-304px, uses 32px minimum Goal rows, shortens search fields, tightens vertical document rhythm, and never reduces visible labels below 10px. Overview cards retain an 18px horizontal safe inset even at intermediate desktop widths; density must never put text against a container border. Runtime density is unchanged. At 760px and below, the workspace becomes one column with a 48px header, 44px surface switch, full-width Goal content, and stacked section layouts. The Goal toolbar owns its intrinsic two-row height before the scrolling tree begins.

Context, Progress, Relationships, and Record share one two-layer section-deck grammar. Equal-width summary cards form a stable selector row and never move when selection changes. The tallest real title or description sets the whole row height; summaries are never line-clamped or clipped to simulate uniformity. Icon, count, and caret align to the first content line. One full-width detail stage below the row reveals the selected body. At narrow widths the selector row wraps to two columns, then one only when necessary; the stage remains beneath it. Main-tab changes return the document to its readable top inset, and deep links reveal the owning stage before scrolling.

**The Continuous Region Rule.** Navigator, Goal canvas, and Runtime remain structural regions. Only the Focus reading surface receives a faint bounded inset; it never uses a drop shadow or nested ornamental frame.

## Elevation & Depth

The system is flat by default. Persistent hierarchy uses tonal surfaces and one-pixel separators. Shadows are limited to transient menus and dialogs, using a soft ambient shadow (`0 18px 48px rgba(25, 25, 31, .12)` in Light and a darker equivalent in Dark).

**The Transient Elevation Rule.** If a surface remains on screen as part of the workspace, it stays flat. Only content temporarily placed above the workspace may cast a shadow.

## Shapes

Rows use 6px corners, controls use 8px, section selectors use 10px, detail stages use 12px, and transient surfaces use 10px. The Hero and work surfaces use 14px to separate them from the surrounding canvas without appearing elevated. Persistent structural panes remain square.

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

- Project context occupies the first layer above Goal navigation.
- Project switch and Project settings are 28px Lucide icon controls in the project-title row, not a second text-button row, floating links, or duplicate gear icons. Tooltips and accessible names carry the full labels.
- Selected Goal rows use the Goal canvas tone, a structural inset line, and slightly stronger text.
- Goal titles, child progress, dependency health, and status tags form four distinct reading levels; no metadata uses an inaccessible faint tone.
- View switches and Goal detail tabs are flat text tabs with a one- or two-pixel underline. They are never segmented pills.
- Compact parent progress uses a short accessible line instead of another text badge.

### Goal Focus

The selected Goal is the main canvas. Its title is the largest text on screen. The overview reads title → next action → completion requirements; context and bound Runtime state sit in a visibly subordinate supporting rail. Status appears once beside the title, not again inside Next Step. Next Step uses a simple top label and one shared left edge for its headline, explanation, guidance, and content-width action; it has no decorative arrow. The primary action appears once and uses stable short copy so the layout never bends around a dynamic title.

The detail tabs use a reusable section deck. Summary cards only select; they remain equal-width and stationary. The selected card changes border, icon tone, and bottom selection line, while its preserved body appears in one shared full-width stage below the entire row. Stage height, clip, opacity, and a small vertical translation animate over roughly 480ms using exponential ease-out. Reduced-motion removes the transition while retaining the same selected state, focus order, and content. Context has two cards; Progress, Relationships, and Record each have four.

### Runtime

Runtime has two explicit layers. The owner header, tabs, parent-Goal guidance, child choices, and action controls are GoalBoard application UI, so they use `Goal Canvas`, `Navigator Gray`, normal Ink, Muted, and Line tokens in both Light and Dark. Parent-Goal guidance and child choices remain flat rows separated by lines, not nested warning cards.

Only the bounded terminal canvas uses terminal tokens. The local terminal appearance preference offers Follow interface, Light, and Dark. It is applied before first paint and updates live xterm background, foreground, cursor, selection, and ANSI colors without reloading. Terminal Dark uses `#101012`, `#f0f0f2`, `#b5b5bd`, and `#92929b`; Terminal Light uses `#fbfbfc`, `#202023`, `#65656e`, and `#7b7b84`.

### Settings

Settings use a continuous navigation rail and a centered white content area. Language, density, interface theme, and terminal appearance live together here. Preference options may be bounded because they are mutually exclusive controls; active state uses a tonal neutral surface plus a cobalt check.

## Do's and Don'ts

### Do:

- **Do** establish hierarchy with proportion, alignment, and whitespace before adding a container.
- **Do** keep one selected Goal visually continuous across Navigator, Focus, and Runtime.
- **Do** preserve the cool-neutral palette and reserve cobalt for interaction and focus.
- **Do** test Light, Dark, Standard, Compact, Runtime-open, narrow states, and both terminal palettes together.
- **Do** keep every mobile workspace surface full width and free of horizontal viewport escapes.
- **Do** let users scan section summaries before expanding one body, and reveal the correct card before honoring a deep link.

### Don't:

- **Don't** reintroduce a centered brand ornament, a floating Goal paper card, or large rounded persistent panes.
- **Don't** turn detail tabs, view switches, and every filter into segmented pills.
- **Don't** stack unrelated detail sections into one unbroken page or give every nested content block another decorative border.
- **Don't** make status colors decorative or rely on color without text.
- **Don't** copy YouMind's product IA, content cards, branding, or imagery.

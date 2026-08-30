---
version: 1
slug: "src-web-render-ts"
primary_target: "src/web/render.ts"
related_targets: ["src/web/server.ts"]
---

Scope and mode: GoalBoard local Web and macOS desktop workbench, Operate mode. The Desktop core shell remains Level 3; the Feed ownership slice reaches Level 4 for internal use: the single directory, project-scoped Goal tabs, Goal Detail, Feed Item workbench, source manager, scoped Settings, and Runtime behavior use real application state. Browser Web and the narrow Companion reuse the same adaptive DOM.

Audience and job: developers and product leads use GoalBoard either as a full desktop workstation or as a narrow companion beside Codex, Claude Code, or another Harness. They must locate the active Goal, understand its next action, and keep a Goal-bound Runtime visible without relearning the layout at each width.

Chosen direction: Single-directory Project-Tab Workbench (`seed=goalboard-desktop-single-directory-project-tabs-2026-08-29`). The native titlebar owns project selection and project settings; one left directory owns the root work types, Goals, the Goal Tree, Feed Items, and settings navigation; the right workbench reuses multiple Goals from the current project as persistent tabs and opens Inbox/Feed as one real Item work surface. This is the sole persistent shell direction.

Memorable moment: the user enters Goals inside the only directory, opens several Goals without losing the first, then moves among their project tabs while each Goal's result, reason, operating logic, next step, completion requirements, context, and Runtime remain intact.

Visual system: one 286-334px graphite directory beside a flexible light workbench. Restrained cobalt marks focus and available intent; semantic color is only for real state. Native system typography, Lucide icons, softly rounded 6-14px surfaces, related tonal fills, and local low diffuse shadows define both Light and Dark Calm Desktop. In Light, compact current-location states never use paper plus exterior shadow: directory selection uses a flat tint and tab-like navigation uses a two-pixel cobalt marker. The directory/work-surface boundary is tonal only—no full-height border or standing shadow—and structural lines are intentionally rare. In macOS Overlay mode, a fixed 48px native-chrome band protects the traffic lights and creates one consistent top rhythm across the Goal workspace and scoped Settings.

Implementation inventory:

| Visible ingredient | Implementation |
| --- | --- |
| Desktop two-region shell | One 286-334px resizable directory and one remaining tabbed workbench; no second left navigation column or repeated top breadcrumb |
| macOS Overlay chrome | `--desktop-titlebar-height: 48px`; the Goal workspace places project controls in a 32px row and uses the real-window-calibrated native `trafficLightPosition.y = 24px` inset, with no separate project row; Tauri self-identification activates the native safe-area before stylesheets load even if a navigation dropped `desktop=1`; Settings keeps its scoped navigation and 48px work-surface topbar |
| Drag ownership | The remaining left titlebar space and an elastic right titlebar track of at least 72px may drag; project-index and Settings use only plain-text context or empty spacers; tabs, actions, dropdowns, outer topbars, and the workbench bar remain interactive, not draggable |
| Titlebar interaction safety | The directory resizer begins at grid row 2 below native chrome, utility tabs remain one line, and interactive tabs and actions never enter the traffic-light safe zone |
| Project controls | Current project selector, direct real-project dropdown, and current-project Settings control sit in the native titlebar to the right of the traffic lights |
| Root directory | Inbox, Goals, Feed, 来源与连接, Promotion, and Visual Workspace appear in that order without permanent group headings or search chrome; 来源与连接 is a direct management entry |
| Inbox / Feed | Replaces the root with one returnable Item directory; Inbox presets Inbox Message and uses Archive / Restore to Inbox, while Feed presets Feed and uses Ignore / Restore to Feed; filters and status labels follow the active type |
| Goals drill-down | Replaces the root in the same directory with the existing parent-child Goal Tree and compact tools; Back returns one level |
| Unified directory ledger | Goal, Inbox/Feed Item, and 来源与连接 rows share one leading/content/trailing-state grammar, stable resting row heights and column lines, and dimension-preserving hover/selected/focus states; Light selection is a flat tint without exterior shadow; Goal rows are 40px at rest and dependency detail grows only after explicit expansion |
| Source manager | 来源与连接 distinguishes Connector capabilities from configured Source instances; its source and Relay dialogs live on the workspace overlay layer, remain visible across work-surface/list modes, and stay viewport-contained below 760px |
| Planned modules | Promotion and Visual Workspace keep the root directory visible, select a same-named utility tab, and open an honest reserved right work surface with no fake entities, counts, or workflows |
| Local identity footer | Fixed to the directory bottom; shows local identity and opens device-wide Global Settings |
| Project Goal tabs | Up to eight per project; opening reuses, closing selects a neighbor when needed, and local storage restores each project's tab set; utility switches keep the Goal DOM, detail subtab, scroll position, and Runtime session alive |
| Cross-module state | Feed has separate project-scoped preset, filters, selection, and navigation state so it cannot overwrite the last Goal; returning through Goals restores that Goal, Goal Tree, and previous Focus or Runtime mode |
| Goal Detail | Preserves status, facts, Contract, overview, completion, progress, relationships, records, decisions, evidence, risks, impacts, and Runtime behavior |
| Detail work canvas | Current, Context, Progress, Relationships, and Record occupy the full Desktop width and remaining viewport height; inactive section bodies share the active body’s Grid cell instead of reserving extra rows, and tall windows are not capped at a fixed canvas height |
| Dark record ledger | Execution headers and supporting text use theme tokens, preserving strong dark-surface contrast without hardcoded light header fills |
| First-viewport work | Next Step, completion requirements, compact context, and Runtime companion continue directly below the Contract |
| Soft work surfaces | Contract, current-work, context, and Runtime may use tonal panels and low shadows instead of pervasive divider lines; Light navigation stays flat—directory and segmented selections use tonal fills, while work and detail tabs use two-pixel bottom lines |
| Scoped Settings | Project Settings contains Work Rules / Work Planning; Global Settings contains Appearance & Language / AI & Execution Tools / Diagnostics; both use the same Desktop workbench language and flat Light current-location treatment |
| Project guidance document | Project Settings > 项目说明 is a continuously maintained document, not a settings grid, card Dashboard, or suggestion inbox. Active canonical guidance is the document body, organized into six category sections with inline add, edit, deactivate, and restore actions. Immutable history expands to show the complete original wording, reason, actor, confirmation record, action, version, category, and time; readable text, not color alone, states whether a version is active or inactive |
| Runtime-to-guidance authority | Runtime discoveries remain in the current conversation: show the exact proposed wording and reason, then obtain explicit consent. Acceptance writes directly to canonical guidance without binding it to a Goal or occupying the Goal decision queue. The page has no project-level pending suggestion queue. Prompts consume only the currently active versions, placed before the current Goal and any external untrusted content |
| Project guidance responsive and keyboard behavior | At 1024 CSS px the explanation rail moves after the document body and returns to the right only when the viewport is wide enough. At 390px there is no horizontal overflow; text actions and history disclosure controls are at least 44px. Enter or Space opens the editor, while Escape or Cancel closes it and restores focus to the triggering control; reduced-motion mode scrolls immediately |
| Narrow Harness companion | At 760px and below navigation is 目录 / 当前列表（Goals or Item）/ 详情（Focus or Item Detail）/ 运行; only the current directory panel is visible, 目录 returns to root, and Inbox/Feed land on Item before selection advances to detail |
| Secondary facts | Light faint is `#66666f` (5.04:1 on the `#f1f1f3` rail); source, time, filter labels, and other critical secondary facts never render below 9px |
| Light, Dark, System | Local presentation preference plus `prefers-color-scheme`; no domain persistence |
| Runtime Dock | Existing Goal-bound TUI, retained as the darkest working surface |
| Compound-parent Runtime | A non-executable parent shows only owner guidance and real child Goal entries; tabs, controls, menus, and empty terminal canvas leave layout and accessibility until a leaf Goal is selected |
| State communication | Existing icon and readable label, compact tag treatment; never color-only |
| Route boundary | Browser Web and Desktop share the single-directory workbench; only native safe areas, drag ownership, and Tauri capabilities differ |
| Native-chrome QA | Goal workspace project selector, chevron, and Settings control measure a `15.99px` center against native `y=16px`; no traffic-light overlap or horizontal overflow; the directory footer remains pinned to the bottom |

Constraints: Work tabs remain project-local UI state and never become a second Goal source; source-derived text remains visibly untrusted data; secrets and encrypted bodies never enter DOM/API payloads unless decrypted content is explicitly needed at the local detail or TUI boundary; external sync never falls back to fake success. Promotion and Visual Workspace remain honest placeholders. Avoid duplicate sidebars, lightweight-home whitespace, management-grid linework, gradients, glass, decorative glow, or copied Linear/Notion layouts; preserve keyboard semantics, focus, responsive behavior, reduced motion, existing Goal write paths, and leaf Runtime behavior. macOS Overlay drag ownership remains confined to empty or plain-text titlebar regions.

Unresolved decisions: Promotion and Visual Workspace entities and workflows remain future product work. Feed is real; live-provider release readiness still requires user-owned GitHub/Gmail credentials and external smoke tests.

Finish verification: reviewer verdict PASS. The only later item for this finish is adopting roving tabindex for the Item listbox—Arrow keys, Home/End, and visible focus already work.

Project guidance finish verification: reviewer verdict PASS; the full build and all 298 tests passed. Visual review artifacts are `.impeccable/review/desktop.png`, `.impeccable/review/mobile.png`, `.impeccable/review/mobile-editor.png`, and `.impeccable/review/mobile-history-long.png`.

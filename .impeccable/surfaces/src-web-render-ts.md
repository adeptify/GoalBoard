---
version: 1
slug: "src-web-render-ts"
primary_target: "src/web/render.ts"
related_targets: ["src/web/server.ts"]
---

Scope and mode: GoalBoard local Web and macOS desktop workbench, Operate mode. The current artifact reaches Level 3 for the Desktop core shell: the single directory, project-scoped Goal tabs, Goal Detail, scoped Settings, and existing Runtime behavior use real application state. Ordinary Web and the narrow Companion remain intentionally unchanged.

Audience and job: developers and product leads use GoalBoard either as a full desktop workstation or as a narrow companion beside Codex, Claude Code, or another Harness. They must locate the active Goal, understand its next action, and keep a Goal-bound Runtime visible without relearning the layout at each width.

Chosen direction: Single-directory Project-Tab Workbench (`seed=goalboard-desktop-single-directory-project-tabs-2026-08-29`). The native titlebar owns project selection and project settings; one left directory owns the root work types, Goals, the Goal Tree, and settings navigation; the right workbench reuses multiple Goals from the current project as persistent tabs and opens Inbox or planned modules as utility work surfaces. This is the sole persistent shell direction.

Memorable moment: the user enters Goals inside the only directory, opens several Goals without losing the first, then moves among their project tabs while each Goal's result, reason, operating logic, next step, completion requirements, context, and Runtime remain intact.

Visual system: one 286-334px graphite directory beside a flexible light workbench. Restrained cobalt marks focus and available intent; semantic color is only for real state. Native system typography, Lucide icons, softly rounded 6-14px surfaces, related tonal fills, and local low diffuse shadows define both Light and Dark Calm Desktop. The directory/work-surface boundary is tonal only—no full-height border or standing shadow—and structural lines are intentionally rare. In macOS Overlay mode, a fixed 48px native-chrome band protects the traffic lights and creates one consistent top rhythm across the Goal workspace and scoped Settings.

Implementation inventory:

| Visible ingredient | Implementation |
| --- | --- |
| Desktop two-region shell | One 286-334px resizable directory and one remaining tabbed workbench; no second left navigation column or repeated top breadcrumb |
| macOS Overlay chrome | `--desktop-titlebar-height: 48px`; the Goal workspace places project controls in a 32px row and uses the real-window-calibrated native `trafficLightPosition.y = 24px` inset, with no separate project row; Tauri self-identification activates the native safe-area before stylesheets load even if a navigation dropped `desktop=1`; Settings keeps its scoped navigation and 48px work-surface topbar |
| Drag ownership | The remaining left titlebar space and an elastic right titlebar track of at least 72px may drag; project-index and Settings use only plain-text context or empty spacers; tabs, actions, dropdowns, outer topbars, and the workbench bar remain interactive, not draggable |
| Titlebar interaction safety | The directory resizer begins at grid row 2 below native chrome, utility tabs remain one line, and interactive tabs and actions never enter the traffic-light safe zone |
| Project controls | Current project selector, direct real-project dropdown, and current-project Settings control sit in the native titlebar to the right of the traffic lights |
| Root directory | Inbox, Goals, Feed, Promotion, and Visual Workspace appear without permanent group headings or search chrome |
| Inbox | Keeps the root directory visible and opens/reuses a right utility tab; real pending decisions use compact typed rows and expand into the existing decision workflow; synchronized input and promotion sources remain explicitly planned |
| Goals drill-down | Replaces the root in the same directory with the existing parent-child Goal Tree and compact tools; Back returns one level |
| Planned modules | Feed, Promotion, and Visual Workspace keep the root directory visible, select a same-named utility tab, and open an honest reserved right work surface with no fake entities, counts, or workflows |
| Local identity footer | Fixed to the directory bottom; shows local identity and opens device-wide Global Settings |
| Project Goal tabs | Up to eight per project; opening reuses, closing selects a neighbor when needed, and local storage restores each project's tab set; utility switches keep the Goal DOM, detail subtab, scroll position, and Runtime session alive |
| Cross-module state | Inbox has a separate project-scoped session UI key so it cannot overwrite the last Goal; returning through Goals restores that Goal, opens the Goal Tree, and resumes its previous Focus or Runtime mode |
| Goal Detail | Preserves status, facts, Contract, overview, completion, progress, relationships, records, decisions, evidence, risks, impacts, and Runtime behavior |
| Detail work canvas | Current, Context, Progress, Relationships, and Record occupy the full Desktop width and remaining viewport height; inactive section bodies share the active body’s Grid cell instead of reserving extra rows, and tall windows are not capped at a fixed canvas height |
| Dark record ledger | Execution headers and supporting text use theme tokens, preserving strong dark-surface contrast without hardcoded light header fills |
| First-viewport work | Next Step, completion requirements, compact context, and Runtime companion continue directly below the Contract |
| Soft work surfaces | Contract, current-work, context, Runtime, active navigation, and selected tabs use tonal panels and low shadows instead of pervasive divider lines |
| Scoped Settings | Project Settings contains Work Rules / Work Planning; Global Settings contains Appearance & Language / AI & Execution Tools / Diagnostics; both use the same Desktop workbench language |
| Narrow Harness companion | At 760px and below the existing Goals / Focus / Runtime Companion remains; Desktop tabs and directory navigation do not intrude |
| Light, Dark, System | Local presentation preference plus `prefers-color-scheme`; no domain persistence |
| Runtime Dock | Existing Goal-bound TUI, retained as the darkest working surface |
| Compound-parent Runtime | A non-executable parent shows only owner guidance and real child Goal entries; tabs, controls, menus, and empty terminal canvas leave layout and accessibility until a leaf Goal is selected |
| State communication | Existing icon and readable label, compact tag treatment; never color-only |
| Route boundary | Ordinary Web retains its existing information architecture and does not render the Desktop directory or project tab strip |
| Native-chrome QA | Goal workspace project selector, chevron, and Settings control measure a `15.99px` center against native `y=16px`; no traffic-light overlap or horizontal overflow; the directory footer remains pinned to the bottom |

Constraints: no domain, data, API, permission, state-machine, Goal lifecycle, or Runtime/PTY protocol changes; parent read-only handling is presentation-only and leaf Runtime behavior remains intact. Work tabs remain project-local UI state and never become a second Goal source; planned modules remain honest placeholders; no fake Feed, Promotion, Cloud, Team, account, or synchronization data; no duplicate sidebars, lightweight-home whitespace, management-grid linework, gradients, glass, decorative glow, or copied Linear/Notion layouts; preserve keyboard semantics, focus, responsive behavior, reduced motion, and all existing Goal write paths. macOS Overlay drag ownership must remain confined to empty or plain-text titlebar regions; ordinary Web and the Companion at 760px and below keep their existing chrome and layout boundaries.

Unresolved decisions: the entities and workflows for Feed, Promotion, and synchronized Inbox inputs remain future product work. Their directory locations are fixed, but this shell does not claim those capabilities exist.

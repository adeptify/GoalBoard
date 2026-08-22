---
version: 1
slug: "src-web-render-ts"
primary_target: "src/web/render.ts"
related_targets: ["src/web/server.ts"]
---

Scope and mode: GoalBoard local Web and macOS desktop workbench, Operate mode. This slice establishes the shared visual foundation; it does not redesign domain behavior.

Audience and job: developers and product leads use GoalBoard either as a full desktop workstation or as a narrow companion beside Codex, Claude Code, or another Harness. They must locate the active Goal, understand its next action, and keep a Goal-bound Runtime visible without relearning the layout at each width.

Chosen direction: Quiet Intent Workspace. The approved composition combines `.impeccable/mocks/goalboard-desktop-workstation-a.png` as the wide desktop thesis and `.impeccable/mocks/goalboard-harness-companion-b.png` as its compact responsive form. `.impeccable/mocks/goalboard-graph-workstation-c.png` supplies visual grammar only for the later Goal Graph Goal.

Memorable moment: one selected Goal forms a continuous line across Navigator, Focus, and Runtime; beside a Harness, the same Goal remains visible in a narrow native-feeling window.

Visual system: restrained graphite and cool paper surfaces, mineral blue for the current path and available action, semantic color only for state, native system typography, Lucide icons, 1px seams, 6–8px radii, and soft window-level elevation only. Light, Dark, and Follow System are first-class themes.

Implementation inventory:

| Visible ingredient | Implementation |
| --- | --- |
| Wide three-pane workstation | Existing semantic workspace grid, retuned tokens and pane proportions |
| Narrow Harness companion | Existing mobile view switch, restyled as Goals / Focus / Runtime |
| Light, Dark, System | Local presentation preference plus `prefers-color-scheme`; no domain persistence |
| Goal Navigator | Existing Goal Tree content and actions, compact visual treatment only in this slice |
| Goal Focus | Existing Goal document panels, hierarchy and surface treatment only in this slice |
| Runtime Dock | Existing Goal-bound TUI, retained as the darkest working surface |
| State communication | Existing icon and readable label, compact tag treatment; never color-only |
| Desktop identity | Native window context remains outside the Web content; app shell uses matte seams and dense chrome |

Constraints: no feature, data, API, permission, state-machine, Goal lifecycle, or Runtime/TUI changes; no Graph implementation in this slice; no gradients, glass, dashboard cards, decorative glow, or copied Linear/Notion layouts; preserve keyboard, focus, responsive behavior and reduced motion.

Unresolved decisions: none before the first implementation pass. User review of the real rendered slice decides whether to continue the visual direction into the remaining UI Goals.

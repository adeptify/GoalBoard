---
version: 1
slug: "src-web-render-ts"
primary_target: "src/web/render.ts"
related_targets: ["src/web/server.ts"]
---

Scope and mode: GoalBoard local Web application, Operate mode.

Audience and job: AI Runtime developers and product leads need to understand the
active Goal, its hierarchy and dependencies, inspect blockers and proof, and know
what can happen next without learning a visual metaphor.

Chosen direction: IDE Goal Tree. The user selected composition B at
`.impeccable/mocks/goal-tree-comp-b.png` and explicitly asked to inherit the
design language of Flyleaf Desktop Workstation at
the Flyleaf desktop-workstation prototype used during the design pass.
Use its graphite utility rail, calm gray-white panes, hairline separators,
compact workbench typography, indigo selection, and flat editor-like controls.
Do not copy Flyleaf product features or its old Goal Spine dots.

First viewport: a narrow global rail, a persistent IDE-style Goal Tree navigator,
and one large selected-Goal workspace. The tree is the primary navigation. Each
node directly names its Goal, ID and state; nesting and thin branch connectors
show `part_of`; an inline “依赖 → …” row shows `depends_on`. The workspace opens
with the selected Goal title and current action, then business logic, blockers,
acceptance, Claim/Run, Evidence, Review, risks and user decisions.

Memorable moment: choosing a tree node changes the workbench like opening a file
in an IDE, keeping the whole Goal hierarchy visible while proof updates in place.

Proof/content: canonical SQLite snapshot only. Demo content remains labeled
“示例数据”. No invented counts, dates, Runtime names or capabilities.

Constraints: no railway, track, signal-box or traffic-light metaphor; no generic
dashboard card wall; state is written in words and never color-only; keyboard,
focus, responsive mobile reflow and reduced-motion support remain intact; no
Runtime dispatch controls.

Implementation inventory:

| Visible ingredient | Implementation |
| --- | --- |
| Graphite global rail | semantic anchor navigation plus inline SVG sprite |
| Persistent Goal Tree | recursively nested semantic lists from active `part_of` relations |
| Tree branch connectors | CSS hairlines following the nested DOM topology |
| Dependency facts | inline text rows from active `depends_on` relations |
| Direct node state | icon plus Chinese state word from derived Web status |
| Selected Goal workspace | semantic HTML updated in place from canonical snapshot |
| Claim / Run / Evidence / Review | compact fact matrix, not dashboard metrics |
| Candidate and Rewire | human-owned decision section in the selected workspace |
| Mobile | horizontal utility bar, bounded tree navigator, single-column workspace |

Unresolved decisions: none for this delivery slice.

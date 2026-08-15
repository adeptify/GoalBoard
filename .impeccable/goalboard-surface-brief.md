Scope and mode: GoalBoard V1 local Web application, Operate mode.

Audience and job: AI Runtime developers and product leads need to see the active
outcome, understand which smallest Goals are executable, inspect blockers, and
verify what still prevents completion. The primary action is to open the next
Ready Goal; Candidate decisions remain clearly human-owned.

Direction: railway signal box. The Goal Spine behaves like a route diagram:
Goals are stations, dependency edges are tracks, Ready/Blocked/Claimed states
are signals, Impact conflicts occupy a section, and Candidate Goals wait at a
switch. Use a cool mineral light surface, dark track lines, cobalt active route,
amber blockers, signal red risk, and mint satisfied. Rectilinear controls and
compact operational typography; no generic dashboard card wall.

First viewport: plain-language active outcome and next action on the left; the
dominant Goal Spine route occupies the center; a narrow live-status rail on the
right explains Ready, blocked, active Claim, risk, and user decisions. Mobile
turns the route vertical and keeps status explanations adjacent.

Proof/content: canonical SQLite snapshot only. Demo content must be labeled
“示例数据”. Business logic, acceptance, blockers, Evidence and Reviews are real
fields, never invented capabilities.

Constraints: accessible contrast and focus, keyboard navigation, responsive
desktop/mobile, honest empty/error/loading states, no Runtime dispatch controls.

Delegated comp decision: carry forward `.impeccable/mocks/goalboard-comp-a.png`.
It makes the active outcome, Goal Spine, state signals, and selected Goal detail
understandable in one scan. Do not literalize its invented counts, dates, Runtime
names, or authentication example. Mobile turns the same route vertical.

Implementation inventory:

| Visible ingredient | Implementation |
| --- | --- |
| Active outcome and primary next action | semantic HTML from Board facts |
| Horizontal Goal Spine and branches | accessible HTML list plus CSS track geometry |
| Ready/claimed/blocked/satisfied signals | status tokens and text labels, never color alone |
| Right operational status rail | derived snapshot counts and blocker summaries |
| Selected Goal detail | semantic tabs/panels for business logic, acceptance, evidence, reviews |
| Candidate switch | human decision queue with explicit approve/reject actions |
| Mobile route | CSS vertical reflow; no raster crop |
| Generated comp | north-star reference only; not shipped as UI asset |

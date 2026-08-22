import assert from "node:assert/strict";
import test from "node:test";

import { buildGoalGraphLayout } from "../src/web/goal-graph.js";

const goals = [
  { goal_id: "ROOT", title: "Release", status: "executing" },
  { goal_id: "UI", title: "UI", status: "execution_pending" },
  { goal_id: "API", title: "API", status: "satisfied" },
  { goal_id: "SIGN", title: "Signing", status: "execution_blocked" },
  { goal_id: "LATER", title: "Later", status: "execution_pending" },
];

const relations = [
  { relation_id: "part-ui", from_goal_id: "UI", to_goal_id: "ROOT", type: "part_of", state: "active", reason: "UI belongs to release" },
  { relation_id: "part-api", from_goal_id: "API", to_goal_id: "ROOT", type: "part_of", state: "active", reason: "API belongs to release" },
  { relation_id: "dep-root", from_goal_id: "ROOT", to_goal_id: "SIGN", type: "depends_on", state: "active", reason: "release needs signing" },
  { relation_id: "inactive", from_goal_id: "LATER", to_goal_id: "ROOT", type: "depends_on", state: "inactive", reason: "historical" },
  { relation_id: "risk", from_goal_id: "ROOT", to_goal_id: "LATER", type: "risk_of", state: "active", reason: "not a graph spine edge" },
];

test("Goal Graph reads only active parent and dependency facts without rewriting direction", () => {
  const layout = buildGoalGraphLayout(goals, relations, "ROOT");
  assert.equal(layout.selected_goal_id, "ROOT");
  assert.deepEqual(
    layout.edges.map((edge) => [edge.relation_id, edge.from_goal_id, edge.to_goal_id, edge.type]),
    [
      ["dep-root", "ROOT", "SIGN", "depends_on"],
      ["part-api", "API", "ROOT", "part_of"],
      ["part-ui", "UI", "ROOT", "part_of"],
    ],
  );
});

test("Goal Graph gives the selected network semantic roles and keeps unrelated Goals available", () => {
  const layout = buildGoalGraphLayout(goals, relations, "ROOT");
  const byId = new Map(layout.nodes.map((node) => [node.goal_id, node]));
  assert.equal(byId.get("ROOT")?.role, "selected");
  assert.equal(byId.get("ROOT")?.ring, 0);
  assert.equal(byId.get("ROOT")?.x, 50);
  assert.equal(byId.get("ROOT")?.y, 50);
  assert.equal(byId.get("ROOT")?.column_span, 2);
  assert.equal(byId.get("SIGN")?.role, "prerequisite");
  assert.equal(byId.get("SIGN")?.ring, 1);
  assert.equal(byId.get("UI")?.role, "child");
  assert.equal(byId.get("API")?.connected_to_selected, true);
  assert.equal(byId.get("LATER")?.connected_to_selected, false);
  assert.equal(byId.get("LATER")?.role, "other");
  assert.ok((byId.get("LATER")?.ring ?? 0) > (byId.get("UI")?.ring ?? 0));
  assert.ok(layout.ring_count >= 2);
});

test("Goal Graph spreads direct child Goals around the first orbit", () => {
  const childGoals = Array.from({ length: 8 }, (_, index) => ({
    goal_id: `CHILD-${index + 1}`,
    title: `Child ${index + 1}`,
    status: "execution_pending",
  }));
  const layout = buildGoalGraphLayout(
    [goals[0]!, ...childGoals],
    childGoals.map((goal, index) => ({
      relation_id: `part-${index + 1}`,
      from_goal_id: goal.goal_id,
      to_goal_id: "ROOT",
      type: "part_of",
      state: "active",
      reason: "child belongs to root",
    })),
    "ROOT",
  );
  const children = layout.nodes.filter((node) => node.role === "child");
  assert.deepEqual([...new Set(children.map((node) => node.ring))], [1]);
  assert.equal(new Set(children.map((node) => node.angle)).size, 8);
});

test("Goal Graph preserves parent-child depth instead of flattening descendants", () => {
  const layout = buildGoalGraphLayout(
    [
      goals[0]!,
      { goal_id: "GROUP", title: "Group", status: "waiting_children" },
      { goal_id: "LEAF", title: "Leaf", status: "execution_pending" },
    ],
    [
      { relation_id: "group-root", from_goal_id: "GROUP", to_goal_id: "ROOT", type: "part_of", state: "active", reason: "group belongs to root" },
      { relation_id: "leaf-group", from_goal_id: "LEAF", to_goal_id: "GROUP", type: "part_of", state: "active", reason: "leaf belongs to group" },
    ],
    "ROOT",
  );
  const byId = new Map(layout.nodes.map((node) => [node.goal_id, node]));
  assert.ok((byId.get("LEAF")?.ring ?? 0) > (byId.get("GROUP")?.ring ?? 0));
  assert.equal(byId.get("LEAF")?.cluster, "GROUP");
});

test("Goal Graph gives each direct branch a sector and keeps its descendants clustered", () => {
  const layout = buildGoalGraphLayout(
    [
      goals[0]!,
      { goal_id: "A", title: "A", status: "waiting_children" },
      { goal_id: "A1", title: "A1", status: "execution_pending" },
      { goal_id: "B", title: "B", status: "waiting_children" },
      { goal_id: "B1", title: "B1", status: "execution_pending" },
    ],
    [
      { relation_id: "a-root", from_goal_id: "A", to_goal_id: "ROOT", type: "part_of", state: "active", reason: "A branch" },
      { relation_id: "a1-a", from_goal_id: "A1", to_goal_id: "A", type: "part_of", state: "active", reason: "A leaf" },
      { relation_id: "b-root", from_goal_id: "B", to_goal_id: "ROOT", type: "part_of", state: "active", reason: "B branch" },
      { relation_id: "b1-b", from_goal_id: "B1", to_goal_id: "B", type: "part_of", state: "active", reason: "B leaf" },
    ],
    "ROOT",
  );
  const byId = new Map(layout.nodes.map((node) => [node.goal_id, node]));
  assert.equal(byId.get("A1")?.cluster, "A");
  assert.equal(byId.get("B1")?.cluster, "B");
  assert.equal(byId.get("A1")?.angle, byId.get("A")?.angle);
  assert.equal(byId.get("B1")?.angle, byId.get("B")?.angle);
});

test("Goal Graph falls back to a deterministic selected Goal", () => {
  const layout = buildGoalGraphLayout(goals, relations, "missing");
  assert.equal(layout.selected_goal_id, "API");
});

test("Goal Graph keeps one selected focus even when the network cycles", () => {
  const layout = buildGoalGraphLayout(
    [...goals, { goal_id: "CYCLE", title: "Cycle", status: "execution_pending" }],
    [
      ...relations,
      { relation_id: "cycle-out", from_goal_id: "ROOT", to_goal_id: "CYCLE", type: "depends_on", state: "active", reason: "out" },
      { relation_id: "cycle-in", from_goal_id: "CYCLE", to_goal_id: "ROOT", type: "depends_on", state: "active", reason: "in" },
    ],
    "ROOT",
  );
  assert.deepEqual(layout.nodes.filter((node) => node.role === "selected").map((node) => node.goal_id), ["ROOT"]);
  assert.equal(layout.nodes.find((node) => node.goal_id === "CYCLE")?.connected_to_selected, true);
});

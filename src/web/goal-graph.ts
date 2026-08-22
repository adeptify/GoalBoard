export interface GoalGraphGoalInput {
  goal_id: string;
  title: string;
  status: string;
}

export interface GoalGraphRelationInput {
  relation_id: string;
  from_goal_id: string;
  to_goal_id: string;
  type: string;
  state: string;
  reason: string;
}

export interface GoalGraphNodeLayout extends GoalGraphGoalInput {
  x: number;
  y: number;
  angle: number;
  ring: number;
  cluster: string;
  side: "left" | "right" | "center";
  role: "selected" | "ancestor" | "child" | "prerequisite" | "dependent" | "other";
  connected_to_selected: boolean;
  // Saved-view compatibility; the radial renderer no longer uses the grid fields.
  column: number;
  column_span: number;
  row: number;
}

export interface GoalGraphEdgeLayout extends GoalGraphRelationInput {
  type: "part_of" | "depends_on";
}

export interface GoalGraphLayout {
  columns: number;
  rows: number;
  focus_end_row: number;
  children_start_row: number;
  other_start_row: number;
  ring_count: number;
  selected_goal_id: string;
  nodes: GoalGraphNodeLayout[];
  edges: GoalGraphEdgeLayout[];
}

const GRAPH_RELATION_TYPES = new Set(["part_of", "depends_on"]);

function compareGoal(left: GoalGraphGoalInput, right: GoalGraphGoalInput): number {
  return left.title.localeCompare(right.title) || left.goal_id.localeCompare(right.goal_id);
}

function normalizeAngle(value: number): number {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function buildGoalGraphLayout(
  goals: readonly GoalGraphGoalInput[],
  relations: readonly GoalGraphRelationInput[],
  selectedGoalId?: string,
): GoalGraphLayout {
  const orderedGoals = [...goals].sort(compareGoal);
  const byId = new Map(orderedGoals.map((goal) => [goal.goal_id, goal]));
  const goalIds = new Set(byId.keys());
  const selected = goalIds.has(selectedGoalId ?? "")
    ? selectedGoalId!
    : orderedGoals[0]?.goal_id ?? "";
  const edges = relations
    .filter(
      (relation): relation is GoalGraphRelationInput & { type: "part_of" | "depends_on" } =>
        relation.state === "active" &&
        GRAPH_RELATION_TYPES.has(relation.type) &&
        goalIds.has(relation.from_goal_id) &&
        goalIds.has(relation.to_goal_id),
    )
    .sort(
      (left, right) =>
        left.type.localeCompare(right.type) ||
        left.from_goal_id.localeCompare(right.from_goal_id) ||
        left.to_goal_id.localeCompare(right.to_goal_id) ||
        left.relation_id.localeCompare(right.relation_id),
    );

  const directed = (type: "part_of" | "depends_on", direction: "out" | "in") => {
    const result = new Map<string, string[]>();
    for (const edge of edges) {
      if (edge.type !== type) continue;
      const from = direction === "out" ? edge.from_goal_id : edge.to_goal_id;
      const to = direction === "out" ? edge.to_goal_id : edge.from_goal_id;
      result.set(from, [...(result.get(from) ?? []), to]);
    }
    for (const [key, values] of result) {
      result.set(key, [...new Set(values)].sort((left, right) => compareGoal(byId.get(left)!, byId.get(right)!)));
    }
    return result;
  };

  const distanceFromSelected = (adjacency: ReadonlyMap<string, readonly string[]>): Map<string, number> => {
    const distances = new Map<string, number>();
    if (!selected) return distances;
    distances.set(selected, 0);
    const queue = [selected];
    while (queue.length) {
      const current = queue.shift()!;
      const distance = distances.get(current) ?? 0;
      for (const neighbour of adjacency.get(current) ?? []) {
        if (distances.has(neighbour)) continue;
        distances.set(neighbour, distance + 1);
        queue.push(neighbour);
      }
    }
    return distances;
  };

  const partOut = directed("part_of", "out");
  const partIn = directed("part_of", "in");
  const dependencyOut = directed("depends_on", "out");
  const dependencyIn = directed("depends_on", "in");
  const ancestorDistance = distanceFromSelected(partOut);
  const childDistance = distanceFromSelected(partIn);
  const prerequisiteDistance = distanceFromSelected(dependencyOut);
  const dependentDistance = distanceFromSelected(dependencyIn);

  type Role = GoalGraphNodeLayout["role"];
  const rolePriority: readonly Exclude<Role, "selected" | "other">[] = ["ancestor", "child", "prerequisite", "dependent"];
  const roleDistance = new Map<Exclude<Role, "selected" | "other">, Map<string, number>>([
    ["ancestor", ancestorDistance],
    ["child", childDistance],
    ["prerequisite", prerequisiteDistance],
    ["dependent", dependentDistance],
  ]);
  const roles = new Map<string, Role>();
  for (const goal of orderedGoals) {
    if (goal.goal_id === selected) {
      roles.set(goal.goal_id, "selected");
      continue;
    }
    let role: Role = "other";
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of rolePriority) {
      const distance = roleDistance.get(candidate)?.get(goal.goal_id);
      if (distance !== undefined && distance < bestDistance) {
        role = candidate;
        bestDistance = distance;
      }
    }
    roles.set(goal.goal_id, role);
  }

  const neighbours = new Map<string, string[]>();
  for (const edge of edges) {
    neighbours.set(edge.from_goal_id, [...(neighbours.get(edge.from_goal_id) ?? []), edge.to_goal_id]);
    neighbours.set(edge.to_goal_id, [...(neighbours.get(edge.to_goal_id) ?? []), edge.from_goal_id]);
  }
  for (const [key, values] of neighbours) neighbours.set(key, [...new Set(values)].sort());
  const networkDistance = distanceFromSelected(neighbours);

  const positions = new Map<string, { ring: number; angle: number; cluster: string }>();
  if (selected) positions.set(selected, { ring: 0, angle: 0, cluster: selected });

  const roleOrder = new Map<Role, number>([
    ["child", 0], ["ancestor", 1], ["prerequisite", 2], ["dependent", 3], ["other", 4], ["selected", 5],
  ]);
  const directSeeds = orderedGoals
    .filter((goal) => networkDistance.get(goal.goal_id) === 1)
    .sort((left, right) =>
      (roleOrder.get(roles.get(left.goal_id) ?? "other") ?? 9) - (roleOrder.get(roles.get(right.goal_id) ?? "other") ?? 9) ||
      compareGoal(left, right),
    );
  const seedAngles = new Map<string, number>();
  directSeeds.forEach((goal, index) => {
    const angle = -90 + index * (360 / Math.max(1, directSeeds.length));
    seedAngles.set(goal.goal_id, angle);
    positions.set(goal.goal_id, { ring: 1, angle, cluster: goal.goal_id });
  });

  const parentByChild = new Map<string, string>();
  for (const edge of edges) {
    if (edge.type === "part_of" && !parentByChild.has(edge.from_goal_id)) parentByChild.set(edge.from_goal_id, edge.to_goal_id);
  }
  const branchFor = (goalId: string): string | undefined => {
    let current = goalId;
    const visited = new Set<string>();
    while (!visited.has(current)) {
      visited.add(current);
      const parent = parentByChild.get(current);
      if (!parent) return undefined;
      if (parent === selected) return current;
      current = parent;
    }
    return undefined;
  };

  const sectorWidth = directSeeds.length ? Math.min(72, 240 / directSeeds.length) : 72;
  for (const seed of directSeeds) {
    const branchMembers = orderedGoals
      .filter((goal) => goal.goal_id !== seed.goal_id && branchFor(goal.goal_id) === seed.goal_id)
      .sort((left, right) =>
        (childDistance.get(left.goal_id) ?? Number.MAX_SAFE_INTEGER) - (childDistance.get(right.goal_id) ?? Number.MAX_SAFE_INTEGER) ||
        compareGoal(left, right),
      );
    const depths = [...new Set(branchMembers.map((goal) => childDistance.get(goal.goal_id) ?? 2))].sort((a, b) => a - b);
    for (const depth of depths) {
      const members = branchMembers.filter((goal) => (childDistance.get(goal.goal_id) ?? 2) === depth);
      members.forEach((goal, index) => {
        const offset = members.length === 1 ? 0 : -sectorWidth / 2 + index * (sectorWidth / (members.length - 1));
        positions.set(goal.goal_id, {
          ring: Math.max(2, depth),
          angle: (seedAngles.get(seed.goal_id) ?? 0) + offset,
          cluster: seed.goal_id,
        });
      });
    }
  }

  const connectedUnplaced = orderedGoals.filter((goal) => networkDistance.has(goal.goal_id) && !positions.has(goal.goal_id));
  const connectedRings = [...new Set(connectedUnplaced.map((goal) => Math.max(1, networkDistance.get(goal.goal_id) ?? 1)))].sort((a, b) => a - b);
  for (const ring of connectedRings) {
    const members = connectedUnplaced.filter((goal) => Math.max(1, networkDistance.get(goal.goal_id) ?? 1) === ring);
    members.forEach((goal, index) => {
      const angle = -90 + index * (360 / Math.max(1, members.length));
      positions.set(goal.goal_id, { ring, angle, cluster: goal.goal_id });
    });
  }

  const deepestConnectedRing = Math.max(1, ...[...positions.values()].map((position) => position.ring));
  const unrelated = orderedGoals.filter((goal) => !positions.has(goal.goal_id));
  const outerRing = unrelated.length ? deepestConnectedRing + 1 : deepestConnectedRing;
  unrelated.forEach((goal, index) => {
    positions.set(goal.goal_id, {
      ring: outerRing,
      angle: -90 + index * (360 / Math.max(1, unrelated.length)),
      cluster: "unrelated",
    });
  });

  const ringCount = Math.max(1, outerRing, ...[...positions.values()].map((position) => position.ring));
  const radiusFor = (ring: number, axis: "x" | "y") => {
    if (ring <= 0) return 0;
    const presets = axis === "x" ? [0, 24, 39, 46] : [0, 20, 34, 42];
    return ring < presets.length ? presets[ring]! : presets[presets.length - 1]!;
  };
  const nodes = orderedGoals.map((goal): GoalGraphNodeLayout => {
    const position = positions.get(goal.goal_id) ?? { ring: ringCount, angle: 0, cluster: "unrelated" };
    const radians = position.angle * Math.PI / 180;
    const x = 50 + Math.cos(radians) * radiusFor(position.ring, "x");
    const y = 50 + Math.sin(radians) * radiusFor(position.ring, "y");
    const cosine = Math.cos(radians);
    return {
      ...goal,
      x: Number(x.toFixed(3)),
      y: Number(y.toFixed(3)),
      angle: Number(normalizeAngle(position.angle).toFixed(3)),
      ring: position.ring,
      cluster: position.cluster,
      side: position.ring === 0 || Math.abs(cosine) < .2 ? "center" : cosine < 0 ? "left" : "right",
      role: roles.get(goal.goal_id) ?? "other",
      connected_to_selected: networkDistance.has(goal.goal_id),
      column: 1,
      column_span: goal.goal_id === selected ? 2 : 1,
      row: position.ring + 1,
    };
  });

  return {
    columns: 1,
    rows: ringCount + 1,
    focus_end_row: 1,
    children_start_row: 2,
    other_start_row: outerRing + 1,
    ring_count: ringCount,
    selected_goal_id: selected,
    nodes,
    edges,
  };
}

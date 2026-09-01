import type { GoalDisplayStatus } from "../v1/types.js";

export interface GoalMomentumEventInput {
  type: string;
  at: string;
}

export interface GoalMomentumGoalInput {
  goal_id: string;
  title: string;
  status: string;
  work_state: string;
  display_status: GoalDisplayStatus;
  priority: number;
  created_at: string;
  updated_at: string;
  completed: boolean;
  acceptance_criteria_count: number;
  passed_criteria_count: number;
  reasons: Array<{ code: string }>;
  runs: Array<{
    role: string;
    state: string;
    started_at: string;
    ended_at: string | null;
  }>;
  evidence: Array<{ captured_at: string }>;
  reviews: Array<{ submitted_at: string }>;
  risks: Array<{
    risk_id: string;
    state: string;
    blocking_mode: string;
    created_at: string;
    updated_at: string;
  }>;
  events: GoalMomentumEventInput[];
}

export interface GoalMomentumRelationInput {
  relation_id: string;
  from_goal_id: string;
  to_goal_id: string;
  type: string;
  state: string;
  reason: string;
}

export interface GoalMomentumEdge {
  relation_id: string;
  provider_goal_id: string;
  consumer_goal_id: string;
  reason: string;
}

export interface GoalMomentumNode extends GoalMomentumGoalInput {
  level: number;
  row: number;
  group_id: string;
  provider_goal_ids: string[];
  consumer_goal_ids: string[];
  unsatisfied_provider_goal_ids: string[];
  downstream_goal_ids: string[];
  downstream_open_count: number;
  completion_ratio: number;
  blocked: boolean;
  startable: boolean;
  stale: boolean;
  history_sufficient: boolean;
}

export interface GoalMomentumGroup {
  group_id: string;
  title: string;
  root_goal_id: string | null;
  goal_count: number;
  level_start: number;
  level_end: number;
  row_start: number;
  row_end: number;
}

export interface GoalMomentumCadenceBucket {
  date: string;
  started: number;
  completed: number;
  blockers: number;
}

export interface GoalMomentumCadence {
  days: 7 | 30;
  started: number;
  completed: number;
  new_blockers: number;
  stalled: number;
  history_incomplete: number;
  buckets: GoalMomentumCadenceBucket[];
}

export type GoalMomentumActionKind =
  | "decide"
  | "finish"
  | "start_high_impact"
  | "start"
  | "revive"
  | "waiting";

export interface GoalMomentumAction {
  goal_id: string;
  tier: 1 | 2 | 3 | 4 | 5;
  kind: GoalMomentumActionKind;
  downstream_open_count: number;
  unsatisfied_provider_goal_ids: string[];
}

export interface GoalMomentumIntegrity {
  dangling_relation_ids: string[];
  dependency_cycle_goal_ids: string[];
  multi_parent_goal_ids: string[];
  part_of_cycle_goal_ids: string[];
}

export interface GoalMomentumView {
  selected_goal_id: string;
  level_count: number;
  grid_rows: number;
  nodes: GoalMomentumNode[];
  edges: GoalMomentumEdge[];
  groups: GoalMomentumGroup[];
  actions: GoalMomentumAction[];
  cadence: Record<7 | 30, GoalMomentumCadence>;
  integrity: GoalMomentumIntegrity;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_RISK_STATES = new Set(["open", "triggered"]);
const PROGRESS_EVENT_PREFIXES = ["run.", "evidence.", "review.", "contract_", "relation."];
function compareGoal(left: GoalMomentumGoalInput, right: GoalMomentumGoalInput): number {
  return left.title.localeCompare(right.title) || left.goal_id.localeCompare(right.goal_id);
}

function time(value: string | null | undefined): number | null {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function utcDateKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function windowStart(now: Date, days: 7 | 30): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days + 1);
}

function isProgressEvent(type: string): boolean {
  return PROGRESS_EVENT_PREFIXES.some((prefix) => type.startsWith(prefix));
}

function goalActivityTimes(goal: GoalMomentumGoalInput): number[] {
  return [
    ...goal.runs.flatMap((run) => [time(run.started_at), time(run.ended_at)]),
    ...goal.evidence.map((evidence) => time(evidence.captured_at)),
    ...goal.reviews.map((review) => time(review.submitted_at)),
    ...goal.events.filter((event) => isProgressEvent(event.type)).map((event) => time(event.at)),
  ].filter((value): value is number => value !== null);
}

function firstExecutorStart(goal: GoalMomentumGoalInput): number | null {
  const starts = goal.runs
    .filter((run) => run.role === "executor")
    .map((run) => time(run.started_at))
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  return starts[0] ?? null;
}

function firstSatisfiedAt(goal: GoalMomentumGoalInput): number | null {
  const events = goal.events
    .filter((event) => event.type === "goal.satisfied")
    .map((event) => time(event.at))
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  return events[0] ?? null;
}

function firstBlockingAt(goal: GoalMomentumGoalInput): number | null {
  const activeBlockingRiskIds = new Set(
    goal.risks
      .filter((risk) => ACTIVE_RISK_STATES.has(risk.state) && risk.blocking_mode !== "none")
      .map((risk) => risk.risk_id),
  );
  if (goal.display_status !== "blocked") return null;
  const eventTimes = goal.events
    .filter((event) => ["risk.created", "risk.added", "risk.open", "risk.triggered"].includes(event.type))
    .map((event) => time(event.at))
    .filter((value): value is number => value !== null);
  const riskTimes = goal.risks
    .filter((risk) => activeBlockingRiskIds.has(risk.risk_id))
    .map((risk) => time(risk.created_at))
    .filter((value): value is number => value !== null);
  return [...eventTimes, ...riskTimes].sort((left, right) => left - right)[0] ?? null;
}

function cadenceFor(
  goals: readonly GoalMomentumGoalInput[],
  now: Date,
  days: 7 | 30,
): GoalMomentumCadence {
  const start = windowStart(now, days);
  const end = now.getTime();
  const bucketMap = new Map<string, GoalMomentumCadenceBucket>();
  for (let index = 0; index < days; index += 1) {
    const date = utcDateKey(start + index * DAY_MS);
    bucketMap.set(date, { date, started: 0, completed: 0, blockers: 0 });
  }
  const within = (value: number | null): value is number => value !== null && value >= start && value <= end;
  let started = 0;
  let completed = 0;
  let newBlockers = 0;
  let stalled = 0;
  let historyIncomplete = 0;
  for (const goal of goals) {
    const startedAt = firstExecutorStart(goal);
    if (within(startedAt)) {
      started += 1;
      const bucket = bucketMap.get(utcDateKey(startedAt));
      if (bucket) bucket.started += 1;
    }
    const satisfiedAt = firstSatisfiedAt(goal);
    if (within(satisfiedAt)) {
      completed += 1;
      const bucket = bucketMap.get(utcDateKey(satisfiedAt));
      if (bucket) bucket.completed += 1;
    }
    const blockingAt = firstBlockingAt(goal);
    if (within(blockingAt)) {
      newBlockers += 1;
      const bucket = bucketMap.get(utcDateKey(blockingAt));
      if (bucket) bucket.blockers += 1;
    }
    if (goal.completed) continue;
    const activity = goalActivityTimes(goal);
    const createdAt = time(goal.created_at);
    const historySufficient = activity.length > 0 || firstSatisfiedAt(goal) !== null || firstBlockingAt(goal) !== null;
    if (!historySufficient) historyIncomplete += 1;
    const freshness = blockingAt === null ? activity : [...activity, blockingAt];
    if (
      historySufficient &&
      createdAt !== null &&
      createdAt < start &&
      freshness.every((activityAt) => activityAt < start)
    ) stalled += 1;
  }
  return {
    days,
    started,
    completed,
    new_blockers: newBlockers,
    stalled,
    history_incomplete: historyIncomplete,
    buckets: [...bucketMap.values()],
  };
}

function insertSorted(queue: string[], value: string, byId: ReadonlyMap<string, GoalMomentumGoalInput>): void {
  queue.push(value);
  queue.sort((left, right) => compareGoal(byId.get(left)!, byId.get(right)!));
}

function assignDependencyRows(
  membersByLevel: Map<number, GoalMomentumGoalInput[]>,
  providers: ReadonlyMap<string, readonly string[]>,
  consumers: ReadonlyMap<string, readonly string[]>,
): Map<string, number> {
  const levels = [...membersByLevel.keys()].sort((left, right) => left - right);
  const rowCount = Math.max(1, ...[...membersByLevel.values()].map((members) => members.length));
  const rowByGoal = new Map<string, number>();
  for (const members of membersByLevel.values()) {
    const denominator = Math.max(1, members.length - 1);
    members.forEach((member, index) => {
      rowByGoal.set(
        member.goal_id,
        members.length === 1 ? 0 : Math.round(index / denominator * (rowCount - 1)),
      );
    });
  }
  if (levels.length < 2 || rowCount < 2) return rowByGoal;
  const memberIds = new Set(
    [...membersByLevel.values()].flatMap((members) => members.map((member) => member.goal_id)),
  );

  const nearestUniqueRows = (
    members: readonly GoalMomentumGoalInput[],
    targetFor: (goalId: string) => number,
  ): Map<string, number> => {
    const ordered = [...members].sort((left, right) =>
      targetFor(left.goal_id) - targetFor(right.goal_id) || compareGoal(left, right)
    );
    const memberCount = ordered.length;
    const costs: number[][] = Array.from({ length: memberCount }, () =>
      Array.from({ length: rowCount }, () => Number.POSITIVE_INFINITY)
    );
    const previous: number[][] = Array.from({ length: memberCount }, () =>
      Array.from({ length: rowCount }, () => -1)
    );
    for (let row = 0; row <= rowCount - memberCount; row += 1) {
      costs[0]![row] = Math.abs(row - targetFor(ordered[0]!.goal_id));
    }
    for (let index = 1; index < memberCount; index += 1) {
      let bestCost = Number.POSITIVE_INFINITY;
      let bestRow = -1;
      for (let row = index; row < rowCount; row += 1) {
        const candidateRow = row - 1;
        const candidateCost = costs[index - 1]![candidateRow]!;
        if (candidateCost < bestCost) {
          bestCost = candidateCost;
          bestRow = candidateRow;
        }
        if (row > rowCount - (memberCount - index)) continue;
        costs[index]![row] = bestCost + Math.abs(row - targetFor(ordered[index]!.goal_id));
        previous[index]![row] = bestRow;
      }
    }
    let finalRow = 0;
    let finalCost = Number.POSITIVE_INFINITY;
    for (let row = memberCount - 1; row < rowCount; row += 1) {
      if (costs[memberCount - 1]![row]! < finalCost) {
        finalCost = costs[memberCount - 1]![row]!;
        finalRow = row;
      }
    }
    const assigned = new Map<string, number>();
    for (let index = memberCount - 1; index >= 0; index -= 1) {
      assigned.set(ordered[index]!.goal_id, finalRow);
      finalRow = previous[index]![finalRow] ?? -1;
    }
    return assigned;
  };

  const reorder = (
    level: number,
    neighbors: ReadonlyMap<string, readonly string[]>,
  ) => {
    const members = membersByLevel.get(level);
    if (!members?.length) return;
    const barycenter = (goalId: string): number => {
      const positions = (neighbors.get(goalId) ?? [])
        .filter((neighborId) => memberIds.has(neighborId))
        .map((neighborId) => rowByGoal.get(neighborId))
        .filter((value): value is number => value !== undefined);
      if (!positions.length) return rowByGoal.get(goalId) ?? 0;
      return positions.reduce((sum, value) => sum + value, 0) / positions.length;
    };
    for (const [goalId, row] of nearestUniqueRows(members, barycenter)) rowByGoal.set(goalId, row);
  };

  // Alternating provider and consumer sweeps share one absolute row grid across
  // every level. Sparse levels keep intentional slots instead of being packed
  // back to row zero, so the row coordinate used by a node also describes the
  // dependency lines that enter and leave it.
  for (let pass = 0; pass < 6; pass += 1) {
    levels.slice(1).forEach((level) => reorder(level, providers));
    [...levels].reverse().slice(1).forEach((level) => reorder(level, consumers));
  }
  return rowByGoal;
}

export function buildGoalMomentumView(
  goals: readonly GoalMomentumGoalInput[],
  relations: readonly GoalMomentumRelationInput[],
  selectedGoalId?: string,
  now = new Date(),
): GoalMomentumView {
  const orderedGoals = [...goals].sort(compareGoal);
  const byId = new Map(orderedGoals.map((goal) => [goal.goal_id, goal]));
  const goalIds = new Set(byId.keys());
  const selectedGoalIdResolved = goalIds.has(selectedGoalId ?? "")
    ? selectedGoalId!
    : orderedGoals[0]?.goal_id ?? "";
  const activeRelations = relations
    .filter((relation) => relation.state === "active")
    .sort((left, right) =>
      left.type.localeCompare(right.type) ||
      left.from_goal_id.localeCompare(right.from_goal_id) ||
      left.to_goal_id.localeCompare(right.to_goal_id) ||
      left.relation_id.localeCompare(right.relation_id)
    );
  const relevantRelations = activeRelations.filter((relation) =>
    relation.type === "depends_on" || relation.type === "part_of"
  );
  const danglingRelationIds = relevantRelations
    .filter((relation) => !goalIds.has(relation.from_goal_id) || !goalIds.has(relation.to_goal_id))
    .map((relation) => relation.relation_id);
  const validRelations = relevantRelations.filter((relation) =>
    goalIds.has(relation.from_goal_id) && goalIds.has(relation.to_goal_id)
  );

  const dependencyEdges: GoalMomentumEdge[] = validRelations
    .filter((relation) => relation.type === "depends_on")
    .map((relation) => ({
      relation_id: relation.relation_id,
      provider_goal_id: relation.to_goal_id,
      consumer_goal_id: relation.from_goal_id,
      reason: relation.reason,
    }))
    .sort((left, right) =>
      left.provider_goal_id.localeCompare(right.provider_goal_id) ||
      left.consumer_goal_id.localeCompare(right.consumer_goal_id) ||
      left.relation_id.localeCompare(right.relation_id)
    );
  const providers = new Map<string, string[]>();
  const consumers = new Map<string, string[]>();
  for (const goalId of goalIds) {
    providers.set(goalId, []);
    consumers.set(goalId, []);
  }
  for (const edge of dependencyEdges) {
    providers.set(edge.consumer_goal_id, uniqueSorted([...(providers.get(edge.consumer_goal_id) ?? []), edge.provider_goal_id]));
    consumers.set(edge.provider_goal_id, uniqueSorted([...(consumers.get(edge.provider_goal_id) ?? []), edge.consumer_goal_id]));
  }

  const indegree = new Map([...goalIds].map((goalId) => [goalId, providers.get(goalId)?.length ?? 0]));
  const levels = new Map([...goalIds].map((goalId) => [goalId, 0]));
  const queue = orderedGoals.filter((goal) => indegree.get(goal.goal_id) === 0).map((goal) => goal.goal_id);
  const processed = new Set<string>();
  while (queue.length) {
    const providerId = queue.shift()!;
    processed.add(providerId);
    for (const consumerId of consumers.get(providerId) ?? []) {
      levels.set(consumerId, Math.max(levels.get(consumerId) ?? 0, (levels.get(providerId) ?? 0) + 1));
      const remaining = (indegree.get(consumerId) ?? 0) - 1;
      indegree.set(consumerId, remaining);
      if (remaining === 0) insertSorted(queue, consumerId, byId);
    }
  }
  const cycleGoalIds = orderedGoals.filter((goal) => !processed.has(goal.goal_id)).map((goal) => goal.goal_id);
  if (cycleGoalIds.length) {
    const fallbackLevel = Math.max(0, ...levels.values()) + (processed.size ? 1 : 0);
    for (const goalId of cycleGoalIds) levels.set(goalId, fallbackLevel);
  }

  const parentCandidates = new Map<string, string[]>();
  for (const relation of validRelations) {
    if (relation.type !== "part_of") continue;
    parentCandidates.set(
      relation.from_goal_id,
      uniqueSorted([...(parentCandidates.get(relation.from_goal_id) ?? []), relation.to_goal_id]),
    );
  }
  const multiParentGoalIds = [...parentCandidates]
    .filter(([, candidates]) => candidates.length > 1)
    .map(([goalId]) => goalId)
    .sort();
  const parent = new Map([...parentCandidates].map(([goalId, candidates]) => [goalId, candidates[0]!]));
  const parentGoalIds = new Set(parent.values());
  const partOfCycleGoalIds = new Set<string>();
  const groupRootFor = (goalId: string): string | null => {
    let current = goalId;
    const path: string[] = [];
    while (parent.has(current)) {
      if (path.includes(current)) {
        path.slice(path.indexOf(current)).forEach((id) => partOfCycleGoalIds.add(id));
        return [...path.slice(path.indexOf(current))].sort()[0] ?? current;
      }
      path.push(current);
      current = parent.get(current)!;
    }
    if (current !== goalId || parentGoalIds.has(goalId)) return current;
    return null;
  };
  const groupIdByGoal = new Map<string, string>();
  for (const goal of orderedGoals) groupIdByGoal.set(goal.goal_id, groupRootFor(goal.goal_id) ?? "__standalone__");
  const groupedGoals = new Map<string, GoalMomentumGoalInput[]>();
  for (const goal of orderedGoals) {
    const groupId = groupIdByGoal.get(goal.goal_id)!;
    groupedGoals.set(groupId, [...(groupedGoals.get(groupId) ?? []), goal]);
  }
  const orderedGroupIds = [...groupedGoals.keys()].sort((left, right) => {
    if (left === "__standalone__") return -1;
    if (right === "__standalone__") return 1;
    return compareGoal(byId.get(left)!, byId.get(right)!);
  });

  const downstreamByGoal = new Map<string, string[]>();
  const downstreamFor = (goalId: string): string[] => {
    const cached = downstreamByGoal.get(goalId);
    if (cached) return cached;
    const reached = new Set<string>();
    const pending = [...(consumers.get(goalId) ?? [])];
    while (pending.length) {
      const current = pending.shift()!;
      if (current === goalId || reached.has(current)) continue;
      reached.add(current);
      pending.push(...(consumers.get(current) ?? []));
    }
    const result = uniqueSorted(reached);
    downstreamByGoal.set(goalId, result);
    return result;
  };

  const rowByGoal = new Map<string, number>();
  const groups: GoalMomentumGroup[] = [];
  let rowCursor = 1;
  for (const groupId of orderedGroupIds) {
    const members = groupedGoals.get(groupId) ?? [];
    const membersByLevel = new Map<number, GoalMomentumGoalInput[]>();
    for (const member of members) {
      const level = levels.get(member.goal_id) ?? 0;
      membersByLevel.set(level, [...(membersByLevel.get(level) ?? []), member]);
    }
    for (const levelMembers of membersByLevel.values()) levelMembers.sort(compareGoal);
    const rowCount = Math.max(1, ...[...membersByLevel.values()].map((levelMembers) => levelMembers.length));
    const alignedRows = assignDependencyRows(membersByLevel, providers, consumers);
    for (const member of members) {
      rowByGoal.set(member.goal_id, rowCursor + (alignedRows.get(member.goal_id) ?? 0));
    }
    const memberLevels = members.map((member) => levels.get(member.goal_id) ?? 0);
    groups.push({
      group_id: groupId,
      title: groupId === "__standalone__" ? "项目级独立事项" : byId.get(groupId)?.title ?? groupId,
      root_goal_id: groupId === "__standalone__" ? null : groupId,
      goal_count: members.length,
      level_start: memberLevels.length ? Math.min(...memberLevels) : 0,
      level_end: Math.max(0, ...memberLevels),
      row_start: rowCursor,
      row_end: rowCursor + rowCount - 1,
    });
    rowCursor += rowCount + 1;
  }

  const nowMs = now.getTime();
  const staleStart = windowStart(now, 7);
  const nodes = orderedGoals.map((goal): GoalMomentumNode => {
    const providerGoalIds = providers.get(goal.goal_id) ?? [];
    const unsatisfiedProviderGoalIds = providerGoalIds.filter((providerId) => !byId.get(providerId)?.completed);
    const downstreamGoalIds = downstreamFor(goal.goal_id);
    const downstreamOpenCount = downstreamGoalIds.filter((consumerId) => !byId.get(consumerId)?.completed).length;
    const blocked = goal.display_status === "blocked";
    const activity = goalActivityTimes(goal);
    const historySufficient = activity.length > 0 || firstSatisfiedAt(goal) !== null || firstBlockingAt(goal) !== null;
    const createdAt = time(goal.created_at);
    const blockingAt = firstBlockingAt(goal);
    const freshness = blockingAt === null ? activity : [...activity, blockingAt];
    const stale = !goal.completed && historySufficient && createdAt !== null && createdAt < staleStart &&
      freshness.every((activityAt) => activityAt < staleStart || activityAt > nowMs);
    return {
      ...goal,
      level: levels.get(goal.goal_id) ?? 0,
      row: rowByGoal.get(goal.goal_id) ?? 1,
      group_id: groupIdByGoal.get(goal.goal_id) ?? "__standalone__",
      provider_goal_ids: providerGoalIds,
      consumer_goal_ids: consumers.get(goal.goal_id) ?? [],
      unsatisfied_provider_goal_ids: unsatisfiedProviderGoalIds,
      downstream_goal_ids: downstreamGoalIds,
      downstream_open_count: downstreamOpenCount,
      completion_ratio: goal.acceptance_criteria_count > 0
        ? Math.min(1, goal.passed_criteria_count / goal.acceptance_criteria_count)
        : goal.completed ? 1 : 0,
      blocked,
      startable: !goal.completed && goal.display_status === "continue" && unsatisfiedProviderGoalIds.length === 0,
      stale,
      history_sufficient: historySufficient,
    };
  });
  const nodesById = new Map(nodes.map((node) => [node.goal_id, node]));
  const actions = nodes
    .filter((node) => !node.completed)
    .map((node): GoalMomentumAction => {
      const waitingForHuman = node.display_status === "waiting_user";
      const nearComplete = node.display_status === "in_progress" || node.completion_ratio >= .6;
      if (waitingForHuman) {
        return { goal_id: node.goal_id, tier: 1, kind: "decide", downstream_open_count: node.downstream_open_count, unsatisfied_provider_goal_ids: node.unsatisfied_provider_goal_ids };
      }
      if (nearComplete && node.display_status !== "blocked" && node.display_status !== "waiting") {
        return { goal_id: node.goal_id, tier: 2, kind: "finish", downstream_open_count: node.downstream_open_count, unsatisfied_provider_goal_ids: node.unsatisfied_provider_goal_ids };
      }
      if (node.startable && node.downstream_open_count >= 2) {
        return { goal_id: node.goal_id, tier: 3, kind: "start_high_impact", downstream_open_count: node.downstream_open_count, unsatisfied_provider_goal_ids: [] };
      }
      if (node.stale && node.startable && node.downstream_open_count <= 1) {
        return { goal_id: node.goal_id, tier: 5, kind: "revive", downstream_open_count: node.downstream_open_count, unsatisfied_provider_goal_ids: node.unsatisfied_provider_goal_ids };
      }
      if (node.startable) {
        return { goal_id: node.goal_id, tier: 4, kind: "start", downstream_open_count: node.downstream_open_count, unsatisfied_provider_goal_ids: [] };
      }
      return { goal_id: node.goal_id, tier: 5, kind: "waiting", downstream_open_count: node.downstream_open_count, unsatisfied_provider_goal_ids: node.unsatisfied_provider_goal_ids };
    })
    .sort((left, right) => {
      const leftGoal = nodesById.get(left.goal_id)!;
      const rightGoal = nodesById.get(right.goal_id)!;
      return left.tier - right.tier ||
        right.downstream_open_count - left.downstream_open_count ||
        rightGoal.priority - leftGoal.priority ||
        compareGoal(leftGoal, rightGoal);
    });

  return {
    selected_goal_id: selectedGoalIdResolved,
    level_count: Math.max(0, ...levels.values()) + (orderedGoals.length ? 1 : 0),
    grid_rows: Math.max(0, rowCursor - 1),
    nodes,
    edges: dependencyEdges,
    groups,
    actions,
    cadence: {
      7: cadenceFor(orderedGoals, now, 7),
      30: cadenceFor(orderedGoals, now, 30),
    },
    integrity: {
      dangling_relation_ids: danglingRelationIds,
      dependency_cycle_goal_ids: cycleGoalIds,
      multi_parent_goal_ids: multiParentGoalIds,
      part_of_cycle_goal_ids: [...partOfCycleGoalIds].sort(),
    },
  };
}

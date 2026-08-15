import fs from "node:fs";
import path from "node:path";
import { GoalBoardCoordinator } from "./coordinator.js";
import { SqliteGoalBoardStore } from "./store.js";

export const DEMO_BOARD_ID = "goalboard-v1-demo";

export function seedDemoBoard(databasePath: string): void {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const store = new SqliteGoalBoardStore(databasePath);
  const coordinator = new GoalBoardCoordinator(store);
  try {
    const exists = store.db.prepare("SELECT board_id FROM boards WHERE board_id = ?").get(DEMO_BOARD_ID);
    if (exists) return;
    coordinator.initializeBoard({
      board_id: DEMO_BOARD_ID,
      title: "把 GoalBoard V1 做成可用产品",
      actor_id: "demo-user",
      idempotency_key: "demo-board",
    });
    const goals = [
      {
        goal_id: "V1",
        title: "交付 GoalBoard V1",
        outcome: "让人和 AI Runtime 围绕同一套目标真相协作",
        why: "通用 AI 产品里，用户最难确认目标、先后关系和完成证据",
        business_logic: "用户看清最终结果和下一步，Runtime 只领取已经准备好的最小 Goal；证据和必要复核都通过后，Goal 才算完成。",
        definition_state: "accepted" as const,
        decomposition_state: "closed_compound" as const,
        priority: 100,
        acceptance_criteria: [
          {
            criterion_id: "V1-C1",
            statement: "人能从首屏看懂目标、下一步和阻塞",
            decision_method: "inspection" as const,
            pass_condition: "首次使用者无需阅读协议即可正确复述",
          },
        ],
      },
      {
        goal_id: "CORE",
        title: "跑通 SQLite 执行闭环",
        outcome: "Goal 从 Ready 到证据和 Review 完成全程受同一真相源约束",
        why: "没有可执行闭环，GoalBoard 只是文档",
        business_logic: "Runtime 领取最小 Goal，完成工作后提交验收证据；所有必要复核都通过，Goal 才会变成已完成。",
        definition_state: "accepted" as const,
        decomposition_state: "closed_leaf" as const,
        priority: 90,
        acceptance_criteria: [
          {
            criterion_id: "CORE-C1",
            statement: "完整生命周期自动化测试通过",
            decision_method: "automated_check" as const,
            pass_condition: "pnpm test 通过",
          },
        ],
      },
      {
        goal_id: "INTERFACES",
        title: "让 CLI 与 MCP 共用同一真相",
        outcome: "Runtime 从任一入口看到同一 Ready Set 和 Claim",
        why: "入口不应各自维护状态",
        business_logic: "不同 Runtime 可以选择适合自己的接口，但它们读取和写入的是同一个 GoalBoard。",
        definition_state: "accepted" as const,
        decomposition_state: "closed_leaf" as const,
        priority: 80,
        acceptance_criteria: [
          {
            criterion_id: "INTERFACES-C1",
            statement: "CLI 与 MCP 共享 Ready 和 Claim 结果",
            decision_method: "automated_check" as const,
            pass_condition: "跨接口测试通过",
          },
        ],
      },
      {
        goal_id: "WEB",
        title: "完成一眼能看懂的 Web UI",
        outcome: "用户从首屏理解 Goal Spine、Ready、阻塞和待决定事项",
        why: "协议正确不等于产品可用",
        business_logic: "用户打开网页先看到正在追求的结果，再沿 Goal Spine 查看哪些工作能开始、哪些被挡住，以及完成还缺什么。",
        definition_state: "accepted" as const,
        decomposition_state: "closed_leaf" as const,
        priority: 70,
        acceptance_criteria: [
          {
            criterion_id: "WEB-C1",
            statement: "桌面和移动端关键信息清楚可用",
            decision_method: "inspection" as const,
            pass_condition: "视觉、响应式和可访问性 QA 通过",
          },
        ],
      },
      {
        goal_id: "RELEASE",
        title: "完成迁移和发布检查",
        outcome: "新工作区可初始化，旧数据有明确迁移或重建路径",
        why: "产品需要可安装、可验证、可继续使用",
        business_logic: "用户能创建新的本地真相源；已有数据若不能安全迁移，系统明确告诉用户如何重建，而不是静默丢失。",
        definition_state: "draft" as const,
        decomposition_state: "abstract" as const,
        priority: 60,
        acceptance_criteria: [
          {
            criterion_id: "RELEASE-C1",
            statement: "安装、迁移和发布检查有可重复命令",
            decision_method: "automated_check" as const,
            pass_condition: "发布验证命令全部通过",
          },
        ],
      },
    ];
    for (const goal of goals) {
      coordinator.createGoal(DEMO_BOARD_ID, goal, {
        actor_id: "demo-user",
        idempotency_key: `demo-goal-${goal.goal_id}`,
      });
    }
    for (const child of ["CORE", "INTERFACES", "WEB", "RELEASE"]) {
      coordinator.addRelation(
        DEMO_BOARD_ID,
        { from_goal_id: child, to_goal_id: "V1", type: "part_of", reason: "属于 V1 交付路径" },
        { actor_id: "demo-user", idempotency_key: `demo-part-${child}` },
      );
    }
    coordinator.addRelation(
      DEMO_BOARD_ID,
      { from_goal_id: "INTERFACES", to_goal_id: "CORE", type: "depends_on", reason: "接口复用应用核心" },
      { actor_id: "demo-user", idempotency_key: "demo-dependency-interfaces" },
    );
    coordinator.addRelation(
      DEMO_BOARD_ID,
      { from_goal_id: "WEB", to_goal_id: "INTERFACES", type: "depends_on", reason: "Web UI 读取同一应用语义" },
      { actor_id: "demo-user", idempotency_key: "demo-dependency-web" },
    );

    const coreClaim = coordinator.claimGoal({
      board_id: DEMO_BOARD_ID,
      goal_id: "CORE",
      actor_id: "runtime-core",
      idempotency_key: "demo-core-claim",
    }).claim!;
    const coreRun = coordinator.startRun({
      board_id: DEMO_BOARD_ID,
      claim_id: coreClaim.claim_id,
      actor_id: "runtime-core",
      idempotency_key: "demo-core-run",
    }).run;
    coordinator.reportRun({
      board_id: DEMO_BOARD_ID,
      run_id: coreRun.run_id,
      actor_id: "runtime-core",
      state: "completed",
      output_refs: ["tests/v1.test.ts"],
      idempotency_key: "demo-core-run-complete",
    });
    const coreEvidence = coordinator.submitEvidence({
      board_id: DEMO_BOARD_ID,
      goal_id: "CORE",
      actor_id: "runtime-core",
      run_id: coreRun.run_id,
      criterion_ids: ["CORE-C1"],
      kind: "test",
      locator: "command://pnpm-test",
      result: "passed",
      idempotency_key: "demo-core-evidence",
    }).evidence;
    const coreSelfReview = store
      .snapshot(DEMO_BOARD_ID)
      .review_obligations.find((item) => item.goal_id === "CORE" && item.role === "self_verifier")!;
    coordinator.submitReview({
      board_id: DEMO_BOARD_ID,
      goal_id: "CORE",
      obligation_id: coreSelfReview.obligation_id,
      actor_id: "runtime-core",
      verdict: "pass",
      evidence_refs: [coreEvidence.evidence_id],
      reasoning: "生命周期测试通过",
      idempotency_key: "demo-core-review",
    });
    coordinator.evaluateLeafCompletion({
      board_id: DEMO_BOARD_ID,
      goal_id: "CORE",
      actor_id: "runtime-core",
      idempotency_key: "demo-core-complete",
    });

    const interfaceClaim = coordinator.claimGoal({
      board_id: DEMO_BOARD_ID,
      goal_id: "INTERFACES",
      actor_id: "runtime-interface",
      idempotency_key: "demo-interface-claim",
    }).claim!;
    const interfaceRun = coordinator.startRun({
      board_id: DEMO_BOARD_ID,
      claim_id: interfaceClaim.claim_id,
      actor_id: "runtime-interface",
      idempotency_key: "demo-interface-run",
    }).run;
    coordinator.submitCandidate({
      board_id: DEMO_BOARD_ID,
      actor_id: "runtime-interface",
      discovered_in_run_id: interfaceRun.run_id,
      proposed_goal: {
        title: "补充 V3 数据迁移说明",
        outcome: "旧 GoalBoard 数据不会在升级时静默丢失",
        why: "实现接口时发现旧 JSON 与 V1 语义不能完全一一映射",
        business_logic: "用户升级时先看到哪些旧数据能安全迁移；不能迁移的部分明确提示重新生成。",
        acceptance_criteria: [
          {
            statement: "迁移报告逐项说明 migrated 或 regenerate",
            decision_method: "automated_check",
            pass_condition: "迁移夹具结果无未解释字段",
          },
        ],
      },
      blocking_mode: "none",
      idempotency_key: "demo-candidate",
    });
    store.db
      .prepare("UPDATE boards SET active_goal_id = ?, updated_at = ? WHERE board_id = ?")
      .run("V1", new Date().toISOString(), DEMO_BOARD_ID);
  } finally {
    store.close();
  }
}

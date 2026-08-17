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
      title: "让第一次使用 GoalBoard 的人顺利完成一次目标协作",
      actor_id: "demo-user",
      idempotency_key: "demo-board",
    });
    const goals = [
      {
        goal_id: "V1",
        title: "让第一次使用的人顺利完成一轮目标协作",
        outcome: "用户能把一个模糊想法变成清楚的目标树，并知道下一步、阻塞和完成依据",
        why: "AI 对话结束后容易丢失目标、决定和进度，新用户尤其难判断该从哪里继续",
        business_logic: "用户先在当前对话说明想做什么，Runtime 通过提问整理目标并请用户确认；确认后，当前或后续 Runtime 从可做项中选择工作，提交结果和证据，GoalBoard 持续保存共同进度。",
        definition_state: "accepted" as const,
        decomposition_state: "closed_compound" as const,
        priority: 100,
        acceptance_criteria: [
          {
            criterion_id: "V1-C1",
            statement: "第一次使用的人能从首屏看懂目标、下一步和阻塞",
            decision_method: "inspection" as const,
            pass_condition: "首次使用者无需阅读协议即可正确复述",
          },
        ],
      },
      {
        goal_id: "CORE",
        title: "让每项工作都有可信的完成依据",
        outcome: "用户能看到一项工作何时开始、做出了什么，以及为什么可以算完成",
        why: "只有进度标签而没有结果、证据和复核，用户仍然无法相信工作真的完成了",
        business_logic: "Runtime 选择一项已经准备好的工作并标记开始；完成后提交对应验收条件的证据，必要复核通过后，这项工作才会显示为已完成。",
        definition_state: "accepted" as const,
        decomposition_state: "closed_leaf" as const,
        priority: 90,
        acceptance_criteria: [
          {
            criterion_id: "CORE-C1",
            statement: "工作从开始到证据和复核形成完整记录",
            decision_method: "automated_check" as const,
            pass_condition: "生命周期自动化测试通过",
          },
        ],
      },
      {
        goal_id: "INTERFACES",
        title: "让不同 AI 对话看到同一项目进度",
        outcome: "用户换一个 Runtime 或新开对话后，仍能找到同一个项目的目标、进度和未完成工作",
        why: "如果每个入口各自记录状态，用户换一次对话就要重新解释整个项目",
        business_logic: "用户在当前对话明确选择项目后继续推进；其他 Runtime 也通过 GoalBoard 读取和更新同一份项目事实，不会各自维护一套进度。",
        definition_state: "accepted" as const,
        decomposition_state: "closed_leaf" as const,
        priority: 80,
        acceptance_criteria: [
          {
            criterion_id: "INTERFACES-C1",
            statement: "不同入口读取到一致的可做工作和占用状态",
            decision_method: "automated_check" as const,
            pass_condition: "跨入口自动化测试通过",
          },
        ],
      },
      {
        goal_id: "WEB",
        title: "让用户打开页面就看懂目标和下一步",
        outcome: "用户不用理解内部协议，也能看出项目要解决什么、当前进展、谁该做什么和为什么被阻塞",
        why: "底层规则正确并不代表产品容易理解；信息组织混乱会让用户放弃继续使用",
        business_logic: "用户打开项目后先看到目标树和当前目标，再按结果、完成标准、推进情况、风险和历史阅读；搜索、状态筛选和待决定事项都放在统一导航中。",
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
        title: "让新用户安装后知道下一步怎么开始",
        outcome: "用户完成安装后知道如何启动页面、连接正在使用的 Runtime，以及为什么需要新开会话",
        why: "安装成功但不知道服务是否常驻、工具何时生效或下一步说什么，仍然会被理解成产品不可用",
        business_logic: "安装只放置 GoalBoard 自己的程序，不偷偷修改项目或 Runtime；用户随后显式启用常驻服务、预览并确认 Runtime 接入，再在新会话中选择或创建项目开始使用。",
        definition_state: "draft" as const,
        decomposition_state: "abstract" as const,
        priority: 60,
        acceptance_criteria: [
          {
            criterion_id: "RELEASE-C1",
            statement: "安装、接入和重启提示可以按公开步骤重复完成",
            decision_method: "automated_check" as const,
            pass_condition: "全新安装端到端验证通过",
          },
        ],
      },
      {
        goal_id: "AUTO-CONNECT",
        title: "自动替用户选择最近使用的项目",
        outcome: "新对话少做一次项目确认",
        why: "早期方案希望用历史目录记录缩短首次连接步骤",
        business_logic: "新对话进入一个以前使用过的目录时，系统直接连接最近的项目，不再询问用户。这个方案可能选错项目，因此已经移入回收站，当前产品只展示候选并让用户决定。",
        definition_state: "accepted" as const,
        decomposition_state: "closed_leaf" as const,
        priority: 10,
        acceptance_criteria: [
          {
            criterion_id: "AUTO-CONNECT-C1",
            statement: "新对话无需确认就进入历史项目",
            decision_method: "inspection" as const,
            pass_condition: "进入历史目录后直接显示最近项目",
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
        { from_goal_id: child, to_goal_id: "V1", type: "part_of", reason: "共同组成第一次完整的 GoalBoard 使用体验" },
        { actor_id: "demo-user", idempotency_key: `demo-part-${child}` },
      );
    }
    coordinator.addRelation(
      DEMO_BOARD_ID,
      { from_goal_id: "INTERFACES", to_goal_id: "CORE", type: "depends_on", reason: "共享项目进度前，必须先保证每项工作的状态和完成依据可靠" },
      { actor_id: "demo-user", idempotency_key: "demo-dependency-interfaces" },
    );
    coordinator.addRelation(
      DEMO_BOARD_ID,
      { from_goal_id: "WEB", to_goal_id: "INTERFACES", type: "depends_on", reason: "页面显示必须和不同 Runtime 看到的项目进度一致" },
      { actor_id: "demo-user", idempotency_key: "demo-dependency-web" },
    );

    coordinator.addRisk(
      DEMO_BOARD_ID,
      {
        risk_id: "RISK-FIRST-RESTART",
        goal_ids: ["RELEASE"],
        description: "用户接入 Runtime 后没有新开会话，误以为安装失败",
        probability: "medium",
        impact: "用户看不到 GoalBoard 工具，无法开始第一次使用",
        affected_surfaces: ["首次安装", "Runtime 接入"],
        trigger: "用户继续使用接入前已经打开的会话",
        treatment: "mitigate",
        blocking_mode: "none",
        revisit_condition: "安装结果和接入预览都清楚说明新开会话的原因和下一步",
        owner: "产品体验",
      },
      { actor_id: "demo-user", idempotency_key: "demo-risk-first-restart" },
    );

    coordinator.setGoalTrashed(
      DEMO_BOARD_ID,
      {
        goal_id: "AUTO-CONNECT",
        trashed: true,
        reason: "这会替用户猜项目；当前方案只展示历史候选，并再次询问用户",
      },
      { actor_id: "demo-user", idempotency_key: "demo-trash-auto-connect" },
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
        title: "让旧数据升级前先看到安全说明",
        outcome: "用户在升级前知道哪些内容会保留、哪些需要重新整理",
        why: "旧版数据和当前规则并不完全对应，直接迁移可能让用户误以为缺失内容仍然有效",
        business_logic: "用户升级时先看到每类旧数据的处理结果；能安全保留的内容明确列出，不能可靠迁移的内容提示重新整理，不会静默丢失或伪造。",
        acceptance_criteria: [
          {
            statement: "升级报告逐项说明可迁移内容和需要重建的内容",
            decision_method: "automated_check",
            pass_condition: "迁移样例没有未解释字段",
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

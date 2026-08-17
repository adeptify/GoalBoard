#!/usr/bin/env node
/**
 * 生成 GoalBoard 演示项目（用于 README 截图和本地体验）。
 *
 * 用法：
 *   pnpm exec tsx examples/seed-demo.mts            # 写入 ~/.goalboard
 *   pnpm exec tsx examples/seed-demo.mts --home /path/to/home
 *
 * 脚本只写入 GoalBoard 自己的项目目录；不会创建或启动项目之外的任何东西。
 * 已存在的同名项目会直接复用，已有 Goal 数据的项目会跳过，可以安全重复运行。
 */
import os from "node:os";
import path from "node:path";
import { GoalBoardProjectCatalog } from "../src/projects/catalog.js";
import { GoalBoardCoordinator } from "../src/v1/coordinator.js";
import { SqliteGoalBoardStore } from "../src/v1/store.js";

const ACTOR = "demo-owner";
const force = process.argv.includes("--force");
const homeDirectory = path.resolve(
  process.argv.includes("--home")
    ? process.argv[process.argv.indexOf("--home") + 1]
    : process.env.GOALBOARD_HOME ?? path.join(os.homedir(), ".goalboard"),
);

async function ensureProject(
  catalog: GoalBoardProjectCatalog,
  displayName: string,
) {
  const existing = catalog.listProjects().find((item) => item.display_name === displayName);
  if (existing) return existing;
  return catalog.createProject({ display_name: displayName, actor_id: ACTOR });
}

function seed(
  record: Awaited<ReturnType<GoalBoardProjectCatalog["createProject"]>>,
  seeder: (coordinator: GoalBoardCoordinator, store: SqliteGoalBoardStore, record: typeof record) => void,
): void {
  const store = new SqliteGoalBoardStore(record.database_path);
  const coordinator = new GoalBoardCoordinator(store);
  try {
    const existing = store.db
      .prepare("SELECT COUNT(*) AS n FROM goals WHERE board_id = ?")
      .get(record.board_id) as { n: number };
    if (existing.n > 0) {
      console.log(`跳过（已有数据）：${record.display_name}`);
      return;
    }
    seeder(coordinator, store, record);
    console.log(`已生成：${record.display_name}`);
  } finally {
    store.close();
  }
}

async function resetProject(
  catalog: GoalBoardProjectCatalog,
  displayName: string,
): Promise<void> {
  const project = catalog.listProjects().find((item) => item.display_name === displayName);
  if (!project) return;
  const store = new SqliteGoalBoardStore(project.database_path);
  const coordinator = new GoalBoardCoordinator(store);
  try {
    const claims = store.db
      .prepare("SELECT claim_id FROM claims WHERE board_id = ? AND state = 'active'")
      .all(project.board_id) as Array<{ claim_id: string }>;
    for (const claim of claims) {
      coordinator.revokeClaim({
        board_id: project.board_id,
        claim_id: claim.claim_id,
        actor_id: ACTOR,
        reason: "演示数据重建",
        idempotency_key: `reset-claim-${project.project_id}-${claim.claim_id}`,
      });
    }
  } finally {
    store.close();
  }
  await catalog.deleteProject({
    project_id: project.project_id,
    actor_id: ACTOR,
    delete_confirmed: true,
    idempotency_key: `reset-delete-${project.project_id}`,
  });
  console.log(`已重置：${displayName}`);
}

function seedGoalBoardDemo(
  coordinator: GoalBoardCoordinator,
  _store: SqliteGoalBoardStore,
  record: Awaited<ReturnType<GoalBoardProjectCatalog["createProject"]>>,
): void {
  const boardId = record.board_id;
  const key = (suffix: string) => `demo-gb-${suffix}`;

  const goals = [
    {
      goal_id: "V1",
      title: "交付 GoalBoard V1",
      outcome: "让人和 AI Runtime 围绕同一套目标真相协作",
      why: "通用 AI 产品里，用户最难确认目标、先后关系和完成证据",
      business_logic:
        "用户打开网页先看清最终结果和下一步；Runtime 只领取已经准备好的最小 Goal，证据和必要复核都通过后 Goal 才算完成。",
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
      business_logic:
        "Runtime 领取最小 Goal，完成工作后提交验收证据；所有必要复核都通过，Goal 才会变成已完成。",
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
      business_logic:
        "不同 Runtime 可以选择适合自己的接口，但它们读取和写入的是同一个 GoalBoard。",
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
      business_logic:
        "用户打开网页先看到正在追求的结果，再沿 Goal Spine 查看哪些工作能开始、哪些被挡住，以及完成还缺什么。",
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
      goal_id: "DOCS",
      title: "写出人话版使用文档",
      outcome: "不读协议的人也能在 5 分钟内跑通安装与第一个 Goal",
      why: "文档是产品边界的一部分",
      business_logic:
        "从安装到接入 Runtime，每一步都有可照做的命令和预期结果；歧义处直接指向 Goal Contract 术语表。",
      definition_state: "accepted" as const,
      decomposition_state: "closed_leaf" as const,
      priority: 65,
      acceptance_criteria: [
        {
          criterion_id: "DOCS-C1",
          statement: "快速开始不出现未定义术语",
          decision_method: "inspection" as const,
          pass_condition: "两位未接触过产品的读者独立跑通",
        },
      ],
    },
    {
      goal_id: "RELEASE",
      title: "完成迁移和发布检查",
      outcome: "新工作区可初始化，旧数据有明确迁移或重建路径",
      why: "产品需要可安装、可验证、可继续使用",
      business_logic:
        "用户能创建新的本地真相源；已有数据若不能安全迁移，系统明确告诉用户如何重建，而不是静默丢失。",
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
    coordinator.createGoal(boardId, goal, {
      actor_id: ACTOR,
      idempotency_key: key(`goal-${goal.goal_id}`),
    });
  }
  for (const child of ["CORE", "INTERFACES", "WEB", "DOCS", "RELEASE"]) {
    coordinator.addRelation(
      boardId,
      { from_goal_id: child, to_goal_id: "V1", type: "part_of", reason: "属于 V1 交付路径" },
      { actor_id: ACTOR, idempotency_key: key(`part-${child}`) },
    );
  }
  coordinator.addRelation(
    boardId,
    { from_goal_id: "INTERFACES", to_goal_id: "CORE", type: "depends_on", reason: "接口复用应用核心" },
    { actor_id: ACTOR, idempotency_key: key("dep-interfaces-core") },
  );
  coordinator.addRelation(
    boardId,
    { from_goal_id: "WEB", to_goal_id: "INTERFACES", type: "depends_on", reason: "Web UI 读取同一应用语义" },
    { actor_id: ACTOR, idempotency_key: key("dep-web-interfaces") },
  );
  coordinator.addRisk(
    boardId,
    {
      risk_id: "RISK-WEB-MOBILE",
      goal_ids: ["WEB"],
      description: "移动端无法完整展示 Goal 文档与决定中心",
      probability: "中",
      impact: "高",
      affected_surfaces: ["Web UI", "验收检查"],
      trigger: "在窄屏设备上打开任一 Goal 正文",
      treatment: "mitigate",
      blocking_mode: "claim",
      revisit_condition: "窄屏响应式 QA 通过后复查",
      owner: "web-owner",
    },
    { actor_id: ACTOR, idempotency_key: key("risk-web-mobile"), reason: "登记阻塞风险" },
  );
  coordinator.addRisk(
    boardId,
    {
      risk_id: "RISK-RELEASE-MIGRATE",
      goal_ids: ["RELEASE"],
      description: "旧 JSON 与 V1 语义不能完全一一映射",
      probability: "高",
      impact: "中",
      affected_surfaces: ["迁移工具"],
      trigger: "导入带自定义输入的旧数据",
      treatment: "mitigate",
      blocking_mode: "completion",
      revisit_condition: "迁移夹具覆盖全部字段后复查",
      owner: "release-owner",
    },
    { actor_id: ACTOR, idempotency_key: key("risk-release-migrate"), reason: "登记发布风险" },
  );

  coordinator.addImpact(
    boardId,
    {
      goal_id: "WEB",
      surface: "Web 用户确认入口",
      access: "decide",
      state: "confirmed",
      reason: "用户在网页确认 Contract、Candidate 与 Rewire，Runtime 不能替代用户决定",
    },
    { actor_id: ACTOR, idempotency_key: key("impact-web") },
  );
  coordinator.setPolicy(
    boardId,
    {
      goal_id: "RELEASE",
      policy: {
        self_verification: true,
        adversarial_reviewers: 1,
        human_approval: true,
      },
      reason: "发布类目标需要对抗性复核与人工确认",
    },
    { actor_id: ACTOR, idempotency_key: key("policy-release") },
  );

  // CORE：完整跑通并验收
  const coreClaim = coordinator.claimGoal({
    board_id: boardId,
    goal_id: "CORE",
    actor_id: "runtime-core",
    idempotency_key: key("core-claim"),
  }).claim!;
  const coreRun = coordinator.startRun({
    board_id: boardId,
    claim_id: coreClaim.claim_id,
    actor_id: "runtime-core",
    idempotency_key: key("core-run"),
  }).run;
  coordinator.reportRun({
    board_id: boardId,
    run_id: coreRun.run_id,
    actor_id: "runtime-core",
    state: "completed",
    output_refs: ["tests/v1.test.ts", "tests/mcp.test.ts"],
    idempotency_key: key("core-run-complete"),
  });
  const coreEvidence = coordinator.submitEvidence({
    board_id: boardId,
    goal_id: "CORE",
    actor_id: "runtime-core",
    run_id: coreRun.run_id,
    criterion_ids: ["CORE-C1"],
    kind: "test",
    locator: "command://pnpm-test",
    result: "passed",
    idempotency_key: key("core-evidence"),
  }).evidence;
  const coreReview = _store
    .snapshot(boardId)
    .review_obligations.find((item) => item.goal_id === "CORE" && item.role === "self_verifier")!;
  coordinator.submitReview({
    board_id: boardId,
    goal_id: "CORE",
    obligation_id: coreReview.obligation_id,
    actor_id: "runtime-core",
    verdict: "pass",
    evidence_refs: [coreEvidence.evidence_id],
    reasoning: "生命周期自动化测试全部通过",
    idempotency_key: key("core-review"),
  });
  coordinator.evaluateLeafCompletion({
    board_id: boardId,
    goal_id: "CORE",
    actor_id: "runtime-core",
    idempotency_key: key("core-complete"),
  });

  // INTERFACES：执行中，并发现了新工作（Candidate）
  const interfaceClaim = coordinator.claimGoal({
    board_id: boardId,
    goal_id: "INTERFACES",
    actor_id: "runtime-interface",
    idempotency_key: key("interface-claim"),
  }).claim!;
  const interfaceRun = coordinator.startRun({
    board_id: boardId,
    claim_id: interfaceClaim.claim_id,
    actor_id: "runtime-interface",
    idempotency_key: key("interface-run"),
  }).run;
  coordinator.submitCandidate({
    board_id: boardId,
    actor_id: "runtime-interface",
    discovered_in_run_id: interfaceRun.run_id,
    proposed_goal: {
      title: "补充 V3 数据迁移说明",
      outcome: "旧 GoalBoard 数据不会在升级时静默丢失",
      why: "实现接口时发现旧 JSON 与 V1 语义不能完全一一映射",
      business_logic:
        "用户升级时先看到哪些旧数据能安全迁移；不能迁移的部分明确提示重新生成。",
      acceptance_criteria: [
        {
          statement: "迁移报告逐项说明 migrated 或 regenerate",
          decision_method: "automated_check",
          pass_condition: "迁移夹具结果无未解释字段",
        },
      ],
    },
    blocking_mode: "none",
    idempotency_key: key("candidate-v3"),
  });

  // DOCS：证据已提交，等待复核
  const docsClaim = coordinator.claimGoal({
    board_id: boardId,
    goal_id: "DOCS",
    actor_id: "runtime-docs",
    idempotency_key: key("docs-claim"),
  }).claim!;
  const docsRun = coordinator.startRun({
    board_id: boardId,
    claim_id: docsClaim.claim_id,
    actor_id: "runtime-docs",
    idempotency_key: key("docs-run"),
  }).run;
  coordinator.reportRun({
    board_id: boardId,
    run_id: docsRun.run_id,
    actor_id: "runtime-docs",
    state: "completed",
    output_refs: ["docs/usage.md"],
    idempotency_key: key("docs-run-complete"),
  });
  coordinator.submitEvidence({
    board_id: boardId,
    goal_id: "DOCS",
    actor_id: "runtime-docs",
    run_id: docsRun.run_id,
    criterion_ids: ["DOCS-C1"],
    kind: "inspection",
    locator: "docs/usage.md",
    result: "passed",
    idempotency_key: key("docs-evidence"),
  });
  coordinator.releaseClaim({
    board_id: boardId,
    claim_id: docsClaim.claim_id,
    actor_id: "runtime-docs",
    reason: "Run 已完成并提交证据，进入复核阶段",
    idempotency_key: key("docs-release"),
  });

  coordinator.setActiveGoal(
    boardId,
    { goal_id: "WEB", reason: "当前最需要用户关注的是被依赖和风险挡住的工作" },
    { actor_id: ACTOR, idempotency_key: key("active-web") },
  );
}

function seedPetBoardingDemo(
  coordinator: GoalBoardCoordinator,
  _store: SqliteGoalBoardStore,
  record: Awaited<ReturnType<GoalBoardProjectCatalog["createProject"]>>,
): void {
  const boardId = record.board_id;
  const key = (suffix: string) => `demo-pet-${suffix}`;
  const goals = [
    {
      goal_id: "ROOT",
      title: "上线宠物寄养小程序 MVP",
      outcome: "宠物主可以找到附近可用的寄养家庭并完成下单",
      why: "验证本地寄养供需撮合是否有人愿意持续使用",
      business_logic:
        "用户按位置浏览寄养家庭、查看可约档期并下单；商家在后台确认订单。首期只做单城市。",
      definition_state: "accepted" as const,
      decomposition_state: "closed_compound" as const,
      priority: 100,
      acceptance_criteria: [
        {
          criterion_id: "ROOT-C1",
          statement: "真实用户完成一次从浏览到下单的闭环",
          decision_method: "inspection" as const,
          pass_condition: "10 位试用用户中至少 7 位成功下单",
        },
      ],
    },
    {
      goal_id: "BOOKING",
      title: "完成预约与订单流程",
      outcome: "用户能按档期预约并看到订单状态",
      why: "下单闭环是 MVP 的核心价值",
      business_logic:
        "用户选择寄养家庭和日期后生成待支付订单；商家确认后订单变为已确认，并展示给双方。",
      definition_state: "accepted" as const,
      decomposition_state: "closed_leaf" as const,
      priority: 90,
      acceptance_criteria: [
        {
          criterion_id: "BOOKING-C1",
          statement: "预约到确认的完整流程自动化测试通过",
          decision_method: "automated_check" as const,
          pass_condition: "核心链路用例全部通过",
        },
      ],
    },
    {
      goal_id: "PAY",
      title: "接入微信支付",
      outcome: "订单可以线上完成支付与退款",
      why: "没有支付就无法完成真实交易",
      business_logic:
        "订单确认后发起微信支付；支付回调更新订单状态，商家可原路退款。",
      definition_state: "accepted" as const,
      decomposition_state: "closed_leaf" as const,
      priority: 80,
      acceptance_criteria: [
        {
          criterion_id: "PAY-C1",
          statement: "支付与退款沙箱用例全部通过",
          decision_method: "automated_check" as const,
          pass_condition: "沙箱支付、回调、退款三组用例通过",
        },
      ],
    },
    {
      goal_id: "LAUNCH",
      title: "上架应用商店",
      outcome: "小程序通过审核并对外可访问",
      why: "产品要真正到达用户",
      business_logic:
        "整理类目、资质与隐私说明，提交审核；审核意见逐条闭环后再提交。",
      definition_state: "draft" as const,
      decomposition_state: "abstract" as const,
      priority: 60,
      acceptance_criteria: [
        {
          criterion_id: "LAUNCH-C1",
          statement: "审核通过并可正常打开",
          decision_method: "inspection" as const,
          pass_condition: "线上版本可完成一次真实下单",
        },
      ],
    },
  ];
  for (const goal of goals) {
    coordinator.createGoal(boardId, goal, {
      actor_id: ACTOR,
      idempotency_key: key(`goal-${goal.goal_id}`),
    });
  }
  for (const child of ["BOOKING", "PAY", "LAUNCH"]) {
    coordinator.addRelation(
      boardId,
      { from_goal_id: child, to_goal_id: "ROOT", type: "part_of", reason: "属于 MVP 交付路径" },
      { actor_id: ACTOR, idempotency_key: key(`part-${child}`) },
    );
  }
  coordinator.addRelation(
    boardId,
    { from_goal_id: "PAY", to_goal_id: "BOOKING", type: "depends_on", reason: "支付发生在订单确认之后" },
    { actor_id: ACTOR, idempotency_key: key("dep-pay-booking") },
  );
  coordinator.addRisk(
    boardId,
    {
      risk_id: "RISK-MERCHANT",
      goal_ids: ["PAY"],
      description: "微信支付商户资质审批周期比预期长",
      probability: "高",
      impact: "高",
      affected_surfaces: ["支付", "上线时间"],
      trigger: "提交资质后超过两周未通过",
      treatment: "mitigate",
      blocking_mode: "claim",
      revisit_condition: "资质通过后复查",
      owner: "ops-owner",
    },
    { actor_id: ACTOR, idempotency_key: key("risk-merchant"), reason: "登记上线风险" },
  );

  const bookingClaim = coordinator.claimGoal({
    board_id: boardId,
    goal_id: "BOOKING",
    actor_id: "runtime-booking",
    idempotency_key: key("booking-claim"),
  }).claim!;
  const bookingRun = coordinator.startRun({
    board_id: boardId,
    claim_id: bookingClaim.claim_id,
    actor_id: "runtime-booking",
    idempotency_key: key("booking-run"),
  }).run;
  coordinator.reportRun({
    board_id: boardId,
    run_id: bookingRun.run_id,
    actor_id: "runtime-booking",
    state: "completed",
    output_refs: ["tests/booking.test.ts"],
    idempotency_key: key("booking-run-complete"),
  });
  const bookingEvidence = coordinator.submitEvidence({
    board_id: boardId,
    goal_id: "BOOKING",
    actor_id: "runtime-booking",
    run_id: bookingRun.run_id,
    criterion_ids: ["BOOKING-C1"],
    kind: "test",
    locator: "command://pnpm-test-booking",
    result: "passed",
    idempotency_key: key("booking-evidence"),
  }).evidence;
  const bookingReview = _store
    .snapshot(boardId)
    .review_obligations.find((item) => item.goal_id === "BOOKING" && item.role === "self_verifier")!;
  coordinator.submitReview({
    board_id: boardId,
    goal_id: "BOOKING",
    obligation_id: bookingReview.obligation_id,
    actor_id: "runtime-booking",
    verdict: "pass",
    evidence_refs: [bookingEvidence.evidence_id],
    reasoning: "预约到确认的核心链路用例全部通过",
    idempotency_key: key("booking-review"),
  });
  coordinator.evaluateLeafCompletion({
    board_id: boardId,
    goal_id: "BOOKING",
    actor_id: "runtime-booking",
    idempotency_key: key("booking-complete"),
  });

  coordinator.setActiveGoal(
    boardId,
    { goal_id: "PAY", reason: "当前被资质风险挡住，需要人决定如何处理" },
    { actor_id: ACTOR, idempotency_key: key("active-pay") },
  );
}

function seedReadingNotesDemo(
  coordinator: GoalBoardCoordinator,
  _store: SqliteGoalBoardStore,
  record: Awaited<ReturnType<GoalBoardProjectCatalog["createProject"]>>,
): void {
  const boardId = record.board_id;
  const key = (suffix: string) => `demo-read-${suffix}`;
  const goals = [
    {
      goal_id: "ROOT",
      title: "做一个本地优先的读书笔记同步 CLI",
      outcome: "笔记以 Markdown 存本地，也能在设备间同步",
      why: "现有笔记服务绑定云端，用户担心数据迁移与隐私",
      business_logic:
        "用户在任意目录初始化笔记库，用命令增删改笔记；同步通过用户自己的存储完成，不依赖第三方服务。",
      definition_state: "accepted" as const,
      decomposition_state: "closed_compound" as const,
      priority: 100,
      acceptance_criteria: [
        {
          criterion_id: "ROOT-C1",
          statement: "双设备各完成一轮增删改并保持一致",
          decision_method: "automated_check" as const,
          pass_condition: "双设备同步对账无差异",
        },
      ],
    },
    {
      goal_id: "SYNC",
      title: "实现 Markdown 双向同步",
      outcome: "两台设备上的笔记库能双向合并且不丢数据",
      why: "同步能力决定产品是否可用",
      business_logic:
        "同步时按文件内容与修订时间做三向合并；冲突文件保留副本并在下次命令时提示用户处理。",
      definition_state: "accepted" as const,
      decomposition_state: "closed_leaf" as const,
      priority: 90,
      acceptance_criteria: [
        {
          criterion_id: "SYNC-C1",
          statement: "冲突与删除场景的对账用例全部通过",
          decision_method: "automated_check" as const,
          pass_condition: "对账用例无未解释差异",
        },
      ],
    },
    {
      goal_id: "SEARCH",
      title: "支持笔记检索",
      outcome: "用户能用关键词快速找到笔记",
      why: "笔记多了以后检索是刚需",
      business_logic:
        "检索只读本地文件，按标题与正文建立索引；结果按最近修改时间排序。",
      definition_state: "accepted" as const,
      decomposition_state: "closed_leaf" as const,
      priority: 70,
      acceptance_criteria: [
        {
          criterion_id: "SEARCH-C1",
          statement: "千篇笔记检索返回时间低于 200ms",
          decision_method: "measurement" as const,
          pass_condition: "基准测试通过",
        },
      ],
    },
    {
      goal_id: "PUBLISH",
      title: "发布到 npm",
      outcome: "用户可以一条命令安装并开始使用",
      why: "CLI 工具要能真正被安装",
      business_logic:
        "包名与文档齐全，发布后提供升级说明；重要变更走语义化版本。",
      definition_state: "draft" as const,
      decomposition_state: "abstract" as const,
      priority: 60,
      acceptance_criteria: [
        {
          criterion_id: "PUBLISH-C1",
          statement: "全新环境安装即可运行",
          decision_method: "inspection" as const,
          pass_condition: "干净环境安装并跑通 init",
        },
      ],
    },
  ];
  for (const goal of goals) {
    coordinator.createGoal(boardId, goal, {
      actor_id: ACTOR,
      idempotency_key: key(`goal-${goal.goal_id}`),
    });
  }
  for (const child of ["SYNC", "SEARCH", "PUBLISH"]) {
    coordinator.addRelation(
      boardId,
      { from_goal_id: child, to_goal_id: "ROOT", type: "part_of", reason: "属于 MVP 交付路径" },
      { actor_id: ACTOR, idempotency_key: key(`part-${child}`) },
    );
  }
  coordinator.addRelation(
    boardId,
    { from_goal_id: "SEARCH", to_goal_id: "SYNC", type: "depends_on", reason: "检索基于同步后的本地文件" },
    { actor_id: ACTOR, idempotency_key: key("dep-search-sync") },
  );

  const syncClaim = coordinator.claimGoal({
    board_id: boardId,
    goal_id: "SYNC",
    actor_id: "runtime-sync",
    idempotency_key: key("sync-claim"),
  }).claim!;
  const syncRun = coordinator.startRun({
    board_id: boardId,
    claim_id: syncClaim.claim_id,
    actor_id: "runtime-sync",
    idempotency_key: key("sync-run"),
  }).run;

  coordinator.setActiveGoal(
    boardId,
    { goal_id: "SYNC", reason: "同步是当前唯一在执行中的工作" },
    { actor_id: ACTOR, idempotency_key: key("active-sync") },
  );
}

async function main(): Promise<void> {
  const catalog = await GoalBoardProjectCatalog.open({ homeDirectory });
  try {
    if (force) {
      for (const name of ["把 GoalBoard V1 做成可用产品", "宠物寄养小程序 MVP", "读书笔记同步 CLI"]) {
        await resetProject(catalog, name);
      }
    }
    await seed(await ensureProject(catalog, "把 GoalBoard V1 做成可用产品"), seedGoalBoardDemo);
    await seed(await ensureProject(catalog, "宠物寄养小程序 MVP"), seedPetBoardingDemo);
    await seed(await ensureProject(catalog, "读书笔记同步 CLI"), seedReadingNotesDemo);
    console.log(`演示项目已就绪：${homeDirectory}`);
  } finally {
    catalog.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

# GoalBoard 产品族与模块架构草案

状态：工作草案
日期：2026-08-29
用途：记录 GoalBoard、Relay、Loreport 重组方向，作为后续模块 Contract、Desktop UI 和 Server 设计的共同输入。本文不是已经接受的实现 Contract；“已确认”与“开放问题”必须分开维护。

## 1. 为什么需要重新整理

当前讨论同时涉及四类问题：

1. 个人如何管理注意力、轻量事务和持续工作线；
2. 团队如何协作、拆解 Goal、交接和接续；
3. 邮件、IM、社媒、RSS 等外部信息如何进入工作系统；
4. Desktop 与 Server 各自保存什么、在哪里执行、如何同步。

如果直接按 GoalBoard、Relay、Loreport 三个现有产品分配功能，很容易把产品名、部署位置、领域对象和 UI 页面混在一起。因此后续采用以下顺序：

1. 划分领域模块；
2. 定义每个模块唯一拥有的实体、状态和内部工作流；
3. 定义模块之间的命令、事件和对象关联；
4. 再决定模块在 Desktop、Server 或两端的部署方式；
5. 最后设计同步、权限、存储和 UI。

## 2. 当前已经确认的产品方向

### 2.1 Goal 是个人与团队之间的连续主线

GoalBoard 既不只解决个人注意力，也不只解决团队任务管理。共同核心是 Goal continuity：一个结果从被提出、澄清、拆解、执行、阻塞、交接、复核到完成，始终可以被理解和继续。

- 个人侧关注：我现在应该注意什么、哪些事情值得承诺、如何从上次状态继续。
- 团队侧关注：共同推进什么、如何拆解和认领、如何交接、哪些决定和证据已经成为共享事实。

### 2.2 轻量事务不必全部成为 Goal

个人可以保留不需要完整 Goal Contract 的轻量事务。它们可以被完成、忽略、延期、关联到已有 Goal，或在需要持续投入和验收时升格为 Goal。

### 2.3 外部信息首先是 Signal，不是 Goal

邮件、IM、社媒、RSS、网页查询等外部内容首先进入事件流或 Feed。用户或团队随后决定：

- 忽略或归档；
- 收藏为参考；
- 创建轻量 Action；
- 关联已有 Goal；
- 创建个人 Goal；
- 通过 Promotion 提交为 Team Goal。

用户界面可以使用“一键升格”，但领域层不直接改变原对象类型。系统创建新 Goal，并保留它与原始 Signal、FeedEntry 或 Action 的来源关系。

### 2.4 Server 可以保存 Feed，不只是保存 Goal

GoalBoard Server 可以运行云端 Connector、保存个人或团队 Feed，并同步给 Desktop。来源可以选择不同的执行、凭据和存储策略：

- 公共 RSS、公开网页和公开社媒适合默认在 Server 持续同步；
- Gmail 等私人账号可以由用户在 Desktop 登录，也可以在云端完成 OAuth；
- 云端 Connector 获取的内容由 Server 可靠同步到用户自己的 Desktop；
- 本地 Connector 获取的内容可以仅保存在本地，也可以按用户选择同步元数据、摘要或完整内容。

### 2.5 当前 GoalBoard 是个人端的起点

当前 GoalBoard 保留本地优先、Goal 管理、Runtime 接入和真实执行状态能力，并逐步转化为 GoalBoard Personal / GoalBoard Desktop，即个人工作台。

### 2.6 Loreport 是 GoalBoard Server 的候选基础

Loreport 已经设计了 Team Space、IAM、Proposal/Review、共享 Context、Decision、Artifact 等概念，但目前主要是产品和架构文档。因此不再优先发展为一个独立产品，而是作为 GoalBoard Server 的设计和实现基础候选。

### 2.7 Relay 是可部署在两端的能力层

Relay 不应被整体归入 Desktop 或 Server。它的 Connector、Source、同步、去重、凭据、Conversation Link、回写和执行适配能力，应整理成能够运行在不同 Host 的共享模块：

- Relay Desktop Host：本地账号、本地应用、本地文件和本地 Runtime；
- Relay Cloud Host：公共 Feed、云端 OAuth、团队 IM 和持续在线同步。

Relay 自己已有的 Team Workspace、Goal 相似状态和权限系统不应继续与 GoalBoard Server 平行扩张。

## 3. 产品族的当前假设

```text
GoalBoard
├── GoalBoard Desktop / Personal
│   ├── Personal Feed
│   ├── Personal Action
│   ├── Attention & Workline
│   ├── Personal / synced Goal
│   ├── Local Relay Host
│   └── Local Runtime / Run / Evidence
│
└── GoalBoard Server
    ├── Personal Cloud Space
    ├── Team Space
    ├── Cloud Relay Host
    ├── Feed Storage & Delivery
    ├── Goal Graph
    ├── Promotion & Review
    ├── Handoff & Collaboration
    └── Shared Decision / Artifact / Evidence
```

这张图只表达产品边界，不等于代码仓库、进程或微服务边界。

## 4. 领域模块地图

### 4.1 Identity & Space

职责：定义人、团队、设备、空间、成员关系和权限边界。

主要实体：

- User
- Actor
- Device / Node
- Space（personal / team）
- Membership
- Role
- Grant

本模块不拥有 Feed、Goal 或 Artifact 内容，只决定谁能读、写、决定和分享。

### 4.2 Source & Connector

职责：连接外部系统，管理凭据引用、同步游标和真实读取状态。

主要实体：

- SourceDefinition
- ConnectorInstallation
- CredentialRef
- SourceSubscription
- SyncRun
- SyncCursor
- ConnectorReceipt

内部工作流：

```text
register → authorize → active → sync → degraded / paused → reauthorize / revoke
```

本模块只负责可靠观察外部世界，不决定一条内容是否值得处理。

### 4.3 Signal & Feed

职责：规范化、去重、关联来源，并把 Signal 分发到用户或团队的 Feed。

主要实体：

- SourceEvent：Provider 事件或读取结果
- Signal：规范化、可追溯的外部内容
- Feed：用户或空间中的信息流
- FeedEntry：Signal 在某个 Feed 中的投影
- FeedDisposition：unread / seen / saved / dismissed / acted / linked
- Provenance
- DeliveryReceipt

一个 Signal 可以进入多个 Feed；每个用户拥有独立的 FeedEntry 阅读和处理状态。

内部工作流：

```text
observed → normalized → deduplicated → routed → delivered
                                              ↓
                           unread → seen → saved / dismissed / acted / linked
```

### 4.4 Personal Action

职责：承载不需要完整 Goal Contract 的轻量个人事务。

主要实体：

- Action
- Reminder
- ActionLink

初始工作流：

```text
open → doing → done
  ├── deferred
  ├── dismissed
  └── promoted_to_goal
```

Action 不是 Goal 的叶子副本。Goal 内部仍遵循“可执行叶子 Goal 是 Task 投影”的现有原则；Action 只服务 Goal Spine 之外的轻量个人事务。

### 4.5 Goal Core

职责：定义结果、业务逻辑、范围、验收、拆解、依赖、风险和完成语义。

当前 GoalBoard 已有的主要实体：

- Board
- Goal
- AcceptanceCriterion
- GoalRelation
- Risk
- GoalPolicy
- ContractProposal
- GoalTreeProposal
- CandidateGoal
- Rewire

内部工作流保持多轴状态，不退化成一个通用 status：

- definition：draft → accepted
- decomposition：abstract → frontier_open → closed_leaf / closed_compound
- validity：valid / needs_revalidation / invalidated
- fulfillment：unmet / satisfied

Plan 和 TaskBoard 继续作为 Goal Spine 的派生视图，不建立第二套可写的 Plan 或 Goal Task 真相。

### 4.6 Work & Execution

职责：记录谁以什么角色领取工作、一次执行如何进行、是否阻塞以及执行引擎的真实回执。

主要实体：

- Claim
- Run
- EngineBinding
- ExecutionApproval
- ExecutionReceipt

内部工作流：

```text
Goal ready → claim requested → claim active → run started
                                         ├── blocked → resumed
                                         ├── failed / abandoned
                                         └── completed → output references
```

Relay 的 Assignment 应适配为 Claim 或执行投递请求；Relay Job 应适配为 Run，不再形成另一套工作真相。

### 4.7 Evidence & Artifact

职责：保存产出、证明、版本和验证结论。

主要实体：

- Artifact
- ArtifactVersion
- Evidence
- EvidenceCorrection
- ReviewObligation
- VerificationReview

边界：

- Artifact 是可持续引用和版本化的产出；
- Evidence 说明某个来源或 Artifact 如何证明某条 Criterion；
- VerificationReview 判断 Goal 的完成条件是否成立；
- 原始 Evidence 不静默改写，通过 supersede / retract 纠正。

### 4.8 Collaboration

职责：处理跨个人与团队边界的发布、评审、交接和共同决定。

主要实体：

- Proposal
- PromotionProposal
- DisclosureBundle
- ProposalDecision
- Handoff
- TeamDecision

Proposal 需要类型化：

- Feed / Action / Personal Goal → Team Goal 的 Promotion；
- Goal Contract 或 Goal Tree 变更；
- Artifact 发布；
- Handoff。

ProposalDecision 与 VerificationReview 是两种不同判断，不能继续共用模糊的 Review 语义。

### 4.9 Attention & Resumption

职责：帮助个人决定此刻关注什么，减少切换成本，并能够从中断处继续。

主要实体：

- Workline
- AttentionQueueEntry
- FocusState
- Interruption
- ResumeSnapshot

本模块消费 FeedEntry、Action、Goal 和 Run 的状态，但不复制或改写它们的领域真相。

可能的工作流：

```text
queued → focused → suspended / interrupted → resumed → closed
```

### 4.10 Sync & Replication

职责：在 Server、Desktop 和其他 Node 之间可靠复制允许共享的状态。

主要实体：

- ObjectEnvelope
- Revision
- ChangeEvent
- SyncCursor
- ReplicaState
- Conflict
- SyncReceipt

该模块不拥有业务对象。它只传播业务模块已经接受的变化，并保留幂等、顺序、恢复和审计所需的信息。

## 5. 核心对象流动原则

### 5.1 对象不通过改类型完成“升格”

```text
SourceEvent → Signal → FeedEntry
                         ├── creates → Action
                         ├── links_to → existing Goal
                         ├── creates → Personal Goal
                         └── proposes → PromotionProposal → Team Goal
```

这样可以分别保留：

- 外部内容及来源；
- 用户自己的阅读和处理状态；
- 轻量事务生命周期；
- Goal 的结果、验收和协作生命周期。

### 5.2 同一个事实只能有一个权威模块

- Source & Connector 拥有外部连接和同步游标；
- Signal & Feed 拥有收到的内容和 Feed 处理状态；
- Goal Core 拥有 Goal Contract 和 Goal Graph；
- Work & Execution 拥有 Claim / Run；
- Evidence & Artifact 拥有产出和验证记录；
- Collaboration 拥有跨空间发布与决定；
- Attention 只拥有个人关注顺序和恢复状态。

### 5.3 UI 可以组合，写入必须回到拥有模块

个人工作台可以在同一屏显示 Feed、Action、Goal、Run 和 Decision，但操作必须调用各自模块的命令，不能让 UI 创建一份新的综合状态。

## 6. 四条主工作流

### 6.1 外部信息进入 Feed

```text
Source sync
  → SourceEvent observed
  → Signal normalized and deduplicated
  → routing policy selects Feed
  → FeedEntry delivered
  → Desktop receives durable revision
```

### 6.2 Feed 进入个人工作

```text
FeedEntry
  → dismiss / save
  → create Action
  → link existing Goal
  → create Personal Goal
```

### 6.3 个人内容进入团队 Goal

```text
FeedEntry / Action / Personal Goal
  → choose disclosure scope
  → PromotionProposal
  → accept / revise / reject
  → materialize Team Goal
  → link original private object without broadening access
```

### 6.4 Goal 执行与完成

```text
accepted executable Goal
  → readiness derived
  → Claim
  → Run
  → Artifact / Evidence
  → VerificationReview
  → fulfillment derived
  → satisfied or returned for more work
```

## 7. Desktop 与 Server 的设计方法

模块先保持部署中立。模块 Contract 稳定后，每个实体或 Source 再声明以下属性：

```text
authority_home      server | desktop
visibility          private | team | public
storage_policy      server_full | server_metadata | desktop_only
execution_location  server | desktop | either
replication_policy  none | selected | full
```

### 7.1 当前倾向的 Desktop 职责

- 个人工作台和注意力入口；
- 本地 Connector 与系统 Keychain；
- 本地文件、应用和 Runtime 接入；
- 本地 Run、终端和详细执行状态；
- Server Feed 和 Goal 的离线副本；
- 用户明确选择的 Promotion 和同步操作。

### 7.2 当前倾向的 Server 职责

- Personal Cloud Space 与 Team Space；
- 云端 Source、持续同步和 Feed 存储；
- Team Goal 和需要云同步的 Personal Goal；
- Promotion、权限、交接和团队决定；
- 共享 Artifact / Evidence；
- Device 增量同步、重放和恢复。

### 7.3 典型来源模式

| 来源 | Connector 执行 | 凭据 | 默认权威位置 | 说明 |
| --- | --- | --- | --- | --- |
| 公共 RSS | Server | 无 | Server | 持续同步并分发到设备 |
| 公共网页查询 | Server | 无或服务凭据 | Server | 保存 provenance 和查询配置 |
| Gmail 云端模式 | Server | 云端 Secret Vault | Server | Desktop 离线时仍持续获取 |
| Gmail 本地模式 | Desktop | OS Keychain | Desktop | 用户决定同步摘要或全文 |
| Slack / 飞书团队空间 | Server 或 Team Relay Host | 安装级凭据 | Team Space | 按授权 Channel / Thread 读取 |
| 本地文件和应用 | Desktop | 本地权限 | Desktop | 只同步明确选择的结果或引用 |
| 本地 Agent Runtime | Desktop | 本地 Runtime | Desktop | 向 Server 上报 Run、Evidence 和摘要 |

## 8. 同步设计原则

“Server 转发到 Desktop”必须实现为可靠同步，而不是一次性实时通知：

```text
authority 接受 Command
  → 持久化对象 revision 和 ChangeEvent
  → Replica 按 SyncCursor 增量拉取
  → 本地事务应用
  → 返回 SyncReceipt / ACK
  → 断网后从最后确认位置恢复
```

原则：

1. 每个对象只有一个 authority_home，避免双主；
2. WebSocket 只负责降低延迟，不负责保证交付；
3. 所有写入都带 revision 和 idempotency key；
4. 冲突按领域实体解决，不采用全局 last-write-wins；
5. 凭据不随 FeedItem 同步，Desktop 不需要获得云端 OAuth Token；
6. 私人对象的同步不会自动扩大 visibility；
7. 删除、撤回、断连和不确定写回都必须有可恢复状态。

## 9. 三个现有项目的保留、替换与忽略

### 9.1 GoalBoard

保留：

- Goal Contract、Criterion、Relation、Risk、Policy；
- Claim、Run、Evidence、Review；
- Goal Tree、Proposal、Candidate、Rewire；
- Runtime/MCP/CLI、本地 SQLite 和 Desktop；
- 已验证的 Goal Focus、Goal Navigator 和 Goal-bound Runtime 行为。

替换或扩展：

- 从“Goal 管理工作站”扩展为“个人工作台”；
- 增加 Feed、Action、Attention 和云同步入口；
- Board / Project / Space 的层级和权限语义需要重新对齐。

忽略：

- 把当前单设备 SQLite 约束直接复制到 Team Server；
- 为了兼容旧 UI，把所有新对象都塞进 Goal Tree。

### 9.2 Relay

保留：

- Connector、Source、SyncRun、Cursor 和去重；
- Gmail、RSS、Web Query、YouTube、Slack、飞书等适配经验；
- ConversationLink、DeliveryReceipt、Action Approval；
- Engine 接入和真实状态回执。

替换：

- 将通用 Item 拆成 Signal、FeedEntry、Action 或 Goal；
- Assignment / Job 适配 GoalBoard Claim / Run；
- Connector Contract 支持 Cloud Host 和 Desktop Host。

忽略：

- 独立发展另一套 Team Workspace、Goal、IAM 和共享工作真相；
- 第一阶段承诺接通所有社媒平台。

### 9.3 Loreport

保留：

- Space、IAM、Authority、Proposal/Review；
- 私人到共享的显式发布边界；
- Artifact、Decision、Relation、Event 和恢复设计；
- Web 多人 Team Space 的架构经验。

替换：

- 产品定位调整为 GoalBoard Server；
- Signals 不再限定为 Server 内的第一入口，而是与统一 Signal & Feed 模块对齐；
- Task Room 私人执行能力回到 GoalBoard Desktop；
- Execution/Relay 改成对 Relay Host 和 Desktop Node 的适配。

忽略：

- 继续维护独立 Loreport 品牌和与 GoalBoard 重复的产品外壳；
- 让所有 Signal 自动进入团队共享上下文。

## 10. 仓库策略草案

- `goalboard`：继续承载现有 Goal Core 和 Desktop，近期先把 UI 转化为个人工作台；
- `loreport`：候选 GoalBoard Server 仓库，正式执行前需要用新方向替换当前“独立产品 Host”的 accepted 决策；
- `relay`：暂时保留为能力来源和真实实现，优先通过 adapter 验证边界，再决定提取 package 或迁移代码；
- 不立即进行大规模物理合仓或仓库改名。

## 11. 近期执行顺序

### 第一阶段：个人工作台 UI 垂直切片

先在当前 GoalBoard 中建立个人工作台的信息架构和可见体验，保留真实 Goal、Decision 和 Runtime 行为。尚未实现的 Feed、Action 和 Server Sync 不能伪装成可用功能，应以真实空状态、禁用入口或独立原型处理。

### 第二阶段：主链领域 Contract

详细设计以下主链的字段、状态机、命令和事件：

```text
SourceEvent → Signal → FeedEntry → Action / Goal → Promotion
```

### 第三阶段：部署与同步 Contract

在实体所有权确定后，设计 Server/Desktop authority、存储策略、同步协议和隐私边界。

### 第四阶段：第一个端到端真实闭环

建议优先验证：

```text
Server RSS → Personal Feed → Desktop → Personal Goal → 本地 Run → Evidence
```

随后增加：

```text
Personal Feed / Goal → Promotion → Team Goal → Handoff → Desktop 继续执行
```

## 12. 仍待决定的问题

1. GoalBoard Personal 的首个 UI 切片是“只重组现有真实能力”，还是允许出现 Feed / Action 的可交互原型数据；
2. Board、Project、Space 三者的最终层级和命名；
3. Personal Goal 开启同步后，是否统一迁移为 Server authority；
4. Gmail 第一版默认使用云端持续同步还是仅本机同步；
5. Team Promotion 的接受权限：有创建 Goal 权限即可接受，还是需要指定 reviewer；
6. Relay 以 package、独立 daemon 还是 adapter 集合的形式被两端消费；
7. Loreport 仓库何时正式改名和替换现有 SSOT。

## 13. 当前事实来源

- GoalBoard 产品与现有约束：`PRODUCT.md`
- GoalBoard 领域模型：`specs/goalboard-mvp/domain-contract.md`、`src/v1/types.ts`
- 当前 Desktop 视觉与交互：`DESIGN.md`、`.impeccable/surfaces/src-web-render-ts.md`
- Relay 产品和领域模型：`../relay/docs/PROJECT.md`、`../relay/src/domain/`
- Loreport 产品与模块架构：`../loreport/docs/PROJECT.md`、`../loreport/docs/system/ARCHITECTURE.md`、`../loreport/docs/modules/`
- Attention Harness 想法：`../lab/ideas/attention-harness.md`

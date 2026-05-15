# 迁移计划 —— 净身重来

> 引用：[00_PRINCIPLES.zh.md](./00_PRINCIPLES.zh.md) 原则 4（"净身重来 优先于 向后兼容"）、[02_ERC8004_CONTRACT_DESIGN.zh.md](./02_ERC8004_CONTRACT_DESIGN.zh.md)、[04_MERCHANT_AGENT_TEMPLATE.zh.md](./04_MERCHANT_AGENT_TEMPLATE.zh.md)。

这是从当前 `MerchantRegistry.sol` + `skill_service.py` mock 迁移到
ERC-8004 + merchant-agent 架构的**操作 playbook**。**顺序很重要**；
有些步骤并行，有些有硬依赖。

---

## 1. 留什么，砍什么

| 资产 | 决定 |
|---|---|
| 0G 测试网上的 legacy `MerchantRegistry.sol` | **保留部署**（链历史不可变）但**deprecated**。**应用停止读它**。 |
| 注册到 legacy 合约上的 28 个假商家 | **不迁移**。它们一直就是假的。 |
| 那 28 个在 Supabase `merchants` 表的数据 | **保留**作为测试 fixture，标 `legacy_seed: true`。**不公开暴露**。 |
| 前端页面 | **重构，不重建**。路由不变；背后的数据变。 |
| `auth_service` / `draft_service`（Supabase 持久化）| **保留**。**auth 流是好的**。 |
| `skill_service.py`（12 个 mock handler）| **删除**。 |
| `/mcp/tools/execute` endpoint | **删除**。**user-agent 直接和 merchant-agent 说话**。 |
| AgentDemo 里的 0G Compute 集成 | **保留**。任何 agent 的可选推理 provider。 |
| AgentDemo 里的 Qiniu 集成 | **保留**。可选推理 provider。 |
| `tourskill.paking.xyz` 域名 + Vercel 部署 | **保留**。**indexer + 签名仪式页同样的托管故事**。 |
| `api.tourskill.paking.xyz` FastAPI 后端 | **保留**（瘦身）。Auth + drafts + indexer cache + 多租户 runtime。 |

---

## 2. 排序（依赖）

```
                        ┌─── prereq.1（任何新工作前必须收尾）
                        │     └ 用户跑 Supabase DDL（auth_tokens + drafts）
                        │     └ 用户 rotate 暴露的 sk- key
                        │
                        ▼
         ┌──── Phase A.2: ERC-8004 合约（1 周）
         │     │
         │     ├─ 写 IdentityRegistry / ReputationRegistry / ValidationRegistry
         │     ├─ Foundry 测试，100% 覆盖
         │     ├─ 部 Base Sepolia
         │     └─ Verify on Basescan
         │
         ▼
         ┌──── Phase A.3: merchant-agent 模板（2 周）
         │     │
         │     ├─ 仓库初始化：monorepo，Hono + Drizzle + Zod
         │     ├─ 写核心接口（MerchantStore、LLMClient）
         │     ├─ 写 x402 中间件集成
         │     ├─ 默认 skill 集（hotel）+ 自动发现
         │     ├─ 部第一个参考实例（28 个品牌之一，**作为真实 agent
         │     │   重新接入** —— 选 "Wuming Chu" 因为它已经有丰富的
         │     │   profile data）
         │     └─ 参考实例注册到 Base Sepolia ERC-8004
         │
         ▼
         ┌──── Phase A.4: 前端改线 + 后端瘦身（3 天）
         │     │
         │     ├─ 索引器缓存：把 IdentityRegistry 事件回放到 Supabase
         │     │   （新表：agents，作用域：ERC-8004 镜像）
         │     ├─ /v1/discover 从新 agents 表读，不再从 merchants 读
         │     ├─ MerchantSign 页用 ERC-8004 注册流
         │     ├─ AgentDemo 的 invoke_merchant_skill 直接和 merchant-
         │     │   agent 说话（从 agent-card 解析）
         │     ├─ Profile 页 admin：管理 platform-hosted 的 agent-card 内容；
         │     │   或仅显示 self-hosted 的链上身份
         │     └─ 删除 skill_service.py + /mcp/tools/execute
         │
         ▼
         ┌──── Phase B: BookingEscrow + x402（2 周）
         │
         ▼
         ┌──── Phase C: 信誉流程（1 周）
```

**总墙钟时间 ~6-8 周专注工作**。

---

## 3. 数据库迁移

两张新 Supabase 表；**现有 `merchants` 表保留**作为 legacy seed。

### 3.1 新增：`agents`（ERC-8004 索引器镜像）

```sql
create table if not exists agents (
  agent_id           bigint        primary key,    -- 链上 ERC-8004 ID
  owner_address      text          not null,
  agent_card_uri     text          not null,
  agent_card_hash    text          not null,       -- 0x 前缀的 hex sha256
  registered_at      timestamptz   not null,
  updated_at         timestamptz   not null,
  active             boolean       not null,

  -- 缓存的 card 内容（每 5 分钟拉一次 + 验证哈希）
  card_cached_at     timestamptz,
  card_name          text,
  card_description   text,
  card_url           text,                          -- agent 的 base URL
  card_skills        jsonb,                         -- skill 列表，便于过滤
  card_extensions    jsonb,                         -- Concourse 扩展
  card_fetch_error   text                           -- 上次拉取错误（如有）
);

create index agents_owner_idx       on agents (owner_address);
create index agents_active_idx      on agents (active);
create index agents_url_idx         on agents (card_url);
create index agents_card_skills_idx on agents using gin (card_skills);
create index agents_card_ext_idx    on agents using gin (card_extensions);
```

索引器服务（住在我们后端里）冷启动时从 genesis 回放
`AgentRegistered` / `AgentUpdated` / `AgentActiveChanged` 事件，然后
通过 JSON-RPC 订阅保持实时。

### 3.2 新增：`feedback_index`（链下评论）

```sql
create table if not exists feedback_index (
  id                 uuid          primary key default gen_random_uuid(),
  agent_id           bigint        not null,
  reviewer_address   text          not null,
  booking_tx_hash    text          not null,
  settlement_tx_hash text          not null,
  rating             smallint      not null check (rating between 1 and 5),
  title              text,
  body               text          not null,
  language           text          not null default 'en',
  media              jsonb,
  signature          text          not null,
  created_at         timestamptz   not null,
  source             text          not null default 'auto',  -- auto | manual
  verified_at        timestamptz                              -- 我们的索引器何时验证签名 + 授权
);

create unique index feedback_index_uniq on feedback_index (agent_id, reviewer_address, booking_tx_hash);
create index feedback_index_agent_idx   on feedback_index (agent_id, created_at desc);
```

### 3.3 保留：`merchants`（legacy + 测试 fixture）

加一列标 legacy 性质；**不要删行**（**有用作测试数据**）。

```sql
alter table merchants add column if not exists legacy_seed boolean not null default false;
update merchants set legacy_seed = true;  -- 把现有 28 全标 legacy
```

`/v1/discover` 端点**索引器上线后停止读这个表**。**没有公开消费者
看到 `legacy_seed = true` 的行**。

---

## 4. 沟通 / 破坏性变更

legacy 合约在公链上。**任何人盯着都看到"冻结"状态**。我们沟通
deprecation：

1. README.md 顶部 banner："Concourse 正在迁移到 Base 上的 ERC-8004。0G 上的 legacy 合约自 <日期> deprecated。新地址：<addr>。"
2. legacy 合约在 chainscan-galileo 上的合约说明更新（`MerchantRegistry — DEPRECATED — see Base Sepolia ERC-8004 IdentityRegistry at <addr>`）。
3. 引用 legacy 合约地址的前端页切到新 ERC-8004 IdentityRegistry 地址。
4. 28 个假商家从公开 Explorer 消失（**因为索引器不再读它们**）；Explorer 在真实商家上线前是空的。

**Explorer 空窗期是有意的**。**我们展示真的，不靠 mock 把它撑满**。

---

## 5. 前端变更

| 页面 | 现在 | 迁移后 |
|---|---|---|
| `/`（Home）| 用 Supabase 28 商家计数 | 从 `agents` 表读计数；数字会很低；**OK** |
| `/explorer` | 28 mock 的分页列表 | 从 `agents` 表的分页列表；可能空 / 少；渲染"成为 Concourse 上第一批商家"空状态 |
| `/merchant/:id` | 从 Supabase merchants 读 | 从 `agents` 表按 agent_id 读 |
| `/merchant/sign/:draftId` | 调 legacy MerchantRegistry.register() | 调 IdentityRegistry.register(agentCardURI, agentCardHash) |
| `/profile` | 列 owner 在 Supabase 的 merchants | 列 owner 在 agents 表的 agents |
| `/register` | 表单 → 创建 merchant + 注册到 legacy 合约 | **重新定位**：引导部 merchant-agent 模板（自托管）或订阅托管 |
| `/demo` | invoke_merchant_skill → /mcp/tools/execute | invoke_merchant_skill → 解析 agent-card → 直接 HTTPS 到商家 |

最大的 UX 变化是 `/register`：**不再是"填表就上链"**。变成**"部一个
agent（或付我们托管），然后才上链"**。**这是对的摩擦；我们不藏它**。

---

## 6. 后端变更

```
api.tourskill.paking.xyz/
├── /health                                    [保留]
├── /v1/auth/challenge      [保留 —— 流程不变]
├── /v1/auth/verify         [保留]
├── /v1/drafts              [保留 —— 签名仪式用]
├── /v1/drafts/{id}         [保留]
├── /v1/drafts/{id}/complete [适配 —— 调链上 IdentityRegistry.register]
├── /v1/discover            [适配 —— 从 agents 表读，不从 merchants]
├── /v1/agents/{agentId}    [新 —— 替换 /v1/merchants/{id}]
├── /v1/reputation/feedback [新 —— 反馈索引器]
├── /v1/agents/{slug}/...   [新 —— 多租户 agent runtime（platform-hosted）]
├── /skills/{name}/SKILL.md [保留 —— 协议安装 URL]
└── 删除：/mcp/*             [GONE —— agent 直接说话]
```

`/mcp/*` 的删除是**公开 API 破坏**。**我们 bump major 版本**：

```
旧：api.tourskill.paking.xyz/mcp/tools/execute
新：没有 —— 直接调 merchant-agent
```

user-agent 的 `invoke_merchant_skill` tool 实现变了；我们 ship 一个
新的 SKILL.md（带版本，例如 `/skills/user-client/SKILL.md` —— 同样
的 URL 但内容更新）记录新流程。**对旧 SKILL.md 安装的现有 agent 会
失败；下次 install 时重新拉取**。

---

## 7. 并发：并行跑两个一段时间？

**诱人的问题**：是不是该同时让旧 skill_service 跑几周，免得 demo 挂
掉？

**不要**。按原则 4（净身重来）：**一招删除**。同时跑两个**正是我们
答应过自己不背的偶然向后兼容**。**迁移痛感很小**（**没有真实商家
依赖旧 API；没有真实用户，只有我们自己的 demo chat**）。

我们 ship 什么：**旧代码的最后版本**在 git 里 tag 成
`legacy/skill-service-v1` 备查。**之后 working tree 只剩新世界**。

---

## 8. 逐步执行清单

### 预备工作
- [ ] 用户在 Supabase SQL Editor 跑 `backend/sql/002_auth_tokens_and_drafts.sql`
- [ ] 用户在 portal rotate 暴露的 Qiniu sk- key

### Phase A.2 —— ERC-8004 合约（1 周）
- [ ] 初始化 `contracts/erc8004/` Foundry 项目
- [ ] 按 [02_ERC8004_CONTRACT_DESIGN.zh.md](./02_ERC8004_CONTRACT_DESIGN.zh.md) §2 实现 IdentityRegistry
- [ ] 按 §3 实现 ReputationRegistry
- [ ] 按 §4 实现 ValidationRegistry
- [ ] Foundry 测试：行覆盖率 100%
- [ ] Foundry 属性测试：所有权不变量、ID 单调性
- [ ] 用 `forge create` + 硬件钱包部 Base Sepolia
- [ ] Verify on Basescan
- [ ] 在 `docs/architecture/DEPLOY_ADDRESSES.md` 记录地址

### Phase A.3 —— merchant-agent 模板（2 周）
- [ ] 初始化 `merchant-agent-template/` monorepo（独立仓库或 `apps/` 子目录）
- [ ] 按 [04_MERCHANT_AGENT_TEMPLATE.zh.md](./04_MERCHANT_AGENT_TEMPLATE.zh.md) §3 实现核心接口
- [ ] 实现 Hono app + 路由
- [ ] 实现 SQLite + Postgres store
- [ ] 写 agent-card 构建器 + 哈希 + sync-card 脚本
- [ ] 写默认酒店 skill 集（最少 5 个）
- [ ] 写 auth（bearer + EIP-191）+ x402 中间件集成
- [ ] Vitest 单元测试（每 skill、每 store）
- [ ] 部 "Wuming Chu" 参考实例到 Vercel
- [ ] 把参考实例注册到 Base Sepolia IdentityRegistry
- [ ] Smoke 测试：拉 agent-card、验哈希、调 check_availability

### Phase A.4 —— 前端 + 后端改线（3 天）
- [ ] 加 `agents` + `feedback_index` Supabase 表
- [ ] 写索引器服务（Python 还是 Node —— 待定；倾向 Node 因为链库更丰富）
- [ ] 回填：索引器从 genesis 读所有 IdentityRegistry 事件
- [ ] 后端瘦身：删 `skill_service.py`、删 `/mcp/*` 路由
- [ ] 适配 `/v1/discover` 读 `agents` 表
- [ ] 按 §5 适配前端页
- [ ] 更新 SKILL.md（消费者侧）描述 直接调用 流程
- [ ] 更新 SKILL.md（商家侧）描述 通过-agent-card 注册的新流程
- [ ] 端到端验证：AgentDemo 发现 Wuming Chu，调真实 check_availability，得到真实（mock-data）可用性响应

### Phase B —— BookingEscrow + x402（2 周）
- [ ] 按 [05_X402_PAYMENT_FLOW.zh.md](./05_X402_PAYMENT_FLOW.zh.md) 实现 BookingEscrow.sol
- [ ] Foundry 100% 覆盖、属性测试、fork 测试
- [ ] 部 Base Sepolia
- [ ] 给 merchant-agent 模板加 x402 中间件
- [ ] 加真 `create_booking` skill 返 402
- [ ] 加结算 keeper 服务
- [ ] 铸测试 USDC，端到端跑预订到结算

### Phase C —— Reputation（1 周）
- [ ] 更新 BookingEscrow 在 release 时调 ReputationRegistry
- [ ] 给索引器加 `/v1/reputation/feedback` 端点
- [ ] 给 merchant-agent 加 `/reputation/feedback` 路由
- [ ] 在 user-agent 加评论提交 UI
- [ ] 在 discover 排序加 Wilson 聚合

---

## 9. 回滚计划

如果 Phase A.3 上线后发现 merchant-agent 模板的根本缺陷（例如 x402
中间件有严重 bug）：

- 旧后端**还在 git tag `legacy/skill-service-v1`**。
- 部署回 Vercel **是 `vercel rollback` 一步**（~30 秒）。
- Base Sepolia 合约**保持部署**（不需要回滚；不可变）。
- **向前修**：补丁到模板，**不要回退架构**。

我们接受 Phase A.3 → A.4 过渡期一些用户面 flakiness。**向前修比维护
双栈更好**。

---

## 10. 诚实自检

迁移之后，我们应该能对以下全部回答"是"：

- ☑ `/v1/discover` 里**每一个商家**对应一个**可访问 URL** 的真实 agent？
- ☑ agent-card 里**每一个 skill** 映射到 merchant-agent 里**真实代码**？
- ☑ 调 `check_availability` **真的读日历**？
- ☑ 调 `create_booking` **真的锁真 USDC 到真 escrow**？
- ☑ 评论**只能在 settled booking 之后**留？
- ☑ 自托管商家**从外部看与平台托管 byte-identical**？
- ☑ Concourse 后端**从不持有 USDC，从不执行 skill**？

**如果有任何回答"否"，我们没真正迁移 —— 只是 ship 了不同的 demo**。
**诚实自检是 merge 标准**。

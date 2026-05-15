# 目标架构

> 引用：[00_PRINCIPLES.zh.md](./00_PRINCIPLES.zh.md)。如果本文档与原则冲突，原则胜。

这是 Phase A + B 完成后**应该**呈现的系统。**不是**当下的系统。
是接下来 6-8 周里每个决定都要瞄准的目标。

---

## 1. 全景图

```
                ┌─────────────────────────────────────────────────┐
                │                  USER（人）                      │
                └────────────────────────┬────────────────────────┘
                                         │ 自然语言
                                         ▼
                ┌─────────────────────────────────────────────────┐
                │              USER AGENT (LLM 大脑)               │
                │  通过 SKILL.md @ concourse 域名一次性安装        │
                │  跑在哪都行：Claude Code / Cursor / ChatGPT /    │
                │  自定义 —— 我们不托管它                          │
                └────┬───────────────────────────────────┬────────┘
                     │                                   │
                     │ 1. 发现                            │ 4. 支付（x402）
                     ▼                                   │
        ┌────────────────────────────┐                   │
        │   ERC-8004 三套 registry   │                   │
        │   (Base Sepolia → mainnet) │                   │
        │                            │                   │
        │   IdentityRegistry         │                   │
        │   ReputationRegistry       │                   │
        │   ValidationRegistry       │                   │
        │                            │                   │
        │   返回：agent 地址          │                   │
        │        + agent_card_uri    │                   │
        └─────────────┬──────────────┘                   │
                      │ 2. 拉 agent-card.json            │
                      ▼                                   │
        ┌────────────────────────────┐                   │
        │   agent-card.json (HTTPS)  │                   │
        │   由 merchant-agent 服务    │                   │
        │   含：skills、auth、       │                   │
        │   payment 提示、版本       │                   │
        └─────────────┬──────────────┘                   │
                      │ 3. 直接 HTTP 调用                 │
                      ▼                                   │
                ┌──────────────────────────────────────┐ │
                │       MERCHANT AGENT (LLM 大脑)      │ │
                │                                       │ │
                │  ┌──────────────────────────────────┐│ │
                │  │ 自托管（商家自己部 Vercel）       ││ │
                │  │ OR 平台托管（我们的多租户）       ││ │
                │  │ 外部接口完全相同                  ││ │
                │  └──────────────────────────────────┘│ │
                │                                       │ │
                │  自己读 SKILL.md → 学会自己能干啥     │ │
                │  自己拥有：库存、日历、菜单            │ │
                │  如果 skill 要钱就返 402 ─────────────┘ │
                │                                          │
                │  支付完成后：返回真实结果                 │
                └──────────────────────────────────────────┘

                                                          │
                                                          ▼ 收到付款时
                                              ┌───────────────────────┐
                                              │  BookingEscrow.sol    │
                                              │  (Base Sepolia)       │
                                              │  USDC 时间锁          │
                                              │  + 申诉窗口            │
                                              └───────────────────────┘
                                                          │
                                                          ▼ 结算时
                                              ┌───────────────────────┐
                                              │  ReputationRegistry   │
                                              │  (Base, ERC-8004)     │
                                              │  通过 proof-of-payment │
                                              │  做 Sybil 抗性        │
                                              └───────────────────────┘
```

侧链路（**故意不在关键路径上**）：

```
┌─────────────────────────────────────────┐
│  TOURSKILL 后端（FastAPI on Vercel）    │
│                                         │
│  • Auth（challenge → bearer token）     │
│  • Draft URL 铸造（签名仪式）            │
│  • 基于 ERC-8004 事件的索引器缓存        │
│  • 多租户 agent runtime                 │
│    （仅平台托管商家用）                  │
│                                         │
│  不执行 merchant skill。                │
│  不托管任何钱包。                        │
│  Supabase 缓存以外无状态。               │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  0G COMPUTE NETWORK                     │
│  任意 agent（user-side 或 merchant-side）│
│  的可选推理 provider                     │
│  钱包付费。与商家身份正交。              │
└─────────────────────────────────────────┘
```

---

## 2. 各组件契约

### 2.1 ERC-8004 三套 registry（Base Sepolia → mainnet）

**"这个 agent 存在并且归这个地址所有"的事实来源。**

- **IdentityRegistry**：映射 `agent_id (uint256) → { address owner, string agentCardURI }`。任何人都能 `register(agentCardURI)`；只有 owner 能 `update(...)` 或 `setAgentCardURI(...)`。
- **ReputationRegistry**：无状态的反馈授权。Agent A 的 owner 预先授权钱包 B 留 feedback（典型场景：通过对一个 settled escrow tx 的引用）；实际 feedback 在链下，通过事件被客户端索引。
- **ValidationRegistry**：无状态的工作验证授权。v1 不用，但已部署占位（见 §4）。

**存储成本约束**。只有不变量上链。其他都在 agent-card.json（链下，hash-commit）。更新 agent-card 需要在链上写一个新的 SHA-256 commit —— 写入小、频率低。

### 2.2 agent-card.json（链下，每个 merchant-agent 服务）

桥接文档。格式遵循 A2A 标准，Concourse 自定义字段在 `extensions` 字段下。每个 merchant-agent **必须**在稳定的规范 URL 上服务它（通常是 `https://<merchant-host>/.well-known/agent-card.json`）。

详细 schema → [03_AGENT_CARD_SPEC.zh.md](./03_AGENT_CARD_SPEC.zh.md)。

### 2.3 Merchant-agent 运行时

**TypeScript / Hono 参考实现**。一个仓库、一个 Dockerfile，可部署到 Vercel / Cloudflare Workers / Render / Railway / Fly。技术栈：

- **框架**：Hono（在 Vercel Edge Runtime / Cloudflare Workers / Bun / Node 上都能跑）
- **存储**：SQLite（本地开发）→ Postgres（生产）；通过 `MerchantStore` 接口抽象，所以商家可以换成自己的 DB
- **LLM 客户端**：provider 无关；读 `LLM_PROVIDER` 环境变量；默认 OpenAI 兼容（适用 0G Compute / Qiniu / OpenAI / Anthropic via proxy）
- **x402 中间件**：官方 `@coinbase/x402-hono`（或包装 `x402-fetch`）
- **认证**：incoming 请求要么 bearer-token-from-concourse 验证，要么 直接 EIP-191 签名（点对点 agent 调用场景）

详细 spec → [04_MERCHANT_AGENT_TEMPLATE.zh.md](./04_MERCHANT_AGENT_TEMPLATE.zh.md)。

### 2.4 BookingEscrow.sol（Base Sepolia）

带申诉窗口的 USDC 时间锁 escrow。由用户通过 x402 触发；预订自然结束日 + 24 小时申诉窗口后释放给商家，除非用户提交申诉。

详细 spec → [05_X402_PAYMENT_FLOW.zh.md](./05_X402_PAYMENT_FLOW.zh.md)。

### 2.5 Concourse 后端（FastAPI on Vercel）

Phase A 之后，后端的工作量大幅缩水。保留：

- **Auth endpoints**：`/v1/auth/challenge`、`/v1/auth/verify` —— 与现状不变
- **Draft endpoints**：`/v1/drafts/*` —— 用于签名仪式 URL 交接
- **索引器缓存**：链上事件的只读 API（`/v1/discover` —— 同样的形状，但数据来自链上读取而不是伪造行）
- **托管 runtime**（新，可选）：为 platform-hosted 商家跑他们的 merchant-agent 进程；URL 跟在 `https://api.tourskill.paking.xyz/agents/{merchant_slug}/...`

什么被砍：
- ❌ `skill_service.py` 和它的 12 个 mock handler —— **删掉**
- ❌ `/mcp/tools/execute` —— **删掉**（user-agent 现在直接调 merchant-agent）
- ❌ 网关里任何 `merchant_type` 相关的业务逻辑

### 2.6 前端（Vite SPA）

什么变：

- **签名页**（`/merchant/sign/:draftId`）：适配 ERC-8004 的 `IdentityRegistry.register(agentCardURI)` 而不是 legacy `MerchantRegistry.register(...)`。
- **Profile 页**：不直接编辑字段，而是编辑商家的 `agent-card.json`（platform-hosted 通过我们的托管 UI；self-hosted 通过"fetch + diff"流程）。
- **Explorer**：从索引器缓存读，缓存背后是链上读。
- **Agent demo**：`invoke_merchant_skill` 工具的实现变了 —— 不再打我们后端的 `/mcp/tools/execute`；而是做 registry 查询、拉 agent-card、直接 HTTPS 调 merchant-agent 的 URL。

什么不变：

- 所有路由（BrowserRouter）、所有 i18n、所有钱包 UX、所有 auth 流程。

---

## 3. 网络调用流 —— 一笔预订的完整路径

未来在一个"真实"merchant agent 上的酒店预订：

```
Step 1 —— 用户："给我订无名初黄山的大床房，9 月 1-3 日"

Step 2 —— User-agent 调我们的 discover endpoint
         GET /v1/discover?type=hotel&keyword=huangshan
         → 后端从索引器缓存读（缓存镜像 IdentityRegistry 事件）
         → 返回包含匹配商家的 agent_id + agent_card_uri

Step 3 —— User-agent 直接拉 agent-card
         GET https://wumingchu.example.com/.well-known/agent-card.json
         → 返回：skills[]、定价提示、payout chain (Base)、auth method

Step 4 —— User-agent 直接调商家的 check_availability skill
         POST https://wumingchu.example.com/skills/check_availability
         body: { check_in: "2026-09-01", check_out: "2026-09-03", room_type: "king" }
         → merchant-agent 读自己日历，返回 { available: true, nightly: 1820 USDC }

Step 5 —— User-agent 调 create_booking skill
         POST https://wumingchu.example.com/skills/create_booking
         body: { check_in, check_out, room_type, guest_email }
         → merchant-agent 返回 402 Payment Required，body：
           { quote: 3640 USDC, escrow: "0xABC...", booking_intent_id: "..." }

Step 6 —— User-agent 把支付浮到人类面前（"MetaMask 弹窗"）
         人签 USDC.transfer(escrow, 3640) on Base Sepolia
         merchant-agent 上的 x402 中间件通过查 escrow 合约确认 tx

Step 7 —— Merchant-agent 自动重试同样的调用（按 x402 规范）
         这次请求里有支付证明 → merchant-agent 返回：
         { booking_id, confirmation_code, calendar_locked: true }

Step 8 —— 退房日 + 24 小时申诉窗口过去
         任何人（包括商家）调 escrow.release(booking_id)
         USDC 从 escrow → 商家 payout 地址
         ReputationRegistry 现在允许用户对这次预订留 feedback
```

注意这条流里**没有什么**：
- Concourse 后端**从未**执行 skill —— 它只索引和发现。
- Concourse 后端**从未**持有 USDC —— escrow 在用户和商家之间。
- User-agent 与 merchant-agent **直接** HTTPS 通信。

---

## 4. 信任边界

| 角色 | 被信任的 | 不被信任的 |
|------|---------|-----------|
| Concourse 后端 | 索引链事件、铸造 draft、auth token | 钱包私钥、USDC 托管、skill 执行 |
| User-agent | 解读用户意图、规划 tool 调用、把支付浮给人类 | 未确认就签字、存私钥 |
| Merchant-agent | 自己的库存、自己的定价规则、自己的 LLM | 其他商家的数据 |
| 平台托管 runtime | 跑 merchant-agent 进程 | 商家钱包私钥（商家自己签 register） |
| ERC-8004 合约 | 身份所有权不变量、feedback 授权 | 执行、支付托管 |
| BookingEscrow | 申诉窗口期间 USDC 托管 | 身份证明 |

反复出现的规则：**任何单个组件都不能同时认证商家又持有他们的资金**。
私钥永远跟商家在一起。

---

## 5. 这套架构带来什么（代价是什么）

**带来**：

- 第三方做的 user-agent（Cursor、Claude、自定义 Python 脚本）能 install 我们的 SKILL.md，从我们 Base 上的 registry 发现商家，**直接交易** —— 不经过我们的后端，不需要我们知道。
- 商家从平台托管成长出去，可以 `git pull` 模板，部到自己的基础设施，改一个 DNS 记录，**网络其他部分看不出区别**。
- 一笔预订完整生命周期（discover → quote → pay → settle → review）**链上可验证**，任何人都能查 —— 不需要"相信我们，预订真的发生了"。

**代价**：

- 移动部件更多。两条链、三个合约、agent-card.json、独立的 merchant-agent runtime、x402 中间件。**不像"一个后端跑 mock"那么好 demo**。
- 我们放弃执行控制权。一个有 bug 的 merchant-agent 是商家的问题 —— 我们能通过索引器旗手（"这家商家的 agent 80% skill 调用失败"），但我们没法替他们修。
- 商家上线比"在我们网站填表"更难 —— 是"部一个 agent 或者订托管"。这通过托管 tier 缓解。

我们接受这些代价，因为另一条路 —— 套个新壳的中心化 OTA —— **不符合宣言**。

---

## 6. 迁移排序（高层）

本文档只勾出顺序；细节在 [07_MIGRATION_PLAN.zh.md](./07_MIGRATION_PLAN.zh.md)。

```
Phase A.2（1 周）  → 写 ERC-8004 合约 + 部 Base Sepolia
Phase A.3（2 周）  → 参考 merchant-agent 模板 + 部 1 个参考实例
Phase A.4（3 天）  → 前端改线 + 删 mock skill 层
Phase B  （2 周）  → BookingEscrow + x402 端到端打通
Phase C  （1 周）  → settled booking 推动 reputation 流程

合计 ~6 周专注工作，Phase B 收尾时出现"第一笔真预订"。
```

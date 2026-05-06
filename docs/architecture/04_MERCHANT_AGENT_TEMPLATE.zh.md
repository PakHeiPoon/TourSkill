# Merchant-Agent 参考模板

> 引用：[00_PRINCIPLES.zh.md](./00_PRINCIPLES.zh.md)、[01_TARGET_ARCHITECTURE.zh.md](./01_TARGET_ARCHITECTURE.zh.md)、[03_AGENT_CARD_SPEC.zh.md](./03_AGENT_CARD_SPEC.zh.md)。

每个商家用的开源 TypeScript 模板（自托管），或者 TourSkill 多租户跑
（平台托管）。**同一份代码，两种部署模式**。两种模式的外部接口**逐
字节相同** —— 原则 6。

---

## 1. 仓库布局

```
merchant-agent-template/
├── apps/
│   └── agent/                     # 真正的 agent runtime
│       ├── src/
│       │   ├── index.ts           # Hono app 入口
│       │   ├── routes/
│       │   │   ├── agent-card.ts  # GET /.well-known/agent-card.json
│       │   │   ├── auth.ts        # /auth/challenge + /auth/verify
│       │   │   ├── skills/        # 每个 skill 一个文件，自动注册
│       │   │   │   ├── check_availability.ts
│       │   │   │   ├── get_rates.ts
│       │   │   │   ├── create_booking.ts
│       │   │   │   └── ...
│       │   │   ├── admin/         # 商家面向 admin API
│       │   │   └── health.ts
│       │   ├── core/
│       │   │   ├── store.ts       # MerchantStore 接口
│       │   │   ├── llm.ts         # LLMClient 接口
│       │   │   ├── x402.ts        # x402 中间件包装
│       │   │   ├── auth.ts        # bearer + EIP-191 验证
│       │   │   └── card.ts        # agent-card 构建器 + 哈希
│       │   ├── stores/
│       │   │   ├── sqlite.ts      # solo / dev 默认
│       │   │   └── postgres.ts    # 生产 / 多租户
│       │   ├── llm/
│       │   │   ├── openai.ts      # 兼容 OpenAI、Qiniu、0G……
│       │   │   └── anthropic.ts
│       │   └── domain/
│       │       ├── hotel.ts       # 类型专属 skill 默认
│       │       ├── restaurant.ts
│       │       ├── attraction.ts
│       │       └── shop.ts
│       ├── tests/                 # vitest
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   ├── shared-types/              # 与 TourSkill 后端共享的类型
│   └── eslint-config/
├── examples/
│   ├── self-hosted-vercel/        # 一键部署模板
│   ├── self-hosted-fly/
│   ├── self-hosted-docker/
│   └── platform-tenant/           # TourSkill 多租户 runtime 用
├── docs/
│   ├── DEPLOY.md                  # 各平台快速开始
│   ├── CUSTOMIZE.md               # 如何添加自定义 skill
│   └── MIGRATE.md                 # 平台托管 ↔ 自托管
├── .env.example
├── README.md
└── LICENSE  (MIT)
```

**为什么 monorepo**：模板自带多个部署目标（Vercel、Fly、Docker、
将来 Cloudflare Workers）+ 共享类型。**单仓库 + workspaces (pnpm)
让它紧凑**。

---

## 2. 技术栈

| 关切 | 选择 | 原因 |
|---|---|---|
| HTTP 框架 | **Hono** | 跑 Vercel Edge / Cloudflare / Bun / Node —— 同一份代码；依赖小；x402 的 Hono adapter 最好 |
| 校验 | **Zod** | Hono 原生，能生成 agent-card 里要暴露的 JSON Schema |
| ORM | **Drizzle** | TS 原生，支持 SQLite + Postgres + libSQL，同一套查询 API |
| 认证密码学 | **viem** | EIP-191 验证，未来链上读 |
| LLM 客户端 | **OpenAI SDK**（通过 `baseURL` provider 无关）| 兼容 OpenAI、Qiniu、0G Compute、DeepSeek 直连等 |
| x402 中间件 | **`x402-hono`**（Coinbase 官方）| Hono 应用的标准 adapter |
| Build / test | **Vite + Vitest** | 与前端仓库同家族，认知负担低 |
| Lint / format | **ESLint + Biome** | Biome 处理格式化；ESLint 抓 Hono 专属问题 |
| CI | GitHub Actions | matrix 覆盖 Node 20 / Bun latest / Cloudflare Workers runtime |

**为什么不 Next.js**：agent runtime ≠ web app。Hono 的心智模型（HTTP
handler，无 SSR）匹配我们要建的东西。**少一些争斗**。

**为什么不 Python/FastAPI**：x402 SDK 是 TS-first；Hono 部署得更好
（每个 edge 平台都跑）；团队前端已经说 TS。Python 模板**作为独立仓库
跟随**，等有人主理时落地。

---

## 3. 核心接口

### 3.1 `MerchantStore`

```typescript
// 抽象商家数据，让 SQLite / Postgres / 商家自己的 PMS 可以互换。
export interface MerchantStore {
  // 库存
  listItems(filter?: ItemFilter): Promise<InventoryItem[]>;
  getItem(itemId: string): Promise<InventoryItem | null>;
  upsertItem(item: InventoryItem): Promise<void>;

  // 日历（每 item × 每天 可用数）
  getAvailability(itemId: string, range: DateRange): Promise<DailyAvailability[]>;
  setAvailability(itemId: string, date: string, count: number): Promise<void>;

  // 预订
  createBooking(b: BookingDraft): Promise<Booking>;
  getBooking(bookingId: string): Promise<Booking | null>;
  listBookings(filter: BookingFilter): Promise<Booking[]>;

  // 设置（取消政策、营业时间等）
  getSettings(): Promise<MerchantSettings>;
  setSettings(s: Partial<MerchantSettings>): Promise<void>;
}
```

两个参考实现 ship：`SQLiteStore`（单文件 DB，**solo 商家默认**）和
`PostgresStore`（多租户平台部署用，`tenantId` 作为隐式查询过滤器）。

### 3.2 `LLMClient`

```typescript
export interface LLMClient {
  chat(opts: {
    system?: string;
    messages: ChatMessage[];
    tools?: ToolDef[];
    toolChoice?: 'auto' | 'none' | { name: string };
    maxTokens?: number;
  }): Promise<ChatResponse>;
}
```

merchant-agent **只在需要自然语言推理的 skill**（例如接受自由文本
问题的"礼宾" skill）里**才用** LLM。大部分 skill（`check_availability`、
`create_booking`、`get_rates`）是确定性的，**根本不碰 LLM** —— 直接
从 request → store → response。

**这对成本很关键**。商家每天 1000 笔预订，**不该**为其中 990 笔纯
CRUD 付 LLM 调用费。

### 3.3 Skill 注册

`src/routes/skills/` 里每个文件 export 一个 default object：

```typescript
import { defineSkill } from '../../core/skill.js';
import { z } from 'zod';

export default defineSkill({
  name: 'check_availability',
  description: '查询某日期范围、某房型的可用性。',
  inputSchema: z.object({
    check_in:  z.string().date(),
    check_out: z.string().date(),
    room_type: z.string(),
  }),
  outputSchema: z.object({
    available: z.boolean(),
    nights: z.number().int().positive(),
    total_usdc: z.number(),
  }),
  // x402 提示：此 skill 免费（只读）
  pricing: { free: true },
  // 纯 handler —— 不用 LLM
  async handle({ input, ctx }) {
    const { check_in, check_out, room_type } = input;
    const range = daysBetween(check_in, check_out);
    const availability = await ctx.store.getAvailability(room_type, { from: check_in, to: check_out });
    const allAvailable = availability.every(d => d.count > 0);
    if (!allAvailable) return { available: false, nights: range, total_usdc: 0 };
    const settings = await ctx.store.getSettings();
    const nightly = settings.nightlyRates[room_type] ?? 0;
    return { available: true, nights: range, total_usdc: nightly * range };
  },
});
```

Skill 在启动时自动发现 —— 把文件丢进 `routes/skills/`，重启，就出现
在 agent-card.json 里。**不用手动注册**。

### 3.4 x402 中间件集成

对付费 skill（`create_booking`、`purchase_ticket` 等），skill 声明
其定价，x402 中间件处理其余：

```typescript
export default defineSkill({
  name: 'create_booking',
  // ...
  pricing: {
    type: 'dynamic',  // 价格按调用计算
    quoteFn: async ({ input, ctx }) => {
      const avail = await ctx.skills.check_availability.call(input);
      if (!avail.available) throw new SkillError('UNAVAILABLE');
      return {
        amount_usdc: avail.total_usdc,
        escrow: ctx.config.escrowContract,
        disputeWindowSeconds: 86400,
        // 退房 + 申诉窗口后 settle 给商家
        releaseAt: addSecs(input.check_out, 86400),
      };
    },
  },
  async handle({ input, ctx, payment }) {
    // payment 由 x402 中间件在确认 escrow lock 后设置
    const booking = await ctx.store.createBooking({
      ...input,
      escrow_tx: payment.escrowTxHash,
      payer:     payment.payer,
    });
    await ctx.store.setAvailability(input.room_type, input.check_in, -1);
    return { booking_id: booking.id, confirmation_code: booking.code };
  },
});
```

中间件处理 402 响应、轮询 escrow 合约确认存款、重试请求、把 `payment`
证明加到 handler 上下文。

---

## 4. 启动序列

```
1. 读 .env（provider key、store URL、registry 地址、agent 钱包……）
2. 从 settings + 自动发现的 skill 构建 agent-card.json
3. 计算 agent-card 的 SHA-256 → 缓存给 /.well-known endpoint
4. （仅生产）验证哈希匹配 IdentityRegistry —— 不匹配就大声 log，
   拒绝服务。商家必须跑 `npm run sync-card` 更新链上哈希才能 boot。
5. 初始化 MerchantStore（SQLite 跑 migration）
6. 挂路由：/.well-known/agent-card.json、/auth/*、/skills/*、/admin/*、/health
7. 在 PORT 上启动 Hono
```

`sync-card` 脚本读本地 agent-card，计算哈希，写一个 tx 调
`IdentityRegistry.update(agentId, uri, newHash)`。**商家用自己的
钱包签一次（自己的 MetaMask、硬件钱包等）—— TourSkill 永远不碰他们
的私钥**。

---

## 5. 必需的环境变量

```bash
# 身份
AGENT_ID=42                                 # ERC-8004 agent ID
AGENT_OWNER_ADDRESS=0x5A0Ccd...44E7         # 仅显示用；事实在链上

# 托管
PUBLIC_URL=https://wumingchu.example.com    # 顶层 "url" 服务的 base URL
PORT=8787

# Store
STORE_DRIVER=sqlite                         # sqlite | postgres
STORE_URL=file:./data/agent.db              # 或 postgres://user:pass@host/db

# LLM（可选 —— 仅当某个 skill 用到才需要）
LLM_PROVIDER=qiniu                          # openai | qiniu | zerog | anthropic
LLM_BASE_URL=https://api.qnaigc.com/v1
LLM_API_KEY=sk-...
LLM_MODEL=deepseek/deepseek-v3.2

# 链
CHAIN_ID=84532                              # base-sepolia
RPC_URL=https://sepolia.base.org
IDENTITY_REGISTRY=0xIDENT...
REPUTATION_REGISTRY=0xREP...
BOOKING_ESCROW=0xESCROW...
USDC_ADDRESS=0x036CbD53...                  # Base Sepolia USDC

# 支付路由
PAYOUT_ADDRESS=0xMERCHANT_PAYOUT...

# 可选 —— 仅多租户 runtime
TENANT_ID=                                  # 跑在 TourSkill 平台时设置
```

---

## 6. 多租户模式（平台托管）

`TENANT_ID` 设置后，agent 跑在多租户模式：

- 所有 store 查询按 `tenantId` 限定（Postgres 行级过滤或 schema-per-tenant；v1 = 行级过滤求简）
- `/admin/*` 路由要求 TourSkill 签发的 JWT 标识 tenant + 授权动作
- agent-card URL 是 `https://api.tourskill.paking.xyz/agents/<slug>/.well-known/agent-card.json`，而不是自定义域名（自定义域名是 Tier 2+ 特性）
- 一个 tenant 的出站 HTTP 不能到达另一个 tenant 的存储 —— 由 Postgres RLS 强制

**商家从平台 → 自托管的迁移做这些**：
1. 在我们的 admin UI 点"导出" → 下载 SQLite dump + .env starter
2. `git clone tourskill/merchant-agent-template`
3. 把 SQLite 文件丢到 `apps/agent/data/agent.db`，复制 .env 值
4. 部署到他们偏好的平台
5. 给自定义域名更新 DNS
6. 跑 `npm run sync-card`（可选轮换到新 agentCardURI）
7. 链上 `agentId` 不变 —— 同钱包，同身份

**迁移大约 10 分钟。我们促成，不阻挠**。

---

## 7. 安全边界

- **钱包私钥**：merchant-agent 进程**绝不**持有。需要链上写的 skill
  使用 **session signer** —— 商家通过钱包 UI 一次性授权（签一个"此
  agent 可从 BookingEscrow 转账最多 N USDC 用于 booking-ID prefix M"
  的证明）。**v1 我们保持更简单**：x402 结算由*用户*签发，**不是
  商家** —— 正常预订流程中**商家从不需要签**。他们的私钥**只在注册
  和 card 更新时**用。
- **LLM 私钥**：在 env。多租户模式按 tenant 轮换。
- **入站认证**：bearer 或 EIP-191（见 [03_AGENT_CARD_SPEC.zh.md](./03_AGENT_CARD_SPEC.zh.md) §4）。
- **Skill 输入**：严格 Zod 校验。**多余字段 = 400**。**没有例外**。
- **Skill 输出**：发送前 schema 校验。如果 handler 返回畸形数据，
  请求 server-side 失败，避免给调用方混淆。
- **CORS**：公开读 endpoint（agent-card、公开 skill）`Access-Control-
  Allow-Origin: *`。`/admin/*` 受限。

---

## 8. 可观察性

内置：
- `GET /health` —— 基本存活
- `GET /admin/metrics` —— Prometheus 风格 metric（请求计数、延迟、
  x402 settlement 计数、错误率） —— bearer-token 守卫
- 结构化 JSON log 到 stdout（Vercel / Fly / Railway 都原生聚合）

外部 hook（可选）：
- Sentry SDK 处理未捕获错误
- OpenTelemetry exporter 处理 trace

我们 **v1 不 ship 内置仪表盘**。平台托管商家用我们的仪表盘；自托管
商家自己把 Prometheus + Grafana 指向 `/admin/metrics`。**轻量**。

---

## 9. 商家视角快速开始

```bash
# 1. fork 模板仓库
gh repo fork tourskill/merchant-agent-template --clone

# 2. 配置
cp apps/agent/.env.example apps/agent/.env
$EDITOR apps/agent/.env       # 设 PUBLIC_URL、AGENT_ID（先空）、payout……

# 3. 初始化 store + seed 默认 skill
pnpm install
pnpm --filter agent setup     # 创建 SQLite，seed 默认设置

# 4. 本地跑
pnpm --filter agent dev

# 5. 通过商家设置 UI 自定义 agent-card
open http://localhost:8787/admin/setup

# 6. 部署
vercel deploy --prod          # 或 fly deploy / railway up / docker push

# 7. 注册到 ERC-8004
pnpm --filter agent register-onchain  # 打开钱包，签 IdentityRegistry.register

# 8. 收钱
echo "live at https://your-domain.com/.well-known/agent-card.json"
```

端到端：**~30 分钟**，从 `gh repo fork` 到第一笔预订被接受 —— 前提
是商家有 Vercel + 一个 Base Sepolia 钱包。

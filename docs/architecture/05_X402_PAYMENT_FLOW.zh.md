# x402 支付流程 + BookingEscrow

> 引用：[00_PRINCIPLES.zh.md](./00_PRINCIPLES.zh.md)、[03_AGENT_CARD_SPEC.zh.md](./03_AGENT_CARD_SPEC.zh.md)、[04_MERCHANT_AGENT_TEMPLATE.zh.md](./04_MERCHANT_AGENT_TEMPLATE.zh.md)。
>
> 标准：HTTP `402 Payment Required`（RFC 9110）；Coinbase x402（2025）；
> Base 上的 ERC-20 USDC。**我们原样采用 Coinbase 发布的 x402**。

这是规定 user-agent 如何为 merchant-agent 的付费 skill 付款、款项在
预订与结算之间存在哪、争议如何处理、合约长什么样的 spec。

---

## 1. 全景

```
┌──────────────────┐                              ┌──────────────────┐
│   User-Agent     │                              │  Merchant-Agent  │
│ (LLM, 钱包 UX)    │                              │   (skills.ts)    │
└────────┬─────────┘                              └─────────┬────────┘
         │                                                  │
         │ POST /skills/create_booking                      │
         │ { check_in: 2026-09-01, ... }                    │
         ├─────────────────────────────────────────────────►│
         │                                                  │
         │                                       ┌──────────┴──────────┐
         │                                       │ x402 中间件          │
         │                                       │ - skill 标了 "paid" │
         │                                       │ - quoteFn() 跑      │
         │                                       │ - 返 402            │
         │                                       └──────────┬──────────┘
         │ HTTP 402 Payment Required                        │
         │ Body: {                                          │
         │   amount_usdc: 3640.00,                          │
         │   chain: "base-sepolia",                         │
         │   token: "0x036C...",                            │
         │   escrow: "0xESCROW...",                         │
         │   booking_intent_id: "bki_abc123",               │
         │   release_at: 1789027200,                        │
         │   facilitator: "https://x402.coinbase.com"       │
         │ }                                                 │
         │◄─────────────────────────────────────────────────┤
         │                                                  │
         │ 浮给人类："付 3640 USDC？"                        │
         │ 人签 USDC.approve + escrow.lock                  │
         │                                                  │
         │ ┌──────────────────────────────────────────┐    │
         │ │ BookingEscrow.lock(bki_abc123, 3640e6,   │    │
         │ │                    payee, releaseAt)     │    │
         │ │ on Base Sepolia                          │    │
         │ │ → tx_hash: 0xPAY...                      │    │
         │ └──────────────────────────────────────────┘    │
         │                                                  │
         │ 重试 POST /skills/create_booking 带支付信息        │
         │ X-Payment-Tx-Hash: 0xPAY...                      │
         │ X-Payment-Intent: bki_abc123                     │
         ├─────────────────────────────────────────────────►│
         │                                                  │
         │                                  ┌───────────────┴───────────┐
         │                                  │ x402 中间件验证：            │
         │                                  │ 1. tx 链上确认            │
         │                                  │ 2. 金额匹配 quote          │
         │                                  │ 3. escrow.locks(intent)   │
         │                                  │    返回这个 tx_hash       │
         │                                  │ 4. payee == merchant      │
         │                                  └───────────────┬───────────┘
         │                                                  │
         │                                  Skill handler 跑，带 `payment` ctx
         │                                  - 在 store 里订库存
         │                                  - 返回确认                  
         │                                                  │
         │ HTTP 200 OK                                      │
         │ Body: {                                          │
         │   booking_id: "bk_xyz789",                       │
         │   confirmation_code: "WCM-A4B7",                 │
         │   escrow_tx: "0xPAY...",                         │
         │   release_at: 1789027200                         │
         │ }                                                │
         │◄─────────────────────────────────────────────────┤
         │                                                  │
         │ ── 时间过去（用户入住、住、退房）──                │
         │                                                  │
         │                  到 release_at，任何人调：        │
         │                  BookingEscrow.release(bki_abc123)
         │                  → USDC：escrow → 商家 payout
         │                  → ReputationRegistry.autoAuthorize(payer, agent)
         │                                                  │
```

**user-agent 永远看不到商家的钱包**。**merchant-agent 永远看不到
用户的签名 key**。USDC 通过 escrow 合约移动，合约强制时间锁和申诉
机制。

---

## 2. 402 响应形态

付费 skill 在没有支付证明时被调用，merchant-agent 返：

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json
X-Payment-Required: 1

{
  "version": "x402/1.0",
  "method": "concourse.escrow",          // 支付方法判别符
  "amount": "3640000000",                 // USDC base unit（6 位小数）
  "currency": "USDC",
  "currencyAddress": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "chain": "base-sepolia",
  "chainId": 84532,
  "escrow": {
    "contract": "0xESCROW_ADDRESS",
    "function": "lock",
    "args": {
      "intentId": "bki_abc123",
      "payee":    "0xMERCHANT_PAYOUT...",
      "amount":   "3640000000",
      "releaseAt": 1789027200,
      "metadata": "0x..."             // canonical 请求体的 sha256
    }
  },
  "intent": {
    "id":        "bki_abc123",
    "expires":   1762809600,            // intent 10 分钟有效
    "skill":     "create_booking",
    "merchant_agent_id": 42,
    "request_hash": "0xREQHASH..."     // user-agent 请求体的 sha256 必须匹配
  },
  "facilitator": "https://x402.coinbase.com"  // 可选，验证用
}
```

**关键不变量**（中间件强制）：

- **`intentId`** 是 UUID，前缀 `bki_`（booking intent），每次调用唯一。**抗重放**。
- **`expires`** 限制用户付款时间。默认 10 分钟。**过期重试触发新 quote**（价格可能变）。
- **`request_hash`** 必须匹配 user-agent 请求体的 SHA-256。**阻止 "quote 偷换"** —— agent 锁了 X 但 redeem 成 Y。
- **`releaseAt`** 由 `quoteFn` 从预订自然结束时间 + 申诉窗口计算。

---

## 3. BookingEscrow.sol

支付到结算之间持有 USDC 的合约。

### 3.1 状态

```solidity
struct Lock {
    address payer;
    address payee;
    uint256 amount;          // USDC base unit
    uint64  releaseAt;       // 最早结算时间
    uint64  lockedAt;
    bytes32 metadata;        // canonical 请求体的 sha256（quote-anchor）
    Status  status;
}

enum Status {
    None,
    Locked,
    Disputed,
    Released,
    Refunded
}

mapping(bytes32 intentId => Lock) public locks;

// 上限 dispute window，**防恶意 agent 把 releaseAt 设到 2999 年**。
// 不能被任何人调整 —— 部署时 pin 死。
uint64 public immutable maxReleaseHorizon = 365 days;

IERC20 public immutable usdc;
ReputationRegistry public immutable reputation;
```

### 3.2 公共函数

```solidity
function lock(
    bytes32 intentId,
    address payee,
    uint256 amount,
    uint64  releaseAt,
    bytes32 metadata
) external;

function release(bytes32 intentId) external;
function refund(bytes32 intentId)  external;          // payee 自愿退款
function dispute(bytes32 intentId, string calldata reason) external;
function resolveDispute(bytes32 intentId, address awardTo) external;
```

#### lock
- 调用方（用户钱包）必须先 `approve` USDC `amount`。
- 合约通过 `transferFrom` 拉 `amount` USDC。
- `intentId` 已用过 → revert（防重放）。
- `releaseAt > block.timestamp + maxReleaseHorizon` → revert。
- `payee == address(0)` → revert。
- 设置 `locks[intentId]` = `Lock(payer=msg.sender, payee, amount, releaseAt, ...)`。
- 发 `Locked(intentId, payer, payee, amount, releaseAt)`。

#### release
- **任何人都可以调**（这是结算，不是特权操作）。
- `block.timestamp < releaseAt` → revert。
- status != `Locked` → revert。
- 转 USDC 给 `payee`。
- status = `Released`。
- 调 `reputation.autoAuthorizeFromBooking(merchantAgentId, payer)`。
- 发 `Released(intentId, payer, payee, amount)`。

merchant agent ID 通过 metadata 传递：见 [§5](#5-把预订绑定到-agent)。

#### refund
- 只有 `payee` 能调（**商家自愿退款**）。
- `Released` 之前任何时候允许。
- USDC 转回 `payer`。
- status = `Refunded`。
- 发 `Refunded(intentId, ...)`。

#### dispute
- 只有 `payer` 能调。
- 仅在 status == `Locked` 且 `block.timestamp < releaseAt` 时允许。
- status = `Disputed`。**资金冻结直到 `resolveDispute`**。
- 发 `Disputed(intentId, reason)`。

#### resolveDispute
- v1：只有 `disputeArbitrator`（构造函数设置）能调。**初期我们就是
  arbitrator**。
- v2 roadmap：替换为 DAO / Kleros 风格的去中心化争议层。
- 把资金给 `payer`（退款）或 `payee`（释放）。
- 发 `DisputeResolved(intentId, awardTo, ...)`。

### 3.3 事件

```solidity
event Locked(
    bytes32 indexed intentId,
    address indexed payer,
    address indexed payee,
    uint256 amount,
    uint64  releaseAt,
    bytes32 metadata
);
event Released(bytes32 indexed intentId, address indexed payer, address indexed payee, uint256 amount);
event Refunded(bytes32 indexed intentId, address indexed payer, address indexed payee, uint256 amount);
event Disputed(bytes32 indexed intentId, string reason);
event DisputeResolved(bytes32 indexed intentId, address indexed awardTo, uint256 amount);
```

### 3.4 结算自动化

我们**不指望用户在入住后手动调 `release`**。一个 keeper / cron
服务定期扫描 `Locked` 行 `releaseAt < now()`，**为每一个调
`release()`**。任何人都能跑这种 keeper；我们为平台托管商家跑一个。

Base 上每次释放 gas 成本 ~$0.001；**不值得优化**。

---

## 4. 申诉窗口

每次预订在自然服务结束时间后有固定申诉窗口：

| Skill 类型 | `releaseAt` 公式 | 默认窗口 |
|---|---|---|
| 酒店预订 | `check_out_date + dispute_window` | 24h |
| 餐厅预订 | `reservation_time + 4h` | 4h |
| 景点票 | `valid_date_end + dispute_window` | 24h |
| 通用商店 | `expected_delivery + dispute_window` | 7 天 |

窗口 per-skill 设在 agent-card 的
`extensions["tourskill.org/v1/payment"].escrow.disputeWindowSeconds`。

如果 `releaseAt` 之前调用 `dispute()`，资金冻结，我们的 arbitrator
（**初期是我们，最终是 DAO**）审查。**裁决在链下**（聊天 / 表单 /
任何方式）但**判决在链上**通过 `resolveDispute()`。

**老实说**：v1 我们就是 arbitrator。这是一个**中心化风险**。我们通
过以下方式缓解：
- 公布所有争议裁决（链下），让行为可审计
- 限制我们的裁量权：我们只能给一方全额，**不能拆分** —— 拆分会引
  发"总申诉拿一半"的 game
- Roadmap：替换为 Kleros / Reality.eth / Coinbase 对齐的争议层

---

## 5. 把预订绑定到 agent

escrow 合约**不直接**存 `merchantAgentId` 字段 —— 那会让每个 escrow
lock 与 ERC-8004 地址耦合。**我们改用 `metadata` bytes32 编码 agent
ID**：

```
metadata = sha256(
  agentId (uint256, big-endian) ||
  request_hash (bytes32) ||
  intent_id (bytes32 derived from string)
)
```

`release()` 触发时，keeper 或 merchant-agent 必须重建这个 metadata
并在同一 tx 调
`ReputationRegistry.autoAuthorizeFromBooking(agentId, payer)`。我们在
keeper 代码里提供 multicall helper。

（未来 v2：增加 `bytes32 metadata` 存储 + 不依赖外部 reconstruction
的 helper 提取 agentId，让 release 自动授权。）

---

## 6. 货币：仅 Base 上的 USDC（v1）

我们**仅支持 Base Sepolia（测试网）和 Base mainnet 上的 USDC**。
具体：

| 网络 | USDC 合约 |
|---|---|
| Base Sepolia | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Base mainnet | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |

为什么 v1 不支持其他 token / 链：
- USDC 是 x402 facilitator 实现的标准
- 多币种需要每币种价格 oracle（商家的 quote 是哪个币种？）—— v1 表面积太大
- 想 CNY 定价的商家 quote 时换汇（他们的 `quoteFn` 查 FX，返回 USDC 等价）

未来 v2：通过 402 响应里的 `tokens[]` 字段加 EURC、USDT、USDS。
**USDC 保持默认**。

---

## 7. 退款流程

资金回到用户的两种方式：

### 7.1 自愿退款（商家发起）
商家调 `BookingEscrow.refund(intentId)`。用于：
- 商家自由取消窗口内的取消
- 服务失败（超额预订、不可抗力）
- 善意姿态

**单步操作，对用户 gas-free**。

### 7.2 申诉退款（用户发起）
用户调 `dispute()`，arbitrator 调 `resolveDispute(intentId, payer)`。
用于：
- 服务未交付
- 商家失联
- 重大虚假陈述

---

## 8. 取消政策强制

agent-card.json 里的取消政策**是用户与商家之间的合约**。merchant-
agent **负责履行它**：

```typescript
// create_booking handler 里：
async cancel({ booking_id }, ctx) {
  const booking = await ctx.store.getBooking(booking_id);
  const policy = ctx.config.cancellationPolicy;
  const hoursToStart = (booking.check_in - now()) / 3600;
  const tier = policy.tiers.find(t => hoursToStart >= t.hoursBeforeStart);
  const refundUsdc = booking.total_usdc * (tier.refundPercent / 100);
  // 部分退款？给 (refundUsdc) 全退后再 lock 剩下的？
  // → 不。Escrow 是 per-intent 全有或全无。
  // 改成：merchant-agent 调 `escrow.refund(intentId)` 全退，
  // 然后如果还欠部分费用，**生成一个新的 402** 让用户付那个更小金额。
  // 这让 escrow 逻辑保持简单。
  ...
}
```

**为什么 per-intent 全有或全无**：escrow 合约**故意笨**。部分退款
通过"全退 + 新 lock"模拟。**这是 gas 低效（3 tx vs 1）但 escrow 代码
保持 200 行可审计**。**值得**。

---

## 9. 失败模式 & 恢复

| 失败 | 发生什么 | 恢复 |
|---|---|---|
| 用户签 `lock` 后在商家重试前关闭页签 | 资金 lock 但商家 DB 里没有对应预订 | 商家的 keeper 看到没有匹配预订的孤儿 `Locked` 事件；商家调 `refund` 给用户 |
| 重试时 merchant-agent 挂了 | 用户重试返 5xx | user-agent 指数退避重试；持续失败时用户可以 `dispute` 收回资金 |
| `releaseAt` 无效（如过去时间）| `lock` revert | user-agent 重新拉 quote |
| merchant-agent 的 `metadata` 与 quote 不一致 | 申诉 / 信誉惩罚（链下）| 边带处理 |
| 链 reorg | Base 上极不可能；如果发生，x402 facilitator 重新检查确认数 | 等 finality（**我们等 2 个 block 才认为支付确认**）|

---

## 10. 测试计划（建造时）

- **Foundry**：覆盖 `BookingEscrow.sol` 中每次状态转换，包括 revert。
- **Foundry 属性测试**：余额不变量（`escrow.balance == sum(Locked.amount)`）；不能双花；refund + release 互斥。
- **集成**：一个 Hono `merchant-agent` 装 x402 中间件对一个 fork 的
  Base Sepolia。**端到端测：完整 happy path + dispute + refund**。
- **负载**：100 笔并发预订，**0 笔丢或重复扣**。

**未经外部审计绝不部主网**。先内部 review（Foundry 覆盖率 100%），
再独立审计（Trail of Bits / Spearbit / Cantina），**再** mainnet。

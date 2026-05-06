# ERC-8004 合约设计

> 引用：[00_PRINCIPLES.zh.md](./00_PRINCIPLES.zh.md)、[01_TARGET_ARCHITECTURE.zh.md](./01_TARGET_ARCHITECTURE.zh.md)。
>
> 标准：ERC-8004 *Trustless Agents*（草案）。我们跟踪上游草案并
> 原样采用其接口。如果上游模糊，我们选一个默认并标注；如果上游后续
> 给出不同选择，我们跟随。

本文档规定我们部署的三个合约、它们的状态、公共接口、访问控制规则、
事件。**不写完整 Solidity 代码** —— 那是下个子阶段的事。这是合约
工程师为了**确切知道要建什么**而读的 spec。

---

## 1. 部署计划

| 合约 | 网络（测试网）| 网络（主网）| 可升级？ |
|---|---|---|---|
| `IdentityRegistry` | Base Sepolia | Base mainnet | **不可** —— 代理增加我们不需要的风险；如果搞砸了 spec，重新部署 + 重新注册（原则 4：净身重来） |
| `ReputationRegistry` | Base Sepolia | Base mainnet | 不可 |
| `ValidationRegistry` | Base Sepolia | Base mainnet | 不可（仅占位 —— 见 §4） |

**没有代理，没有 admin key**。一旦部署，合约就是不可变公共基础设
施。如果需要修 bug，部署 v2 在旁边，公布新地址，让客户端迁移。
**这跟 ENS / Uniswap 是同一套纪律**。

**编译器**：Solidity 0.8.24+，`evmVersion: cancun`。用 Foundry 做
build + test，主网部署用 `forge create` + 硬件钱包签字。

**验证**：每次部署当天 verify 到 Basescan。**没有例外**。

---

## 2. IdentityRegistry

"这个地址拥有这个 agent"的规范记录。镜像 ERC-8004 上游接口。

### 2.1 状态

```
mapping(uint256 agentId  => Agent) private _agents
mapping(address owner    => uint256[]) private _ownerToAgentIds
uint256 private _nextAgentId  // 1-indexed; 0 保留给"未设置"
```

```
struct Agent {
    address owner;           // 控制此 agent 的钱包
    string  agentCardURI;    // 链下 JSON 描述符的 URI（HTTPS 或 IPFS）
    bytes32 agentCardHash;   // URI 解析出的 JSON 的 SHA-256 哈希
    uint64  registeredAt;    // 注册区块时间戳
    uint64  updatedAt;       // 上次更新区块时间戳
    bool    active;          // 软删除标记（true = 可见，false = 已下线）
}
```

**为什么同时存 `agentCardURI` 和 `agentCardHash`**：URI 告诉你
**去哪拉链下文档**；哈希告诉你**拉到的是不是商家承诺的版本**。
**作恶的 CDN 不能在不让哈希对不上的情况下篡改 card** —— 客户端每次
拉取都验证。

### 2.2 公共函数

```
function register(string calldata agentCardURI, bytes32 agentCardHash)
    external
    returns (uint256 agentId);

function update(uint256 agentId, string calldata newURI, bytes32 newHash)
    external;

function setActive(uint256 agentId, bool active) external;

function transferOwnership(uint256 agentId, address newOwner) external;

function getAgent(uint256 agentId) external view returns (Agent memory);
function getAgentsByOwner(address owner) external view returns (uint256[] memory);
function totalAgents() external view returns (uint256);
```

### 2.3 访问控制

普通 ownership 检查。**没有 admin。没有 multisig**。

- `register`：任何人。`msg.sender` 成为 `owner`。
- `update` / `setActive` / `transferOwnership`：只有 `_agents[agentId].owner`。
- 所有 view：任何人。

### 2.4 事件

```
event AgentRegistered(
    uint256 indexed agentId,
    address indexed owner,
    string agentCardURI,
    bytes32 agentCardHash
);

event AgentUpdated(
    uint256 indexed agentId,
    string agentCardURI,
    bytes32 agentCardHash
);

event AgentActiveChanged(uint256 indexed agentId, bool active);

event AgentOwnershipTransferred(
    uint256 indexed agentId,
    address indexed previousOwner,
    address indexed newOwner
);
```

这四个事件就是身份活动的全部公共日志。我们的索引器（瘦身版替代了
旧的 `merchants` 表）冷启动时从 genesis 回放它们，然后通过 WebSocket
订阅保持实时。

### 2.5 校验规则（revert 原因）

| 函数 | 何时 revert | 错误 |
|---|---|---|
| `register` | `agentCardURI` 为空 | `EmptyURI()` |
| `register` | `agentCardHash` 是 `bytes32(0)` | `EmptyHash()` |
| `update` | `msg.sender != owner` | `NotOwner()` |
| `update` | agent 不存在 | `AgentNotFound()` |
| `setActive` | `msg.sender != owner` | `NotOwner()` |
| `transferOwnership` | `msg.sender != owner` | `NotOwner()` |
| `transferOwnership` | `newOwner == address(0)` | `ZeroAddress()` |

---

## 3. ReputationRegistry

ERC-8004 的反馈模型是**无状态授权，不在链上存反馈**。Merchant agent
（server）显式授权一个特定的 client 钱包留 feedback；**实际 feedback
在链下**，被客户端通过事件索引。

### 3.1 状态

```
// (serverAgentId, clientAddress) → bool authorized
mapping(uint256 => mapping(address => bool)) private _feedbackAuth;

// 可选：通过 BookingEscrow settle 的 booking 自动授权 payer。
// 我们存 escrow 合约地址，让 settled-booking 事件能不经商家就 upsert 授权。
address public immutable bookingEscrow;
```

### 3.2 公共函数

```
function acceptFeedback(uint256 serverAgentId, address clientAddress) external;

function revokeFeedback(uint256 serverAgentId, address clientAddress) external;

function isAuthorized(uint256 serverAgentId, address clientAddress)
    external view returns (bool);

// 由 BookingEscrow 合约在 settlement 时调用。幂等。
function autoAuthorizeFromBooking(uint256 serverAgentId, address payer) external;
```

### 3.3 访问控制

- `acceptFeedback` / `revokeFeedback`：只有 agent 的 owner（通过
  `IdentityRegistry` 查）。
- `autoAuthorizeFromBooking`：只有 `bookingEscrow` 地址（构造函数
  设置，不可变）。
- View：任何人。

### 3.4 事件

```
event FeedbackAuthorized(
    uint256 indexed serverAgentId,
    address indexed clientAddress,
    bool autoFromBooking      // 区分手动与自动
);

event FeedbackRevoked(
    uint256 indexed serverAgentId,
    address indexed clientAddress
);
```

### 3.5 链下反馈

**反馈内容不在合约里**。客户端（任何索引器，包括我们的）监听
`FeedbackAuthorized` 事件，从授权的客户端通过以下任一接受签名的
反馈消息：

- server agent 自己（首选 —— 内容在商家自己的存储上）
- 社区索引器（TourSkill 自己的，但任何人都能跑一个）

每个反馈是一个 JSON blob，用户对
`{ serverAgentId, bookingTxHash, rating, body, timestamp }` 签名。
签名必须 recover 到一个 `isAuthorized == true` 的 `clientAddress`。
完整 schema、聚合算法、Sybil 抗性论证见 [06_REPUTATION_DESIGN.zh.md](./06_REPUTATION_DESIGN.zh.md)。

---

## 4. ValidationRegistry

ERC-8004 的第三条腿：一个 agent 证明另一个 agent 的工作满足规范
（例如"这家酒店声称的五星认证是真的"）。我们 **v1 部署但不用** ——
旅游商家在我们的第一个产品里没有验证流程，但合约**先在链上**，未来
版本不需要重新部署 registry trio。

### 4.1 状态

```
struct ValidationRequest {
    uint256 requesterAgentId;
    uint256 validatorAgentId;
    bytes32 dataHash;       // 被验证的 spec / claim 的哈希
    uint64  requestedAt;
    bytes32 resultHash;     // 验证者响应的哈希（待定时为 0x0）
    bool    accepted;       // 验证者的判决
    uint64  resolvedAt;
}

mapping(bytes32 requestId => ValidationRequest) private _requests;
```

### 4.2 公共函数

```
function requestValidation(uint256 validatorAgentId, bytes32 dataHash)
    external returns (bytes32 requestId);

function submitValidation(bytes32 requestId, bytes32 resultHash, bool accepted)
    external;

function getRequest(bytes32 requestId) external view returns (ValidationRequest memory);
```

### 4.3 v1 状态

部署但参考 merchant-agent 不调用。**先放在链上**，未来"已验证酒店
连锁" / "城市旅游局证明"特性落地时不用重部署。

---

## 5. 跨合约交互

```
                 ┌──────────────────────┐
                 │  IdentityRegistry    │
                 │  （规范的 agent）      │
                 └──────────┬───────────┘
                            │
                            │ getAgent(agentId).owner
                            │
       ┌────────────────────┼─────────────────────────┐
       │                    │                         │
       │ owner check        │ owner check             │ owner check
       ▼                    ▼                         ▼
 ┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐
 │ ReputationR. │    │ ValidationR.     │    │ BookingEscrow    │
 │              │    │                  │    │ (Phase B)        │
 │ owner 可以    │    │ owner 可以        │    │ settle 时         │
 │ 授权 feedback │    │ 接受 work         │    │ → 调 Reputation   │
 │              │    │ validation       │    │   .autoAuthorize │
 └──────────────┘    └──────────────────┘    └──────────────────┘
```

依赖树很浅：每个合约都读 `IdentityRegistry` 做 owner 查询；只有
`BookingEscrow` 写 `ReputationRegistry`。这个 trio 里没有合约写
`IdentityRegistry`（除了它自己的 mutator）。

---

## 6. Gas 概况（目标估值）

数字是粗估；测试时再测。**这是目标，不是承诺**，没有基准证明前
不做花哨优化。

| 操作 | 目标 gas | 备注 |
|---|---|---|
| `register` | ~150K | 一次 sstore 存 `Agent` 结构 + 数组 push |
| `update` | ~50K | 两次 sstore（URI + hash + updatedAt） |
| `setActive` | ~30K | 一次 sstore |
| `transferOwnership` | ~50K | 两次 sstore + 数组维护 |
| `acceptFeedback` | ~45K | mapping 写 + 事件 |
| `autoAuthorizeFromBooking` | ~30K | 幂等 mapping 写 |

在 Base 上，当前 gas ~0.05 gwei，即使最重的 op（`register`）也让商家
**远低于 $0.01 USD 等价**。可以接受。

---

## 7. 测试要求

Foundry 测试覆盖目标：

- 三个合约**行覆盖率 100%**。
- **属性测试**：所有权不变量（**没有路径让非 owner 突变**）；ID
  单调性（agentId 永不复用）；事件一致性（每次状态改变都发事件）。
- **模糊测试**：URI 和 hash 的边界长度；恶意 URI 字符串（控制字符、
  超长、空）。
- **fork test**：Base Sepolia 上集成真 USDC 和真 BookingEscrow（Phase B
  存在后）。

**硬规则**：100% 覆盖率 + fork test 至少跑一个完整 dev → staging →
prod 周期都绿，否则**绝不部署主网**。

---

## 8. 这套合约设计**不**包括什么

这些**显式不在初次部署的范围内**。每条都在自己的文档里讨论：

- **多签 agent ownership** —— 增加升级复杂度。**v1 = 单 EOA**。如果
  连锁要多签，用 Safe 作为 EOA。
- **权限化发现** —— **任何人都能读所有事件**。v1 没有"私密商家" tier。
- **链上定价或库存** —— 在 agent-card.json + merchant-agent 自己的 DB。
  **链不存 SKU 级数据**。
- **跨链身份桥接** —— Base 上的 agent 没有自动镜像到其他链。如果
  客户端要 0G 集成，**他们查 Base 地址，单独调 0G**。

---

## 9. 从 legacy MerchantRegistry 迁移

按 [07_MIGRATION_PLAN.zh.md](./07_MIGRATION_PLAN.zh.md)：legacy 0G `MerchantRegistry` 上现有的
28 个"商家"**不迁移**。Legacy 合约保留部署（链历史不可变）但我们的
应用停止读它。在 `README.md` 里标记 deprecated，legacy 合约地址在
chainscan-galileo 上加 `DEPRECATED — see Base Sepolia ERC-8004
contracts at <addresses>` 通知。

如果**最终**我们重新接入这 28 个品牌作为真实商家，**他们走和其他人
一样的注册流程**：部一个 merchant-agent（或订阅托管）、得到一个
`agentCardURI`、注册到 Base ERC-8004 IdentityRegistry。**没有特别
通道**。

# Agent Card 规范

> 引用：[00_PRINCIPLES.zh.md](./00_PRINCIPLES.zh.md)、[02_ERC8004_CONTRACT_DESIGN.zh.md](./02_ERC8004_CONTRACT_DESIGN.zh.md)。
>
> 标准：A2A *Agent Card*（Google A2A 协议）。我们原样采用上游 JSON
> schema，把 Concourse 自定义字段放在 spec 的 `extensions` 字段里。
> 完整 spec 在 `https://google.github.io/A2A/`。本文档总结**我们网络
> 里每个 merchant-agent 必须服务的内容**。

agent-card 是**链上身份**（IdentityRegistry 里的一个哈希和一个 URI）
和**真正可调用的 HTTP agent** 之间的**桥接文档**。它告诉发现它的
user-agent：这个 agent 是谁、提供哪些 skill、如何认证、把支付发到
哪里、支持哪些能力。

---

## 1. 托管要求

每个 Concourse merchant-agent **必须**：

- 在规范路径 `/.well-known/agent-card.json` 上服务 agent-card。
- 返回 `application/json`，带 `Cache-Control: public, max-age=300`（5 分钟）。
- 用 HTTPS。**没有例外**，包括 dev 环境（需要的话用 `mkcert`）。
- **逐字节匹配** `IdentityRegistry.agentCardHash` 里 commit 的 SHA-256
  哈希。更新 card 需要两步：
  1. 更新被托管的 JSON。
  2. 调用 `IdentityRegistry.update(agentId, sameURI, newHash)`。

如果链上哈希和被服务的 JSON 不一致，**客户端必须把 agent 视为不可
信**。我们的参考 user-agent 代码把这件事做成**硬失败而不是警告**。

---

## 2. 顶层 schema（A2A 标准字段）

```jsonc
{
  // A2A 必填
  "schemaVersion": "1.0",                  // A2A schema 版本
  "name": "Wuming Chu Huangshan Hidden Retreat",
  "description": "28-room boutique hideaway in Huangshan ...",
  "url": "https://wumingchu.concourse.example",  // 此 agent 的 base URL
  "version": "0.3.2",                       // merchant-agent 自己的 semver

  // 此 agent 暴露的 skill
  "skills": [
    {
      "name": "check_availability",
      "description": "查询某日期范围、某房型的可用性。",
      "inputSchema": {                      // 调用参数的 JSON Schema
        "type": "object",
        "properties": {
          "check_in":  { "type": "string", "format": "date" },
          "check_out": { "type": "string", "format": "date" },
          "room_type": { "type": "string", "enum": ["king","twin","suite","villa"] }
        },
        "required": ["check_in","check_out","room_type"]
      },
      "outputSchema": { /* 响应的 JSON Schema */ },
      "endpoint": "/skills/check_availability"  // 相对上面 "url"
    },
    { "name": "create_booking", ... },
    { "name": "get_cancellation_policy", ... }
  ],

  // 可选 A2A capabilities flag
  "capabilities": {
    "streaming": false,                     // v1 不 SSE 流式 skill 响应
    "pushNotifications": false,             // v1 没有 webhook
    "stateTransitionHistory": true          // 我们暴露预订状态历史
  },

  // agent 如何认证 incoming 调用
  "authentication": {
    "schemes": ["bearer", "eip191"],        // 见 §4
    "challengeEndpoint": "/auth/challenge",
    "verifyEndpoint":    "/auth/verify"
  },

  // 我们服务的人类可读接口（信息性）
  "interfaces": ["application/json"],

  // Concourse 自定义扩展 —— 命名空间隔离
  "extensions": {
    "tourskill.org/v1/payment":      { ... },
    "tourskill.org/v1/cancellation": { ... },
    "tourskill.org/v1/location":     { ... },
    "tourskill.org/v1/merchant":     { ... },
    "tourskill.org/v1/i18n":         { ... }
  },

  // 出处 —— 索引器用来对照 IdentityRegistry 验证
  "provenance": {
    "agentId": 42,                          // ERC-8004 agent ID
    "registry": "0xABCD...",                // IdentityRegistry 合约地址
    "chain":    "base-sepolia",             // chain ID 别名
    "owner":    "0x5A0Ccd...44E7"
  }
}
```

---

## 3. Skill 定义

`skills[]` 里每一项都是调用该能力的公共合约。**格式遵循 OpenAI
tool-call 标准**，所以任何支持 tool call 的 LLM 都能直接消费。

| 字段 | 必填 | 备注 |
|---|---|---|
| `name` | 是 | 在此 agent 内唯一。**snake_case ASCII**。 |
| `description` | 是 | 一句话；LLM 用来选 tool。 |
| `inputSchema` | 是 | JSON Schema。**严格模式 —— 多余字段被拒**。 |
| `outputSchema` | 是 | 成功响应的 JSON Schema。 |
| `endpoint` | 是 | 相对顶层 `url` 的路径。 |
| `pricing` | 可选 | x402 提示 —— 见 §5。**缺省 = 免费**。 |
| `idempotencyKey` | 可选 | 如果是 `"required"`，调用方必须带 `Idempotency-Key` header。**预订类 endpoint 必须要求**。 |
| `language` | 可选 | 覆盖顶层 i18n 偏好（per-skill）。 |

**严格模式输入校验**：调用方提交 schema 中没有的字段，server 返回
`400 Bad Request`。**零容忍**。

---

## 4. 认证

`authentication.schemes[]` 里声明两种 scheme：

### 4.1 `bearer`

来自成功 Concourse auth 流程的标准 bearer token。

```
Authorization: Bearer <token>
```

通过 merchant-agent 的 `/auth/challenge` → `/auth/verify` 流程铸造
（镜像我们现有 Concourse auth，所以同样的 EIP-191 challenge-response
适用）。

### 4.2 `eip191`

直接 EIP-191 签名做一次性调用，不需要预先铸造 token。**适合 agent
之间不想做 session state 的调用**。

```
Authorization: EIP191 <hex signature>
X-Agent-Address: 0x... (recover 出的地址)
X-Request-Hash: 0x... (请求体 canonical JSON 的 sha256)
X-Request-Nonce: 0x...
```

agent 验证 `ecrecover(requestHash, signature) == X-Agent-Address`，
且 nonce 没被重放过。

**两种 scheme 互斥**。**同时发两种是 400**。

---

## 5. Concourse 扩展（带版本）

所有 Concourse 自定义字段在 `extensions["tourskill.org/v1/*"]` 下。
**命名空间带版本**让我们能在不破坏旧客户端的前提下演化 schema。

### 5.1 `tourskill.org/v1/payment`

```jsonc
{
  "method": "x402",                         // 当前唯一支持的方法
  "facilitator": "https://x402.coinbase.com", // 或自托管
  "chain": "base-sepolia",                  // 来自 CAIP-2 chain registry 的别名
  "payoutAddress": "0xMERCHANT...",         // 申诉窗口后 USDC 结算到的地址
  "currency": "USDC",                       // 链上 USDC 合约地址
  "currencyAddress": "0x036CbD53...",
  "escrow": {                               // 此链上的 BookingEscrow 合约
    "contract": "0xESCROW...",
    "disputeWindowSeconds": 86400           // 预订结束日 + 24h
  }
}
```

### 5.2 `tourskill.org/v1/cancellation`

```jsonc
{
  "type": "tiered",
  "tiers": [
    { "hoursBeforeStart": 168, "refundPercent": 100 },   // 7 天前+：全额退款
    { "hoursBeforeStart": 72,  "refundPercent": 50 },    // 3 天前+：半额退款
    { "hoursBeforeStart": 0,   "refundPercent": 0 }      // 3 天内：不退
  ],
  "freeReschedulingHours": 48
}
```

`BookingEscrow` 合约在链下读这个（merchant-agent 把它编码进
`release()` 调用）—— **不在链上**，但是 agent 强制执行的权威源。

### 5.3 `tourskill.org/v1/location`

```jsonc
{
  "country": "CN",
  "city": "huangshan",                       // 小写，索引器用
  "address": "安徽省黄山市黄山风景区云谷寺路侧",
  "coordinates": { "lat": 30.1372, "lng": 118.1856 },
  "timezone": "Asia/Shanghai"
}
```

### 5.4 `tourskill.org/v1/merchant`

```jsonc
{
  "type": "hotel",                          // hotel | restaurant | attraction | shop
  "tags": ["boutique","retreat","hot-spring"],
  "priceLevel": 5,                          // 1-5（¥-¥¥¥¥¥）
  "languagesSupported": ["zh","en"],
  "specifics": {                            // 类型专属字段
    "starRating": 5,
    "roomTypes": ["king","twin","suite","villa"],
    "checkInTime":  "15:00",
    "checkOutTime": "12:00"
  }
}
```

### 5.5 `tourskill.org/v1/i18n`

```jsonc
{
  "name":        { "zh": "无名初隐世酒店", "en": "Wuming Chu ..." },
  "description": { "zh": "...",          "en": "..." }
}
```

设置后，客户端按用户首选语言本地化。

---

## 6. 出处验证

每个 agent-card 消费者**必须**在信任 card 之前验证出处：

1. 从 `IdentityRegistry.getAgent(agentId).agentCardURI` 拉 JSON。
2. 计算收到字节的 SHA-256（**canonical 形式：不重新序列化**；直接
   验证 wire bytes）。
3. 与 `IdentityRegistry.getAgent(agentId).agentCardHash` 比较。
   **不匹配 = 中止**。
4. 验证 JSON 里的 `provenance.agentId` 和 `provenance.registry` 与
   链上记录匹配（防 URL 别名攻击）。

**这跟 `<script>` 标签的 Subresource Integrity 是同一个 trust-on-fetch
模型**。链持有真相；链下文档只是方便的形态。

---

## 7. 必填 vs 可选 字段总结

**每个 Concourse merchant-agent 必填**：
- `schemaVersion`、`name`、`description`、`url`、`version`
- `skills[]`（≥ 1 个 skill）
- `authentication.schemes[]`（≥ 1 个 scheme）
- `extensions["tourskill.org/v1/payment"]`（完整块）
- `extensions["tourskill.org/v1/location"]`
- `extensions["tourskill.org/v1/merchant"]`
- `provenance`（全部四个字段）

**可选但推荐**：
- `extensions["tourskill.org/v1/cancellation"]`
- `extensions["tourskill.org/v1/i18n"]`
- `interfaces[]` 用于更丰富的模态（餐厅菜单的图片响应等）

---

## 8. 版本管理与演化

- A2A `schemaVersion` 跟随上游 A2A spec。
- Concourse 扩展命名空间是 `tourskill.org/v1/*`。**破坏性变更升到
  `v2`**，v1 至少再支持 6 个月。
- `version`（顶层，semver）是 merchant-agent 自己的软件版本 —— 对
  监控 + bug-triage 有用，但客户端不消费它（除了信息性显示）。

Concourse ship 任意扩展的 v2 时，merchant-agent 模板会 dual-emit
两个版本。**平台托管的商家自动升级；自托管的按自己节奏更新**。

---

## 9. 示例 —— 参考 seed 商家的完整 card

完整示例 check-in 在
`packages/merchant-agent-template/examples/wumingchu.agent-card.json`，
模板仓库落地后会有。**索引器测试 fixture 用这个文件**。

# 信誉系统设计

> 引用：[00_PRINCIPLES.zh.md](./00_PRINCIPLES.zh.md)、[02_ERC8004_CONTRACT_DESIGN.zh.md](./02_ERC8004_CONTRACT_DESIGN.zh.md)、[05_X402_PAYMENT_FLOW.zh.md](./05_X402_PAYMENT_FLOW.zh.md)。

开放注册表里**最难**的一件事是**防止刷评论**。本文档规定 TourSkill
**怎么让评论造假变贵**。

---

## 1. 威胁模型

| 攻击 | 中心化 OTA 的成本 | 我们朴素设计的成本 |
|---|---|---|
| 马甲好评 | 创建假账号（$/账号）；有些平台靠行为分析检测 | 免费（再签一个新钱包） |
| 差评勒索（"付钱否则给你 1 星"）| 平台审核能限制但有限 | 免费，直到被发现 |
| 竞争对手破坏 | 中等成本可能 | 免费 |
| "买评论"服务 | 灰色市场 $0.50-5/条 | 同样成本 |

**老实话**：**没有 Sybil 抗性的注册表比没用还糟糕**，因为评论是
*主要*发现信号。**我们必须让每条评论都带有可验证的成本**。

---

## 2. 核心原则：feedback 由 settled booking 解锁

**只有为预订付过款且结算的钱包才能给那家商家留评论**。这由 Base 上
`ReputationRegistry` 合约（见 [02_ERC8004_CONTRACT_DESIGN.zh.md](./02_ERC8004_CONTRACT_DESIGN.zh.md) §3）通过
`autoAuthorizeFromBooking` hook 强制：

```
BookingEscrow.release(intentId)
  └── Reputation.autoAuthorizeFromBooking(merchantAgentId, payer)
        └── 设置 _feedbackAuth[merchantAgentId][payer] = true
```

现在 `payer` 的钱包**链上授权**对 `merchantAgentId` 留一条（或多条）
反馈条目。**没有这个授权**，他们提交的任何反馈都会被每个诚实索引器
拒绝。

**攻击者写一条假评论的成本**：
1. 创建一个有 USDC 的马甲钱包
2. 真做一笔预订并付款（USDC → escrow）
3. 等过申诉窗口
4. 结算把 USDC 释放给商家
5. *现在* 马甲钱包能评论了

**第 4 步是杀手**：攻击者**已经付给了被攻击的商家**完整预订金额。
**差评勒索现在的最低成本等于一笔预订**。马甲好评的成本对攻击者也
一样，钱流向他们试图刷的商家本身（这没问题，但**无利可图**）。

**这恰好是 Booking.com 用的模式 —— 住完才能评 —— 但用智能合约强制
而不是他们的内部 CRM**。

---

## 3. 链下反馈存储

**链存的是"授权"**。**链不存评论文本**。为什么：
- 评论内容 ~500-2000 字节；存到 Base 上花几分钱但不好查询
- 我们要国际化（zh + en + 未来其他）
- 我们要媒体（照片）
- 我们要更正 / 回应，不被不可变性卡住

所以：**反馈内容在链下，由授权钱包签名，任何人都能索引**。

### 3.1 反馈消息 schema

```jsonc
{
  "schemaVersion": "tourskill.org/feedback/v1",
  "merchantAgentId": 42,
  "bookingTxHash": "0xPAY...",        // BookingEscrow.lock tx
  "settlementTxHash": "0xRELEASE...",  // BookingEscrow.release tx（证明已结算）
  "rating": 4,                         // 1-5 星
  "title": "风景很棒，早餐一般",
  "body": "...最多 4000 字符...",
  "language": "zh",
  "media": [                           // 可选：照片的 IPFS 哈希
    { "type": "image/jpeg", "ipfs": "Qm..." }
  ],
  "createdAt": 1789200000,
  "address": "0xPAYER..."              // 签名钱包
}
```

评论者通过 EIP-191 对此 JSON 的 canonical SHA-256 签名。索引器验证签名 recover 到 `address`，且 `address` 满足
`Reputation.isAuthorized(merchantAgentId, address) == true`。

### 3.2 存储位置

**反馈可以在三个地方，都合法**：

1. **merchant-agent 自己的存储** —— 商家暴露
   `GET /reputation/feedback?since=...`。**他们 serve 自己的评论**。
   利益冲突？是，但通过索引器（#3）交叉引用缓解。
2. **TourSkill 中央索引器** —— `GET /v1/reputation/feedback?merchantAgentId=...`。**索引器发布它看到的一切**。**任何人都能跑自己的索引器**。
3. **IPFS / Arweave** —— 永久存档。可选；Tier 2+ 商家可以选择镜像
   到那里。

**user-agent 读信誉时应该至少查 3 个源里 2 个，并标记不一致**。

### 3.3 重放与唯一性

一个钱包**每个 `bookingTxHash` 最多留一条反馈**。索引器强制 ——
来自同一 `address` 的相同 `bookingTxHash` 第二次提交**替换**第一次
（**允许更正**）。同一钱包不同预订各自有自己的反馈。

做了 10 次预订的钱包能留 10 条反馈。**这是有意的 —— "一住一评"，
和真实平台一样**。

---

## 4. 聚合算法

怎么把签名 + 已结算 反馈列表变成 agent 用于排序的"信誉分数"？
朴素平均有已知问题（**1 条满分 5 星**比**100 条仔细的 4.5 星**得分
更高）。

我们用 **Wilson 95% 置信区间下界**，跟 Reddit 的"best"排序一样：

```
score = ((p + z²/(2n)) - z·√((p(1-p)/n) + z²/(4n²))) / (1 + z²/n)
其中 p = positive_fraction（rating ≥ 4 / 5），n = total_reviews，z = 1.96
```

**这个公式惩罚低量商家**（高不确定性 → 更低分）**奖励高量稳定**。

**评分相同时打破平局**：通过对反馈施加 6 个月半衰期衰减后再做
Wilson 计算 —— **新评论权重更高**。

**聚合不在链上**。**索引器从签名反馈集计算**。不同索引器排名可能
略有不同；**这没问题，甚至健康**。

---

## 5. 有争议的反馈

如果商家声称某条评论欺诈或被胁迫呢？我们有两个机制：

### 5.1 答辩权（链下）
商家可以发表对任何反馈的签名回复。回复通过哈希链接到原始反馈。
**索引器把它们一起显示**。这是最简单的机制；不需要合约改动。

### 5.2 反馈作废（链上、升级版）
对明显恶意的反馈（如**用户从未真实入住**的评论 —— 预订被申诉退款，
未结算），商家可以调：

```solidity
// 假设的 ReputationRegistry v2 函数 —— 不在 v1
function disputeFeedback(uint256 agentId, address reviewer, bytes32 feedbackHash) external;
```

这发出索引器索引的事件。**有争议的反馈不从索引器列表移除**，但带
"商家有争议"标记显示。**user-agent 可以选择如何在排名里加权这个**。

**v1 我们只 ship 链下答辩权**。**v2 看情况后再加链上争议原语**。

---

## 6. 商家上线分数

**全新商家零评论**。纯 Wilson 评分会让他们永远排在每次搜索的最底
部。为引导：

- 新商家在 UI 里得到**"未验证"徽章**（用户可见）
- **排名分数设为类目中位数**（这样他们出现在中间，不是最底）
- 第 5 次 settled feedback 后，**徽章移除，Wilson 接管**

**这是软启发式，不是合约功能**。**逻辑在索引器里**。

---

## 7. 我们明确**不做**的

- **链上星级**。**星级在链下**；链只存授权。这保留 schema 灵活性。
- **匿名反馈**。每条评论绑定到付款钱包。**身份即 Sybil 抗性是核心
  论点**。
- **替商家做情感分析**。**我们不会自动**把评论汇总成"happy/unhappy"
  轴。索引器愿意做就做；平台不做。
- **付费置顶**。**没有商家能付钱给我们（或任何人）让自己在
  `/v1/discover` 里排名更高。 句号**。（见 [09_BUSINESS_MODEL.zh.md](./09_BUSINESS_MODEL.zh.md) §6
  "永远不做的事"。）

---

## 8. 未来：ValidationRegistry 用法

ERC-8004 的 `ValidationRegistry`（**v1 部署但不用**）是**第三方证明**
的天然归宿，可以增强基于预订的信誉：

- "城市旅游局已验证此酒店在所声称地址存在"
- "FoodSafetyCertifier 已验证此餐厅卫生评级"
- "GreenTourism Coalition 已验证此 lodge 的可持续性声明"

每个 attester 自己也是 `IdentityRegistry` 里注册的 agent。它们通过
`submitValidation()` 签发 attestation。**user-agent 排名时可以查询
相关 attester**（每用户可配置 —— "我信城市委员会，不信网红 attester"）。

**这是 roadmap，不是 v1**，但合约在链上所以不重部署。

---

## 9. 手动反馈授权（逃生通道）

有时商家想授权评论者绕过预订 + escrow：

- Beta 测试者奖励
- 媒体 / 网红免费招待
- B2B 合作评论

**合约支持这个**：

```solidity
Reputation.acceptFeedback(merchantAgentId, reviewerAddress);
```

**只有商家的 owner 能调**。这是和 auto-from-booking hook 同样的授权
槽。**索引器把这些评论标记 `source: "manual"`**，让消费者决定信不
信。

**这是有意的逃生通道 + 透明性**。

---

## 10. v1 实现总结

v1 ship 什么（Phase C，escrow 之后）：

- ✅ `ReputationRegistry` 合约带 `acceptFeedback` / `revokeFeedback` /
  `autoAuthorizeFromBooking` / `isAuthorized`
- ✅ `BookingEscrow.release()` 同 tx 调 `autoAuthorizeFromBooking()`
- ✅ 索引器（`/v1/reputation/feedback?merchantAgentId=X`）返回签名 +
  验证过的反馈列表
- ✅ 每个 merchant-agent 在 `/reputation/feedback` 服务自己的反馈
- ✅ user-agent 排名算法用 Wilson 下界 + 6 个月半衰期
- ✅ 商家签名回复（无合约改动）
- ✅ 索引器里 `source: "manual"` 标记的手动 `acceptFeedback`

什么推到 v2：
- ⏸ 链上反馈争议（`disputeFeedback`）
- ⏸ ValidationRegistry attestation 流程
- ⏸ 多源信誉（跨平台聚合）

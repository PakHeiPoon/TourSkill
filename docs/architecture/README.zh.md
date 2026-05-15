# Concourse 架构文档（中文版）

英文原版在同目录的 `*.md` 文件中。中文版与英文版**逐节对应**，
术语翻译与中英对照保持一致。

新人阅读顺序：

1. [00_PRINCIPLES.zh.md](./00_PRINCIPLES.zh.md) —— 8 条原则。所有其他文档都回指向这里。
2. [01_TARGET_ARCHITECTURE.zh.md](./01_TARGET_ARCHITECTURE.zh.md) —— 一张图看完整套系统。
3. [09_BUSINESS_MODEL.zh.md](./09_BUSINESS_MODEL.zh.md) —— 这事儿怎么挣钱。

按执行顺序进入实现细节：

4. [02_ERC8004_CONTRACT_DESIGN.zh.md](./02_ERC8004_CONTRACT_DESIGN.zh.md)
5. [03_AGENT_CARD_SPEC.zh.md](./03_AGENT_CARD_SPEC.zh.md)
6. [04_MERCHANT_AGENT_TEMPLATE.zh.md](./04_MERCHANT_AGENT_TEMPLATE.zh.md)
7. [05_X402_PAYMENT_FLOW.zh.md](./05_X402_PAYMENT_FLOW.zh.md)
8. [06_REPUTATION_DESIGN.zh.md](./06_REPUTATION_DESIGN.zh.md)
9. [07_MIGRATION_PLAN.zh.md](./07_MIGRATION_PLAN.zh.md)
10. [08_OPEN_QUESTIONS.zh.md](./08_OPEN_QUESTIONS.zh.md) —— 还没拍板的问题。

## 状态

- Phase A.1（这套文档）：✅ 完成于 2026-04-29
- Phase A.2（ERC-8004 合约）：⏳ 待启动
- Phase A.3（merchant-agent 模板）：⏳ 待启动
- Phase A.4（前端改线）：⏳ 待启动
- Phase B（escrow + x402）：⏳ 待启动
- Phase C（reputation）：⏳ 待启动

## 怎么提建议

如果你不同意某个文档里的某个决定，打开对应文档，找到那段话，
在 PR 里以 quote-block 形式提出替代方案。引用 [00_PRINCIPLES.zh.md](./00_PRINCIPLES.zh.md)，
你的替代方案要么强化某条原则，要么按那条原则的"用法"段落明确说明
为什么这是一个例外。

<h1 align="center">Concourse</h1>

<p align="center">
  <strong>让平台可有可无的协议层。</strong>
</p>

<p align="center">
  <em>一种让 AI agent 直接发现、验证、交易的开放方式——没有中介市场，没有网关，不需要相信除了数学之外的任何公司。</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@concourse-protocol/discover"><img src="https://img.shields.io/npm/v/@concourse-protocol/discover?label=npm&color=cb3837" alt="npm" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow" alt="License: MIT" /></a>
  <a href="https://github.com/PakHeiPoon/Concourse/actions"><img src="https://img.shields.io/github/actions/workflow/status/PakHeiPoon/Concourse/publish-discover-cli.yml?label=CI" alt="CI" /></a>
  <a href="./README.md"><img src="https://img.shields.io/badge/English-Readme-blue" alt="English" /></a>
</p>

<p align="center">
  <img src="docs/diagrams/architecture-protocol.png" alt="今天每一笔交易都要绕道平台；用了 Concourse，agent 之间直接见面" width="900" />
</p>

---

## 要解决的问题

今天每一笔数字交易都绕道平台——Booking、Uber、OpenAI plugins、Anthropic MCP catalog、Coinbase AgentKit。**平台决定谁可见、谁可信、抽走多少**。AI agent 正在继承同样的模式：发现、排序、甚至 API 调用都流经厂商网关。厂商一旦消失，你的访问就跟着消失。

## Concourse 定义了什么

一种让两个 AI agent——一个代表用户，一个代表商家——**互相发现、互相验证、完成交易**的方式。整个路径上除了下面三样什么都没有：

- 任何人都能读的**公开注册表**
- 任何人都能跑的**密码学计算**
- 这**两方各自的服务器**

不需要中介市场。不需要网关 API。不需要你去信任任何一家"得保持在线"的公司。**数学本身就是信任**。

## Concourse 开创了什么

这个 repo 是**第一个可证伪的论证**——证明 AI-agent 之间的商业活动能够在「运行的关键路径上没有任何平台」的前提下完成。

> **命题**：把所有 Concourse 的服务器全部关掉，把公司离线。用户 agent 仍然应该能发现商家、验证商家没被篡改、完成一笔真实交易。
>
> **证明**：你自己试试。下面的 CLI 用的是零 Concourse-controlled 基础设施。如果你能跑通，平台在运行层面就是可替代的。**这就是目标本身**。

## 30 秒上手

```bash
# 列出注册表上所有商家 — 不需要注册、不需要 API key、不需要平台
npx -y @concourse-protocol/discover list

# 验证商家的 listing 有没有被篡改 — 是数学，不是信任
npx -y @concourse-protocol/discover fetch 1

# 直接预订 — 你的 agent 跟商家的 agent 对话，没有第三方
npx -y @concourse-protocol/discover invoke 1 check_availability \
  -d '{"check_in":"2026-09-01","check_out":"2026-09-03","room_type":"mountain_view"}'
```

跑完这一段，你刚刚跟一个商家完成了一次交易——**全程没碰任何平台，包括我们**。

## 接入 Claude Desktop / Cursor / 任何 AI agent

加这一段到你的 MCP 配置：

```json
{
  "mcpServers": {
    "concourse": {
      "command": "npx",
      "args": ["-y", "@concourse-protocol/discover", "concourse-mcp"]
    }
  }
}
```

你的 AI agent 立即获得 4 个新 tool——列商家、验证商家、看 skill、调用 skill——全部走开放协议，**循环里没有厂商网关**。

## 仓库内容

| 路径 | 你能用它做什么 |
|---|---|
| [`packages/discover-cli/`](./packages/discover-cli/) | 你刚才跑的 CLI + MCP server。装到任何地方，跟任何注册过的商家通话 |
| [`merchant-agent-template/`](./merchant-agent-template/) | 商家 clone 这个就能**变成** agent。服务器、钥匙、listing 都是商家自己的——Concourse 上没有商家账号 |
| [`backend/skills/`](./backend/skills/) | 两份 SKILL 文档——协议手册，AI agent 加载它就会用规则。**把它们塞给任何 LLM，LLM 都不需要这个 repo 才能 work** |
| [`contracts/erc8004/`](./contracts/erc8004/) | 协议依赖的公开注册表。任何人都能读，部署后没人能改 |
| [`docs/architecture/`](./docs/architecture/) | 设计文档——每个组件为什么存在，刻意不做什么 |
| [`frontend/`](./frontend/) | 一个展示注册表的参考网站。**可选**——协议本身不依赖它 |

## 路线图

| 状态 | 用户能得到什么 |
|---|---|
| ✅ 已上线 | 用户能发现任何商家、验证它真实存在、调用它的 skill——不需要相信任何公司 |
| ✅ 已上线 | 商家能自己托管、被收录、被任何 AI agent 找到——不需要付平台抽成、不需要请求许可 |
| ✅ 已上线 | 开发者一行命令装协议（`npx @concourse-protocol/discover`），从任意机器跑起 |
| 🟡 建设中 | per-call 付费机制——商家直接收 skill 调用费，没有 payment 处理器分润 |
| 📋 规划 | 资金 escrow + 真实交易解锁的信誉——假评论结构上就写不出来 |
| 📋 规划 | 不想自托管的商家用的托管层——**完全可选** |

## 证明平台可被关掉

```bash
# 1. 用第三方 RPC（不是我们控制的任何东西）
export CONCOURSE_RPC_URL=https://base-sepolia.public.blastapi.io

# 2. /etc/hosts 把我们的网站黑掉（可选）
echo "0.0.0.0  concourse.paking.xyz" | sudo tee -a /etc/hosts

# 3. 跑完整 discover → verify → invoke。仍然应该 work
npx -y @concourse-protocol/discover list
npx -y @concourse-protocol/discover invoke 1 get_room_types
```

哪天这条路失败了，命题就被证伪——开 issue。

---

<details>
<summary><strong>技术细节</strong>（开发者向）</summary>

Concourse 站在三个开放标准之上：

- **ERC-8004** — 公开链上身份注册表。任何人读、owner 写、无 admin
- **A2A Agent Card** — Google 发布的 JSON 描述符，路径 `/.well-known/agent-card.json`
- **x402** — Coinbase 发布的 HTTP 原生 USDC 微支付（付费 skill 用，规划中）

商家的 listing 在链上被精简成三件事：`(owner_address, cardURI, sha256(card_bytes))`。**发现** = 一次 `eth_call`；**验证** = 一次 HTTP GET + 一次 SHA-256；**调用** = 一次 HTTP POST 到商家自己的 URL。整条路径上没有任何 Concourse 运营的服务器。

参考实现选择：Foundry + Solidity 0.8.24 + `evmVersion = cancun`（注册表）；Hono + Drizzle + better-sqlite3 + viem（merchant agent 模板）；EIP-191 challenge-response（session 鉴权）；canonical JSON 序列化（确保链上 SHA-256 与 server 返回字节一致）。设计细节见 [`docs/architecture/`](./docs/architecture/)。

注册表当前部署在 Base Sepolia [`0xBdE5A55D50d2062FF5529546d8c391f6a6eEA29f`](https://sepolia.basescan.org/address/0xBdE5A55D50d2062FF5529546d8c391f6a6eEA29f)（73 测试 100% 覆盖）。Mainnet 迁移走共享的 canonical ERC-8004 地址，让生态自动收录。

</details>

## 许可证

[MIT](./LICENSE) — Copyright © 2026 Pak Hei Poon and Concourse Protocol contributors。

---

<p align="center">
  <sub>你的下一笔交易应该发生在你和商家之间，而不是你和平台之间。</sub>
</p>

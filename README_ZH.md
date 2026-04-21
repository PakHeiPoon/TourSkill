<p align="center">
  <img src="docs/images/tourskill-banner.svg" alt="TourSkill Banner" width="800" />
</p>

<p align="center">
  <img src="docs/images/tourskill-logo.png" alt="TourSkill Logo" width="140" />
</p>

<p align="center">
  <strong>打破 OTA 垄断 —— 智能体对智能体的旅游新范式</strong>
</p>

<p align="center">
  <a href="./README.md"><img src="https://img.shields.io/badge/English-Click_Here-blue?style=for-the-badge" alt="English" /></a>
  <a href="#快速开始"><img src="https://img.shields.io/badge/快速开始-5分钟-brightgreen?style=for-the-badge" alt="Quick Start" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="License" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/github/stars/PakHeiPoon/TourSkill?style=social" alt="Stars" />
  <img src="https://img.shields.io/github/forks/PakHeiPoon/TourSkill?style=social" alt="Forks" />
  <img src="https://img.shields.io/github/last-commit/PakHeiPoon/TourSkill" alt="Last Commit" />
</p>

---

## 目录

- [问题：为什么需要 TourSkill？](#问题为什么需要-tourskill)
- [愿景：智能体直接对话](#愿景智能体直接对话)
- [工作流程](#工作流程)
- [系统架构](#系统架构)
- [核心特性](#核心特性)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [技术栈](#技术栈)
- [路线图](#路线图)
- [Star History](#star-history)

---

## 问题：为什么需要 TourSkill？

### 现状：你的旅行体验被平台控制

<p align="center">
  <img src="docs/images/tourskill-problem-today.png" alt="现状：你的旅行体验被平台控制" width="900" />
</p>
**选择的幻觉：** 商家看似有定价权，但平台通过发现机制、排名算法和优惠券生态系统掌控一切。酒店 ¥800 的房间在平台上变成 ¥1,200 —— 然后一张"¥200 优惠券"让你觉得 ¥1,000 买到了便宜。实际上商家只拿到 ¥900。

> *"我们发明了互联网来直接连接人与人。然后我们又建了平台，坐在每个连接中间收租。"*

---

## 愿景：智能体直接对话

受 **比特币白皮书核心思想** 启发 —— *无需可信第三方的点对点交易* —— TourSkill 将同样的原则应用到旅游商业：

<p align="center">
  <img src="docs/images/tourskill-a2a-ecosystem.png" alt="TourSkill 智能体对智能体（A2A）旅游生态" width="900" />
</p>

### 进化之路：从平台依赖到智能体自由

<p align="center">
  <img src="docs/images/tourskill-journey.png" alt="进化之路：从平台依赖到智能体自由" width="900" />
</p>


---

## 工作流程

### 用户使用流程

<p align="center">
  <img src="docs/images/tourskill-feature-flow.png" alt="TourSkill 功能流程：个性化 AI 用餐" width="900" />
</p>

---

## 系统架构

<p align="center">
  <img src="docs/images/tourskill-infographic.png" alt="TourSkill 系统架构信息图" width="800" />
</p>

<details>
<summary>文字版本（点击展开）</summary>

```
                           ┌─────────────────────────────────┐
                           │        前端 (React)              │
                           │                                  │
                           │  ┌────────┐ ┌──────┐ ┌───────┐ │
                           │  │商家注册│ │商家   │ │AI 智能│ │
                           │  │Portal  │ │浏览器 │ │体演示 │ │
                           │  └───┬────┘ └──┬───┘ └───┬───┘ │
                           └──────┼─────────┼─────────┼──────┘
                                  │         │         │
                    ┌─────────────┘         │         └──────────────┐
                    │                       │                        │
                    ▼                       ▼                        ▼
          ┌─────────────────┐    ┌──────────────────┐   ┌───────────────────┐
          │  智能合约         │    │  MCP 网关          │   │ 去中心化 LLM      │
          │  (链上)          │    │  (FastAPI)         │   │ (0G Compute)      │
          │                  │    │                    │   │                   │
          │  MerchantRegistry│    │  3 个 MCP 工具：   │   │ 支持模型：         │
          │  .sol            │    │  - 发现商家        │   │ - Qwen            │
          │                  │    │  - 调用技能        │   │ - GLM             │
          │  链上存储：       │    │  - 查询详情        │   │ - DeepSeek        │
          │  - DID           │    │                    │   │                   │
          │  - Profile Hash  │    │  12 个技能处理器   │   │ 工具调用循环       │
          │  - 技能端点      │    │  (菜单/预订/门票)  │   │ (最多 8 轮)       │
          └─────────────────┘    │                    │   │                   │
                                  │  ┌──────────────┐ │   │ processResponse() │
                                  │  │  Supabase DB │ │   │ 费用结算          │
                                  │  └──────────────┘ │   │                   │
                                  └──────────────────┘   └───────────────────┘
```

</details>

### 商家技能系统

TourSkill 的商家发布的是**可执行技能** —— 不是静态列表。任何 AI 智能体都可以调用：

| 类别 | 技能 | 说明 |
|------|------|------|
| **餐厅** | `get_menu`, `reserve_table`, `check_table_availability`, `get_dietary_options` | 真实菜单含价格、饮食标签、过敏原 |
| **酒店** | `check_availability`, `get_rates`, `create_booking`, `get_cancellation_policy` | 房型、动态定价、取消规则 |
| **景点** | `check_ticket_inventory`, `get_opening_hours`, `purchase_ticket`, `get_visitor_guide` | 时段、联票、交通指南 |

---

## 核心特性

| 特性 | 说明 |
|------|------|
| **去中心化注册表** | 链上商家身份，Profile Hash 验证 |
| **MCP 协议** | 标准工具接口 —— 任何 AI 智能体都能接入 |
| **用户驱动 AI** | 你的钱包支付 LLM 推理费用 —— 无中心化 API Key |
| **网络切换** | 支持测试网 / 主网，自动配置链参数 |
| **智能充值** | 自动检测余额，仅在不足时充值/转账 |
| **12 种商家技能** | 真实可执行 API：菜单、预订、门票、指南 |
| **自主智能体** | LLM 自主决定调用哪些工具（最多 8 轮） |
| **实时日志** | 终端面板实时展示每个工具调用和结果 |
| **多城市数据** | 杭州、上海、苏州、北京 —— 29 家真实商家 |

---

## 快速开始

### 前置要求

- Node.js 18+ / Python 3.10+
- MetaMask 浏览器插件
- 测试网代币（[水龙头](https://faucet.0g.ai)）

### 1. 克隆仓库

```bash
git clone https://github.com/PakHeiPoon/TourSkill.git
cd TourSkill
```

### 2. 启动后端（MCP 网关）

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # 编辑填入 Supabase 凭证
uvicorn app.main:app --reload --port 8000
```

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
```

### 4. 部署智能合约（可选 —— 已部署）

```bash
cd contracts
npm install
cp .env.example .env    # 编辑填入部署私钥
npx hardhat run scripts/deploy.js --network zerog_testnet
```

> **已部署合约：** [`0x18B9AbB94eeaCbAbc6bFECB7143165AF6E0df543`](https://chainscan-galileo.0g.ai/address/0x18B9AbB94eeaCbAbc6bFECB7143165AF6E0df543)

---

## 项目结构

```
TourSkill/
├── frontend/                    # React + Vite + Tailwind
│   ├── src/pages/
│   │   ├── RegistrationPortal.tsx    # 商家注册
│   │   ├── Explorer.tsx              # 浏览 & 测试商家技能
│   │   └── AgentDemo.tsx             # AI 智能体聊天界面
│   ├── src/hooks/
│   │   └── use0gCompute.ts           # 去中心化 LLM Hook
│   └── src/contracts/
│       └── MerchantRegistry.ts       # 链上合约 ABI
├── backend/                     # FastAPI MCP 网关
│   ├── app/routers/mcp.py           # MCP 工具端点
│   ├── app/services/
│   │   ├── merchant_service.py       # 发现 & 查询
│   │   └── skill_service.py          # 12 个技能处理器
│   └── requirements.txt
├── contracts/                   # Solidity (Hardhat 3)
│   ├── contracts/MerchantRegistry.sol
│   └── scripts/deploy.js
└── agent/                       # 可选的服务端智能体
    └── server.js
```

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS |
| 智能合约 | Solidity 0.8.24 + Hardhat 3 |
| 后端 | FastAPI + Supabase |
| AI 推理 | 0G Compute Network + `@0glabs/0g-serving-broker` |
| 协议 | MCP（模型上下文协议） |
| 钱包 | MetaMask + ethers.js v6 |
| 区块链 | 0G Network（测试网 & 主网） |

---

## 路线图

| 阶段 | 状态 | 说明 |
|------|------|------|
| **MVP** | 已完成 | 注册表 + MCP 网关 + 智能体演示 + 去中心化 LLM |
| **多智能体** | 规划中 | 商家端智能体与用户智能体直接协商 |
| **x402 支付** | 规划中 | HTTP 原生的智能体间点对点支付 |
| **信誉系统** | 规划中 | 链上评价和信任评分 |
| **多链部署** | 规划中 | 在多条链上部署注册表 |
| **移动端** | 规划中 | 支持语音交互的移动智能体 |

---

## Star History

<div align="center">
  <a href="https://star-history.com/#PakHeiPoon/TourSkill&Date">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=PakHeiPoon/TourSkill&type=Date&theme=dark" />
      <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=PakHeiPoon/TourSkill&type=Date" />
      <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=PakHeiPoon/TourSkill&type=Date" width="700" />
    </picture>
  </a>
</div>

---

## 许可证

MIT

---

<p align="center">
  <sub>TourSkill —— 因为你的下一趟旅行，应该是你和商家之间的事，不是你和平台之间的事。</sub>
</p>

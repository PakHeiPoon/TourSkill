<p align="center">
  <img src="docs/images/tourskill-banner.svg" alt="TourSkill Banner" width="800" />
</p>

<p align="center">
  <img src="docs/images/tourskill-logo.png" alt="TourSkill Logo" width="140" />
</p>

<p align="center">
  <strong>Breaking the OTA Monopoly — Agent-to-Agent Tourism, Powered by You</strong>
</p>

<p align="center">
  <a href="#the-problem"><img src="https://img.shields.io/badge/Why-Read_the_Story-blue?style=for-the-badge" alt="Story" /></a>
  <a href="#quick-start"><img src="https://img.shields.io/badge/Quick_Start-5_min-brightgreen?style=for-the-badge" alt="Quick Start" /></a>
  <a href="./README_ZH.md"><img src="https://img.shields.io/badge/中文文档-点击查看-orange?style=for-the-badge" alt="中文" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="License" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/github/stars/PakHeiPoon/TourSkill?style=social" alt="Stars" />
  <img src="https://img.shields.io/github/forks/PakHeiPoon/TourSkill?style=social" alt="Forks" />
  <img src="https://img.shields.io/github/last-commit/PakHeiPoon/TourSkill" alt="Last Commit" />
</p>

---

## Table of Contents

- [The Problem](#the-problem)
- [The Vision](#the-vision)
- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Key Features](#key-features)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Roadmap](#roadmap)
- [Star History](#star-history)
- [License](#license)

---

## The Problem

### Today: You Don't Control Your Travel Experience

<p align="center">
  <img src="docs/images/tourskill-problem-today.png" alt="Today: you don't control your travel experience" width="900" />
</p>
**The illusion of choice:** Merchants appear to set their own prices, but platforms control discovery, ranking, and the coupon ecosystem. A hotel's ¥800 room becomes ¥1,200 after platform fees — then a "¥200 coupon" makes you feel like you got a deal at ¥1,000. The merchant still only receives ¥900.

> *"We invented the internet to connect people directly. Then we built platforms that sit between every connection and extract rent."*

---

## The Vision

### Tomorrow: Your Agent Talks to Their Agent

Inspired by the **Bitcoin whitepaper's core insight** — *peer-to-peer transactions without a trusted third party* — TourSkill applies the same principle to travel commerce:

<p align="center">
  <img src="docs/images/tourskill-a2a-ecosystem.png" alt="TourSkill Agent-to-Agent (A2A) travel ecosystem" width="900" />
</p>

**TourSkill is the decentralized registry that makes this possible** — an open, verifiable "Yellow Pages" where merchants publish their skills (menus, availability, booking) and any AI agent can discover and interact with them directly.

### The Journey: From Platform Dependency to Agent Freedom

<p align="center">
  <img src="docs/images/tourskill-journey.png" alt="The journey: from platform dependency to agent freedom" width="900" />
</p>
---



## How It Works

### User Flow

<p align="center">
  <img src="docs/images/tourskill-feature-flow.png" alt="TourSkill feature flow: personalized AI dining" width="900" />
</p>

---

## Architecture

<p align="center">
  <img src="docs/images/tourskill-infographic.png" alt="TourSkill Architecture Infographic" width="800" />
</p>

<details>
<summary>Text Version (Click to Expand)</summary>

```
                           ┌─────────────────────────────────┐
                           │        Frontend (React)          │
                           │                                  │
                           │  ┌────────┐ ┌──────┐ ┌───────┐ │
                           │  │Register│ │Browse│ │Agent  │ │
                           │  │Portal  │ │& Test│ │Demo   │ │
                           │  └───┬────┘ └──┬───┘ └───┬───┘ │
                           │      │         │         │      │
                           └──────┼─────────┼─────────┼──────┘
                                  │         │         │
                    ┌─────────────┘         │         └──────────────┐
                    │                       │                        │
                    ▼                       ▼                        ▼
          ┌─────────────────┐    ┌──────────────────┐   ┌───────────────────┐
          │  Smart Contract  │    │  MCP Gateway      │   │ Decentralized LLM │
          │  (0G Chain)      │    │  (FastAPI)         │   │ (0G Compute)      │
          │                  │    │                    │   │                   │
          │  MerchantRegistry│    │  3 MCP Tools:      │   │ Models:           │
          │  .sol            │    │  - discover        │   │ - Qwen            │
          │                  │    │  - invoke_skill    │   │ - GLM             │
          │  On-chain:       │    │  - get_details     │   │ - DeepSeek        │
          │  - DID           │    │                    │   │                   │
          │  - Profile Hash  │    │  12 Skill Handlers │   │ Tool Calling Loop │
          │  - Skill Endpoint│    │  (menu, booking,   │   │ (up to 8 rounds)  │
          │                  │    │   tickets, etc.)   │   │                   │
          └─────────────────┘    │                    │   │ processResponse() │
                                  │  ┌──────────────┐ │   │ fee settlement    │
                                  │  │  Supabase DB │ │   │                   │
                                  │  └──────────────┘ │   └───────────────────┘
                                  └──────────────────┘
```

</details>

### Merchant Skill System

TourSkill merchants publish **executable skills** — not just static listings. Any AI agent can invoke these:

| Category | Skills | Description |
|----------|--------|-------------|
| **Restaurant** | `get_menu`, `reserve_table`, `check_table_availability`, `get_dietary_options` | Real menus with prices, dietary tags, allergens |
| **Hotel** | `check_availability`, `get_rates`, `create_booking`, `get_cancellation_policy` | Room types, dynamic pricing, cancellation rules |
| **Attraction** | `check_ticket_inventory`, `get_opening_hours`, `purchase_ticket`, `get_visitor_guide` | Time slots, combo tickets, transport info |

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Decentralized Registry** | On-chain merchant identity with profile hash verification |
| **MCP Protocol** | Standard tool interface — any AI agent can connect |
| **User-Powered AI** | Your wallet pays for LLM inference — no centralized API keys |
| **Network Selection** | Switch between Testnet and Mainnet with auto chain config |
| **Smart Funding** | Auto-detect balance, only deposit/transfer when insufficient |
| **12 Merchant Skills** | Real executable APIs: menus, bookings, tickets, guides |
| **Autonomous Agent** | LLM decides which tools to call (up to 8 iterations) |
| **Real-time Logs** | Live terminal showing every tool call and result |
| **Multi-city Data** | Hangzhou, Shanghai, Suzhou, Beijing — 29 real merchants |

---

## Quick Start

### Prerequisites

- Node.js 18+ / Python 3.10+
- MetaMask browser extension
- Testnet tokens ([faucet](https://faucet.0g.ai))

### 1. Clone

```bash
git clone https://github.com/PakHeiPoon/TourSkill.git
cd TourSkill
```

### 2. Backend (MCP Gateway)

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # Edit with your Supabase credentials
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

### 4. Smart Contract (Optional — already deployed)

```bash
cd contracts
npm install
cp .env.example .env    # Edit with your deployer private key
npx hardhat run scripts/deploy.js --network zerog_testnet
```

> **Deployed Contract:** [`0x18B9AbB94eeaCbAbc6bFECB7143165AF6E0df543`](https://chainscan-galileo.0g.ai/address/0x18B9AbB94eeaCbAbc6bFECB7143165AF6E0df543)

---

## Project Structure

```
TourSkill/
├── frontend/                    # React + Vite + Tailwind
│   ├── src/pages/
│   │   ├── RegistrationPortal.tsx    # Merchant onboarding
│   │   ├── Explorer.tsx              # Browse & test merchant skills
│   │   └── AgentDemo.tsx             # AI agent chat interface
│   ├── src/hooks/
│   │   └── use0gCompute.ts           # Decentralized LLM hook
│   └── src/contracts/
│       └── MerchantRegistry.ts       # On-chain contract ABI
├── backend/                     # FastAPI MCP Gateway
│   ├── app/routers/mcp.py           # MCP tool endpoints
│   ├── app/services/
│   │   ├── merchant_service.py       # Discovery & lookup
│   │   └── skill_service.py          # 12 skill handlers
│   └── requirements.txt
├── contracts/                   # Solidity (Hardhat 3)
│   ├── contracts/MerchantRegistry.sol
│   └── scripts/deploy.js
└── agent/                       # Optional server-side agent
    └── server.js
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS |
| Smart Contract | Solidity 0.8.24 + Hardhat 3 |
| Backend | FastAPI + Supabase |
| AI Inference | 0G Compute Network + `@0glabs/0g-serving-broker` |
| Protocol | MCP (Model Context Protocol) |
| Wallet | MetaMask + ethers.js v6 |
| Chain | 0G Network (Testnet & Mainnet) |

---

## Roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| **MVP** | Done | Registry + MCP Gateway + Agent Demo with decentralized LLM |
| **Multi-Agent** | Planned | Merchant-side agents that negotiate with user agents |
| **x402 Payments** | Planned | HTTP-native peer-to-peer payments between agents |
| **Reputation** | Planned | On-chain reviews and trust scoring |
| **Multi-Chain** | Planned | Deploy registry on multiple chains |
| **Mobile** | Planned | Mobile agent with voice interaction |

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

## License

MIT

---

<p align="center">
  <sub>TourSkill — Because your next trip should be between you and the merchant, not you and a platform.</sub>
</p>

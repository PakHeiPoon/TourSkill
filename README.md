<p align="center">
  <img src="docs/images/tourskill-banner.svg" alt="Concourse Banner" width="800" />
</p>

<p align="center">
  <img src="docs/images/tourskill-logo.png" alt="Concourse Logo" width="140" />
</p>

<p align="center">
  <strong>Concourse — the open protocol layer where AI agents discover, verify, and transact directly. Agent-to-Agent. Peer-to-Peer.</strong>
</p>

<p align="center">
  <em>Built on ERC-8004 Trustless Agents · A2A Agent Card · x402 micropayments. Tourism is the first vertical that proves the protocol; commerce of every kind follows.</em>
</p>

<p align="center">
  <a href="#the-problem"><img src="https://img.shields.io/badge/Why-Read_the_Story-blue?style=for-the-badge" alt="Story" /></a>
  <a href="#quick-start"><img src="https://img.shields.io/badge/Quick_Start-5_min-brightgreen?style=for-the-badge" alt="Quick Start" /></a>
  <a href="./README_ZH.md"><img src="https://img.shields.io/badge/中文文档-点击查看-orange?style=for-the-badge" alt="中文" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="License" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/github/stars/PakHeiPoon/Concourse?style=social" alt="Stars" />
  <img src="https://img.shields.io/github/forks/PakHeiPoon/Concourse?style=social" alt="Forks" />
  <img src="https://img.shields.io/github/last-commit/PakHeiPoon/Concourse" alt="Last Commit" />
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

Inspired by the **Bitcoin whitepaper's core insight** — *peer-to-peer transactions without a trusted third party* — Concourse applies the same principle to travel commerce:

<p align="center">
  <img src="docs/images/tourskill-a2a-ecosystem.png" alt="Concourse Agent-to-Agent (A2A) travel ecosystem" width="900" />
</p>

**Concourse is the decentralized registry that makes this possible** — an open, verifiable "Yellow Pages" where merchants publish their skills (menus, availability, booking) and any AI agent can discover and interact with them directly.

### The Journey: From Platform Dependency to Agent Freedom

<p align="center">
  <img src="docs/images/tourskill-journey.png" alt="The journey: from platform dependency to agent freedom" width="900" />
</p>
---



## How It Works

### User Flow

<p align="center">
  <img src="docs/images/tourskill-feature-flow.png" alt="Concourse feature flow: personalized AI dining" width="900" />
</p>

---

## Architecture

<p align="center">
  <img src="docs/images/tourskill-infographic.png" alt="Concourse Architecture Infographic" width="800" />
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
          ┌──────────────────┐    ┌────────────────────┐   ┌───────────────────┐
          │  ERC-8004 Layer  │    │  Merchant Agent    │   │ Optional LLM      │
          │  (Base Sepolia)  │    │  (Hono · self-host)│   │ (any OpenAI-compat│
          │                  │    │                    │   │  endpoint)        │
          │  IdentityRegistry│    │  /.well-known/     │   │                   │
          │  ReputationReg   │    │    agent-card.json │   │ - Qiniu / OpenAI  │
          │  ValidationReg   │    │  /auth/challenge   │   │ - 0G Compute      │
          │                  │    │  /auth/verify      │   │ - DeepSeek / Kimi │
          │  Per agent:      │    │  /skills/<name>    │   │                   │
          │  - owner addr    │    │                    │   │ Used by user-     │
          │  - card URI      │    │  EIP-191 auth      │   │ agents for tool-  │
          │  - SHA-256 hash  │    │  Idempotency-Key   │   │ calling loops.    │
          │                  │    │  on state changes  │   │                   │
          └──────────────────┘    └────────────────────┘   └───────────────────┘
```

</details>

### Merchant Skill System

Concourse merchants publish **executable skills** — not just static listings. Any AI agent can invoke these:

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
git clone https://github.com/PakHeiPoon/Concourse.git
cd Concourse
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

> **Deployed Contract:** [`0x18B9AbB94eeaCbAbc6bFECB7143165AF6E0df543`](https://chainscan-galileo.0g.ai/address/0x18B9AbB94eeaCbAbc6bFECB7143165AF6E0df543) (0G testnet, chainId `16602`) — already populated with 28 merchants across Hangzhou, Shanghai, Suzhou, Beijing.

---

## Agent Integration via SKILL.md

Concourse ships with a **client-side SKILL.md spec** that any AI agent (Claude Code, Cursor, custom agents) can install to discover and interact with the on-chain merchant registry.

### Quick install

Tell your personal agent:

> "Install the Concourse skill from `https://api.tourskill.paking.xyz/skills/user-client/SKILL.md`"

The SKILL.md is served directly by the public Concourse gateway — same host as the API it describes. No GitHub access needed.

Once installed, the agent learns to:

1. **Classify** tourism intent ("dinner in Hangzhou tomorrow") into structured form
2. **Discover** merchants via the registry — already populated on-chain
3. **Personalize** ranking using your own preferences (allergens, budget, history) — the core anti-OTA edge
4. **Invoke** merchant skills (book a table, reserve a room, buy tickets) with on-chain proof

See [`skills/user-client/SKILL.md`](skills/user-client/SKILL.md) for the full spec.

---

## Project Structure

```
Concourse/
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
│   │   └── skill_service.py          # 12 merchant-aware skill handlers
│   └── requirements.txt
├── contracts/                   # Solidity (Hardhat 3)
│   ├── contracts/MerchantRegistry.sol
│   └── scripts/deploy.js
├── agent/                       # Optional server-side agent
│   └── server.js
└── skills/                      # Client-side SKILL.md specs for personal agents
    └── user-client/SKILL.md         # Discover → personalize → invoke loop
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite + Tailwind v4 + ethers v6 |
| Chain | **Base Sepolia** (testnet, live) → **Base mainnet** (canonical ERC-8004 registry) |
| Smart contracts | Solidity 0.8.24 + Foundry — evmVersion `cancun`, optimizer 200, 73 tests at 100% coverage |
| Merchant agent template | Hono 4 + Drizzle + better-sqlite3 + viem + Zod + vitest |
| Auth | EIP-191 challenge → opaque bearer token (also EIP-712 for future booking-escrow) |
| Standards | **ERC-8004** (Trustless Agents) + **A2A** (Agent Card) + **x402** (paid skills, planned) |
| Hosting | Self-host (Fly.io / Railway / your VPS) · Vercel for frontend · Multi-tenant SaaS planned |
| Optional LLM | Any OpenAI-compatible endpoint (Qiniu MaaS, OpenAI, 0G Compute, DeepSeek, Kimi …) |
| Wallet | MetaMask / hardware wallets via ethers v6 / viem |

---

## Roadmap

The first agent on this protocol — `wumingchu.tourskill.paking.xyz` — is **live now** at agentId=1 on Base Sepolia.
Any client can verify: `cast call --rpc-url https://sepolia.base.org 0xBdE5A55D50d2062FF5529546d8c391f6a6eEA29f 'getAgent(uint256)' 1`

| Tier | Status | Description |
|---|---|---|
| **Phase A.2 — Contracts** | ✅ Shipped | `IdentityRegistry`, `ReputationRegistry`, `ValidationRegistry` deployed + Basescan-verified on Base Sepolia |
| **Phase A.3 — Merchant template** | ✅ Shipped | Open-source Hono template, 5 hotel skills, EIP-191 auth, canonical-JSON cards with SHA-256 |
| **Phase A.5 — First live agent** | ✅ Shipped | Wuming Chu · Huangshan on Fly Tokyo, custom domain + LetsEncrypt cert, agentId=1 on chain |
| **Phase A.7 — Trustless explorer** | ✅ Shipped | Frontend reads chain directly, hash-verifies served bytes, calls skills against agent URL — no backend proxy |
| **Phase B-min — Canonical mainnet** | 🟡 Building | Switch `Deploy.s.sol` to use the shared mainnet ERC-8004 address (`0x8004A169…A432`) so [8004scan.io](https://8004scan.io) auto-indexes us |
| **Phase B-mcp — MCP route** | 🟡 Building | Add MCP server endpoint alongside REST skills — Claude Desktop / GPT can use merchants as native tools |
| **Phase C-1 — Frontend rewire** | 🟡 Building | Retire legacy 0G demo, MerchantSign writes to Base IdentityRegistry via MetaMask |
| **Phase C-2 — x402 paid skills** | 📋 Planned | Stateless per-call USDC payments (EIP-3009), standard Coinbase x402 — separate from booking-level escrow |
| **Phase C-3 — `@concourse/cli`** | 📋 Planned | Independent npm CLI: `concourse list`, `concourse show 1`, `concourse call <id> <skill>` |
| **Phase D — BookingEscrow + reputation** | 📋 Planned | EIP-712 Seaport-style escrow with time-locked release; settled bookings auto-authorize feedback in ReputationRegistry |
| **Phase E — Multi-tenant SaaS** | 📋 Planned | Platform-hosted runtime so 95% of merchants get zero-ops onboarding; free tier + paid tiers |

See [`docs/architecture/07_MIGRATION_PLAN.md`](./docs/architecture/07_MIGRATION_PLAN.md) for the canonical post-Phase-A roadmap and [`merchant-agent-template/TROUBLESHOOTING.md`](./merchant-agent-template/TROUBLESHOOTING.md) for real gotchas hit shipping agent #1.

---

## Star History

<div align="center">
  <a href="https://star-history.com/#PakHeiPoon/Concourse&Date">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=PakHeiPoon/Concourse&type=Date&theme=dark" />
      <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=PakHeiPoon/Concourse&type=Date" />
      <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=PakHeiPoon/Concourse&type=Date" width="700" />
    </picture>
  </a>
</div>

---

## License

MIT

---

<p align="center">
  <sub>Concourse — Because your next trip should be between you and the merchant, not you and a platform.</sub>
</p>

# Concourse — English Presentation Script

**Speaker:** Pan Baixi (潘柏熙) · 2250002208@student.must.edu.mo
**Course:** Intelligent Agent (Macau University of Science and Technology)
**Total target time:** ~20 minutes (incl. ~3 min Q&A)
**Pace target:** ~150 words/min — natural, not rushed

> **How to use this:** Print this as cue cards or have it open on a second screen. Each slide section includes (a) a stage direction in italics, (b) the words to actually say, and (c) a transition cue at the end. Words in **bold** are the beats you should land hard on. The `[…]` are optional flex sentences — drop them if you're running long.

---

## Opening — before Slide 1 (~10 sec)

*Walk to the centre. Smile. Don't start speaking until the room is quiet.*

> Good evening everyone. Thank you, professor, for the time. My name is Pan Baixi. Tonight I want to show you a small system I built called **Concourse** — and use it to talk about something bigger: **what happens when one agent talks directly to another agent, with no platform sitting in the middle.**

*Click to slide 1.*

---

## Slide 1 — Cover (~30 sec total)

*Stay on the cover for one beat — let people read your name and email.*

> The full title is "**Concourse — A Decentralized Agent-to-Agent Tourism Protocol**." The subtitle says it all: *when your agent talks directly to the merchant's agent.*

> If you want the slides, the demo, or the source code afterwards, my email is on screen. I'll also drop the link in the last slide.

*Pause. Click.*

---

## Slide 2 — Inspiration & Vision (~1 min 30 sec)

*Stand still. This is the "why" — don't rush it.*

> I want to start with a quote that's almost twenty years old.

> In 2008, when Satoshi Nakamoto published the Bitcoin white paper, the very first sentence said: *"A purely peer-to-peer version of electronic cash would allow online payments to be sent directly from one party to another without going through a financial institution."*

> That sentence is famous because of the money. But re-read it and replace "payments" with **"any service request"**. Now it sounds like the future of AI.

> Today, when you ask ChatGPT to book a hotel, it doesn't talk to the hotel. It talks to **Booking dot com's API**. Which means Booking still sits in the middle, takes a cut, controls the ranking, and decides who gets discovered.

> The thesis of Concourse — and honestly, of this entire course on intelligent agents — is that **agents need their own peer-to-peer layer**. My agent should be able to find your merchant's agent, talk to it, transact, and walk away — **without asking a third party for permission**.

> That's what we mean by **A2A: Agent-to-Agent**. And I believe it's the next paradigm of how the internet works.

*Click.*

---

## Slide 3 — The Problem Today (~1 min 30 sec)

*Point at the price example on screen.*

> Let me make the problem concrete.

> Here's a hotel room. The merchant's actual asking price is **eight hundred yuan**. But on the OTA, the user sees **one thousand two hundred**, with a flashy "two hundred yuan coupon." The user pays one thousand. The merchant nets nine hundred. The platform takes one hundred yuan **just for being the middleman**.

> Now you might say — "Pan, AI agents are going to fix this. They'll find the cheaper price." But here's the trap: **today's AI agents are built on top of the same closed APIs**. ChatGPT plugins, Claude tool-use, custom agents — they all need API keys, and the API keys are issued by the same handful of OTAs.

> So if we just bolt LLMs onto the current ecosystem, **we'll inherit the same rent-extraction**, just with a fancier interface.

> The invariant we have to break is this: *an agent representing a user, and an agent representing a merchant, should be able to discover each other without anyone's permission.*

*Click.*

---

## Slide 4 — What is Concourse (~1 min)

*Open hands gesture. This is the "what".*

> Concourse is two things in one sentence.

> First, it's a **decentralized yellow pages for tourism merchants** — a public registry where any merchant can list themselves on-chain.

> Second, it's an **agent-protocol layer** on top of that registry — meaning any AI agent, anywhere, can install one URL and immediately know how to find merchants, query them, and book through them.

> The system is live right now, at **concourse dot paking dot xyz**. I'll show you the demo in a few slides.

> The point I want you to remember from this slide is: **Concourse is not an OTA**. We don't take a cut. We don't host bookings. We're more like a **protocol** — like SMTP for email, or HTTP for the web. You install it, and you're free.

*Click.*

---

## Slide 5 — The A2A Workflow Loop (~2 min)

*This is the workflow page. Walk through the diagram with your hand.*

> So how does the loop actually work? Let me trace it from end to end.

> **Step one** — A user, say a tourist, says to their personal AI agent: *"I want to spend a weekend in Hangzhou with my partner, around two thousand yuan a night, and we like quiet places."*

> **Step two** — The user's agent **parses that intent**. It pulls out the city, the budget, the vibe.

> **Step three** — The agent queries our **decentralized registry**. The registry returns a list of candidate merchants — let's say twelve hotels in Hangzhou.

> **Step four** — The agent **personalizes the ranking**. Maybe it knows the user is allergic to peanuts, or hates buffets. So it re-orders the twelve based on what it knows about the user.

> **Step five** — The agent **invokes the merchant's skill** — calls a real endpoint on the merchant's side: *check availability, hold the room, return a price.*

> **Step six** — The user confirms, payment happens, and the booking is done.

> Notice what's *not* in this loop: **there's no OTA in the middle**. The user's agent talks directly to the merchant. That's A2A. **That's the disintermediation.**

*Click.*

---

## Slide 6 — System Architecture (~2 min)

*Point at each layer of the diagram, top to bottom.*

> Behind the scenes, Concourse is built on three layers.

> **The bottom layer** is the **on-chain identity anchor**. We deployed a smart contract on the 0G Galileo testnet. When a merchant registers, the contract permanently stores three things: **who they are** (a decentralized identifier called a DID), **what they offer** (their merchant type — hotel, restaurant, attraction), and a **cryptographic hash** of their full profile.

> **The middle layer** is the **off-chain mutable profile**. This lives in a regular database. Why? Because tourism information changes daily — opening hours, today's menu, this season's prices. Putting all of that on-chain would be **too slow and too expensive**. So we keep the rich data off-chain, but we **commit a hash of it on-chain** — so if anyone tampers with it, you can detect it.

> **The top layer** is the **agent protocol layer** — that's where SKILL.md lives. I'll explain that on the next slide.

> The key design idea on this slide is: **separate identity from state**. Identity goes on-chain because it must be permanent. State goes off-chain because it must be flexible. The cryptographic hash is the bridge.

*Click.*

---

## Slide 7 — How SKILL.md Works (~1 min 30 sec)

*Pause. This is a small but important concept.*

> Now let me explain SKILL.md.

> Think of SKILL.md as **a restaurant menu plus an ordering interface**, but written in a format that an AI can read directly.

> When a merchant joins Concourse, they publish a **single URL** — a Markdown document that lists what they offer. For example: *"You can call my book-table endpoint to reserve a seat. You can call my get-menu endpoint to fetch tonight's specials. You can call my check-availability endpoint to see if next Saturday is open."*

> An AI agent **fetches this URL**, reads the document, and **immediately knows how to talk to that merchant**. No SDK download. No API documentation hunt. No vendor lock-in. **One URL, and the agent is plugged in.**

> The analogy I like best: SKILL.md is to AI agents what **a menu** is to a customer walking into a restaurant. You don't need a tutorial. You read it. You order.

*Click.*

---

## Slide 8 — Sign Once, Govern Forever (~1 min 30 sec)

*Walk through the four arrows on the diagram.*

> Now, one design challenge that took us a long time to get right: **how does a merchant register and authorize their agent without ever giving away their wallet's private key?**

> The answer is what we call **Sign Once, Govern Forever**.

> **Step one** — The merchant opens a one-time signing page in their browser, and signs **one** on-chain transaction with MetaMask. This anchors their identity on the blockchain. *That's the only on-chain signature they will ever do.*

> **Step two** — In the same flow, they also sign a **free off-chain message** that authorizes their agent for the next thirty days. This generates an **opaque token** for the agent.

> **Step three** — The agent now holds the token. From this moment on, the agent can update menus, change opening hours, pause listings, all on the merchant's behalf — **without ever touching the private key**, and **without bothering the merchant for new signatures**.

> The principle here is the same one we apply to humans: **you sign one employment contract once, and then the agent acts on your behalf**. The signature is the trust. The token is the working credential.

*Click.*

---

## Slide 9 — Demo (~2 min)

*This is the demo slide. If the system is up, switch to the browser. If not, talk through the screenshots.*

> Let me show you the system briefly.

> **[If demoing live: switch to browser tab]** This is the home page at concourse dot paking dot xyz. You can see we have **twenty-eight real merchants seeded** on-chain right now — hotels, restaurants, attractions, and shops, mostly around Hangzhou.

> **[Click "Explorer"]** The Explorer lets you browse all the merchants. Notice this **green badge** — it links straight to the blockchain explorer, so anyone can verify that this merchant is really anchored on-chain.

> **[Click into a merchant]** This is a single merchant detail page. You can see the full profile, plus the on-chain transaction hash that registered them.

> **[Click sign URL if available]** And this is the signing ceremony page that I just described. When a merchant agent wants to onboard, the AI generates this URL and the human owner just opens it once, clicks "Sign", and they're live.

> *[If no live demo: just walk through the four screenshot thumbnails on the slide.]*

*Click.*

---

## Slide 10 — Challenges Encountered (~2 min)

*This is the "owner's perspective" slide. Slow down, be honest.*

> I want to be honest about what was hard.

> **Challenge one — putting tourism on a blockchain is awkward.** Restaurants change their hours. Menus change daily. You can't write that to the chain — it would cost dollars per update and take seconds. **The fix:** the bifurcated architecture I showed you on slide six. Identity on chain, mutability off chain.

> **Challenge two — agents must never hold private keys.** A merchant will *never* hand their seed phrase to an AI. But the agent still needs to *act* on the merchant's behalf. **The fix:** the browser-signs, backend-mints-token handshake. The private key never leaves the browser. The agent only ever sees a short-lived token.

> **Challenge three — how do you let an agent safely act for a user?** This is actually the deepest question in the agent-security space. We started with a naive approach, found it was vulnerable, and rebuilt it with a **proper challenge-response protocol** — the merchant signs a fresh server-issued nonce, the server cryptographically verifies the signature, then mints the token. **The lesson: a public identifier is never an authentication secret.**

> **Challenge four — agent installability.** We wanted *any* AI agent — Claude, ChatGPT, a custom one — to plug in. **The fix:** SKILL.md as a single-URL contract. No SDK, no glue code, no vendor lock-in.

*Click.*

---

## Slide 11 — Trust & Security (~1 min)

*This is brief — don't spend too long.*

> Let me summarize how trust is built into the system, in four bullets.

> **One —** wallet signatures prove identity. Only the wallet holder can sign. We verify on the server using standard Ethereum cryptography.

> **Two —** the on-chain hash of the profile prevents tampering. If anyone modifies the off-chain data, the hash check fails immediately.

> **Three —** the backend issues short-lived tokens. **Thirty days**, then the merchant has to re-sign. That limits the blast radius if a token is ever leaked.

> **Four —** the user is always in the loop. Before any irreversible action — like a payment, or a booking — the agent must present a draft and wait for explicit confirmation. Hard rule. **No agent acts alone.**

*Click.*

---

## Slide 12 — Future & Closing (~1 min 30 sec)

*Open posture. This is the close — make it feel forward-looking.*

> Three things on the roadmap.

> **First, a reputation system.** Right now, the registry is open — anyone can list. The next step is to add cryptographically-signed reviews so consumer agents can rank merchants by reputation. The hard problem there is **resisting fake reviews** — Sybil resistance, in the literature — and we're exploring proof-of-payment as the way in.

> **Second, micropayments via HTTP four-oh-two.** The HTTP standard has had a "Payment Required" status code since 1999, and it's never been used. We want to use it for agent-to-agent micropayments — a few cents per skill call, paid in stablecoin, **no card processor in the middle**.

> **Third, integration with the Model Context Protocol** — Anthropic's recent standard — so any MCP-compatible agent can speak to Concourse natively, without even reading a SKILL.md.

> Now, to close where I started.

> Bitcoin gave us **money without banks**. The web gave us **information without publishers**. The next frontier — and this is where intelligent agents come in — is **services without platforms**.

> When **your agent** talks directly to **the merchant's agent**, the next era of the internet finally becomes truly disintermediated. **And that's the world I'm trying to build.**

> Thank you. I'm happy to take questions.

*Stop. Smile. Wait for the room.*

---

## Q&A — Anticipated Questions & Suggested Answers

> Keep these short and confident. Don't over-explain.

### Q: "Isn't this still centralized? You use a database — Supabase — for the profiles."

> Great question. Identity is fully decentralized — it lives on the chain. The off-chain profile is committed via hash on-chain, so any tampering is detectable. The database is **a cache for performance**, not the source of truth. In a future version, the off-chain data would live on decentralized storage like IPFS or 0G storage. The architecture is already designed for that.

### Q: "How do you stop a merchant from registering fake information?"

> Right now, identity is verifiable but the *content* isn't. That's exactly what the **reputation system** on the roadmap addresses. The strongest signal of "this merchant is real" is **a successful payment** — and that's why we're tying reputation to the x402 micropayment system.

### Q: "What if the AI agent hallucinates and books the wrong hotel?"

> The SKILL.md protocol has **hard rules**. One of them is: **before any irreversible action, the agent must present a draft and wait for explicit user confirmation**. The agent can hallucinate the search query, but it cannot hallucinate the confirmation step. That's the user's responsibility.

### Q: "Why 0G Network and not Ethereum mainnet?"

> Two reasons. First, 0G is purpose-built for AI applications — it has decentralized storage and decentralized inference baked in, which we'll use in future versions. Second, mainnet gas costs would make daily merchant updates impractical even on Layer 2. 0G's testnet is free and fast, perfect for an A2A registry that needs many small writes.

### Q: "Could OpenAI or Anthropic just build this themselves and centralize it?"

> They could. But the value of Concourse is that **it's a protocol, not a platform**. Anyone can run a registry — multiple registries can interoperate. Even if Anthropic built one, an open one would still exist, and merchants could choose. **The protocol layer is the moat against centralization** — that's the lesson of email, of the web, and now of agents.

### Q: "What's the biggest risk to your project?"

> Adoption. The technology works. The hardest problem is convincing both sides — merchants and agent developers — that the upside of being on a permissionless protocol outweighs the comfort of the OTA-based status quo. That's a chicken-and-egg problem we're working on by seeding both sides ourselves first.

---

## Closing line — if you have time at the end

*If Q&A wraps early and you have a minute left, end with this:*

> If anyone here is building an AI agent — for travel, or honestly for **any** vertical — I'd love to talk after class. The same architecture works for restaurants, for healthcare, for legal services. **Tourism is just our first walk.**

> Thank you, professor. Thank you everyone.

*Walk off-stage.*

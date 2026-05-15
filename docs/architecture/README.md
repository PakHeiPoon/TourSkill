# Concourse Architecture Documents

Read order if you're new:

1. [00_PRINCIPLES.md](./00_PRINCIPLES.md) — eight principles. Every other doc points back here.
2. [01_TARGET_ARCHITECTURE.md](./01_TARGET_ARCHITECTURE.md) — the system in one picture.
3. [09_BUSINESS_MODEL.md](./09_BUSINESS_MODEL.md) — how this funds itself.

Then, in execution order:

4. [02_ERC8004_CONTRACT_DESIGN.md](./02_ERC8004_CONTRACT_DESIGN.md)
5. [03_AGENT_CARD_SPEC.md](./03_AGENT_CARD_SPEC.md)
6. [04_MERCHANT_AGENT_TEMPLATE.md](./04_MERCHANT_AGENT_TEMPLATE.md)
7. [05_X402_PAYMENT_FLOW.md](./05_X402_PAYMENT_FLOW.md)
8. [06_REPUTATION_DESIGN.md](./06_REPUTATION_DESIGN.md)
9. [07_MIGRATION_PLAN.md](./07_MIGRATION_PLAN.md)
10. [08_OPEN_QUESTIONS.md](./08_OPEN_QUESTIONS.md) — what isn't decided yet.

## Status

Phase A.1 (this doc set): ✅ complete, 2026-04-29
Phase A.2 (ERC-8004 contracts): ⏳ pending
Phase A.3 (merchant-agent template): ⏳ pending
Phase A.4 (frontend rewire): ⏳ pending
Phase B   (escrow + x402): ⏳ pending
Phase C   (reputation): ⏳ pending

## How to propose a change

If you disagree with a decision in any doc, open the doc, find the
specific paragraph, and write the alternative as a quote-block edit.
Reference [00_PRINCIPLES.md](./00_PRINCIPLES.md) — your alternative must either reinforce a
principle or explicitly justify the exception per the principle's
"how to use" section.

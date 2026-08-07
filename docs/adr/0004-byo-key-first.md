# ADR-0004 — BYO-key-first pricing

- **Status:** Accepted (2026-08-07)
- **Decider:** human (Phase 1 Q3)

## Context
Bootstrapped, all-four-surfaces-at-launch. Managed LLM inference COGS would make Pro/Team
margins thin or negative. Options: managed-only, BYO-key-only, hybrid with BYO-key as default.

## Decision
**BYO-key-first**: lower list prices, default to user-supplied provider keys. Managed keys are
a paid upsell, not the default. We meter only VM-hours, phone minutes, numbers, infra-derived
costs for BYO-key users (not tokens).

## Consequences
- (+) Near-zero LLM COGS for the majority of users → healthy margins at low prices.
- (+) Privacy story: prompts go direct to the user's chosen provider, not through us.
- (-) Lower ARPU; managed inference becomes a smaller revenue line.
- (-) Onboarding friction (user must obtain a provider key). Mitigated by clear setup wizard +
  a managed-key paid upsell for those who won't.
- (-) Harder to predict revenue (usage tied to user's own spend, not ours).

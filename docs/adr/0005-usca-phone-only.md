# ADR-0005 — US/CA phone only at launch

- **Status:** Accepted (2026-08-07)
- **Decider:** human (reconciliation step)

## Context
Bootstrapped + all-four-at-launch. Multi-region telephony adds per-region regulatory overhead
and infra cost before revenue. Options: US/CA only, US/CA + EU, multi-region.

## Decision
**US/CA only** at launch via Twilio. EU/UK/AU post-launch.

## Consequences
- (+) Simplest compliance (TCPA, A2P 10DLC), fastest to ship, lowest cost.
- (+) Lets us reach paid launch sooner — critical for bootstrapped survival.
- (-) Locks out non-US/CA customers from the voice surface at launch. They can still use the
  coding/local-agent surfaces; voice is an upsell they get later.
- (-) May disappoint early international interest. Mitigated by a waitlist + clear roadmap.

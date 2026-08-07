# ADR-0009 — Fully closed source

- **Status:** Accepted (2026-08-07)
- **Decider:** human (Phase 2 §12)

## Context
Open-sourcing the local runtime + skills spec could build community/marketplace trust, but
exposes IP and adds governance overhead. Bootstrapped, all-four-at-launch.

## Decision
**Fully closed source.** Community/marketplace trust earned via transparency (audit logs,
permission model, signed skills) rather than source openness.

## Consequences
- (+) Maximum IP control; no license/attribution obligations; no community governance overhead.
- (-) No open-source community flywheel; harder to earn trust for the local-agent runtime
  (users must trust our binary with system access). Mitigated by: per-skill permission grants,
  local audit log the user can read, signed skill packages, third-party security review (pre-SOC2).
- (-) Marketplace skills are harder to trust without source. Mitigated by sandboxing + perms.

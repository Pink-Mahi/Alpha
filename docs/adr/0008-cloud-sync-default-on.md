# ADR-0008 — Cloud memory sync ON by default

- **Status:** Accepted (2026-08-07)
- **Decider:** human (Phase 2 §12)

## Context
Memory must work cross-device for the convergence pitch (coding agent on desktop, voice agent
on a call, web dashboard). Options: cloud sync on by default (opt-out), off by default (opt-in).

## Decision
**Cloud sync ON by default**, opt-out per project. Memory encrypted at rest with tenant keys.

## Consequences
- (+) Better cross-device UX out of the box; stronger retention; voice agent can recall context.
- (-) More COGS (storage + embeddings). Mitigated by retention policies + tier-based quotas.
- (-) Weaker default privacy story. Mitigated by opt-out per project + clear UI + the fact that
  BYO-key users' prompts never touch us (only memory derived from their sessions does).

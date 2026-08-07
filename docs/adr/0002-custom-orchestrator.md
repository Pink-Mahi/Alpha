# ADR-0002 — Custom thin orchestrator over LangGraph/CrewAI

- **Status:** Accepted (2026-08-07)
- **Decider:** human (Phase 2 §12)

## Context
We need to orchestrate local + cloud + voice agents with checkpointing, replay, multi-provider
model routing, and strict per-tenant cost controls. Options: OpenAI Agents SDK, LangGraph,
CrewAI, or a custom thin orchestrator on top of provider SDKs.

## Decision
Build a **custom thin orchestrator** in Python on top of provider SDKs.

## Consequences
- (+) Full control over multi-provider routing, checkpoint format, replay, cost enforcement.
- (+) No framework lock-in; can adopt pieces of LangGraph later if useful.
- (-) We build checkpointing/state/replay/swarm ourselves — more work, more surface for bugs.
- (-) Slower initial velocity than adopting a framework. Mitigated by a minimal viable surface
  (single-agent + checkpoints first; swarm later).

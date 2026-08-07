# ADR-0010 — Monorepo with Bun + uv workspaces

- **Status:** Accepted (2026-08-07)
- **Decider:** defaulted in Phase 2 design

## Context
2–3 person team building TS apps + Python services + shared protocol (TS + Py). Options:
polyrepo, monorepo with a single package manager, monorepo with mixed workspace managers.

## Decision
**Single monorepo**. TS workspaces via Bun (`package.json` workspaces). Python workspaces via
`uv` (per-service `pyproject.toml`). Shared `agent-protocol` is dual-language: hand-authored
TS + Py types kept in sync with JSON Schema; codegen wired in CI later.

## Consequences
- (+) One repo, one PR per cross-cutting change; shared types stay in sync.
- (+) Bun + uv are both fast; minimal tooling overhead.
- (-) Mixed tooling means CI has two install paths (Bun + uv). Acceptable.
- (-) No single dependency graph across TS/Py. Acceptable — they share a schema, not code.

# Cascade Platform (working name — TBD)

Commercial agentic development platform + personal AI agent + real-time phone answering service.
One account, one memory, one bill. Four surfaces: agentic coding IDE, local personal agent,
cloud autonomous engineer, voice/phone agent.

> **Status:** M0 — Foundations (in progress). Not yet functional.

## Docs
- [Phase 1 Plan](./PHASE1_PLAN.md) — vision, features, business model, architecture, roadmap, decisions.
- [Phase 2 Design](./PHASE2_DESIGN.md) — detailed technical design, data model, APIs, implementation order.
- [Decision log & ADRs](./docs/adr/) — architecture decision records.

## Monorepo layout
```
apps/         desktop (VS Code fork), web (Next.js), tray-agent (Tauri)
services/     control-plane (Bun/TS), agent-control (Py), voice-control (Py), model-router (Py)
runtimes/     local-agent (TS), cloud-agent (Py, microVM image)
shared/       agent-protocol (schema + codegen), skills-sdk, ui-kit
infra/        terraform, microvm, voice-edge
packages/     billing-client, usage-meter, observability
docs/         adr, runbooks
```

## Workspaces
- TS workspaces: managed by Bun (`bun install` at root).
- Python workspaces: managed by `uv` (per-service `pyproject.toml`).

## Quick start (M0)
```bash
bun install                       # TS deps
cd services/control-plane && bun dev
cd services/model-router && uv sync && uv run fastapi dev src/main.py
```

## Tooling required
- Bun >= 1.3, Node >= 22, Python >= 3.12, `uv`, Terraform (only for `infra/` apply), git.

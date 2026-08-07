# ADR-0003 — Fork VS Code for the coding surface

- **Status:** Accepted (2026-08-07)
- **Decider:** human (Phase 2 §12)

## Context
The coding surface needs deep UI control (Command Center, agent panels, branded UX). Options:
VS Code extension, VS Code fork, custom web editor (Monaco + shell).

## Decision
**Fork VS Code** (Cursor/Windsurf pattern).

## Consequences
- (+) Full control of UX, command center, branding, agent-native panels.
- (+) Inherits VS Code's editor + extension ecosystem as a starting point.
- (-) Heavy maintenance burden tracking upstream VS Code releases. Mitigated by a weekly rebase
  cadence and a dedicated (small) effort.
- (-) Larger binary/build pipeline than an extension.
- (-) Distributing a fork has licensing/attribution obligations (MIT for VS Code — comply).

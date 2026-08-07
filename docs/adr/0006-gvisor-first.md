# ADR-0006 — Cloud agent isolation: gVisor first, Firecracker later

- **Status:** Accepted (2026-08-07)
- **Decider:** defaulted in Phase 2 §12 (gVisor-first)

## Context
Cloud autonomous agents need strong isolation (no egress, ephemeral, no cross-tenant). Options:
Firecracker microVMs (strongest, more ops), gVisor containers (simpler, slightly weaker),
plain containers (insufficient).

## Decision
Start with **gVisor containers** on EKS for M3; migrate to **Firecracker microVMs** when scale
or a security review demands it. The agent runtime image is identical either way.

## Consequences
- (+) Faster to ship; less bespoke infra; reuses K8s networking/tooling.
- (+) Migration path to Firecracker is preserved (same image, different sandbox).
- (-) gVisor has a syscall performance overhead and a small compat surface. Acceptable for
  agent workloads (mostly git/shell/HTTP-to-model-router).
- (-) Weaker isolation than Firecracker. Mitigated by no-egress network policy + per-task scoped
  tokens + ephemeral FS. Revisit before SOC2.

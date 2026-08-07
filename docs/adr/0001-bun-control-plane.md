# ADR-0001 — Use Bun as the TS control-plane runtime

- **Status:** Accepted (2026-08-07)
- **Decider:** human (Phase 2 §12 default)

## Context
The control plane is a TypeScript service (auth, org, billing, usage, marketplace, webhooks).
We need a fast, modern runtime with native TS support, a built-in test runner, and good ESM
support. Options: Node + Fastify, Bun + Hono, Deno + Hono.

## Decision
Use **Bun + Hono** for the control plane.

## Consequences
- (+) Native TS, no transpile step; fast startup; built-in `Bun.serve`; single tool for run/test/build.
- (+) Hono is runtime-agnostic (portable to Node/Deno if Bun stalls).
- (-) Bun is younger than Node; some libraries with Node-specific bindings may need shims.
- (-) Smaller ecosystem of deployment images vs Node. Mitigated by Docker.
- (-) `bun-types` occasionally lags TS versions.

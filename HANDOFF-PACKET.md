# Execution Handoff Packet

This packet is for the operator who is spinning up the clean rebuild repo and handing execution to a coding agent.

The rebuild should not happen inside the legacy repo. Treat this planning folder as the spec, move it into a fresh repo root, and build from zero.

---

## Recommended Repo Layout

Create a new repo root and copy this planning packet into it before any code is written:

```text
opndomain-rebuild/
  README.md
  WHAT.md
  WORKING-TRUTH.md
  IDEAS-BANK.md
  LAUNCH-CORE.md
  REBUILD-CONTRACT.md
  SCHEMA-CONTRACT.md
  PORTING-GUIDE.md
  HANDOFF-PACKET.md
  BOOTSTRAP-PROMPT.md
  .env.example
  PROJECTS/
    lead-agent.project.md
```

Do not copy the legacy `packages/` directory into the new repo. Legacy code is reference-only.

---

## Operator Setup

Before handing this to an agent, provide:

- a fresh git repo
- Cloudflare access for Workers, D1, R2, KV, and Durable Objects
- the values needed to fill `.env`
- a statement that the planning docs are authoritative

Do not provide the agent with instructions that weaken the phase gates, naming rules, or fresh-start schema posture.

---

## Environment Contract

Use `.env.example` as the operator checklist and create a real `.env` or secret store values from it.

Minimum categories the implementing agent needs:

- Cloudflare account + API token
- host/domain configuration for router, api, and mcp
- auth key material and session settings
- D1, R2, KV, and Durable Object binding names
- Workers AI model/binding config if semantic scoring is enabled in the first pass
- email verification provider settings if Phase 2 includes real verification

Prefer secret injection through Wrangler secrets or your deployment system rather than keeping production values in a committed `.env`.

---

## First-Day Instructions for the Agent

The implementing agent should receive these constraints explicitly:

1. Read the planning docs in `README.md` order before writing code.
2. Treat the planning folder as the default authority.
3. Use the legacy repo only for formulas, behavior lookup, output shapes, and operational invariants.
4. Preserve normalized naming in code, schema, DTOs, and routes.
5. Do not preserve legacy schema compatibility.
6. Do not skip phase gates.
7. If a better operational invariant is discovered, update the docs before treating it as canonical.

---

## How To Launch the Work

Recommended execution sequence:

1. Create the new repo root.
2. Copy this planning packet into the root.
3. Add `.env.example`.
4. Fill real secret values outside version control.
5. Initialize git.
6. Give the agent [BOOTSTRAP-PROMPT.md](D:\moltzdev\opndomain\BOOTSTRAP-PROMPT.md).
7. Instruct the agent to execute Phase 1 only until Phase 1 acceptance checks pass.

Do not start by saying "build the whole thing." That invites phase skipping.

---

## Phase 1 Deliverables

The first execution handoff should ask only for:

- pnpm monorepo bootstrap
- `packages/api`, `packages/router`, `packages/mcp`, `packages/shared`
- shared env/types/contracts
- Wrangler config and service bindings
- normalized launch-core migration baseline
- proof that all three Workers boot locally

Phase 1 is complete only when the hard acceptance checks in [lead-agent.project.md](D:\moltzdev\opndomain\PROJECTS\lead-agent.project.md) pass.

---

## Suggested Operator Message

Use this with the implementing agent:

```text
This repo is a fresh rebuild of opndomain. The planning docs in the repo root are the default authority.
Read the docs in README order before writing code.
Implement phase-by-phase. Do not skip phase gates.
Use normalized naming only.
Do not preserve legacy schema compatibility.
Use the legacy repo only for formulas, behavior lookup, and operational invariants.
If implementation reveals a better invariant, update the planning docs before treating it as canonical.
Start with Phase 1 only and stop only after the Phase 1 acceptance checks pass or a real blocker is found.
```

---

## Acceptance Check Before You Hand It Off

Before the agent starts, confirm:

- the new repo root contains the planning docs
- `.env.example` exists
- the agent has the needed Cloudflare/runtime credentials
- the legacy repo is available as reference, not as the working tree
- the agent has been told to start with Phase 1 only

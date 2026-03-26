# opndomain Reboot Planning Folder

This folder is the sole planning handoff surface for rebuilding opndomain. It contains no runnable code, no dependencies, and no build steps. It is a structured knowledge packet for a fresh coding agent.

If anything in this folder conflicts with the legacy repo's language or structure, this folder wins.

Selection rule: Preserve systems that materially improve protocol quality, protocol operation, or public protocol outputs. Do not port systems solely because they already exist in the legacy repo.

---

## Reading Order

| # | File | What It Contains |
|:-:|------|-----------------|
| 1 | [WHAT.md](./WHAT.md) | Canonical product definition: thesis, primitives, templates, scoring overview, trust tiers, visual identity |
| 2 | [WORKING-TRUTH.md](./WORKING-TRUTH.md) | Honest assessment of the current repo: what works, design wins to emulate, drift/residue to avoid, technical debt |
| 3 | [IDEAS-BANK.md](./IDEAS-BANK.md) | All protocol ideas, constants, formulas, weight profiles, and thresholds - the centerpiece document |
| 4 | [LAUNCH-CORE.md](./LAUNCH-CORE.md) | Minimal entity model, state machines, data flows, worked example, essential schema, cron responsibilities |
| 5 | [REBUILD-CONTRACT.md](./REBUILD-CONTRACT.md) | Canonical implementation contract: repo shape, package boundaries, naming rules, launch/admin scope, drift rule, handoff checklist |
| 6 | [SCHEMA-CONTRACT.md](./SCHEMA-CONTRACT.md) | Normalized launch-core schema contract: table set, naming posture, authoritative vs materialized boundaries, legacy mapping |
| 7 | [PORTING-GUIDE.md](./PORTING-GUIDE.md) | Port Now / Port Later / Reference Only / Do Not Resurrect classifications with legacy source paths |
| 8 | [PROJECTS/lead-agent.project.md](./PROJECTS/lead-agent.project.md) | Primary execution handoff: mission, stack, architecture, hard phase gates, quality bar, operational constraints |

---

## Build From This Folder

Read the docs in the listed order before writing code.

- This planning folder is the default authority for the rebuild.
- The legacy repo is reference material for formulas, behavior lookup, and implementation details only.
- When docs and code disagree, resolve the case deliberately and update the docs before allowing implementation drift.
- Do not reintroduce storefront, social, chat, or messaging residue into the new build.
- Normalized naming is required in all new code, schema, and public-facing contracts.

---

## What This Is Not

- **Not a codebase.** No TypeScript, no package.json, no wrangler.toml. The new repo starts fresh.
- **Not the old repo.** This folder lives inside the legacy repo for convenience but is independent of it.
- **Not runnable implementation.** It defines what to rebuild, but ships no working app.
- **Not exhaustive documentation.** It preserves the institutional knowledge most likely to be lost in a rewrite - constants, formulas, design rationale, and architectural patterns.
- **The authoritative rebuild spec.** For the rebooted implementation, this folder is the planning authority.

---

## Legacy Repo Source Paths Worth Consulting

These files in the parent repo contain implementation details beyond what this folder captures:

| Area | Path |
|------|------|
| Scoring formulas | `packages/api/src/lib/scoring-composite.ts` |
| Heuristic patterns | `packages/api/src/lib/scoring-heuristics.ts` |
| Vote aggregation | `packages/api/src/lib/scoring-votes.ts` |
| Template definitions | `packages/api/src/lib/arena-prompts.ts` |
| Round orchestration | `packages/api/src/lib/arena-orchestrator.ts` |
| Topic state machine | `packages/api/src/lib/topic-lifecycle.ts` |
| Domain reputation | `packages/api/src/lib/domain-reputation.ts` |
| Global reputation | `packages/api/src/lib/global-reputation.ts` |
| Claim extraction | `packages/api/src/lib/claim-extraction.ts` |
| Epistemic engine | `packages/api/src/lib/epistemic-engine.ts` |
| DO hot-path | `packages/api/src/durable-objects/topic-state.ts` |
| Auth (OAuth/JWT) | `packages/api/src/routes/auth-web.ts`, `oauth.ts` |
| MCP tools | `packages/mcp/src/tools/*.ts` |
| Router + landing | `packages/router/src/index.ts`, `landing.ts` |
| Shared schemas | `packages/shared/src/schemas.ts`, `hosts.ts` |
| Whitepaper | `docs/whitepaper.md` |

---

## Execution Artifacts

These files are for the operator launching the clean rebuild:

- [HANDOFF-PACKET.md](./HANDOFF-PACKET.md) - operator instructions for creating the new repo and handing execution to an agent
- [BOOTSTRAP-PROMPT.md](./BOOTSTRAP-PROMPT.md) - copy-paste bootstrap prompt for the implementing agent
- [.env.example](./.env.example) - environment and binding checklist for the new repo

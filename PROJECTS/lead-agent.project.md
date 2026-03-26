# Lead Agent Project

You are rebuilding opndomain - a public research protocol where AI agents collaborate on bounded research questions, get scored, and build verifiable domain reputation.

This folder is your planning surface. It contains no runnable code. Read it in order, then build.

---

## Mission

Build a clean, production-ready implementation of the opndomain protocol. The old repo works but carries significant identity drift (storefront/commerce residue) and technical debt (giant files, mixed naming, schema drift). Your job is to rebuild the protocol-critical systems from scratch using the institutional knowledge preserved in this folder.

---

## Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Cloudflare Workers |
| Database | D1 (SQLite at edge) |
| Object Storage | R2 |
| Real-time | Durable Objects (one per topic) |
| Cache | KV |
| Language | TypeScript |
| Package Manager | pnpm (monorepo) |
| API Framework | Hono |
| Agent Interface | MCP SDK (`createMcpHandler`) |

---

## Architecture

```text
Router (*.opndomain.com)
  - subdomain dispatch
  - landing and topic pages
  - 3-layer cache
  -> service binding ->
API (api.opndomain.com)
  - Hono REST + OAuth 2.1
  - scoring and orchestration
  - cron jobs
  -> service binding ->
MCP (mcp.opndomain.com)
  - agent tool interface
  - typed tools

Shared resources: D1 database, R2 bucket, KV namespace
Per-topic: Durable Object instance (hot-path batching)
```

---

## Reading Order

Read these files in this sequence before writing code:

1. **WHAT.md** - Product definition, primitives, templates, scoring overview, trust tiers
2. **WORKING-TRUTH.md** - What works in the old repo, design wins to emulate, drift to avoid
3. **IDEAS-BANK.md** - All protocol constants, formulas, thresholds, weight profiles (the centerpiece)
4. **LAUNCH-CORE.md** - Entity model, state machines, data flows, essential schema
5. **REBUILD-CONTRACT.md** - Canonical repo shape, package boundaries, naming rules, admin/launch scope, drift rule
6. **SCHEMA-CONTRACT.md** - Normalized launch-core schema contract and legacy-name mapping
7. **PORTING-GUIDE.md** - What to port, what to skip, in what order
8. **This file** - Hard phase gates and quality bar

---

## Build Phases

### Phase 1: Foundation
- **Required subsystems**
  - pnpm monorepo setup: `packages/api`, `packages/mcp`, `packages/router`, `packages/shared`
  - shared types and schemas: trust tiers, round types, lifecycle enums, DTOs, env bindings, scoring constants
  - normalized launch-core D1 schema and migration runner
  - Wrangler config for 3 Workers + service bindings + shared resources
  - package-local dev/build/test scaffolding needed to unblock downstream work
- **Not yet**
  - no auth flows
  - no topic lifecycle logic
  - no scoring pipeline
  - no router public pages beyond boot verification
  - no MCP workflow behavior beyond boot verification
- **Dependency rule**
  - Do not start identity, topic, or contribution work before the shared schemas, env contract, and migrations runner are stable.
- **Hard acceptance checks**
  - the repo contains exactly the four launch packages and each package responsibility matches the rebuild contract
  - a fresh checkout can install, typecheck, and start all 3 Workers locally
  - normalized launch-core migrations apply cleanly from empty state
  - service bindings and resource bindings are declared and resolvable in local/dev config
  - shared contracts compile without importing runtime orchestration code
- **Phase output artifacts**
  - monorepo package layout
  - initial normalized migration set
  - shared schema/type contract
  - environment contract and Wrangler binding map

Phase 1 is not complete until these artifacts exist and the acceptance checks pass.

### Phase 2: Identity & Topics
- **Required subsystems**
  - OAuth 2.1 auth: register, email verify, token exchange, JWT sessions
  - agent and being identity flows with trust tier assignment
  - domain creation/seed path
  - topic creation with template resolution
  - topic state machine: `open -> countdown -> started -> stalled -> closed`
  - cadence families: scheduled, quorum, rolling
  - round creation with canonical authority round metadata persisted in `round_configs`
  - topic-level `min_trust_tier` enforcement
- **Not yet**
  - no contribution ingest
  - no scoring pipeline
  - no vote logic
  - no verdict generation
  - no public artifact pipeline
  - no selective enrollment execution or fallback-chain runtime (`top_n -> previous_participants -> open_enrollment`)
  - no completion-style runtime beyond deadline-driven advancement
- **Dependency rule**
  - Do not start contribution ingest before identity, topic creation, and round creation contracts are stable.
- **Hard acceptance checks**
  - an agent can register, verify, mint tokens, and operate a being through the API contract
  - domains exist and topics can be created against them with supported templates
  - cron or sweep logic transitions topics across cadence families correctly
  - rounds are created with canonical authority metadata for round kind, enrollment intent, completion style, and vote requirements
  - Phase 2 runtime behavior is explicit: open topic-member enrollment only, deadline-driven round advancement only
  - `min_trust_tier` is enforced on join and contribute eligibility paths
- **Phase output artifacts**
  - auth/session contract
  - beings/domains/topics API contract
  - lifecycle transition functions
  - round creation and eligibility contract

Phase 2 is not complete until these artifacts exist and the acceptance checks pass.

### Phase 3: Contribution Ingest
- **Required subsystems**
  - transcript guardrail pipeline with graduated response, transcript visibility, sanitization, and restriction-aware behavior
  - heuristic scoring: substance formula, role detection, echo/meta detection
  - semantic scoring: relevance, novelty, reframe
  - Durable Object hot-path buffering with timed D1 flush
  - contribution visibility states and persistence path
  - snapshot sync for topic transcript and topic state after meaningful changes
- **Not yet**
  - no trust-weighted vote flow
  - no composite vote blending
  - no domain reputation application at score time
  - no terminal verdict generation
- **Dependency rule**
  - Do not start voting or reputation blending before contribution ingest, scoring persistence, and snapshot sync are stable.
- **Hard acceptance checks**
  - a contribution can be submitted through the intended ingress path and survives guardrail evaluation correctly
  - heuristic and semantic scores persist in the authoritative score table
  - Durable Object buffering flushes correctly within contract limits and preserves idempotency
  - transcript snapshot is written before state snapshot
  - topic transcript/state outputs stay synchronized after meaningful lifecycle changes
- **Phase output artifacts**
  - ingest pipeline contract
  - scoring persistence contract
  - Durable Object buffering/flush contract
  - snapshot ordering invariant

Phase 3 is not complete until these artifacts exist and the acceptance checks pass.

### Phase 4: Voting & Composite
- **Required subsystems**
  - vote casting with trust-weighted aggregation
  - vote influence ramp and adaptive vote maturity thresholds
  - round-type weight profiles across live and shadow scoring
  - scoring profile adjustments by template
  - role-round alignment multipliers
  - shadow scoring versioning and persistence
  - agreement novelty dampening and echo/meta penalties in final composite behavior
  - composite final score computation including vote blending
- **Not yet**
  - no terminal verdict publication
  - no final public artifact generation
  - no launch admin surface
- **Dependency rule**
  - Do not start closure/public output work before vote aggregation, composite scoring, and shadow scoring are stable.
- **Hard acceptance checks**
  - vote eligibility excludes invalid targets and self-votes
  - weighted vote scores and maturity thresholds behave as specified
  - live and shadow scoring both persist with independent versions
  - final composite scores match expected behavior for supported round/scoring profiles
  - at least one full `debate_v2` run with 3+ agents demonstrates stable end-to-end vote blending
- **Phase output artifacts**
  - vote aggregation contract
  - composite scoring contract
  - shadow scoring contract
  - validated profile/round weighting behavior

Phase 4 is not complete until these artifacts exist and the acceptance checks pass.

### Phase 5: Closure & Public Output
- **Required subsystems**
  - domain reputation: Welford variance, 70/30 blend, decay, floor
  - reputation boost on initial score
  - round completion checks: aggressive, patient, quality_gated
  - round reveal behavior
  - topic terminalization sequence
  - verdict generation with confidence levels
  - closed-topic public artifact write/delete behavior
  - cache invalidation for landing/topic/domain/verdict surfaces
- **Not yet**
  - no router-hosted admin workflows beyond what is required to validate API repair hooks
  - no full MCP end-to-end launch surface validation
  - no deferred analytics/reporting surfaces
- **Dependency rule**
  - Do not start launch surface completion before closure, artifacts, and cache invalidation are stable.
- **Hard acceptance checks**
  - a topic can complete end-to-end and produce a terminal state consistent with the closure contract
  - reputation updates apply correctly and respect decay/boost rules
  - verdicts are generated and tied to the closed topic state
  - artifact write/delete behavior follows terminalization quality rather than closed status alone
  - cache invalidation leaves public topic/domain/landing state correct after closure and repair flows
- **Phase output artifacts**
  - reputation update contract
  - terminalization contract
  - verdict/public artifact contract
  - cache invalidation contract

Phase 5 is not complete until these artifacts exist and the acceptance checks pass.

### Phase 6: Launch Surfaces
- **Required subsystems**
  - MCP tool registration and end-to-end participation flow
  - `participate()` one-call entry point
  - router subdomain dispatch and 3-layer cache
  - landing page with network stats
  - topic pages with transcript rendering
  - domain and being directories
  - verdict / closed-topic public surfaces
  - router-hosted protected admin surface for launch workflows
- **Not yet**
  - no deferred analytics/reporting dashboards
  - no comfort tooling beyond launch-admin necessities
  - no later-layer claims, predictions, harness, or graph surfaces
- **Dependency rule**
  - Do not call the rebuild launch-ready before both the public surface and router-hosted admin surface are complete.
- **Hard acceptance checks**
  - an MCP client can authenticate, participate in a topic, and observe the resulting public state through the router
  - landing, topic, domain, being, and verdict surfaces all render from the correct data contracts
  - protected admin routes exist in the router and successfully drive authoritative repair operations
  - router reads public outputs and APIs without reimplementing orchestration logic
  - cache behavior is consistent with public correctness under topic mutations and repairs
- **Phase output artifacts**
  - end-to-end MCP flow
  - complete public router surface
  - protected launch-admin surface
  - launch readiness verification evidence

Phase 6 is not complete until these artifacts exist and the acceptance checks pass.

---

## v1 Non-Goals

Do not build these in v1. They are documented in IDEAS-BANK.md for later:

- **Claims** - Claim extraction, graph, resolution, epistemic adjustment. Preserve the ideas, but defer implementation until the v1 topic loop is stable.
- **Predictions** - In-topic prediction rounds and scoring
- **Harness** - Multi-agent harness and labs automation
- **Moderation tooling** - Broader policy workflows, text restrictions, terms violations, and operator moderation surfaces after the protocol loop is stable
- **Participation reliability** - Per-being reliability tracking and incident recording
- **Forecasts** - Standalone prediction markets
- **Sybil detection** - Cluster detection and vote modifier updates
- **Admin dashboards** - Topic health views, analytics, reporting, graph exports
- **Global reputation** - Aggregate rollup beyond domain reputation

---

## Quality Bar

### Named Constants
Every magic number must be a named constant with a comment explaining its purpose. No `0.82` buried in a formula - use `SUBSTANCE_WEIGHT_NO_SEMANTICS = 0.82`.

### Explicit State Transitions
State machines must be explicit. No implicit transitions inferred from NULL checks. Topic status, round status, and trust tier all have defined transition functions.

### updated_at Everywhere
Every mutable table has an `updated_at` column, updated on every write. No exceptions.

### No Magic Hidden Heuristics
If a scoring formula has a special case (like echo detection or agreement dampening), it must be documented as a named function with a clear docstring explaining the rationale.

### Single Responsibility Files
No 1500-line orchestrator files. Break into focused modules: round creation, round completion, round advancement, topic closure, verdict generation.

### Consistent Entity Naming
Pick one name per concept and use it everywhere:
- "topic" (not "channel" or "arena" interchangeably)
- "contribution" (not "message")
- "being" (not "agent" when referring to the participant identity)

---

## Operational Constraints

### D1
- Batch limit: 100 statements per `db.batch()` call (leave margin, use 80)
- Row size: 1MB max per row
- Total DB size: 10GB (free tier) or 50GB (paid)
- No foreign key enforcement at runtime (define them for documentation, don't rely on them)

### Workers
- CPU time: 30ms (free) or 30s (paid, but aim for < 5s)
- Memory: 128MB
- Subrequest limit: 1000 per invocation
- No persistent state between invocations (use D1/KV/DO)

### Durable Objects
- One instance per topic (keyed by topic ID)
- SQLite storage for hot-path buffering
- Alarm API for timed flushes (schedule at most one alarm at a time)
- Hibernation: DO sleeps when no alarms and no active WebSocket connections

### KV
- Eventually consistent reads (propagation can take up to 60s)
- 25MB max value size
- Use for cache, not for authoritative data

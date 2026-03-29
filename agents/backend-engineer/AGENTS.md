# AGENTS.md — Backend Engineer

## Session Startup

1. Your identity and boundaries are defined in SOUL.md (already loaded by Paperclip — do not search for the file)
2. Check for assigned tasks from the CTO
3. Pull latest code and review recent changes to `packages/api/`
4. Read any referenced files before starting work

## Your Package: `packages/api`

Cloudflare Worker at api.opndomain.com. Hono HTTP framework. Owns all writes, orchestration, scoring, lifecycle, and auth.

```
packages/api/
  src/
    index.ts              — Worker entry, Hono app, route mounting, cron handler, DO export
    routes/               — HTTP route handlers (thin: validate → service → JSON)
      auth.ts             — OAuth 2.1, magic links, sessions
      beings.ts           — Being CRUD
      contributions.ts    — Contribution submission pipeline
      domains.ts          — Domain listing/detail
      topics.ts           — Topic CRUD, enrollment, rounds
      votes.ts            — Vote casting
      internal.ts         — Service-to-service endpoints
      meta.ts             — /healthz, /meta
    services/             — Business logic
      auth.ts             — JWT verification, session creation, OAuth exchange
      beings.ts           — Being creation, trust tier logic
      domains.ts          — Domain seeding, lookup
      lifecycle.ts        — Topic state machine: sweep, round advancement
      topics.ts           — Topic creation, enrollment, round planning
      votes.ts            — Vote casting, weight calculation
      reputation.ts       — Domain reputation, decay, rollups
      terminalization.ts  — Topic closure, verdict generation, artifact creation
      presentation.ts     — Snapshot reconciliation, retries
      invalidation.ts     — KV cache purge on mutations
      artifacts.ts        — R2 artifact storage
      email.ts            — SES email (magic links, verification)
      oauth.ts            — External OAuth providers
    lib/                  — Utilities
      db.ts               — firstRow, allRows, requireRow, batchRun, runStatement
      env.ts              — Zod-parsed environment
      errors.ts           — ApiError + helpers: badRequest, notFound, forbidden, unauthorized, conflict, rateLimited
      http.ts             — jsonData, jsonList, parseJsonBody, apiErrorMiddleware
      ids.ts              — createId(prefix), createClientId, createSecret, createNumericCode
      jwt.ts              — RS256 sign/verify
      crypto.ts           — WebCrypto key imports
      cookies.ts          — Session cookies
      rate-limit.ts       — KV-backed hourly rate limiting
      time.ts             — Time utilities
      trust.ts            — meetsTrustTier() comparison
      visibility.ts       — Contribution visibility rules
      admin.ts            — Admin auth checks
      snapshot-sync.ts    — R2 snapshot sync with retry queue
      scoring/            — 3-layer scoring engine
        index.ts          — scoreContribution() orchestrator
        heuristic.ts      — Substance scoring (text analysis)
        semantic.ts       — Workers AI embeddings (relevance, novelty, reframe)
        composite.ts      — Weighted blend
        roles.ts          — Role detection (evidence, critique, synthesis, etc.)
        votes.ts          — Vote score integration
        constants.ts      — All scoring constants/patterns
      guardrails/         — Content safety
        pipeline.ts       — runGuardrailPipeline() → risk score → decision
        risk-patterns.ts  — Pattern-based risk scoring
        restrictions.ts   — Active restriction lookup
        sanitize.ts       — Body sanitization
      do/                 — Durable Object
        topic-state.ts    — TopicStateDurableObject: buffered writes, alarm flush
        flush.ts          — flushPendingTopicState(): DO SQLite → D1
        schema.ts         — DO-internal schema and typed requests
    db/                   — Schema and migrations
      schema.ts           — Migration registry
      schema.generated.ts — SQL from migration files
      001-005 .sql files
    data/
      domain-seeds.ts     — Initial domain seeds
```

## Key Patterns

### Route → Service Separation

Routes are thin. They:
1. Parse input with `parseJsonBody(Schema, await c.req.json())`
2. Authenticate with `authenticateRequest(env, request)`
3. Call a service function
4. Return `jsonData(c, result)` or `jsonList(c, results)`

Business logic lives in `services/`. If you're writing business logic in a route, move it.

### Error Handling

Throw via helpers — never construct ApiError manually in routes:
```ts
badRequest("invalid_round_kind", "Round kind 'foo' is not valid.")
notFound("Topic not found.")
forbidden("Being does not meet min_trust_tier.")
unauthorized("Token is expired.")
conflict("Handle is already taken.")
rateLimited("Too many registrations this hour.")
```

The `apiErrorMiddleware` catches these and returns `{ error, code, message, details }`.

### Response Format

- Single item: `jsonData(c, item)` → `{ data: T }`
- List: `jsonList(c, items, cursor?)` → `{ data: T[], cursor? }`

### ID Generation

- Entities: `createId("topic")` → `topic_<uuid>`
- Agents: `createClientId()` → `cli_<uuid>`
- Secrets: `createSecret(24)` → hex string
- Verification codes: `createNumericCode(6)` → 6-digit string

### Database Access

```ts
const row = await firstRow<MyType>(db, "SELECT ... WHERE id = ?", id);
const rows = await allRows<MyType>(db, "SELECT ... WHERE status = ?", status);
const row = await requireRow<MyType>(db, sql, id); // throws 404 if null
await runStatement(db.prepare(sql).bind(...values)); // catches UNIQUE violations → conflict()
```

### Authentication

`authenticateRequest(env, request)` verifies JWT from `Authorization: Bearer <token>`, returns `{ agentId, scope }`.

### Validation

All input via Zod schemas from `@opndomain/shared`:
```ts
const body = parseJsonBody(ContributionSubmissionSchema, await c.req.json());
```

## Contribution Pipeline (Critical Path)

1. Authenticate → verify being ownership + trust tier
2. Validate topic/round state (topic `started`, round `active`)
3. Check enrollment (being is topic member)
4. Sanitize body → `sanitizeContributionBody()`
5. Guardrails → `runGuardrailPipeline()` → risk score → decision
6. Score → `scoreContribution()` → heuristic + semantic + composite
7. Write to DO → buffered, flushed to D1 every 15s
8. Return scored response

## Scoring Engine

Three layers blended into composite:

1. **Heuristic** (deterministic): sentence count, unique term ratio, specificity, evidence patterns, vagueness penalties → substanceScore (0-100)
2. **Semantic** (AI): Workers AI embeddings → relevance, novelty, reframe
3. **Composite**: weighted blend per scoring profile. Role bonus. Reputation factor (capped 20%). Dual live (v6) / shadow (v7) pipelines.

## Topic Lifecycle

Cron-driven at `*/5`:
- Evaluate advancement per cadence family (aggressive/patient/quality_gated)
- Advance rounds → start next → if last round → terminalize
- Terminalization: force-flush DO, generate verdict, create artifacts, close topic

## Durable Object Boundary

The DO buffers contributions and votes in internal SQLite, then flushes to D1 in batch every 15s via alarm. It does not contain business logic. Do not put scoring, lifecycle, or guardrail logic in the DO.

## Testing

Node.js built-in test runner:
```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
```

Fake bindings for integration tests: `FakeDb`, `FakeCache`, `FakeBucket`. Test through `createApiApp().request()` for HTTP-level tests.

Test files live alongside source: `services/auth.test.ts`, `routes/contributions.test.ts`.

## Database Migrations

5 existing migrations in `src/db/`. New migrations: `006_descriptive_name.sql` → add to `schema.ts` → regenerate `schema.generated.ts`.

Schema naming: plural tables, protocol language. No legacy names.

## Task Execution

When you receive a task from the CTO:
1. Read the task specification completely
2. Read all referenced files before making changes
3. Implement exactly what was specified
4. Write tests for non-trivial logic (scoring, lifecycle, guardrails)
5. Run `pnpm --filter @opndomain/api test`
6. Report completion with list of files changed

## Red Lines

- Never put business logic in Durable Objects
- Never skip guardrail checks on contributions
- Never modify scoring constants outside `@opndomain/shared`
- Never write migrations with legacy naming
- Never expose internal error details in responses
- Never bypass trust tier checks
- Never add features beyond what was tasked
- Never modify files outside `packages/api/` and `packages/shared/` unless the task explicitly requires it

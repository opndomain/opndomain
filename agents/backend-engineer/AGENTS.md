# AGENTS.md — Backend Engineer

## Session Startup

1. Your identity and boundaries are defined in SOUL.md (already loaded by Paperclip — do not search for the file)
2. Check for assigned tasks from the CTO
3. If you have a task, run `git pull` before starting work
4. Read any referenced files before starting work

## Your Package: `packages/api`

Cloudflare Worker at api.opndomain.com. Hono HTTP framework. Owns all writes, orchestration, scoring, lifecycle, and auth. Use `ls` to explore the file tree — don't memorize it.

Key areas: `routes/` (thin HTTP handlers), `services/` (business logic), `lib/scoring/` (3-layer scoring), `lib/guardrails/` (content safety), `lib/do/` (Durable Object), `db/` (migrations).

## Key Patterns

**Route → Service:** Routes parse input (`parseJsonBody`), authenticate (`authenticateRequest`), call a service, return `jsonData`/`jsonList`. Business logic lives in `services/`, never in routes.

**Errors:** Use typed helpers: `badRequest()`, `notFound()`, `forbidden()`, `unauthorized()`, `conflict()`, `rateLimited()`. Never throw generic errors.

**Responses:** `{ data: T }` for single items, `{ data: T[], cursor? }` for lists.

**IDs:** `createId("topic")` → `topic_<uuid>`. Agents: `createClientId()`.

**DB:** `firstRow()`, `allRows()`, `requireRow()` (throws 404), `runStatement()` (catches UNIQUE → conflict).

**Auth:** `authenticateRequest(env, request)` → `{ agentId, scope }`.

**Validation:** `parseJsonBody(ZodSchema, await c.req.json())`. Schemas from `@opndomain/shared`.

## Contribution Pipeline (Critical Path)

1. Authenticate → verify being ownership + trust tier
2. Validate topic/round state (topic `started`, round `active`)
3. Check enrollment (being is topic member)
4. Sanitize → `sanitizeContributionBody()`
5. Guardrails → `runGuardrailPipeline()` → decision (allow/queue/quarantine/block)
6. Score → `scoreContribution()` → heuristic + semantic + composite
7. Write to DO → buffered, flushed to D1 every 15s
8. Return scored response

## Scoring (3 layers → composite)

1. **Heuristic:** text analysis → substanceScore (0-100)
2. **Semantic:** Workers AI embeddings → relevance, novelty, reframe
3. **Composite:** weighted blend per scoring profile + role bonus + reputation (capped 20%). Dual live/shadow pipelines.

## Topic Lifecycle (cron `*/5`)

Evaluate advancement per cadence family (aggressive/patient/quality_gated) → advance rounds → terminalize when last round completes.

## DO Boundary

The Durable Object buffers and flushes. No business logic in DO. Ever.

## Testing

`node:test` + `node:assert/strict`. Fakes: `FakeDb`, `FakeCache`, `FakeBucket`. HTTP tests via `createApiApp().request()`. Tests live alongside source.

## Migrations

Sequential in `src/db/`. New: `006_name.sql` → update `schema.ts` → regenerate `schema.generated.ts`. Plural tables, protocol language, no legacy names.

## Task Execution

1. Read the task spec completely
2. Read all referenced files before changing anything
3. Implement exactly what was specified — no extras
4. Write tests for non-trivial logic
5. Run `pnpm --filter @opndomain/api test`
6. Report completion with files changed

## Session End (skip if idle / no work was done)

Append exactly one line to `agents/sessions/SESSION-LOG.jsonl`. No pretty-printing, no multi-line.
Format: `{"ts":"[ISO]","agent":"backend-engineer","task_id":"[id or none]","action":"[implementation|testing|blocker|completion]","summary":"[one sentence]","outcome":"[success|partial|failed|blocked]","blockers":[...],"tool_calls":[n],"tags":[...]}`

## Red Lines

- Never put business logic in Durable Objects
- Never skip guardrail checks on contributions
- Never modify scoring constants outside `@opndomain/shared`
- Never write migrations with legacy naming
- Never expose internal error details in responses
- Never bypass trust tier checks
- Never add features beyond what was tasked
- Never modify files outside `packages/api/` and `packages/shared/`

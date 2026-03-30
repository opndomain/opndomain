# AGENTS.md — Frontend Engineer

## Session Startup

1. Your identity and boundaries are defined in SOUL.md (already loaded by Paperclip — do not search for the file)
2. Check for assigned tasks from the CTO
3. If you have a task, run `git pull` before starting work
4. Read any referenced files before starting work

## Your Package: `packages/router`

Cloudflare Worker at opndomain.com. Server-rendered HTML via Hono. No React, no SPA. Use `ls` to explore — don't memorize the tree.

Key files: `index.ts` (routes), `landing.ts` (landing page), `lib/layout.ts` (page shell), `lib/tokens.ts` (CSS), `lib/render.ts` (HTML helpers), `lib/session.ts` (API proxy), `lib/cache.ts` (KV).

## How Pages Work

Route receives request → fetches data (via `apiJson()` or D1 read) → calls render function returning HTML string → wraps with `renderPage(title, body, description?, pageStyles?)` → response.

## Design System

**CSS Variables:** `--bg: #f3f0e8` (warm paper), `--surface: #fbfaf6`, `--border: #d8d2c7`, `--cyan: #4d6780` (protocol accent), `--text: #17191d`, `--text-dim: #4d5460`, `--text-muted: #6d7480`.

**Fonts:** Newsreader (headlines), Inter (body), IBM Plex Mono (scores/labels/metadata).

**Identity:** Warm editorial base, not dark consumer chrome. Protocol accents for state legibility. Data-dense but never cluttered. Document-like surfaces.

**Breakpoints:** 640px (mobile), 800px (tablet).

## Data

| Primitive | Key display fields |
|-----------|-------------------|
| Being | handle, trust tier, domain reputation, bio |
| Domain | name, active topics, top beings |
| Topic | title, status, round progress, participants |
| Contribution | content, composite score, role, breakdown |
| Verdict | summary, confidence, strongest contributions/critiques |

**From API_SERVICE:** `apiJson(env, "/v1/...")` for API-served data.
**From D1 (read-only):** Direct queries for presentation data.
**From KV:** `serveCachedHtml(env, key)` for pre-rendered pages.

## Task Execution

1. Read the task spec completely
2. Read all referenced files before changing anything
3. Implement exactly what was specified — no extras
4. Build: `pnpm --filter @opndomain/router build`
5. Test: `pnpm --filter @opndomain/router test`
6. Verify responsive at 640px and 800px
7. Report completion with files changed

## Session End (skip if idle / no work was done)

Append exactly one line to `agents/sessions/SESSION-LOG.jsonl`. No pretty-printing, no multi-line.
Format: `{"ts":"[ISO]","agent":"frontend-engineer","task_id":"[id or none]","action":"[implementation|testing|blocker|completion]","summary":"[one sentence]","outcome":"[success|partial|failed|blocked]","blockers":[...],"tool_calls":[n],"tags":[...]}`

## Red Lines

- Never add dark mode; never use bright saturated colors
- Never add client-side frameworks; never write to D1
- Never bypass `esc()` for user content
- Never add features beyond what was tasked
- Never modify files outside `packages/router/` unless task requires shared changes

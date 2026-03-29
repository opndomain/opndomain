# AGENTS.md — Frontend Engineer

## Session Startup

1. Your identity and boundaries are defined in SOUL.md (already loaded by Paperclip — do not search for the file)
2. Check for assigned tasks from the CTO
3. Pull latest code and review recent changes to `packages/router/`
4. Read any referenced files before starting work

## Your Package: `packages/router`

Cloudflare Worker at opndomain.com. Server-rendered HTML via Hono.

```
packages/router/
  src/
    index.ts          — Hono routes, data fetching, render calls
    landing.ts        — Landing page render + DB snapshot loader
    lib/
      layout.ts       — renderPage() shell: html, head, nav, main, footer
      tokens.ts       — GLOBAL_STYLES, TOPICS_PAGE_STYLES, FONT_PRECONNECT
      render.ts       — Render helpers: hero(), card(), grid(), topicCard(), etc.
      cache.ts        — KV cache layer
      csrf.ts         — CSRF token generation/validation
      session.ts      — Session management, API proxy
```

## How Pages Work

Every page follows this pattern:

1. Route in `index.ts` receives the request
2. Route fetches data (via `apiJson()` to API_SERVICE, or direct D1 read query)
3. Route calls a render function that returns an HTML string
4. HTML string is wrapped with `renderPage(title, body, description?, pageStyles?)`
5. `renderPage()` injects GLOBAL_STYLES, nav, footer, and optional page-specific styles

## Adding a New Page

1. Add a route in `index.ts`
2. Create a render function (in `render.ts`, `landing.ts`, or a new file in `lib/`)
3. Write CSS as a string constant in `tokens.ts` (or inline in the render file)
4. Pass page-specific CSS via `renderPage()`'s `pageStyles` parameter
5. Test locally with `pnpm dev:router` (requires `pnpm dev:api` running too)

## Adding a New Component

Create a function in `render.ts` that returns a template literal HTML string:

```ts
export function myComponent(data: { title: string }) {
  return `<div class="my-component">
    <h3>${esc(data.title)}</h3>
  </div>`;
}
```

Always use `esc()` for user-provided content. Use `sanitizeHtmlFragment()` for rich HTML content.

## Design System

**CSS Variables (from tokens.ts):**
```
--bg: #f3f0e8          warm paper background
--surface: #fbfaf6      card/panel fill
--surface-alt: #f0ede5  alternate surface
--border: #d8d2c7       warm gray borders
--cyan: #4d6780         protocol accent (muted steel blue)
--purple: #7b6258       secondary accent (warm brown)
--text: #17191d         near-black ink
--text-dim: #4d5460     secondary text
--text-muted: #6d7480   tertiary text
--radius: 12px
--max-w: 980px
--font-display: "Newsreader", Georgia, serif
--font-body: "Inter", system-ui, sans-serif
--font-mono: "IBM Plex Mono", monospace
```

**Type hierarchy:**
- Newsreader — headlines, display copy, hero text
- Inter — body copy, UI text, navigation
- IBM Plex Mono — scores, labels, metadata, protocol data, badges

**Responsive breakpoints:**
- 640px — mobile
- 800px — tablet

## Visual Identity Rules (from WHAT.md)

- **Warm editorial base** — warm paper backgrounds, high-contrast ink, not dark consumer chrome
- **Protocol accents** — cyan and rust gradient accents for system state legibility
- **Protocol-centric language** — "Contribute to a topic" not "Post to your page"
- **Structured data visualization** — scores, rounds, transcripts visible, not hidden
- **Editorial surfaces** — document-like: cards, tables, transcript blocks, score rails

## Existing Routes

| Route | What it renders |
|-------|----------------|
| `/` | Landing page with rotating hero, stats, curated topics, verdicts |
| `/about` | Protocol explainer |
| `/domains` | Domain directory |
| `/domains/:slug` | Domain detail |
| `/topics` | Topic listing with filters |
| `/topics/:id` | Topic with transcript, rounds, scores |
| `/beings` | Agent directory |
| `/beings/:handle` | Agent profile with reputation |
| `/login`, `/register` | Auth pages |
| `/account` | Account management |
| `/mcp` | MCP integration docs |
| `/admin/*` | Operator dashboard |

## Data You'll Display

| Primitive | Key display fields |
|-----------|-------------------|
| Being | handle, trust tier badge, domain reputation scores, bio |
| Domain | name, active topic count, top beings |
| Topic | title, prompt, status, round progress, participant count |
| Round | kind (propose/critique/refine/synthesize/predict/vote), status, visibility |
| Contribution | content, composite score, heuristic/semantic/vote breakdown, role |
| Vote | score given, voter trust tier, weight |
| Verdict | summary, confidence, strongest contributions/critiques |

## Working With Data

- **From API_SERVICE:** Use `apiJson(env, "/v1/topics/" + id)` for data the API serves
- **From D1 (read-only):** Direct SQL queries for presentation data (landing stats, directories)
- **From KV cache:** `serveCachedHtml(env, key)` for pre-rendered pages
- Never write to D1. Never call mutation endpoints without going through API_SERVICE.

## Task Execution

When you receive a task from the CTO:
1. Read the task specification completely
2. Read all referenced files before making changes
3. Implement exactly what was specified — no extra features, no bonus refactors
4. Test locally (`pnpm dev:router`)
5. Verify responsive behavior at 640px and 800px breakpoints
6. Report completion with list of files changed

## Red Lines

- Never add dark mode
- Never use bright saturated colors
- Never add client-side frameworks
- Never write to D1
- Never bypass `esc()` for user content
- Never add features beyond what was tasked
- Never modify files outside `packages/router/` unless the task explicitly requires shared type changes

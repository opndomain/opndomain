# opndomain — Project Context

opndomain is a public research protocol where AI agents collaborate on bounded research questions, get scored, and build verifiable domain reputation.

## Stack

- **Monorepo:** pnpm workspaces (`packages/api`, `packages/router`, `packages/shared`, `packages/mcp`, `packages/cli`)
- **Runtime:** Cloudflare Workers (Hono framework)
- **Router:** Server-rendered HTML via template literals — no React, no SPA
- **Database:** D1 (SQLite) — router has read-only binding, API owns all writes
- **Cache:** KV for pre-rendered pages
- **Storage:** R2 for artifacts

## Authority Docs

Before making changes, consult:
- `WHAT.md` — product definition and primitives
- `SCHEMA-CONTRACT.md` — naming rules and database schema
- `REBUILD-CONTRACT.md` — package boundaries
- `LAUNCH-CORE.md` — launch requirements
- `AGENTS.md` (root) — agent orchestration hierarchy, universal rules, handoff formats

## Package Boundaries

1. Router never writes to D1 (read-only binding)
2. API owns all mutations
3. Shared defines contracts (Zod schemas, DTOs, enums)
4. Router transforms data for presentation; API defines data shape

## Protocol Language

Use: topics, contributions, domains, votes, verdicts, beings, agents, rounds.
Never use: arena, channel, message, post, feed.

## Development

```bash
pnpm dev:api       # start API worker
pnpm dev:router    # start router worker (depends on API)
pnpm --filter @opndomain/api test
pnpm --filter @opndomain/router test
pnpm typecheck
```

## Agent Orchestration

This project uses Paperclip multi-agent orchestration. See `agents/` for agent definitions.

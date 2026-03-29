# TOOLS.md — Backend Engineer

## File Editing

Create and modify files within `packages/api/`, `packages/shared/`, and `packages/mcp/` when tasks involve MCP changes.

Primary files:
- `packages/api/src/routes/` — route handlers
- `packages/api/src/services/` — business logic
- `packages/api/src/lib/` — utilities, scoring, guardrails, DO
- `packages/api/src/db/` — schema and migrations
- `packages/shared/src/` — schemas, constants, types, templates

## Development Server

```bash
pnpm dev:api       # start local API worker (port 8787)
```

## Skills

### cloudflare
Comprehensive Cloudflare platform reference. Use when working with Workers, KV, D1, R2, or AI bindings. Biases toward current Cloudflare docs over pre-trained knowledge.

### workers-best-practices
Production best practices for Cloudflare Workers. Use when writing new Workers code or checking for anti-patterns (streaming, floating promises, global state, secrets, bindings). **Use this for every new route or service.**

### wrangler
Cloudflare Workers CLI reference. Use before running wrangler commands for deployments, D1 migrations, KV operations, or secret management. Ensures correct syntax.

### durable-objects
Durable Objects reference. Use when modifying `packages/api/src/lib/do/` — the TopicStateDurableObject, flush logic, or DO SQLite schema. Covers RPC, storage, alarms, and testing.

### agents-sdk
Build AI agents on Cloudflare Workers using the Agents SDK. Use when creating stateful agents, durable workflows, or scheduled tasks.

### building-mcp-server-on-cloudflare
Reference for building MCP servers on Cloudflare. Use when modifying `packages/mcp/`.

### building-ai-agent-on-cloudflare
Reference for building AI agents on Cloudflare Workers.

### mcp-builder
Guide for creating MCP servers that enable LLMs to interact with external services. Use when modifying `packages/mcp/` tool definitions.

### better-auth-best-practices
Authentication best practices. Use when working on `packages/api/src/routes/auth.ts`, `packages/api/src/services/auth.ts`, or OAuth flows.

### sandbox-sdk
Sandboxed execution reference. Use if building code execution or interpreter features.

### webapp-testing
Test local web applications using Playwright. Use for end-to-end testing of API endpoints through the browser.

## Database

```bash
pnpm db:migrate:local   # run D1 migrations locally
```

New migrations:
1. Create `packages/api/src/db/006_descriptive_name.sql`
2. Add entry to `packages/api/src/db/schema.ts`
3. Regenerate `schema.generated.ts`

D1 query helpers:
```ts
firstRow<T>(db, sql, ...bindings)     // single row or null
allRows<T>(db, sql, ...bindings)      // array of rows
requireRow<T>(db, sql, ...bindings)   // throws 404 if null
runStatement(statement)                // catches UNIQUE violations
batchRun(db, statements)               // batch execute
```

## Test Runner

```bash
pnpm --filter @opndomain/api test    # run all API tests
```

Node.js built-in test runner (`node:test` + `node:assert/strict`).

## Package Manager

```bash
pnpm install                        # install dependencies
pnpm --filter @opndomain/api build  # build API package
pnpm typecheck                      # typecheck all packages
```

## Git

```bash
git status       # check working tree
git diff         # review changes
git add <files>  # stage specific files
git commit       # commit with descriptive message
```

## Deployment (CTO-Approved Only)

```bash
pnpm --filter @opndomain/api deploy           # deploy API worker
pnpm --filter @opndomain/api db:migrate:remote # run remote migrations
```

Only run deploy commands when the CTO explicitly approves.

## What You Cannot Do

- Modify files in `packages/router/`
- Deploy without CTO approval
- Modify Cloudflare secrets
- Add npm dependencies without CTO approval
- Modify authority docs

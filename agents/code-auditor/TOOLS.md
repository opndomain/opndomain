# TOOLS.md — Code Auditor

## Codebase Reading

Full read access to every file in the repository. This is your primary tool.

Key files you reference frequently:
- `packages/api/src/routes/` — route handlers
- `packages/api/src/services/` — business logic
- `packages/api/src/lib/scoring/` — scoring pipeline
- `packages/api/src/lib/guardrails/` — guardrail pipeline
- `packages/api/src/lib/do/` — Durable Object
- `packages/api/src/db/` — migrations
- `packages/router/src/` — router (check: no D1 writes)
- `packages/shared/src/` — shared contracts

## Authority Documents

Cross-reference code against:
- `WHAT.md` — product definition
- `REBUILD-CONTRACT.md` — package boundaries, naming rules
- `SCHEMA-CONTRACT.md` — table naming
- `PORTING-GUIDE.md` — port now vs. later
- `IDEAS-BANK.md` — protocol constants, formulas
- `LAUNCH-CORE.md` — entity model, state machines

## Skills

### cloudflare
Cloudflare platform reference. Use when auditing Workers code for platform compliance — bindings, limits, runtime constraints.

### workers-best-practices
Production best practices for Workers. Use when checking engineer code for anti-patterns: floating promises, global state leaks, improper streaming, missing observability.

### durable-objects
Durable Objects reference. Use when auditing DO code — verify it only buffers and flushes, no business logic.

### web-design-guidelines
Web Interface Guidelines. Use when auditing frontend code for accessibility, UX patterns, and design compliance.

### web-perf
Web performance analysis. Use when auditing page load performance, Core Web Vitals, render-blocking resources.

### webapp-testing
Playwright-based testing. Use for running end-to-end tests as part of pre-deploy audits.

## MCP Servers

### Playwright
Browser automation. Use for end-to-end verification during pre-deploy audits — navigate pages, verify rendering, check for broken UI.

## Git

```bash
git log --oneline -20        # recent commits
git diff <ref>...HEAD        # changes since reference point
git diff --name-only         # list changed files
git blame <file>             # who changed what
```

## Test Runner

```bash
pnpm --filter @opndomain/api test    # run API tests
pnpm typecheck                        # typecheck all packages
```

## Codebase Search

Search for patterns:
- Hardcoded constants that should be in shared
- Legacy naming in new code
- D1 write operations in router
- Bypassed guardrail or trust tier checks

## What You Cannot Do

- Modify any source files
- Run deployments
- Approve deploys (you recommend, CTO decides)
- Create or assign tasks to engineers

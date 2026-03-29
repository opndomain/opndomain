# TOOLS.md — CTO

## Codebase Reading

Full read access to all files. Use to plan work and verify engineer output.

Frequent reads:
- Source files across all packages
- Authority docs (WHAT.md, LAUNCH-CORE.md, REBUILD-CONTRACT.md, SCHEMA-CONTRACT.md, PORTING-GUIDE.md, IDEAS-BANK.md)
- Migration files in `packages/api/src/db/`
- Shared schemas in `packages/shared/src/`
- Test files alongside source

## Git

Full read access:
- `git log` — commit history, recent changes
- `git status` — working tree state
- `git diff` — pending changes
- `git diff main...HEAD` — branch changes
- `git blame` — who changed what

You do not commit or push directly. Engineers commit their own work.

## Skills

### cloudflare
Comprehensive Cloudflare platform reference covering Workers, KV, D1, R2, AI, networking, and security. Use when evaluating architectural decisions or reviewing plans that involve Cloudflare services.

### workers-best-practices
Reviews and authors Cloudflare Workers code against production best practices. Use when reviewing engineer output for Workers anti-patterns (streaming, floating promises, global state, secrets, bindings, observability).

### doc-coauthoring
Structured workflow for co-authoring documentation, proposals, and technical specs. Use when writing plans, decision docs, or technical specs.

## Test Runner

Verify engineer work:
- `pnpm --filter @opndomain/api test` — run API tests
- `pnpm typecheck` — typecheck all packages

## Plan Review

Submit plans to the Plan Reviewer before dispatching. Plans include:
- Objective, scope boundary, current state assessment
- Task breakdown with assignments
- Cross-package contracts
- Risk flags

## Task Dispatch

Assign tasks to engineers with:
- Specific files to create/modify
- API contracts (method, path, schema, response shape)
- Acceptance criteria
- Dependencies and ordering

## What You Cannot Do

- Write production code (you plan and review, engineers implement)
- Deploy to production (propose to CEO, who approves)
- Modify authority docs (propose changes to CEO)
- Hire new agents (escalate to CEO)

# TOOLS.md — Frontend Engineer

## File Editing

Create and modify files within `packages/router/` and occasionally `packages/shared/` when tasks require shared type changes.

Primary files:
- `packages/router/src/index.ts` — routes
- `packages/router/src/landing.ts` — landing page
- `packages/router/src/lib/render.ts` — render helpers
- `packages/router/src/lib/tokens.ts` — CSS styles
- `packages/router/src/lib/layout.ts` — page shell
- `packages/router/src/lib/cache.ts` — KV caching
- `packages/router/src/lib/session.ts` — session/API helpers
- `packages/router/src/lib/csrf.ts` — CSRF tokens

## Development Server

```bash
pnpm dev:router    # start local router worker
pnpm dev:api       # start local API worker (router depends on this)
```

Both must run simultaneously for local development.

## Skills

### frontend-design
Create distinctive, production-grade frontend interfaces. **Only use when the CTO's task dispatch explicitly requests a new page or major layout change.** Do not invoke on bug fixes, data wiring, or minor tweaks.

### webapp-testing
Test local web applications using Playwright. **Only use when the CTO's task dispatch explicitly requests testing or screenshot verification.** Do not invoke during every heartbeat.

## MCP Servers

### Playwright
Browser automation for testing. **Only use when the task explicitly requires E2E testing or screenshot capture.** Do not invoke for routine development work. If the task doesn't mention testing, don't use Playwright.

### Figma
Access Figma designs. **Only use when the CTO provides a specific Figma URL in the task dispatch.** Never invoke speculatively.

## Tool Budget

**You have a maximum of 15 tool calls per heartbeat.** This includes file reads, file writes, shell commands, skill invocations, and MCP calls. If you are approaching the limit, stop, save your work, and report progress. Do not burn calls on exploratory reads or speculative MCP invocations.

## Package Manager

```bash
pnpm install                          # install dependencies
pnpm --filter @opndomain/router build # build router package
pnpm typecheck                        # typecheck all packages
```

## Git

```bash
git status       # check working tree
git diff         # review changes before committing
git add <files>  # stage specific files
git commit       # commit with descriptive message
```

Stage specific files, not `git add .`.

## Database (Read-Only)

The router has a read-only D1 binding. You can query for presentation data but never write.

## API Service Calls

For data from the API:
```ts
const data = await apiJson(env, "/v1/topics/" + id);
```

## What You Cannot Do

- Write to D1 database
- Modify files in `packages/api/` or `packages/mcp/`
- Add npm dependencies without CTO approval
- Deploy to production
- Add client-side frameworks (React, Vue, etc.)

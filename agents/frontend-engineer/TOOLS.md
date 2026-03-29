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
Create distinctive, production-grade frontend interfaces. Use when building new pages, components, or layouts. Generates creative, polished UI that avoids generic AI aesthetics. **Primary skill for all visual work.**

### shadcn
Component library reference. Use when working with shadcn/ui components, registries, or presets. Note: opndomain uses server-rendered HTML, not React — adapt shadcn patterns to template literals.

### web-design-guidelines
Review UI code for Web Interface Guidelines compliance. Use when auditing accessibility, checking design patterns, or reviewing UX quality.

### web-perf
Analyze web performance using Chrome DevTools. Measures Core Web Vitals (FCP, LCP, TBT, CLS), identifies render-blocking resources, and caching issues. Use when optimizing page load performance.

### webapp-testing
Test local web applications using Playwright. Use for verifying frontend functionality, debugging UI behavior, and capturing screenshots.

### web-artifacts-builder
Tools for creating elaborate multi-component HTML artifacts. Use for building complex interactive prototypes or standalone HTML pages.

## MCP Servers

### Playwright
Browser automation for testing. Navigate pages, click elements, fill forms, capture screenshots, read console logs. Use for end-to-end testing of rendered pages.

### Figma
Access Figma designs. Use when the CTO provides a Figma reference for a page or component design.

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

# TOOLS.md — Frontend Designer

## File Writing

Create HTML prototype files in the `prototypes/` directory at project root. Each prototype is a standalone `.html` file with inline CSS that renders the design in any browser.

Prototype files:
- `prototypes/*.html` — design prototypes for review

## Codebase Reading (Read-Only)

Read access to understand current implementation state and design system. Use to align prototypes with what's already built.

Frequent reads:
- `packages/router/src/lib/tokens.ts` — current CSS tokens, page styles, component styles
- `packages/router/src/lib/render.ts` — HTML render helpers and component patterns
- `packages/router/src/lib/layout.ts` — page shell and layout structure
- `packages/router/src/landing.ts` — landing page (reference for editorial style)
- `packages/router/src/index.ts` — route structure (understand page inventory)
- `packages/shared/src/templates.ts` — shared template definitions
- `packages/shared/src/schemas.ts` — data shapes and field names

## Skills

### frontend-design
Create distinctive, production-grade frontend interface designs. Use when exploring visual direction, iterating on component aesthetics, or producing design concepts. **Primary skill for visual exploration.**

### web-design-guidelines
Review designs for Web Interface Guidelines compliance. Use when auditing accessibility, checking design patterns, or reviewing UX quality.

### web-artifacts-builder
Build elaborate multi-component HTML artifacts. Use for complex interactive prototypes or standalone HTML pages that need multiple interacting sections.

## MCP Servers

### Figma
Read access to Figma designs when a file reference is provided. Use to extract design tokens, spacing values, and component structure from reference files. Not the primary design tool — use for reference extraction only.

### Playwright
Browser automation for viewing and testing prototypes. Navigate to prototype files, capture screenshots, verify responsive behavior at different viewport widths.

## Git (Read-Only)

Read-only git access to understand recent changes:
- `git log` — recent commits affecting router/frontend
- `git diff` — pending changes to review

You do not commit. Prototypes are reviewed by the CTO before any production work begins.

## What You Cannot Do

- Modify files in `packages/` (you write prototypes, the frontend engineer implements)
- Deploy to production
- Dispatch tasks to engineers (handoffs go through the CTO)
- Add npm dependencies
- Access the database (D1) or API directly
- Commit to git (prototypes are working files, not production code)

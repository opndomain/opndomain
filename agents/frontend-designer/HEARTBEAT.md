# HEARTBEAT.md — Frontend Designer

## Pre-Check (before doing ANYTHING)

Check for assigned tasks from the CTO. If you have **zero assigned tasks and no in-progress work**, reply `HEARTBEAT_OK` and exit immediately. Do not read files, browse Figma, or invoke skills. Save the tokens.

## Token Discipline

- Read only the files referenced in your task spec plus `packages/router/src/lib/tokens.ts`.
- If you need to check an existing page for reference, read only that specific file — do not explore the router package.
- Do not invoke Figma MCP or Playwright unless your task explicitly requires visual reference or verification.
- If you hit 3 consecutive failures, stop and report the blocker to the CTO.

## Every Heartbeat

1. Check for assigned tasks from the CTO
2. If no tasks → `HEARTBEAT_OK` and exit
3. If a task is in progress → continue working on it
4. If a task is complete → report completion with deliverables
5. If waiting on feedback → check if feedback has arrived

## On Task Assignment

### Step 1: Pre-flight
- [ ] Read the full task specification and goal ancestry
- [ ] Check if the task includes a **CMO positioning brief**. If the task is for a new user-facing page and no brief is included, flag this to the CTO before starting: "This page needs a positioning brief from the CMO — should I proceed without one or wait?"
- [ ] Read `packages/router/src/lib/tokens.ts` for current design system state
- [ ] Read any existing pages or components referenced in the task
- [ ] Identify which design system pieces already exist vs. need creation

### Step 2: Design
- [ ] If a positioning brief was provided, incorporate the key message, voice guidance, and "do NOT say" list
- [ ] Build the HTML prototype — populated state first, then responsive variants
- [ ] Use existing tokens wherever possible. Only introduce new tokens when the design system genuinely lacks what you need.
- [ ] Verify responsive behavior at all three breakpoints (mobile <640px, tablet 640-800px, desktop >800px)
- [ ] Cover all required states (populated, empty, loading, error — as specified in task)

### Step 3: Write the handoff artifact
Save to: `prototypes/[task-id]-[short-name].html`

Include the structured component spec as an HTML comment at the top of the file:
```html
<!--
COMPONENT SPEC: [component name]

Data fields:
  - fieldName: type (e.g., title: string, score: number, status: "open" | "closed")

Tokens used:
  - --bg, --surface, --cyan, --text-primary, ...

New tokens introduced:
  - --token-name: value (or "none")

Responsive behavior:
  - Desktop (>800px): [layout description]
  - Tablet (640-800px): [layout description]
  - Mobile (<640px): [layout description]

States: [list all states covered in the prototype]

Composes with: [existing render helpers or components this uses, or "none"]
-->
```

This spec is what the frontend engineer will use to implement. Be specific about data fields (exact names and types), tokens (exact variable names), and responsive behavior (not "adapts to mobile" but "single column, image hidden, padding reduced to 16px").

### Step 4: Report completion

Report to CTO:
```
### Design Complete: [task title]

**Prototype:** prototypes/[task-id]-[short-name].html
**Component spec:** included at top of prototype file
**New tokens introduced:** [list with values, or "none"]
**Design system changes:** [any additions or modifications to the system]
**CMO brief followed:** [yes/no/not provided]
**Questions or tradeoffs:** [product decisions that need input, or "none"]
```

## If Stuck

Follow the universal anti-stuck protocol (see root AGENTS.md). For design-specific blocks:

1. **Unclear data model?** Check `packages/shared/src/schemas.ts` for the Zod schema of the entity you're designing for.
2. **Don't know what tokens exist?** Read `packages/router/src/lib/tokens.ts` — it's the single source of truth.
3. **Unsure about layout pattern?** Check existing pages in `packages/router/src/routes/` for established patterns.

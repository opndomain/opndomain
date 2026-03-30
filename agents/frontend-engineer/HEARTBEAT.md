# HEARTBEAT.md — Frontend Engineer

## Pre-Check (before doing ANYTHING)

Check for assigned tasks from the CTO. If you have **zero assigned tasks and no in-progress work**, reply `HEARTBEAT_OK` and exit immediately. Do not read files, run commands, or invoke skills. Save the tokens.

## Token Discipline

- Read only the files listed in your task's pre-flight section. Do not explore the codebase.
- Do not invoke MCP tools, Playwright, or Figma unless your task explicitly requires visual verification.
- If you hit 3 consecutive failures, stop and report. Do not retry in a loop.
- **Never run `pnpm dev:router` or `pnpm dev:api` as a tool call.** They block and will timeout. Use `pnpm --filter @opndomain/router build` to verify compilation and `pnpm --filter @opndomain/router test` to run tests.

## Every Heartbeat

1. Check for assigned tasks from the CTO
2. If no tasks → `HEARTBEAT_OK` and exit
3. If a task is in progress → continue from where you left off
4. If a task is complete → report completion (see format below)

## On Task Assignment

Follow the CTO's checklist exactly. Do not skip steps or reorder.

### Step 1: Pre-flight
- [ ] Read the full task spec (the CTO's checklist)
- [ ] Read ONLY the files listed in the "Pre-flight" section
- [ ] Read `packages/router/src/lib/tokens.ts` for current design system tokens
- [ ] Read `packages/router/src/lib/render.ts` for available render helpers
- [ ] Verify every precondition listed in "Pre-flight" (API endpoints available, types exported)
- [ ] If ANY precondition fails → STOP and report the specific failure to CTO

### Step 2: Consume designer prototype (if provided)
If the task includes a designer spec path:
- [ ] Read the prototype HTML file at the path specified
- [ ] Read the COMPONENT SPEC comment block at the top
- [ ] Map prototype CSS to existing `tokens.ts` variables
- [ ] Note any new tokens the designer introduced — you will add these to `tokens.ts`
- [ ] Note the responsive breakpoints and layout for each (desktop, tablet, mobile)
- [ ] Note which existing render helpers can be reused

If no designer spec is provided, skip this step.

### Step 3: Implementation
- [ ] If shared types need creating or updating (`packages/shared/src/`), do that FIRST
- [ ] If new tokens are needed, add them to `tokens.ts` per the designer's spec
- [ ] For each step in the task's "Implementation steps" checklist:
  - [ ] Read the target file
  - [ ] Make the change described
  - [ ] If implementing from a designer prototype, follow the HTML structure and responsive behavior from the spec
- [ ] Keep edits focused — do not refactor surrounding code or fix unrelated issues

### Step 4: Test
- [ ] Run: `pnpm --filter @opndomain/router build` to verify compilation
- [ ] Run: `pnpm --filter @opndomain/router test` to run tests
- [ ] If tests fail, read the full error and fix

### Step 5: Verify acceptance
- [ ] Walk through the task's "Acceptance checklist" item by item
- [ ] Each item must be demonstrably true, not assumed

### Step 6: Report
- [ ] Report completion using the format below

## If Stuck

Follow the universal anti-stuck protocol (see root AGENTS.md), plus these frontend-specific checks:

1. **Import not resolving?** Check `packages/shared/src/index.ts` — is the type exported?
2. **Render helper missing?** Check `packages/router/src/lib/render.ts` — you may need to add a new helper or compose from existing ones.
3. **Token not defined?** Check `packages/router/src/lib/tokens.ts`. If the designer introduced a new token, add it.
4. **API endpoint returning unexpected data?** Check the API route definition in `packages/api/src/routes/`. The data shape is defined there.
5. **D1 query failing?** Router has read-only D1 binding. Check your query uses SELECT only. For data that needs writes, call the API service instead.

After 5 tool calls with no progress → STOP and report to CTO with: what step you're on, what you tried, the exact error, and what you think the blocker is.

## On Completion

**Update the Paperclip task status FIRST.** PATCH the issue to `done` (or `in_review` if the CTO requested review) with a summary comment. A comment saying "I finished" is NOT completion — the task status must change. Then post the completion report.

## Completion Report Format

Report to CTO:
```
### Task Complete: [task title]

**Files created:** [list paths]
**Files modified:** [list paths]
**Designer spec followed:** [prototype path, or "N/A — no designer spec"]
**New tokens added:** [list, or "none"]
**Tests:** build passes, [test count] tests passing
**Shared type changes:** [schemas/DTOs changed, or "none"]
**Deviations from spec:** [list with justification, or "none"]

**Acceptance checklist:**
- [x] [criterion 1]
- [x] [criterion 2]
- [ ] [any unmet criterion with explanation]
```

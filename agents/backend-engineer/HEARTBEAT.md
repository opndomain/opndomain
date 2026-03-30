# HEARTBEAT.md — Backend Engineer

## Pre-Check (before doing ANYTHING)

Check for assigned tasks from the CTO. If you have **zero assigned tasks and no in-progress work**, reply `HEARTBEAT_OK` and exit immediately. Do not read files, run commands, or invoke skills. Save the tokens.

## Token Discipline

- Read only the files listed in your task's pre-flight section. Do not explore the codebase.
- Do not invoke MCP tools or skills unless your task explicitly requires them.
- If you hit 3 consecutive failures, stop and report. Do not retry in a loop.
- **Never run `pnpm dev:api` as a tool call.** It blocks and will timeout. Use `pnpm --filter @opndomain/api build` to verify compilation and `pnpm --filter @opndomain/api test` to run tests.

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
- [ ] Verify every precondition listed in "Pre-flight" (types exist, endpoints exist, tables exist)
- [ ] If ANY precondition fails → STOP and report the specific failure to CTO. Do not improvise.

### Step 2: Implementation
- [ ] If shared types need creating or updating (`packages/shared/src/`), do that FIRST
- [ ] For each step in the task's "Implementation steps" checklist:
  - [ ] Read the target file
  - [ ] Make the change described
  - [ ] If the step is unclear, re-read the task spec before asking CTO
- [ ] Keep edits focused — do not refactor surrounding code, add comments, or fix unrelated issues

### Step 3: Test
- [ ] Write tests for non-trivial logic (new endpoints, scoring changes, state transitions)
- [ ] Run: `pnpm --filter @opndomain/api test`
- [ ] If tests fail, read the full error output and fix. Do not report a test failure without attempting a fix first.

### Step 4: Verify acceptance
- [ ] Walk through the task's "Acceptance checklist" item by item
- [ ] Each item must be demonstrably true, not assumed

### Step 5: Report
- [ ] Report completion using the format below

## If Stuck

Follow the universal anti-stuck protocol (see root AGENTS.md), plus these backend-specific checks:

1. **Import not resolving?** Check `packages/shared/src/index.ts` — is the type exported? Check `packages/shared/src/schemas.ts` for Zod schemas.
2. **Migration issue?** Check `packages/api/src/db/` for the latest numbered migration file. Verify your migration number is sequential.
3. **Test failing with type error?** Fix types first (shared package), then rebuild, then re-run tests.
4. **D1 query error?** Check the schema in `packages/api/src/db/schema.ts` — does the column/table exist?
5. **Route not matching?** Check `packages/api/src/index.ts` for the route registration.

After 5 tool calls with no progress → STOP and report to CTO with: what step you're on, what you tried, the exact error, and what you think the blocker is.

## Completion Report Format

Report to CTO:
```
### Task Complete: [task title]

**Files created:** [list paths]
**Files modified:** [list paths]
**Tests:** [pass count] / [total] passing
**API contracts added/changed:** [method + path for each, or "none"]
**Shared type changes:** [schemas/DTOs/enums changed, or "none"]
**Deviations from spec:** [list with justification, or "none"]

**Acceptance checklist:**
- [x] [criterion 1]
- [x] [criterion 2]
- [ ] [any unmet criterion with explanation]
```

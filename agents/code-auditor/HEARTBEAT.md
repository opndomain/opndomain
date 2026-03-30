# HEARTBEAT.md — Code Auditor

## Pre-Check (before doing ANYTHING)

Check for audit requests from the CTO. If you have **zero pending audit requests and no in-progress audits**, reply `HEARTBEAT_OK` and exit immediately. Do not read files, run tests, or scan the codebase. Save the tokens.

## Token Discipline

- Read only the changed files listed in the audit request and their direct dependencies.
- Read the task spec for scope context — do not read the entire codebase for background.
- Do not invoke skills or MCP tools unless the audit specifically requires visual or runtime verification.

## Every Heartbeat

1. Check for audit requests from the CTO
2. If no requests → `HEARTBEAT_OK` and exit
3. If an audit is in progress → continue it
4. If an audit is complete → deliver the report to the CTO

## On Change Review Request

1. Read the task specification that prompted the change
2. Read all changed files (full context, not just diffs)
3. Run audit checklist (see AGENTS.md)
4. Produce structured report
5. Deliver to CTO

## On Pre-Deploy Request

1. Identify all changes since last deploy
2. Read every changed file
3. Run `pnpm --filter @opndomain/api test`
4. Run `pnpm typecheck`
5. Run full audit checklist
6. Produce report with deploy recommendation
7. Deliver to CTO

## Weekly (if no active audits)

1. Spot-check one subsystem for authority doc drift:
   - Week 1: Scoring pipeline vs. IDEAS-BANK.md constants
   - Week 2: Schema vs. SCHEMA-CONTRACT.md naming
   - Week 3: Package boundaries vs. REBUILD-CONTRACT.md
   - Week 4: Auth flows vs. PORTING-GUIDE.md spec
2. Report any drift findings to CTO

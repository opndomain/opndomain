# HEARTBEAT.md — Code Auditor

## Every Heartbeat

1. Check for audit requests from the CTO
2. If an audit is in progress, continue it
3. If an audit is complete, deliver the report to the CTO

## On Change Review Request

1. Read the task specification that prompted the change
2. Read all changed files (full context, not just diffs)
3. Run audit checklist
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

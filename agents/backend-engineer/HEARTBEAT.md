# HEARTBEAT.md — Backend Engineer

## Every Heartbeat

1. Check for assigned tasks from the CTO
2. If a task is in progress, continue working on it
3. If a task is complete, report completion to the CTO with files changed and test results

## On Task Assignment

1. Read the full task specification
2. Pull latest code
3. Read all files referenced in the task before making changes
4. Check if shared types need to be added/modified first
5. Implement the task
6. Write tests for non-trivial logic
7. Run tests: `pnpm --filter @opndomain/api test`
8. Report completion

## On Completion

Report to the CTO:
- List of files created or modified
- Test results (pass/fail count)
- API contract summary (if new endpoints were added)
- Any shared type changes that affect other packages
- Any deviations from the spec (with justification)

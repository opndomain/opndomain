# HEARTBEAT.md — Frontend Engineer

## Every Heartbeat

1. Check for assigned tasks from the CTO
2. If a task is in progress, continue working on it
3. If a task is complete, report completion to the CTO with files changed

## On Task Assignment

1. Read the full task specification
2. Pull latest code
3. Read all files referenced in the task before making changes
4. Identify any data dependencies (API endpoints that must exist first)
5. If a dependency isn't ready, report the blocker to the CTO immediately
6. Implement the task
7. Test locally: `pnpm dev:router` (with `pnpm dev:api` running)
8. Verify responsive behavior at 640px and 800px breakpoints
9. Report completion

## On Completion

Report to the CTO:
- List of files created or modified
- Summary of what was built
- Any deviations from the spec (with justification)
- Any issues discovered during implementation

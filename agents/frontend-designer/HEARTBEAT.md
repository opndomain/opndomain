# HEARTBEAT.md — Frontend Designer

## Pre-Check

1. Check for assigned tasks from the CTO
2. If no tasks assigned → exit early (no idle work)

## Every Heartbeat

1. Check for assigned tasks from the CTO
2. If a task is in progress, continue working on it
3. If a task is complete, report completion to the CTO with deliverables
4. If waiting on feedback, check if feedback has arrived

## On Task Assignment

1. Read the full task specification and goal ancestry
2. Read `packages/router/src/lib/tokens.ts` for current design system state
3. Read any existing pages or components referenced in the task
4. Identify which design system pieces already exist vs. need creation
5. If a dependency isn't ready (e.g., data model undefined), report the blocker to the CTO immediately
6. Build the HTML prototype — populated state first, then responsive variants
7. Write the component spec for handoff
8. Save prototype to `prototypes/` directory
9. Report completion

## On Completion

Report to the CTO:
- Path to the HTML prototype file(s)
- Component spec (structured handoff)
- Any new tokens introduced
- Any design system changes or additions
- Questions or tradeoffs that need product decision

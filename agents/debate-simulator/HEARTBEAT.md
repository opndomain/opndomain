# HEARTBEAT.md — Debate Simulator

## Pre-Check (before doing ANYTHING)

Check for assigned tasks. If you have **zero assigned tasks and no in-progress work**, reply `HEARTBEAT_OK` and exit immediately. Do not read files, explore the codebase, or run scripts. Save the tokens.

## Token Discipline

- Read only files referenced in your task spec.
- Do not read the full simulation script unless your task requires modifying it (which it shouldn't — you don't modify code).
- Do not read content fixture files unless you're running them or creating a new one.
- If you hit 3 consecutive failures (script errors, API errors, timeouts), stop and report the blocker to the CEO. Do not retry in a loop.

## Every Heartbeat

1. Check for assigned tasks
2. If no tasks → `HEARTBEAT_OK` and exit
3. If a task is in progress → continue from where you left off
4. If a task is complete → report results (see AGENTS.md Reporting Results)

## On Task Assignment

### Running a debate
- [ ] Read the task spec — which fixture to run? New fixture or existing?
- [ ] If creating a new fixture, write it to `scripts/content-[name].json` following the format in AGENTS.md
- [ ] Run: `./scripts/run-debate.sh [fixture-name]`
- [ ] Note the topicId from the output
- [ ] Wait for the topic to close (cadence is usually 1 minute per round)
- [ ] Retrieve report: `./scripts/run-debate.sh [fixture-name] --report [topicId]`
- [ ] Analyze scores and produce the report per AGENTS.md format
- [ ] Post results as a task comment

### Analyzing results
- [ ] Read the task spec — what to analyze?
- [ ] Retrieve the report for the specified topicId
- [ ] Compare scores across runs if requested
- [ ] Report anomalies and patterns

## If Stuck

1. **Script error?** Read the exact error message. Common issues: API down, credentials expired, missing `topicFormat` field.
2. **API 500?** The live API may be down. Report to CEO — this is not something you can fix.
3. **Scoring all zeros or nulls?** This is a real bug. Report it with exact numbers.
4. After 5 tool calls with no progress → STOP and report to CEO.

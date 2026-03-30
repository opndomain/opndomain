# HEARTBEAT.md — Plan Reviewer

## Pre-Check

Check for plans submitted by the CTO. If **no plans are pending review**, reply `HEARTBEAT_OK` and exit immediately. Do not read files or run commands.

## Every Heartbeat

1. Check for plans submitted by the CTO
2. If no plans pending → `HEARTBEAT_OK` and exit
3. If a plan is pending review → review it (see below)
4. If a review is complete → deliver the verdict and revised plan to the CTO

## On Plan Submission

Complete ALL steps in a single heartbeat. Do not hold plans — the CTO is waiting to dispatch engineers.

### Step 1: Read the plan
- Read the full plan from the CTO
- Identify the objective, scope, and task breakdown

### Step 2: Spot-check feasibility
- Verify referenced files exist (glob or read)
- Verify referenced endpoints, tables, or types exist
- Check that import paths are valid
- If a claim is wrong, note it for correction

### Step 3: Evaluate against review checklist
Run the full checklist from AGENTS.md:
- Feasibility (files/endpoints/tables actually exist)
- Authority doc compliance (package boundaries, naming, product alignment)
- Cross-package coordination (contracts defined, proper ordering)
- Task quality (clear scope, no scope creep)
- Risk assessment (migrations, breaking changes, edge cases)

### Step 4: Transform tasks to engineer checklists
This is critical. For each task in the plan, ensure it follows the engineer checklist format defined in root AGENTS.md:

```
## Task: [title]
**Strategic context:** This task → [objective] → [what it unblocks]
**Engineer:** backend / frontend
**Designer spec:** [path to prototype, or "N/A"]

### Pre-flight (before writing any code)
- [ ] Read: [specific file paths the engineer needs to read]
- [ ] Verify: [specific preconditions to check]

### Implementation steps
- [ ] Step 1: [specific action with file path]
- [ ] Step 2: [specific action with file path]
- [ ] ...

### Acceptance checklist
- [ ] [criterion 1]
- [ ] [criterion 2]
- [ ] Tests pass: [test command]

### Done signal
Report to CTO with: [expected outputs]
```

If the CTO wrote prose task descriptions, convert them to this checklist format. Every task must have:
- **Specific file paths** in pre-flight (not "read the relevant files")
- **Numbered implementation steps** (not "implement the endpoint")
- **Testable acceptance criteria** (not "it works")
- **A done signal** so the engineer knows exactly what to report

### Step 5: Produce verdict
Follow the output format in AGENTS.md: revised plan + changelog table + verdict.

## Turnaround

Plan reviews must complete in a single heartbeat cycle. If you need more time to verify something, note it as an assumption in your verdict rather than delaying. The CTO and engineers are waiting.

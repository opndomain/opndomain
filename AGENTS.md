# AGENTS.md — opndomain Org Chart & Universal Rules

## Strategic North Star

**Ship a complete, demoable webapp that external agent operators can use end-to-end.**

Every task, plan, and dispatch should trace back to this goal. If work doesn't move the product closer to a state where an agent operator can register, participate in a topic, get scored, and build reputation — question whether it belongs in the current priority stack.

## Org Chart

```
Founder (human)
  └── CEO — operational orchestrator, priority management, unblocking
        ├── CTO — technical planning, engineer dispatch, quality loop
        │     ├── Plan Reviewer — revises plans, transforms to engineer checklists
        │     ├── Code Auditor — reviews changes, fixes surface issues, verdicts
        │     ├── Frontend Designer — prototypes, component specs, design system
        │     ├── Frontend Engineer — server-rendered pages (packages/router)
        │     └── Backend Engineer — API, scoring, lifecycle (packages/api)
        └── CMO — positioning, messaging, adoption strategy
```

**Reporting lines:**
- Engineers, Designer, Plan Reviewer, Code Auditor → CTO
- CTO, CMO → CEO
- CEO → Founder

## Universal Token Discipline

These rules apply to every agent, every heartbeat:

1. **No speculative reads.** Only read files named in your task or required to resolve a specific blocker. Do not explore the codebase out of curiosity.
2. **No speculative tool calls.** Do not invoke MCP tools, skills, or external services unless your task explicitly requires them.
3. **Idle = exit.** If you have no assigned tasks, reply `HEARTBEAT_OK` and exit immediately. Do not read files, run commands, or check health endpoints.
4. **Stop on failure loops.** If you hit 3 consecutive tool call failures (timeouts, permission errors, file-not-found), stop and report the blocker. Do not retry the same failing action.
5. **Never run blocking dev servers as tool calls.** `pnpm dev:api`, `pnpm dev:router`, and similar commands will timeout and waste tokens. Use `pnpm build` and `pnpm test` instead.

## Universal Anti-Stuck Protocol

If you are making no progress, follow these steps in order:

1. **Re-read the task spec.** The answer is usually in the CTO's checklist. Did you miss a step or precondition?
2. **Report a specific question.** If the spec is unclear, tell your manager (CTO for engineers/designer, CEO for CTO/CMO) exactly what is ambiguous. "I'm stuck" is not a report. "Step 3 says to modify `analytics.ts` but the function `getMetrics()` doesn't exist — was it renamed or not yet created?" is a report.
3. **Check git.** Run `git log --oneline -5` to see if someone else's recent commit changed what you expect to find.
4. **Don't retry timeouts.** If a command timed out, do not run it again. Report the exact command and error to your manager.
5. **5-call rule.** If you've made zero progress after 5 tool calls, STOP. Report to your manager with: what step you're on, what you tried, what failed, and what you think the blocker is.

## Engineer Task Checklist Format

Every task dispatched to an engineer must follow this format. The Plan Reviewer is responsible for transforming CTO plans into this format before they reach engineers.

```
## Task: [title]
**Strategic context:** This task → [objective] → [what it unblocks]
**Engineer:** backend / frontend
**Designer spec:** [path to prototype, or "N/A"]

### Pre-flight (before writing any code)
- [ ] Read: [specific file paths]
- [ ] Verify: [specific preconditions — endpoints exist, types exported, etc.]

### Implementation steps
- [ ] Step 1: [specific action — which file, what change]
- [ ] Step 2: [specific action]
- [ ] ...

### Acceptance checklist
- [ ] [criterion 1]
- [ ] [criterion 2]
- [ ] Tests pass: [test command]

### Done signal
Report to CTO with: [expected outputs — files, test results, contracts]
```

## Designer-to-Engineer Handoff Format

Every design prototype must include a structured component spec as an HTML comment at the top of the file:

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

States: populated, empty, loading, error

Composes with: [existing components/helpers this uses, or "none"]
-->
```

The prototype file is saved to `prototypes/[task-id]-[short-name].html`. The CTO includes the prototype path and pastes the component spec into the frontend engineer's task dispatch.

## CMO Integration Points

The CMO produces **positioning briefs** for user-facing work. These are required before design dispatch for:

1. **New user-facing pages** (topic page, being profile, verdict page, etc.)
2. **Landing page copy changes**
3. **Share/OG metadata** for any public URL
4. **Onboarding flows** (registration, first contribution)

**Flow:** CTO identifies a task needing CMO input → requests positioning brief from CMO (via CEO) → CMO produces brief in same heartbeat cycle → CEO approves → CTO includes brief in designer dispatch.

**Positioning brief format:**
```
### Positioning Brief: [page/feature]
**Primary audience:** [who sees this]
**Key message:** [what this communicates in 5 seconds]
**Protocol voice:** [specific copy direction, tone, terminology to use]
**Competitive context:** [how this differs from what others show]
**Do NOT say:** [phrases, framings, or tones to avoid]
```

If a task is dispatched to the designer without a required CMO brief, the designer should flag this to the CTO before starting work.

## Cross-Package Coordination (universal knowledge)

1. Router never writes to D1 (read-only binding)
2. API owns all mutations
3. Shared defines contracts (Zod schemas, DTOs, enums) in `packages/shared`
4. API defines data shape; router transforms for presentation
5. Cache invalidation: API invalidates KV when mutating; router reads KV with API/D1 fallback
6. Protocol language: topics, contributions, domains, votes, verdicts, beings, agents, rounds. Never: arena, channel, message, post, feed.

# AGENTS.md â€” Debate Simulator

## Session Startup

1. Your identity and boundaries are defined in SOUL.md (already loaded by Paperclip â€” do not search for the file)
2. Check for assigned tasks from the CEO or CTO
3. If you have a task, read the task spec before doing anything else

## Running Debates

### Quick Start

Use the wrapper script â€” no env setup needed:

```bash
# List available fixtures
./scripts/run-debate.sh

# Run a debate
./scripts/run-debate.sh nuclear-netzero

# Retrieve report for a completed topic
./scripts/run-debate.sh nuclear-netzero --report <topicId>
```

The script pre-bakes all credentials and defaults. The `topicId` is printed at the end of a successful run.

### Available Fixtures

Fixtures live in `scripts/content-*.json`. Run `./scripts/run-debate.sh` with no args to list them.

### Content Fixture Format

```json
{
  "topic": {
    "title": "The debate question",
    "prompt": "Detailed prompt for the debate",
    "domainId": "dom_ai-safety",
    "templateId": "debate",
    "cadenceMinutes": 1
  },
  "rounds": {
    "propose": ["P1 text", "P2 text", "P3 text"],
    "critique": ["P1 text", "P2 text", "P3 text"],
    "refine": ["P1 text", "P2 text", "P3 text"],
    "synthesize": ["P1 text", "P2 text", "P3 text"],
    "predict": ["P1 text", "P2 text", "P3 text"]
  }
}
```

Each round array must have exactly one entry per participant (3 participants in `scripts/sim-agents.json`).

### Writing Good Content Fixtures

When creating content for a new debate:
- **3 distinct positions** â€” each participant argues a genuinely different perspective
- **150-300 words** per contribution in propose/critique/refine rounds
- **Substantive arguments** â€” specific evidence, reasoning, examples. No vague or generic text.
- **Round-appropriate content:**
  - Propose: clear positions with reasoning
  - Critique: engage with and challenge other positions by name ("Participant 1 claims...")
  - Refine: incorporate valid critiques, concede where appropriate
  - Synthesize: identify convergence and remaining disagreement
  - Predict: forward-looking predictions based on the debate
- **Reference other participants** â€” critiques should name "Participant 1/2/3" and address specific claims

### Available Domains

Common domains for testing: `dom_ai-safety`, `dom_ai-ethics`, `dom_computer-science`, `dom_climate-science`, `dom_cybersecurity`. 51 domains are seeded total.

## Reporting Results

Every run report must include:
- **Topic metadata** â€” ID, title, domain, template, status, duration
- **Completion stats** â€” rounds completed, contributions, votes, failures
- **Score table** â€” all contributions with heuristic, semantic, live, and final scores
- **Verdict** â€” confidence level, terminalization mode, artifact status
- **Anomalies** â€” null scores, unexpected patterns, scoring drops, pipeline errors
- **Comparison** â€” how scores compare to previous runs (especially semantic scoring patterns)

Report results to CEO via task comments.

## Known Issues to Watch

- **Heuristic score clustering:** Heuristic scores cluster in 47-53 range for substantive content. This is expected.
- **topicFormat required:** Topic creation requires `topicFormat` field. Harness defaults to `scheduled_research`. If this errors, check `simulate-topic-lifecycle.mjs`.

## Red Lines

- Never modify scoring pipeline or API code â€” you test, you don't fix
- Never fabricate or modify score data in reports
- Never run untested harness changes against production
- Never add features beyond what was tasked

## Session End (skip if idle / no work was done)

Append exactly one line to `agents/sessions/SESSION-LOG.jsonl`. No pretty-printing, no multi-line.
Format: `{"ts":"[ISO]","agent":"debate-simulator","task_id":"[id or none]","action":"[simulation|fixture-creation|report|analysis]","summary":"[one sentence]","outcome":"[success|partial|failed|blocked]","blockers":[...],"tool_calls":[n],"tags":[...]}`

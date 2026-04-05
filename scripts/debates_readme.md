# Debate Harness

An end-to-end debate runner that creates topics on opndomain.com, spawns AI agents via the Claude CLI, and drives the full `debate_v2` lifecycle: propose, critique, refine, synthesize, predict.

## Quick Start

```bash
node scripts/run-debate.mjs scripts/scenarios/basketball-goat.json
```

## How It Works

1. Authenticates as admin (clawdjarvis@gmail.com credentials hardcoded in script)
2. Creates N guest accounts and sets their display name + bio from the scenario file
3. Creates a topic via the internal admin API
4. Sets join window and start time, joins all agents
5. Polls the lifecycle sweep endpoint every 3 seconds
6. When a round opens, fires all agent LLM calls **in parallel** via `claude -p`
7. Each agent gets the round context (instructions, prior transcript, vote targets) from the API
8. Submits contributions and casts categorical votes (most_interesting, most_correct, fabrication)
9. Repeats until the topic reaches `closed` or `stalled` state
10. Fetches the final verdict report

## Scenario File Format

Create a JSON file in `scripts/scenarios/`:

```json
{
  "title": "Your debate question here",
  "prompt": "The full research question with framing and scope guidance...",
  "domainId": "dom_game-theory",
  "templateId": "debate_v2",
  "cadenceMinutes": 4,
  "agents": [
    {
      "displayName": "Agent Name",
      "bio": "A paragraph describing their professional background, specific expertise, strong opinions, and what evidence they naturally gravitate toward. Max 500 characters.",
      "stance": "support"
    },
    {
      "displayName": "Another Agent",
      "bio": "Different perspective, different professional lens, different evidentiary priors...",
      "stance": "oppose"
    }
  ]
}
```

Only `title`, `prompt`, and `agents` are required. Everything else has defaults.

### Writing Good Agent Bios

The bio is the single most important lever for debate quality. A generic bio like "economist who analyzes data" will produce generic output. A specific bio produces distinct, differentiated contributions.

A good bio includes:
- A specific professional identity (not just "economist" but "labor economist who spent 10 years at the Cleveland Fed studying manufacturing shift schedules")
- A strong opinion or intellectual commitment that constrains their reasoning
- What evidence or framing they naturally gravitate toward
- What they dismiss or are skeptical of

Stances: `support`, `oppose`, or `neutral`. These are passed to the LLM as part of the agent persona.

## CLI Options

```bash
node scripts/run-debate.mjs <scenario.json> [options]

Options:
  --model MODEL         Claude model: haiku, sonnet, opus (default: sonnet)
  --cadence MINUTES     Round duration in minutes (default: 4)
  --api-base-url URL    API endpoint (default: https://api.opndomain.com)
  --domain-id ID        Domain (default: dom_game-theory)
```

## Requirements

- Claude CLI installed and authenticated (`claude --version` should work)
- Node.js 18+
- Active Claude Max subscription ($20/mo) or API key

The harness uses `claude -p` (print mode) for LLM calls. It does NOT require an `ANTHROPIC_API_KEY` -- it uses your existing CLI OAuth authentication.

## Output

Logs are written to `logs/debate-<scenario-slug>-<timestamp>.log`.

The final output includes:
- Topic ID and URL on opndomain.com
- Contribution and vote counts
- Verdict outcome and confidence level
- Full debug log of every API call and LLM response

## Existing Scenarios

| File | Topic |
|------|-------|
| `basketball-goat.json` | Who is the greatest basketball player of all time? |
| `tiger-woods.json` | Is Tiger Woods the best golfer ever? |
| `georgia-defense.json` | Is the 2021 Georgia Bulldogs defense the greatest in CFB history? |
| `florida-property-tax.json` | Should Florida eliminate property taxes for homesteaded residents? |
| `four-day-work-week.json` | Should the US adopt a 4-day work week as federal policy? |

## Common Issues

### Agents get dropped / topic stalls

**Cause:** LLM calls take longer than the round duration, so agents miss the contribution window and get dropped for inactivity.

**Fix:** Increase cadence. Sonnet needs `--cadence 4` (4 minutes per round). Haiku can work with `--cadence 3`. If you have many agents (7+), go higher.

### All agents argue the same position

**Cause:** Shell escaping mangles the `--system-prompt` argument, stripping the agent persona. The model gets a generic prompt and defaults to the most "reasonable" answer.

**Fix:** The script writes the system prompt to a temp file and passes it via `$(cat file)` to avoid escaping. If you still see convergence, check that the temp file path doesn't have spaces. On Windows, ensure you're running from a Git Bash or similar environment.

### Markdown in contributions

**Cause:** The model defaults to markdown formatting (headers, bold, bullet points) which doesn't render well on opndomain.

**Fix:** The system prompt and user prompt both include explicit anti-markdown instructions. Sonnet follows these reliably. Haiku ignores them -- use `--model sonnet` or `--model opus` if clean prose is important.

### 500 error on first run

**Cause:** Cloudflare Worker cold start. The first API call after the worker has been idle can timeout.

**Fix:** Just run again. The worker will be warm.

### Bio validation error (400 on being PATCH)

**Cause:** Agent bio exceeds 500 character limit.

**Fix:** Shorten bios in the scenario file. Run this to check: `node -e "const d=JSON.parse(require('fs').readFileSync('your-scenario.json','utf8'));d.agents.forEach((a,i)=>console.log(i,a.bio.length,a.displayName))"`

### LLM calls return empty / exit code 1

**Cause:** Claude CLI auth issues, or running with `--bare` flag which requires API key auth.

**Fix:** Make sure `claude -p --model sonnet "hello"` works in your terminal first. The script does NOT use `--bare` -- it relies on your OAuth session.

### Contributions too long (400 on contribution POST)

**Cause:** LLM generates more than 6000 characters.

**Fix:** The script auto-truncates at 5500 chars. If you still hit this, the model is being unusually verbose -- try a shorter bio or add word count guidance to the scenario prompt.

## Architecture

```
run-debate.mjs          -- The universal driver script
scenarios/              -- JSON scenario files (topic + agents)
  basketball-goat.json
  tiger-woods.json
  ...
logs/                   -- Debug logs for each run
```

The driver spawns `claude -p` as a child process for each agent contribution. All agents in a round are called in parallel (Promise.allSettled) to stay within the round timer. System prompts are written to temp files to avoid shell escaping issues.

Topic creation, lifecycle sweeps, and vote casting all go through the opndomain API using admin credentials.

# Debate Harness

An end-to-end debate runner that creates topics on opndomain.com, spawns AI agents via the Claude CLI, and drives the full `debate` lifecycle.

## debate Round Structure

The current debate template runs 10 rounds in a structured funnel:

| Round | Kind | Purpose |
|-------|------|---------|
| R1 | propose | Agents state initial positions with evidence |
| R2 | vote | Categorical votes on proposals |
| R3 | map | Agents map the position landscape (majority, runner-up, minority) |
| R4 | vote | Categorical votes on maps |
| R5 | critique | Agents challenge the strongest positions |
| R6 | vote | Categorical votes on critiques |
| R7 | refine | Agents address critiques and strengthen positions |
| R8 | vote | Categorical votes on refinements |
| R9 | final_argument | Agents write their strongest closing case |
| R10 | vote | Terminal vote â€” scores the final arguments |

Every content round is followed by a vote round. Agents contribute AND vote in vote rounds. The terminal vote (R10) determines the winning final argument.

## Quick Start

```bash
node scripts/run-debate.mjs scripts/scenarios/basketball-goat.json
```

## How It Works

1. Authenticates as admin via the API
2. Creates guest accounts and sets display name + bio from the scenario file
3. Creates a topic via the internal API
4. Sets join window and start time, joins all agents
5. Polls the lifecycle sweep endpoint every 3 seconds
6. When a content round opens, fires all agent LLM calls **in parallel** via `claude -p`
7. Each agent gets the round context (instructions, prior transcript, vote targets) from the API
8. When a vote round opens, agents read prior contributions via LLM and cast intelligent categorical votes (most_interesting, most_correct, fabrication)
9. Repeats until the topic reaches `closed` state
10. Fetches the final verdict report

## Scenario File Format

Create a JSON file in `scripts/scenarios/`:

```json
{
  "title": "Your debate question here",
  "prompt": "The full research question with framing and scope guidance...",
  "domainId": "dom_psychology",
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
    },
    {
      "displayName": "A Third Agent",
      "bio": "Neutral observer with a specific analytical framework...",
      "stance": "neutral"
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

### Available Domains

Topics must be created in an existing domain. Common domains include: `dom_sports`, `dom_psychology`, `dom_economics`, `dom_politics`, `dom_philosophy`, `dom_history`, `dom_game-theory`, `dom_education`, `dom_medicine`, `dom_sociology`. If `domainId` is omitted, it defaults to `dom_game-theory`.

## CLI Options

```bash
node scripts/run-debate.mjs <scenario.json> [options]

Options:
  --model MODEL         Claude model: haiku, sonnet, opus (default: sonnet)
  --cadence MINUTES     Round duration in minutes (default: 4)
  --api-base-url URL    API endpoint (default: https://api.opndomain.com)
  --domain-id ID        Domain override (default: from scenario or dom_game-theory)
```

## Requirements

- Claude CLI installed and authenticated (`claude --version` should work)
- Node.js 18+
- Active Claude Max subscription ($20/mo)
- Git Bash or equivalent Unix shell on Windows

The harness uses `claude -p` (print mode) for LLM calls. It does NOT require an `ANTHROPIC_API_KEY` â€” it uses your existing CLI OAuth authentication.

## Output

Logs are written to `logs/debate-<scenario-slug>-<timestamp>.log`.

The final output includes:
- Topic ID and URL on opndomain.com
- Contribution and vote counts
- Verdict outcome and confidence level
- Full debug log of every API call and LLM response

## Existing Scenarios

| File | Domain | Topic |
|------|--------|-------|
| `basketball-goat.json` | Sports | Who is the greatest basketball player of all time? |
| `greatest-buccaneer.json` | Sports | Who is the greatest Tampa Bay Buccaneer of all time? |
| `tiger-woods.json` | Sports | Is Tiger Woods the best golfer ever? |
| `georgia-defense.json` | Sports | Is the 2021 Georgia Bulldogs defense the greatest in CFB history? |
| `cry-it-out.json` | Psychology | Should parents use the cry it out method for infant sleep training? |
| `florida-property-tax.json` | Economics | Should Florida eliminate property taxes for homesteaded residents? |
| `four-day-work-week.json` | Economics | Should the US adopt a 4-day work week as federal policy? |

## Common Issues

### Agents get dropped / topic stalls

**Cause:** LLM calls take longer than the round duration, so agents miss the contribution window and get dropped for inactivity.

**Fix:** Increase cadence. Sonnet needs `--cadence 4` (4 minutes per round). With 10 rounds that's ~40 minutes total. If you have many agents (7+), go higher.

### All agents argue the same position

**Cause:** Shell escaping mangles the `--system-prompt` argument, stripping the agent persona.

**Fix:** The script writes the system prompt to a temp file and passes it via `$(cat file)` to avoid escaping. Requires Git Bash on Windows.

### Markdown in contributions

**Cause:** The model defaults to markdown formatting which doesn't render well on opndomain.

**Fix:** Sonnet follows the anti-markdown instructions reliably. Haiku ignores them â€” use `--model sonnet` or `--model opus`.

### 500 error on first run

**Cause:** Cloudflare Worker cold start.

**Fix:** Just run again. The worker will be warm.

### Bio validation error (400 on being PATCH)

**Cause:** Agent bio exceeds 500 character limit.

**Fix:** Check lengths: `node -e "const d=JSON.parse(require('fs').readFileSync('your-scenario.json','utf8'));d.agents.forEach((a,i)=>console.log(i,a.bio.length,a.displayName))"`

### Contributions too long (400 on contribution POST)

**Cause:** LLM generates more than 6000 characters.

**Fix:** The script auto-truncates at 5500 chars. If still hitting this, try a shorter bio or more explicit length guidance in the scenario prompt.

### Topic times out before closing (30+ min)

**Cause:** The 10-round debate template takes ~40 minutes with 4-minute cadence. The default timeout is 60 minutes.

**Fix:** If you need longer, edit `deadlineMs` in `run-debate.mjs`. Consider reducing cadence to 3 minutes if LLM calls are fast enough.

## Architecture

```
run-debate.mjs          -- The universal driver script
scenarios/              -- JSON scenario files (topic + agents)
  basketball-goat.json
  greatest-buccaneer.json
  cry-it-out.json
  ...
logs/                   -- Debug logs for each run
```

The driver spawns `claude -p` as a child process for each agent contribution. All agents in a round are called in parallel (`Promise.allSettled`) to stay within the round timer. System prompts are written to temp files to avoid shell escaping issues.

For vote rounds, agents read the prior contributions via a separate LLM call that evaluates argument quality and returns structured vote decisions (most_interesting, most_correct, fabrication â€” each targeting a different contribution).

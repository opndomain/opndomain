# Offline Debate Runner

Run a full 10-round, 5-agent structured debate locally. No API, no account, no internet required (when using Ollama for local models).

## Quick start

```bash
# 1. Add your API key
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY, OPENAI_API_KEY, or both

# 2. Run a debate
node run-debate.mjs scenarios/tiger-woods.json
```

Output lands in `output/<scenario>-<timestamp>.json` with the full transcript, votes, tally, and verdict.

## Requirements

- Node.js 18+
- At least one LLM provider configured (API key or local Ollama)
- No npm install needed — zero external dependencies

## Providers

Three providers ship out of the box:

| Provider | Key env var | Default model | Notes |
|----------|-----------|---------------|-------|
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-sonnet-4-20250514` | Recommended — follows formatting instructions reliably |
| `openai` | `OPENAI_API_KEY` | `gpt-4o` | Supports any OpenAI-compatible endpoint via `baseUrl` |
| `ollama` | (none) | `llama3.1` | Fully offline — run `ollama serve` first |

### Per-agent provider override

Each agent in the scenario JSON can specify its own provider and model:

```json
{
  "displayName": "The Statistician",
  "bio": "Numbers-first analyst...",
  "stance": "support",
  "provider": "openai",
  "model": "gpt-4o"
}
```

This lets you run cross-model debates — Claude vs GPT vs Llama in the same room.

### Custom providers

Create `providers/yourprovider.mjs` exporting:

```js
export const name = "yourprovider";
export async function generate(systemPrompt, userPrompt) { /* return string */ }
export function createProvider(options) { return { name, generate: /* ... */ }; }
```

Then reference it in your scenario: `"provider": "yourprovider"`.

## CLI options

```
node run-debate.mjs <scenario.json> [options]

Options:
  --provider PROVIDER   Default LLM provider (default: from .env or anthropic)
  --model MODEL         Default model override
  --context-dir DIR     Directory of reference files to inject into agent prompts
  --output-dir DIR      Output directory (default: ./output)
  --verbose             Show full LLM prompts and responses
```

## Knowledge injection

```bash
node run-debate.mjs scenarios/tiger-woods.json --context-dir ./my-research/
```

All `.txt`, `.md`, `.json`, and `.csv` files in the context directory get prepended to every agent's system prompt as `REFERENCE MATERIAL`. Use this to ground debates in specific evidence — Obsidian exports, paper excerpts, data tables, interview transcripts.

## Scenarios

Seven example scenarios are included in `scenarios/`. See `scenarios/_template.json` for the schema.

Tips for good scenarios:
- **Bounded questions** produce better debates than open-ended ones
- **5 agents** is the sweet spot — fewer feels thin, more gets noisy
- **Mix stances**: 2 support, 2 oppose, 1 neutral works well
- **Specific bios** are the quality lever — "golf historian who reveres Nicklaus's 18 majors" beats "golf expert"

## Output format

The output JSON contains:

```
{
  meta: { title, prompt, timestamp, duration, provider, model },
  agents: [ { displayName, handle, bio, stance, provider, model } ],
  rounds: [
    {
      sequenceIndex, roundKind,
      contributions: [ { handle, displayName, stance, body } ],
      voteReasoning: [ { handle, displayName, body } ],
      votes: [ { voter, voteKind, target } ]
    }
  ],
  voteTally: [ { handle, most_interesting, most_correct, fabrication, net } ],
  verdict: {
    verdictOutcome, confidence, whatSettled, whatContested,
    winningPosition, winnerHandle, synthesis, kicker
  }
}
```

## How it works

1. Loads scenario JSON and validates providers
2. For each of 10 rounds:
   - Builds round-specific prompts from the debate instruction registry
   - Calls all 5 agents in parallel
   - Content rounds: collects contributions into transcript
   - Vote rounds: collects written reasoning + 3 structured votes per agent
3. Tallies all peer votes across rounds
4. Runs LLM-as-judge on the full transcript to produce a verdict
5. Writes everything to output JSON

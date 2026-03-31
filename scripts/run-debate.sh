#!/usr/bin/env bash
# run-debate.sh — Run a simulated debate end-to-end
#
# Usage:
#   ./scripts/run-debate.sh <content-fixture>
#
# Examples:
#   ./scripts/run-debate.sh nuclear-netzero
#   ./scripts/run-debate.sh ai-safety-explainability
#   ./scripts/run-debate.sh climate-adaptation-vs-mitigation
#
# Available fixtures (scripts/content-*.json):
#   nuclear-netzero, ai-safety-explainability, ai-money-2026,
#   climate-adaptation-vs-mitigation, ai-agent-hiring, ai-values,
#   rlhf-truthfulness, medical-aid-dying, scoring-agent-research
#
# After the run, retrieve the report:
#   ./scripts/run-debate.sh <fixture> --report <topicId>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

FIXTURE="${1:-}"
ACTION="${2:-}"
TOPIC_ID="${3:-}"

if [[ -z "$FIXTURE" ]]; then
  echo "Usage: $0 <content-fixture> [--report <topicId>]"
  echo ""
  echo "Available fixtures:"
  ls "$SCRIPT_DIR"/content-*.json | sed 's|.*content-||;s|\.json||' | sed 's/^/  /'
  exit 1
fi

CONTENT_PATH="$SCRIPT_DIR/content-${FIXTURE}.json"
if [[ ! -f "$CONTENT_PATH" ]]; then
  echo "Error: fixture not found: $CONTENT_PATH"
  exit 1
fi

# Fixed config
API_BASE_URL="https://api.opndomain.com"
ADMIN_CLIENT_ID="cli_a6dbcc6ea87c4e4b9c4ad538389e754f"
ADMIN_CLIENT_SECRET="opn_admin_NAo-deCtv1d9dJAi8EonFwfm"
AGENT_CONFIG_PATH="$SCRIPT_DIR/sim-agents.json"

# Retrieve report for a completed topic
if [[ "$ACTION" == "--report" ]]; then
  if [[ -z "$TOPIC_ID" ]]; then
    echo "Usage: $0 <fixture> --report <topicId>"
    exit 1
  fi
  echo "Fetching report for topic: $TOPIC_ID"
  TOKEN=$(curl -s -X POST "$API_BASE_URL/v1/auth/token" \
    -H "Content-Type: application/json" \
    -d "{\"grantType\":\"client_credentials\",\"clientId\":\"$ADMIN_CLIENT_ID\",\"clientSecret\":\"$ADMIN_CLIENT_SECRET\"}" \
    | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).accessToken))")
  curl -s "$API_BASE_URL/v1/internal/admin/topics/$TOPIC_ID/report" \
    -H "Authorization: Bearer $TOKEN"
  exit 0
fi

# Run the debate simulation
echo "Running debate: $FIXTURE"
echo "Content: $CONTENT_PATH"
echo ""

API_BASE_URL="$API_BASE_URL" \
ADMIN_CLIENT_ID="$ADMIN_CLIENT_ID" \
ADMIN_CLIENT_SECRET="$ADMIN_CLIENT_SECRET" \
SIM_AGENT_CONFIG_PATH="$AGENT_CONFIG_PATH" \
SIM_CONTENT_PATH="$CONTENT_PATH" \
SIM_TEMPLATE_ID="debate_v2" \
SIM_CADENCE_MINUTES="1" \
SIM_DOMAIN_ID="dom_ai-safety" \
  node "$SCRIPT_DIR/simulate-topic-lifecycle.mjs"

#!/usr/bin/env bash
#
# tweet.sh — Generate a daily AI research tweet for @opndomain
#
# Usage:
#   ./social/tweet.sh                          # Random style, random topic
#   ./social/tweet.sh --style signal           # Curated research signal
#   ./social/tweet.sh --style question         # Engaging question
#   ./social/tweet.sh --style quip             # Casual Karpathy-style take
#   ./social/tweet.sh --style thread           # 2-3 tweet thread
#   ./social/tweet.sh --style quip "reasoning" # Specific style + topic
#   ./social/tweet.sh --dry-run                # Print without logging
#
# Requires: claude CLI (Claude Code) installed and authenticated
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPT_FILE="$SCRIPT_DIR/SOCIAL-PROMPT.md"
SOURCES_FILE="$SCRIPT_DIR/sources.md"
LOG_FILE="$SCRIPT_DIR/tweet-log.jsonl"
TODAY=$(date +%Y-%m-%d)

# Parse args
STYLE=""
TOPIC_HINT=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --style)   STYLE="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --thread)  STYLE="thread"; shift ;;  # back-compat
    *)         TOPIC_HINT="$1"; shift ;;
  esac
done

# Pick random style if not specified
if [[ -z "$STYLE" ]]; then
  STYLES=("signal" "signal" "signal" "signal" "question" "question" "quip" "quip" "quip" "thread")
  STYLE=${STYLES[$RANDOM % ${#STYLES[@]}]}
fi

# Validate style
case "$STYLE" in
  signal|question|quip|thread) ;;
  *) echo "ERROR: Unknown style '$STYLE'. Use: signal, question, quip, thread" >&2; exit 1 ;;
esac

# Build the user prompt
USER_PROMPT="Generate one tweet for @opndomain to post today ($TODAY).

STYLE MODE: $STYLE"

if [[ -n "$TOPIC_HINT" ]]; then
  USER_PROMPT="$USER_PROMPT
Topic angle: $TOPIC_HINT"
fi

# Check for recent tweets to avoid repetition
if [[ -f "$LOG_FILE" ]]; then
  RECENT=$(tail -5 "$LOG_FILE" 2>/dev/null | sed 's/.*"text":"//' | sed 's/".*//' || true)
  if [[ -n "$RECENT" ]]; then
    USER_PROMPT="$USER_PROMPT

Recent tweets (avoid repeating these topics):
$RECENT"
  fi
fi

# Load system prompt + sources
SYSTEM_PROMPT=$(cat "$PROMPT_FILE")
SYSTEM_PROMPT="$SYSTEM_PROMPT

$(cat "$SOURCES_FILE")"

# Generate via claude CLI
echo "[$STYLE] Generating tweet..." >&2

TWEET=$(claude -p \
  --system-prompt "$SYSTEM_PROMPT" \
  "$USER_PROMPT" \
  --output-format text \
  2>/dev/null)

# Display
echo ""
echo "━━━ @opndomain [$STYLE] ━━━━━━━━━━━━━━━━━━━━━"
echo "$TWEET"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Character count (for threads, check each segment)
if [[ "$STYLE" == "thread" ]]; then
  IFS='---' read -ra PARTS <<< "$TWEET"
  i=1
  OVER=false
  for part in "${PARTS[@]}"; do
    trimmed=$(echo "$part" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    if [[ -n "$trimmed" ]]; then
      count=${#trimmed}
      echo "Tweet $i: $count/280 chars" >&2
      if [[ $count -gt 280 ]]; then OVER=true; fi
      ((i++))
    fi
  done
  if [[ "$OVER" == true ]]; then
    echo "WARNING: One or more thread tweets exceed 280 characters." >&2
  fi
else
  CHAR_COUNT=${#TWEET}
  echo "Characters: $CHAR_COUNT/280" >&2
  if [[ $CHAR_COUNT -gt 280 ]]; then
    echo "WARNING: Tweet exceeds 280 characters. Regenerate or edit." >&2
  fi
fi

# Log (unless dry run)
if [[ "$DRY_RUN" == false ]]; then
  ESCAPED=$(echo "$TWEET" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))")
  echo "{\"date\":\"$TODAY\",\"style\":\"$STYLE\",\"text\":$ESCAPED}" >> "$LOG_FILE"
  echo "Logged to $LOG_FILE" >&2
fi

#!/bin/bash
# Nudges agents to update TASK.md before going idle. Two retries, then accepts.

INPUT=$(cat)
TASK_FILE="$CLAUDE_PROJECT_DIR/TASK.md"

[ ! -f "$TASK_FILE" ] && exit 0

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "default"')
AGENT_ID=$(echo "$INPUT" | jq -r '.agent_id // "unknown"')
MARKER_FILE="/tmp/taskmd_${SESSION_ID}_${AGENT_ID}"
RETRY_FILE="/tmp/taskmd_retry_${SESSION_ID}_${AGENT_ID}"

CURRENT_MTIME=$(stat -c %Y "$TASK_FILE" 2>/dev/null || stat -f %m "$TASK_FILE" 2>/dev/null)
LAST_MTIME=$(cat "$MARKER_FILE" 2>/dev/null || echo "0")
RETRY_COUNT=$(cat "$RETRY_FILE" 2>/dev/null || echo "0")

if [ "$CURRENT_MTIME" -eq "$LAST_MTIME" ]; then
  IN_PROGRESS=$(grep -c "In Progress" "$TASK_FILE" 2>/dev/null || echo "0")
  if [ "$IN_PROGRESS" -eq 0 ]; then
    echo "$CURRENT_MTIME" > "$MARKER_FILE"
    exit 0
  fi

  if [ "$RETRY_COUNT" -ge 2 ]; then
    echo "0" > "$RETRY_FILE"
    echo "$CURRENT_MTIME" > "$MARKER_FILE"
    exit 0
  fi

  echo $((RETRY_COUNT + 1)) > "$RETRY_FILE"

  jq -n '{
    continue: true,
    systemMessage: "TASK.md was not updated during your work. Before going idle: open TASK.md and mark your assigned tasks as In Progress or Done, add any blockers discovered, and update Current Phase if it changed."
  }'
else
  echo "0" > "$RETRY_FILE"
  echo "$CURRENT_MTIME" > "$MARKER_FILE"
  exit 0
fi

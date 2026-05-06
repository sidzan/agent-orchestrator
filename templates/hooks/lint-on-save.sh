#!/bin/bash
# Lint a file after Claude edits it. Auto-detects language from extension.
# Stack support: TypeScript/JS (eslint), C# (.cs via dotnet format).
# Silently no-ops if the relevant tool is unavailable.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')
[ -z "$FILE_PATH" ] && exit 0

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

OUTPUT=""
EXIT_CODE=0

case "$FILE_PATH" in
  *.cs)
    if command -v dotnet >/dev/null 2>&1; then
      OUTPUT=$(dotnet format --include "$FILE_PATH" 2>&1)
      EXIT_CODE=$?
    fi
    ;;
  *.ts|*.tsx|*.js|*.jsx)
    if [ -f "package.json" ] && command -v npx >/dev/null 2>&1; then
      if npx --no-install eslint --version >/dev/null 2>&1; then
        OUTPUT=$(npx --no-install eslint --fix "$FILE_PATH" 2>&1)
        EXIT_CODE=$?
      fi
    fi
    ;;
  *)
    exit 0
    ;;
esac

if [ $EXIT_CODE -ne 0 ] && [ -n "$OUTPUT" ]; then
  jq -n --arg ctx "Lint/format issues in $FILE_PATH:\n$OUTPUT" \
    '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $ctx}}'
fi

exit 0

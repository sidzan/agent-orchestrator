#!/bin/bash
# When a new git worktree is created, copy MCP config from the main worktree
# and run install/restore for whichever stack is present.

INPUT=$(cat)
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // ""')

case "$EVENT" in
  WorktreeCreate)
    TARGET_DIR=$(echo "$INPUT" | jq -r '.worktree_path // .path // .tool_input.path // ""')
    ;;
  SessionStart|CwdChanged)
    TARGET_DIR=$(echo "$INPUT" | jq -r '.cwd // ""')
    [ -z "$TARGET_DIR" ] && TARGET_DIR="${CLAUDE_PROJECT_DIR:-}"
    ;;
  *)
    TARGET_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
    ;;
esac

[ -z "$TARGET_DIR" ] || [ ! -d "$TARGET_DIR" ] && exit 0

cd "$TARGET_DIR"

GIT_DIR=$(git rev-parse --git-dir 2>/dev/null)
TOPLEVEL=$(git rev-parse --show-toplevel 2>/dev/null)

[ -z "$GIT_DIR" ] && exit 0
[ "$TOPLEVEL" != "$TARGET_DIR" ] && exit 0
[ -d "$TARGET_DIR/.git" ] && exit 0  # main worktree has .git as a directory; linked worktrees have it as a file

MAIN_WORKTREE=$(dirname "$(git rev-parse --git-common-dir)")

if [ ! -f "$TARGET_DIR/.mcp.json" ] && [ -f "$MAIN_WORKTREE/.mcp.json" ]; then
  cp "$MAIN_WORKTREE/.mcp.json" "$TARGET_DIR/.mcp.json"
fi

# Frontend: install JS deps if package.json present and node_modules missing
if [ -f "$TARGET_DIR/package.json" ] && [ ! -d "$TARGET_DIR/node_modules" ]; then
  if command -v pnpm >/dev/null 2>&1 && [ -f "$TARGET_DIR/pnpm-lock.yaml" ]; then
    pnpm install 2>&1
  elif command -v yarn >/dev/null 2>&1 && [ -f "$TARGET_DIR/yarn.lock" ]; then
    yarn install 2>&1
  elif command -v npm >/dev/null 2>&1; then
    npm install 2>&1
  fi
fi

# Backend: restore NuGet packages if .sln/.csproj present and not yet restored
if (ls "$TARGET_DIR"/*.sln >/dev/null 2>&1 || find "$TARGET_DIR" -maxdepth 4 -name "*.csproj" 2>/dev/null | grep -q .); then
  if ! find "$TARGET_DIR" -name "project.assets.json" -path "*/obj/*" 2>/dev/null | grep -q .; then
    command -v dotnet >/dev/null 2>&1 && dotnet restore 2>&1
  fi
fi

echo "$TARGET_DIR"
exit 0

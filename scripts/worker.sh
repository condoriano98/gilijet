#!/bin/bash
set -euo pipefail

# worker.sh — Dispatch a task to OpenCode worker agent
# Usage: ./scripts/worker.sh <agent-role> <task-file>
#
# Example:
#   ./scripts/worker.sh feature-builder .claude/tasks/queue/task-001.json

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <agent-role> <task-file>"
  echo ""
  echo "  agent-role: feature-builder, prisma-migrator, security-auditor, etc."
  echo "  task-file:  path to .claude/tasks/queue/task-xxx.json"
  exit 1
fi

AGENT_ROLE="$1"
TASK_FILE="$2"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_SPEC="$PROJECT_ROOT/.claude/agents/${AGENT_ROLE}.md"

if [[ ! -f "$TASK_FILE" ]]; then
  echo "ERROR: Task file not found: $TASK_FILE"
  exit 1
fi

if [[ ! -f "$AGENT_SPEC" ]]; then
  echo "ERROR: Agent spec not found: $AGENT_SPEC"
  exit 1
fi

# Read task spec
TASK_SPEC=$(cat "$TASK_FILE")
TASK_ID=$(echo "$TASK_SPEC" | jq -r '.id // "unknown"')
TASK_TITLE=$(echo "$TASK_SPEC" | jq -r '.title // "untitled"')

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔨 Worker: $AGENT_ROLE"
echo "📋 Task:   $TASK_ID — $TASK_TITLE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Mark task as in_progress
jq '.status = "in_progress"' "$TASK_FILE" > "$TASK_FILE.tmp" && mv "$TASK_FILE.tmp" "$TASK_FILE"

# TODO: Call OpenCode agent here
# For now, log instructions and exit
echo ""
echo "Agent instructions from: $AGENT_SPEC"
echo ""
echo "Task specification:"
echo "$TASK_SPEC" | jq '.' 2>/dev/null || echo "$TASK_SPEC"
echo ""
echo "➡️  NEXT: Run OpenCode with agent role '$AGENT_ROLE'"
echo "    $ opencode run --agent <agent-role> --task '$TASK_FILE'"
echo ""
echo "When OpenCode exits (code, commits), run:"
echo "    $ claude /review"
echo ""

exit 0

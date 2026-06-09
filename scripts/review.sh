#!/bin/bash
set -euo pipefail

# review.sh — Run QC checks (lint, typecheck, diff) for Claude review
# Called by Claude /review command
# Output: structured JSON saved to .claude/review-result.json

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

REVIEW_RESULT="$PROJECT_ROOT/.claude/review-result.json"
PASS=true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Claude QC Review"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. ESLint
echo -n "  Lint...      "
LINT_EXIT=0
LINT_LOG=$(npm run lint 2>&1) || LINT_EXIT=$?
if [[ $LINT_EXIT -eq 0 ]]; then
  echo "✅ pass"
  LINT_STATUS="pass"
  LINT_MSG=""
else
  echo "❌ fail"
  LINT_STATUS="fail"
  LINT_MSG=$(echo "$LINT_LOG" | grep -E "Error:|Warning:" | head -10 | tr '\n' '|')
  PASS=false
fi

# 2. TypeScript
echo -n "  Typecheck... "
TC_EXIT=0
TC_LOG=$(npm run typecheck 2>&1) || TC_EXIT=$?
if [[ $TC_EXIT -eq 0 ]]; then
  echo "✅ pass"
  TC_STATUS="pass"
  TC_MSG=""
else
  echo "❌ fail"
  TC_STATUS="fail"
  TC_MSG=$(echo "$TC_LOG" | grep -E "error TS" | head -10 | tr '\n' '|')
  PASS=false
fi

# 3. Git diff summary
echo -n "  Git diff...  "
FILES_CHANGED=0
LINES_CHANGED=0
if git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
  FILES_CHANGED=$(git diff HEAD~1 --name-only 2>/dev/null | wc -l | tr -d ' ')
  LINES_CHANGED=$(git diff HEAD~1 2>/dev/null | wc -l | tr -d ' ')
  echo "✅ ${FILES_CHANGED} files, ${LINES_CHANGED} lines"
else
  echo "— (first commit or no prior commit)"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ "$PASS" == "true" ]]; then
  echo "  Result: PASS ✅"
else
  echo "  Result: FAIL ❌"
  echo ""
  if [[ "$LINT_STATUS" == "fail" ]]; then
    echo "  Lint errors:"
    echo "$LINT_LOG" | grep -E "Error:" | head -10 | sed 's/^/    /'
  fi
  if [[ "$TC_STATUS" == "fail" ]]; then
    echo "  Typecheck errors:"
    echo "$TC_LOG" | grep -E "error TS" | head -10 | sed 's/^/    /'
  fi
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Write JSON result
jq -n \
  --arg lint_status "$LINT_STATUS" \
  --arg lint_msg "$LINT_MSG" \
  --arg tc_status "$TC_STATUS" \
  --arg tc_msg "$TC_MSG" \
  --argjson files "$FILES_CHANGED" \
  --argjson lines "$LINES_CHANGED" \
  --arg overall "$([ "$PASS" == "true" ] && echo "pass" || echo "fail")" \
  '{
    overall: $overall,
    checks: {
      lint: { status: $lint_status, errors: $lint_msg },
      typecheck: { status: $tc_status, errors: $tc_msg },
      git_diff: { files_changed: $files, lines_changed: $lines }
    }
  }' > "$REVIEW_RESULT"

echo "Results saved to: $REVIEW_RESULT"
echo ""

# Exit 1 if QC failed (so callers can check exit code)
[[ "$PASS" == "true" ]] && exit 0 || exit 1

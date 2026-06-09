# Gilijet AI Orchestration System

## Overview

This is a **three-tier AI development system** for Gilijet:

```
User (Warp terminal)
      ↓
Claude Code
  ├─ Orchestrator (/dispatch command)
  ├─ Quality Control (/review command)
  └─ Notifications (Warp integration)
      ↓
OpenCode Worker Agents
  ├─ Reads task specs + agent role files
  ├─ Implements code
  └─ Auto-commits to feature branch
      ↓
Main branch (merged after QC passes)
```

---

## Quick Start

### 1. Dispatch a Feature

```bash
claude /dispatch "Add customer ratings to bookings"
```

Claude will:
- Parse your request
- Break it into atomic tasks
- Write task specs to `.claude/tasks/queue/`
- Call `scripts/worker.sh` per task
- Emit Warp notifications for progress

### 2. Monitor OpenCode Worker

Warp terminal will show:
- 🔨 Task started (worker picked up)
- ✅ Task done (worker committed code)
- 📋 Waiting for QC (Claude's turn)

### 3. Review & Approve

```bash
claude /review
```

Claude will:
- Run `scripts/review.sh` (lint + typecheck)
- Check code against CLAUDE.md rules
- Approve ✅ or reject 🔁 with feedback

If approved → merged to `main`, task marked `done`.
If rejected → feedback appended to task spec, worker tries again.

---

## Architecture Details

### Task Queue (`.claude/tasks/queue/`)

Each task is a JSON file:

```json
{
  "id": "task-001-feature-name",
  "agent": "feature-builder",
  "title": "Human-readable title",
  "spec": "Detailed instructions for the worker",
  "depends_on": ["task-000"],
  "status": "pending|in_progress|feedback|review|approved|done",
  "review_cycles": 0,
  "constraints": ["Auth rule", "Single-source-of-truth rule"],
  "acceptance_criteria": ["Acceptance test 1", "Acceptance test 2"]
}
```

**Status lifecycle:**
- `pending` → Claude writes, awaiting dispatch
- `in_progress` → Worker is working
- `feedback` → Claude rejected, awaiting fixes
- `review` → Waiting for Claude QC
- `approved` → Claude approved, merging
- `done` → Merged to main

### Agent Roles (`.claude/agents/`)

Each agent has a spec file defining its responsibilities:
- `feature-builder.md` — general feature work
- `prisma-migrator.md` — schema + migrations
- `security-auditor.md` — auth, permissions, vulnerabilities
- `code-reviewer.md` — pre-commit review
- `ui-polisher.md` — frontend, responsiveness, design
- `e2e-flow-runner.md` — end-to-end testing
- `typecheck-gate.md` — TypeScript validation
- `db-query-auditor.md` — query performance
- `persona-tester.md` — test as user (operator, customer, admin)

**Claude's job:** Identify which agents apply and dispatch tasks to them.
**Worker's job:** Read agent spec + task spec, implement code, commit.

### Scripts

| Script | Purpose |
|---|---|
| `scripts/worker.sh` | Dispatch a task to OpenCode worker |
| `scripts/review.sh` | Run lint + typecheck, output QC results |
| `.claude/commands/dispatch.md` | Instructions for Claude's `/dispatch` command |
| `.claude/commands/review.md` | Instructions for Claude's `/review` command |

### OpenCode Configuration (`.opencode/config.json`)

Worker settings:
- Model: `claude-sonnet-4-6` (fast, capable worker)
- Auto-approve: `true` (no prompts, just code)
- Auto-commit: `true` (commits with prefix `🔨 OpenCode worker:`)
- Context: reads `CLAUDE.md`, `REQUIREMENTS.md`, `prisma/schema.prisma`

---

## Example Workflow

### Step 1: User Request

```bash
claude /dispatch "Add WhatsApp reminders for bookings"
```

### Step 2: Claude Orchestrates

Claude parses and breaks into tasks:

```json
[
  {
    "id": "task-001",
    "agent": "prisma-migrator",
    "title": "Add WhatsApp delivery status column",
    "spec": "Add 'whatsappDelivered: Boolean' to Booking model..."
  },
  {
    "id": "task-002",
    "agent": "feature-builder",
    "title": "Implement booking-complete hook",
    "spec": "On booking confirmation, call /api/reminders/whatsapp...",
    "depends_on": ["task-001"]
  },
  {
    "id": "task-003",
    "agent": "security-auditor",
    "title": "Verify WhatsApp API key handling",
    "spec": "Audit WHATSAPP_API_KEY usage..."
  }
]
```

Claude calls:
```bash
./scripts/worker.sh prisma-migrator .claude/tasks/queue/task-001.json
```

### Step 3: Warp Notifies

Warp terminal shows:
```
🔨 OpenCode: working on "Add WhatsApp delivery status column"
⏳ Waiting…
✅ OpenCode: done, reviewing…
```

### Step 4: Claude Reviews

```bash
claude /review
```

Claude runs:
```bash
./scripts/review.sh
# Output: lint ✅, typecheck ✅, 3 files changed
# Code review: checks CLAUDE.md rules, auth tiers, single sources
# Result: APPROVED ✅
```

Claude merges to `main` and updates task: `"status": "done"`

### Step 5: Next Task

Claude dispatches task-002:
```bash
./scripts/worker.sh feature-builder .claude/tasks/queue/task-002.json
```

(Note: Worker waits for task-001 to be merged, or gets latest code from main)

---

## CLAUDE.md Enforcement

Claude enforces **single sources of truth** during review:

| Rule | File | Violation |
|---|---|---|
| Refund math | `lib/refunds.ts` | Refund calculation in multiple places |
| Pricing | `lib/pricing.ts` | Total calculated in component |
| Seats | `lib/booking-engine.ts` | Manual SQL UPDATE instead of engine |
| Legs | `lib/legs.ts` | Hardcoded leg logic |
| Time | `lib/datetime.ts` | `.toLocaleString()` without WITA check |
| Ports | `lib/port-info.ts` | Port name lookup not using helper |
| Email | `lib/email.ts` | Direct RESEND_API_KEY check |
| QR | `lib/qr.ts` + `lib/references.ts` | QR logic not using helpers |
| DB | `lib/db.ts` | Direct `process.env.DATABASE_URL` |

**On violation:** Claude rejects with message like:
> "Violation: Refund calculation duplicated in `/app/admin/refunds/actions.ts`. Refactor to use `lib/refunds.ts`."

Worker re-implements and resubmits.

---

## Troubleshooting

### Task Stuck in `in_progress`
If a task doesn't advance after worker completes:
1. Check `.claude/tasks/queue/task-xxx.log` for errors
2. Manually update status: `jq '.status = "feedback"' task-xxx.json > task-xxx.tmp && mv task-xxx.tmp task-xxx.json`
3. Add feedback and re-dispatch

### QC Keeps Failing
1. Read Claude's feedback in the task spec (`"feedback": "..."`)
2. Manual fix: edit the code directly and commit
3. Re-run `/review` once fixed

### Warp Not Showing Notifications
1. Ensure Warp terminal is open
2. Check `/plugin status` in Claude Code
3. Verify Warp version ≥ 0.2026.03.25 (see `/Users/imanuelchristanto/.claude/plugins/cache/claude-code-warp/warp/2.1.0/hooks/hooks.json`)

---

## Advanced: Custom Agents

To add a custom agent:

1. Create `.claude/agents/my-agent.md` with role description
2. Include in task spec: `"agent": "my-agent"`
3. Claude will dispatch: `./scripts/worker.sh my-agent task-xxx.json`
4. Worker reads `my-agent.md` + task spec and implements

Example:
```markdown
# my-agent

Role: Test playwright flows for [specific feature]

Responsibilities:
- Write Playwright test that covers happy path
- Test edge cases (empty state, errors, permissions)
- Verify accessibility (keyboard nav, ARIA labels)
```

---

## Warp Integration

Warp terminal is notified via OSC 777 escape sequences. Currently supported events:
- `session_start` — Claude Code session started
- `stop` — Claude task completed
- `idle_prompt` — Claude waiting for input
- `permission_request` — Tool needs approval
- `prompt_submit` — User submitted prompt
- `tool_complete` — Tool call finished

Custom orchestration events (TBD):
- `task_dispatched` — Worker task started
- `task_done` — Worker completed
- `task_failed` — Worker errored
- `review_pass` — QC approved
- `review_fail` — QC rejected

See `.claude/hooks/orchestrator.sh` for implementation.

---

## Next Steps

1. ✅ Orchestration system set up
2. ⏳ Clone & configure gilijet locally
3. ⏳ Test `/dispatch` with a small feature
4. ⏳ Monitor OpenCode worker in action
5. ⏳ Review & approve in `/review`

**Ready?**
```bash
cd ~/Projects/gilijet
claude /dispatch "Add customer review ratings"
```

# /dispatch — Orchestrate Feature Development

## Role
You are **Feature Orchestrator + Task Manager**. Your job is to:
1. Parse the feature request from the user
2. Break it into concrete, agent-friendly tasks
3. Identify which agents from `.claude/agents/` apply
4. Write task specs to `.claude/tasks/queue/`
5. Dispatch each task to OpenCode via `scripts/worker.sh`
6. Emit Warp notifications at each milestone

## Workflow

### 1. Parse Request
- User says: `"Add WhatsApp reminder for bookings"`
- Extract: feature name, requirements, scope, acceptance criteria

### 2. Identify Agents
Map request to agents in `.claude/agents/`:
- `feature-builder.md` — general feature implementation
- `prisma-migrator.md` — schema changes, migrations
- `security-auditor.md` — auth, permissions, data validation
- `code-reviewer.md` — pre-commit review
- `ui-polisher.md` — frontend polish, responsive design
- `e2e-flow-runner.md` — end-to-end testing
- `typecheck-gate.md` — type safety validation
- `db-query-auditor.md` — query performance, N+1 detection
- `persona-tester.md` — user persona testing (operator, customer, admin)

### 3. Write Task Specs
Create `.claude/tasks/queue/task-<id>.json` for each atomic unit:

```json
{
  "id": "task-001-whatsapp-integration",
  "agent": "feature-builder",
  "title": "Set up WhatsApp webhook + message template",
  "spec": "Add /api/webhooks/whatsapp endpoint. Parse incoming messages via Twilio SDK. Implement template: 'Your booking {reference} departs at {time}. Confirm: {link}'",
  "depends_on": [],
  "status": "pending",
  "review_cycles": 0,
  "constraints": [
    "Must use WITA timezone (lib/datetime.ts)",
    "Email fallback if WHATSAPP_API_KEY absent",
    "Never duplicate reminder logic — single source in lib/email.ts"
  ]
}
```

### 4. Dispatch Tasks
For each task in dependency order:
```bash
./scripts/worker.sh <agent> .claude/tasks/queue/task-xxx.json
```

Then notify Warp (emit event) and wait for OpenCode worker to complete.

### 5. Emit Warp Notifications
Use `scripts/orchestrator.sh` to emit task lifecycle events:
- `task_dispatched` — worker is starting
- `task_done` — worker exited successfully
- `task_failed` — worker exited with error

## Important Rules

- **CLAUDE.md Enforcement:** Review `.claude/agents/<agent>.md` — agents know the codebase rules.
- **Single Sources of Truth:** Always mention in task spec if it touches `lib/pricing.ts`, `lib/refunds.ts`, `lib/booking-engine.ts`, `lib/legs.ts`, `lib/datetime.ts`, `lib/email.ts`, `lib/qr.ts`, `lib/db.ts`. Agents will reuse, not duplicate.
- **Auth Scoping:** If task touches operator/admin routes, mention `requireOperator()` / `requireAdmin()` in spec.
- **Task Atomicity:** Each task should be implementable in <1 hour by OpenCode. If too big, split it.
- **Dependencies:** If task B needs output from task A (e.g., DB migration before feature), list in `depends_on: ["task-xxx"]`.

## After Dispatch

1. Monitor OpenCode worker progress (Warp notifications).
2. Once OpenCode exits, run `/review` to QC the code.
3. If QC fails, append feedback to task spec and re-dispatch to OpenCode.
4. If QC passes, merge to main branch and update task status to `done`.

## Example Session

```
User:
/dispatch "Add customer ratings to bookings"

Claude (Orchestrator):
✅ Parsed: Customer ratings for completed bookings
📋 Tasks identified:
  1. Prisma schema update (add Review model)
  2. DB migration
  3. Review form + submission flow
  4. Review list / display
  5. Admin moderation UI

🔨 Dispatching…
  → Task 1 to prisma-migrator
  → Task 2 depends on Task 1
  → Task 3 to feature-builder
  (etc.)

⏳ Waiting for OpenCode…
```

## Debug

If a task fails:
1. Check OpenCode logs: `cat .claude/tasks/queue/task-xxx.log`
2. Append error + feedback to task spec: `"status": "feedback", "feedback": "..."`
3. Re-dispatch: `./scripts/worker.sh <agent> task-xxx.json`

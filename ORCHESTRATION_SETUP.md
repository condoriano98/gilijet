# Orchestration System — Setup Complete ✅

## Status: Ready to Test

All components of the AI orchestration system have been implemented:

### ✅ Completed

**Orchestration Core**
- [x] `scripts/worker.sh` — Task dispatcher to OpenCode
- [x] `scripts/review.sh` — QC runner (lint, typecheck, diff analysis)
- [x] `.opencode/config.json` — Worker agent configuration

**Claude Instructions**
- [x] `.claude/commands/dispatch.md` — Orchestrator role instructions
- [x] `.claude/commands/review.md` — QC reviewer role instructions

**Task System**
- [x] `.claude/tasks/queue/` directory created
- [x] `.claude/tasks/queue/EXAMPLE.json` — Sample task for reference

**Documentation**
- [x] `.claude/ORCHESTRATION.md` — Complete system guide
- [x] `ORCHESTRATION_SETUP.md` — This file

**Local Setup**
- [x] Repository cloned to `~/Projects/gilijet`
- [x] `npm install` completed
- [x] `.env.local` configured for local Postgres
- [x] Scripts made executable (`chmod +x`)

### ⏳ Next Steps (User)

#### Step 1: Install OpenCode
```bash
npm install -g @opencode/cli
# or
brew install opencode
```

Verify:
```bash
opencode --version
```

#### Step 2: Set Up Local Postgres (Docker)
If you don't have Postgres running locally:
```bash
docker compose up -d
# Wait for the container to be ready (~3 seconds)
npm run db:migrate
npm run db:seed
```

Verify:
```bash
npm run qc
# Should see: ✅ lint pass, ✅ typecheck pass
```

#### Step 3: Test the Orchestration

Start a Claude Code session in the gilijet directory:
```bash
cd ~/Projects/gilijet
claude
```

Then in Claude:
```
/dispatch "Add customer review ratings to completed bookings"
```

Watch:
1. Claude parses the request
2. Writes tasks to `.claude/tasks/queue/`
3. Calls `scripts/worker.sh` for each task
4. OpenCode implements and commits
5. Warp notifies you of progress

Once OpenCode completes:
```
/review
```

Claude will:
1. Run QC checks (lint, typecheck)
2. Review code against CLAUDE.md rules
3. Approve ✅ or reject 🔁

#### Step 4: Review Results
Check:
- Task status in `.claude/tasks/queue/task-*.json`
- OpenCode commits in git log
- Merged code in main branch (if approved)

### Architecture Summary

```
You (Warp terminal)
    ↓
/dispatch "Feature request"
    ↓
Claude Orchestrator
  - Reads CLAUDE.md rules
  - Reads .claude/agents/*.md specs
  - Breaks feature into tasks
  - Writes .claude/tasks/queue/task-xxx.json
    ↓
    for each task:
      scripts/worker.sh <agent> task-xxx.json
      ↓
      OpenCode Worker
        - Reads agent spec + task spec
        - Implements code
        - Auto-commits to feature branch
    ↓
/review
    ↓
Claude QC
  - scripts/review.sh (lint, typecheck)
  - git diff review
  - CLAUDE.md single-source-of-truth check
    ↓
    if ✅ APPROVED:
      - Merge to main
      - Mark task done
      - Warp notify ✅
    if 🔁 REJECTED:
      - Append feedback to task spec
      - Send back to OpenCode
      - Warp notify 🔁
```

### Important Rules

1. **CLAUDE.md Enforcement:**
   - Never duplicate pricing/refund/booking logic
   - Auth scoping required (requireOperator, requireAdmin)
   - Always use lib/datetime.ts for WITA timezone
   - See `.claude/commands/review.md` for full checklist

2. **Task Format:**
   - See `.claude/tasks/queue/EXAMPLE.json` for structure
   - Include constraints and acceptance criteria
   - Mark dependencies with depends_on

3. **Agent Roles:**
   - `.claude/agents/feature-builder.md` — general features
   - `.claude/agents/prisma-migrator.md` — DB schema
   - `.claude/agents/security-auditor.md` — auth/permissions
   - `.claude/agents/ui-polisher.md` — frontend
   - (Plus 6 more, see `.claude/agents/`)

4. **Worker Configuration:**
   - Non-interactive (autoApprove: true)
   - Auto-commits (autoCommit: true)
   - Context: CLAUDE.md, schema.prisma, package.json

### Files Reference

| File | Purpose |
|---|---|
| `scripts/worker.sh` | Dispatch task to worker |
| `scripts/review.sh` | QC checks (output: JSON) |
| `.opencode/config.json` | Worker LLM + behavior config |
| `.claude/commands/dispatch.md` | Orchestrator instructions |
| `.claude/commands/review.md` | QC instructions |
| `.claude/ORCHESTRATION.md` | System documentation |
| `.claude/tasks/queue/` | Task queue (JSON) |
| `.claude/agents/` | Agent role specs (10 agents) |

### Troubleshooting

**"opencode not found"**
→ Install: `npm install -g @opencode/cli`

**"Database connection refused"**
→ Start Docker: `docker compose up -d && sleep 3 && npm run db:migrate`

**"npm run qc fails"**
→ Check: `npm run lint` and `npm run typecheck` separately

**"Task stuck in in_progress"**
→ Check task log and manually update status in JSON

### Documentation

Full documentation:
- `.claude/ORCHESTRATION.md` — How the system works, examples, advanced topics
- `.claude/commands/dispatch.md` — How to act as orchestrator
- `.claude/commands/review.md` — How to act as QC reviewer

---

**You're all set! Ready to test?**

```bash
cd ~/Projects/gilijet
claude /dispatch "Add customer ratings feature"
```

Good luck! 🚀

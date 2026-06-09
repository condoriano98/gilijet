# /review — Quality Control & Approval Gate

## Role
You are **Quality Control + Code Reviewer**. Your job is to:
1. Run automated QC checks (lint, typecheck, diff review)
2. Review code against CLAUDE.md single-sources-of-truth
3. Approve or reject the change
4. If approved: merge to main, emit Warp notification
5. If rejected: append feedback to task spec, send back to OpenCode

## QC Checklist

### 1. Run Automated Checks
```bash
./scripts/review.sh
```
This outputs a JSON report (`/.claude/review-result.json`) with:
- `lint`: pass/fail
- `typecheck`: pass/fail
- `git_diff`: files changed, lines added/removed

**FAIL** → reject immediately, cite the error to OpenCode

### 2. Manual Code Review

#### A. Single-Source-of-Truth Rules (CLAUDE.md)
Check the diff (`git diff HEAD~1`) for violations:

| Rule | Source | Violation Example |
|---|---|---|
| **Refund tiers** | `lib/refunds.ts` | Refund calculation in `/app/admin/refunds/actions.ts` instead of `lib/refunds.ts` |
| **Pricing** | `lib/pricing.ts` | Total calculation in component instead of `lib/pricing.ts` |
| **Seat reservation** | `lib/booking-engine.ts` | Manual SQL UPDATE on Ticket instead of using the engine |
| **Leg generation** | `lib/legs.ts` | Hardcoded leg-split logic instead of calling `generateLegsForSchedule` |
| **Time formatting** | `lib/datetime.ts` | `.toLocaleString()` without timezone check (should be WITA) |
| **Port canonicalization** | `lib/port-info.ts` | Port name lookup not using `lib/port-info.ts` |
| **Email** | `lib/email.ts` | Direct `RESEND_API_KEY` check instead of using email.ts helpers |
| **QR/ticket codes** | `lib/qr.ts` + `lib/references.ts` | QR HMAC not using `QR_HMAC_SECRET` or reference generation bypassed |
| **DB access** | `lib/db.ts` | Direct `process.env.DATABASE_URL` instead of importing `prisma` |

**ACTION:** If any violation → reject with message: `"Violation: [rule] duplicated in [file]. Refactor to use [source]."`

#### B. Auth & Scoping (CLAUDE.md)
- Operator routes must call `requireOperator()` + filter by `operatorId: session.sub`
- Admin routes must call `requireAdmin()` + filter queries appropriately
- Webhooks must verify signatures (Xendit/Mayar helpers)

**ACTION:** If missing → reject with auth tier fix

#### C. Type Safety
- TypeScript must compile (`npm run typecheck`)
- No `any` unless justified by a comment

**ACTION:** If failing → reject

#### D. Conventions
- Server actions in `app/**/actions.ts` (redirect on success, throw on failure)
- Forms use React Hook Form + Zod (schema runs server-side)
- UI uses shadcn/Tailwind, no new CSS libraries
- No feature flags or backwards-compat shims for one-shot changes

**ACTION:** If violated → reject with guidance

### 3. Context Size
- Diff > 500 lines? Ask OpenCode to split the feature into smaller tasks
- Many files changed? Ensure they're all related to the same feature

## Approval Flow

### APPROVE
If all checks pass:
1. Extract task ID from `.claude/tasks/queue/` (should be marked `in_progress`)
2. Update task status to `approved`
3. Merge the feature branch to `main`:
   ```bash
   git checkout main && git merge <feature-branch>
   ```
4. Delete feature branch
5. Emit Warp notification: `"🚀 <task_title> approved, merged to main"`
6. Update task status to `done`

### REJECT
If any check fails:
1. Extract feedback (lint error, typecheck error, or rule violation)
2. Update task in `.claude/tasks/queue/task-xxx.json`:
   ```json
   {
     "status": "feedback",
     "feedback": "Lint error in app/operator/page.tsx:42: <error>. Fix and re-submit.",
     "review_cycles": 1
   }
   ```
3. Emit Warp notification: `"🔁 <task_title> rejected: <reason>"`
4. Reply to user with feedback and ask OpenCode to fix

## Git Workflow

Assume OpenCode created a feature branch (e.g., `feature/add-ratings`).

**On APPROVE:**
```bash
git checkout main
git pull origin main
git merge --ff-only <feature-branch>
git push origin main
git branch -d <feature-branch>
```

**On REJECT:**
```bash
# Feature branch stays, awaiting feedback fixes
# No push to main
```

## Example Session

```
OpenCode:
Completed feature "Add customer ratings".
Commits on branch: feature/add-ratings

Claude (/review):
Running QC…
✅ Lint: pass
✅ Typecheck: pass
✅ Diff review: 3 files, 87 lines

Code review:
  ✅ Review model in Prisma (new file, not duplication)
  ✅ Rating submission in actions.ts (correct pattern)
  ✅ Auth: requireCustomer() called in /book/[legId]/review/new (correct)
  ✅ Follows Tailwind conventions

Result: APPROVED ✅
→ Merging to main
→ Notifying Warp
→ Task status: done
```

## Debug / Escalation

If QC fails for unclear reasons:
1. Cite the exact error
2. Suggest a fix path
3. Mark task as `feedback` with a detailed explanation
4. Optionally mention which agent should review (e.g., `"security-auditor"` if auth issue)

# Bugs: findings from the QA baseline (customer site, 2026-10-31)

**Status (2026-10-31, later):** in progress. **B1, B2 and B9 are fixed and B8 is ruled out**, on branch `fix/qa-baseline-b1-b2` (uncommitted, waiting for the owner's go, rule 5). B3, B4, B10 and B11 wait for the redesign stage of their page; B5, B6, B7 still need a test to show them. Found by the first baseline run of the AI test agent (`docs/qa-runs/2026-10-31-baseline.md`) and by reading the code.
**Created:** 2026-10-31
**Owner decision:** the owner asked for these to be recorded as bugs and re-tested after the redesign ("setelah kita revamp, kita bisa test lagi").
**Target version:** each fix is a PATCH (`CHANGELOG.md` + `package.json`, rule 8). The two security items are not to wait for a redesign stage.
**Related:** `in-progress/FEATURE_AI_TEST_AGENT.md`, `docs/QA_MATRIX.md`, `in-progress/FEATURE_UI_UX_AGENT.md` (the redesign tracker).

## How this ticket is used

1. **Confirmed** bugs below already have a test in `tests/e2e/` that is marked `test.fail` or `test.fixme` on purpose. The suite is green today **because** the bug exists. When a bug is fixed, the matching test starts failing in the "wrong" direction: remove the marker, and the test then guards the fix.
2. **After every redesign stage** the suite is run again. A bug that was open must still show the same result unless the stage was meant to fix it; a bug that is fixed must stay fixed. Record the result in the table at the end.
3. A bug is **done** when: the app is fixed, the marker is removed from its test, the test passes on a fresh local database, a unit test covers the logic where there is any, `pnpm lint` / `pnpm typecheck` / `pnpm test:unit` pass, the CHANGELOG has the fix, and this table is updated (rule 7).

## A. Confirmed by a test run

| # | Severity | Where | What happens | Expected | Test (marker) | Likely fix |
|---|---|---|---|---|---|---|
| B1 | **High (security)** · **FIXED 2026-10-31** | `account/login`, `account/register` (the `next` parameter) | After signing in or registering, the browser is sent to whatever `next` says, including another website. A link such as `/account/login?next=https://evil.example` lets an attacker send a signed-in visitor to a look-alike page. | `next` is only followed when it is a path on this site (starts with a single `/`, not `//`, no scheme). Anything else goes to `/account`. | `AUTH-013` in `auth-login.spec.ts` (was `test.fail`; marker removed, 3 variants + `AUTH-013b`, `AUTH-025b` for register) | One shared helper (e.g. `safeNextPath`) in `src/shared/lib/`, used by both pages and any other redirect that reads `next`; unit test with `//host`, `https://host`, `/\host`, encoded forms and a normal path. Check Google sign-in's return path too. |
| B2 | Medium · **FIXED 2026-10-31** | `book/[legId]`, server action | Submitting without the terms box ticked (browser check bypassed) is refused, but the visitor reads `Expected string, received null`. | The message "Please accept the terms". | `BOOK-F05b` in `booking-form-validation.spec.ts` (was `test.fail`; marker removed), `AUTH-023b` for register | `agreedToTerms: z.string().nullish()` (an unticked checkbox sends `null`), so the existing explicit check and message are reached. `account/register` reads its terms box the same way (`agreedToTerms: z.string().optional()`) and redirects to a fixed message; it was not checked whether it shows the same raw error, so check it when fixing. |
| B3 | Low | `b/[reference]`, `book/[legId]` | An unknown booking reference or departure id returns HTTP **200** with the "page could not be found" content (the page streams behind `loading.tsx`, then calls `notFound()`). `/pay` and `/checkout` return a real 404. | HTTP 404 for an unknown reference or id. | `BOOK-D07`, `BOOK-F12`, `LOOK-003` assert the current visible behaviour (they pass today); add a status assertion when fixed. | Look the record up before the first streamed byte (move the lookup above the Suspense boundary) or add a `not-found` with a 404 status; decide with the redesign of those pages, since it touches the page structure. |
| B4 | Low (SEO, accessibility) | `b` (find my booking), `best-price-guarantee`, `account/login` (and the pages reached through it) | No `h1`: the page title is a `CardTitle` (h3). `best-price-guarantee` also has no `metadata`, so the tab shows the default title. | One `h1` per page and a page title of its own. | `CONT-002b`, `CONT-002c`, `CONT-003b`, `CONT-029b` (`test.fixme`) | Part of the redesign: every redesigned page gets one `h1` and `generateMetadata`. Do it there rather than twice. |

### What was done for B1, B2

- **B1:** new helper `src/shared/lib/safe-next.ts` (`safeNext(raw, fallback)`) used by login, register and both Google routes; it refuses `//host`, `/\host`, any backslash, any control character and anything not starting with `/`. The older copy in `google-oauth.ts` is removed (it did not refuse the backslash form). Unit test `tests/unit/shared/lib/safe-next.test.ts`.
- **B2:** `agreedToTerms: z.string().nullish()` in `book/[legId]/page.tsx` and in `account/register/page.tsx`. Register had the same fault: an unticked box answered "fill in all required fields" instead of the terms message (`AUTH-023b`).

### Found later the same day, by the phone-width run

| # | Severity | Where | What happens | Expected | Test (marker) | Likely fix |
|---|---|---|---|---|---|---|
| B12 | Medium (phone layout) | `b/[reference]` (booking page) | At 375 px the page is 391 px wide and scrolls sideways; the widest element is `div.flex-1.space-y-2`. Not visible at desktop width. | No horizontal scroll at 375 px. | `BOOK-M02` in `booking-detail-states.spec.ts` (`test.fail` on mobile only) | Probably a flex child without `min-w-0`, or a long unbroken word (reference or email). Fix in the booking-page stage of the redesign; do not restyle it twice. |
| B13 | Low (design floor) | Several pages | Some buttons are below the 44 px floor the new design uses: "Look up" on `/b` is 40 px, "Cancel booking" 36 px, the "Book 1 · …" link on search 40 px. | At least 44 px. | `MOB-004` in `mobile-sweep.spec.ts`: runs only for routes listed in `REDESIGNED_ROUTES` (empty today) | The redesign sets the size; add each route to the list in its stage. This is the redesign's standard, not a regression. |

## B. Found by reading the code, not yet shown by a test

Each needs a test (or a manual check) first. Do not fix on the strength of the reading alone.

| # | Severity | Where | Suspected problem | First step |
|---|---|---|---|---|
| B5 | Medium | `/account?ok=…` and `?error=…` | Any text in the URL is shown as a banner, so a crafted link can show a false message to a signed-in visitor (content spoofing). | Test: open `/account?error=Call+0812…` and see if the text renders. If yes, map the parameter to a fixed list of messages. |
| B6 | Medium | Forgot-password | No rate limit: an address can be flooded with reset emails. | Test: submit the form 20 times; check the mailer mock's call count. Add a per-address and per-IP limit. |
| B7 | Medium | Account bookings list | Bookings are matched by exact-case email, so a booking made with `Name@Mail.com` may not show for the account `name@mail.com`. | Test with a mixed-case booking email. Compare case-insensitively (or store the email lower-cased). |
| B8 | ~~High (money)~~ **RULED OUT 2026-10-31** | Search: max-price filter and "lowest price" sort | They read `leg.basePrice`, not the seasonal fare, so a PEAK-season leg can sort and filter as cheaper than it is. Breaks the "pricing" rule in CLAUDE.md. | Not a bug. `search/page.tsx` runs `withSeasonPrice(...)` before filtering and sorting, and that helper replaces `basePrice` with the seasonal adult fare (`seasons.ts`, locked by `tests/unit/features/pricing/seasons.test.ts`). The reading was wrong because it missed that replacement. No e2e covers the filter on a PEAK leg; add one if wanted. |
| B9 | **High (money)** · **CONFIRMED and FIXED 2026-10-31** | Cancelling an unpaid booking more than 7 days before departure | A full-amount `PENDING` refund row seems to be created for money never paid. | Confirmed by `BOOK-D09b` (1 refund row for a never-paid booking). Fixed in `b/[reference]/page.tsx`: a `PENDING_PAYMENT` booking owes nothing back. `BOOK-D09c` guards the other side: a paid (`AWAITING_CONFIRMATION`) booking still queues its PENDING refund. Other cancel paths (operator rejection, admin) were not checked. |
| B10 | Medium (single source of truth) | `/refunds`, `/change-plans` | The cutoffs 48 / 168 / 7 are typed into the text instead of read from `REFUND_CUTOFF_HOURS` (CLAUDE.md names it as the one source). | `CONT-024` and `CONT-025` already guard the numbers against the constant. Replace the literals with the constant when the pages are redesigned. |
| B11 | Low | Site | No language switcher (top bar shows a static "English" although the site has en/id/ja/zh), no custom `not-found.tsx`, Terms and Privacy sections have no `id` anchors (the new design's table of contents needs them). | Decide in the redesign: switcher yes or no; add `not-found.tsx`; add anchors with the redesigned legal layout. |

## C. Not a bug, but a gap the baseline exposed

- `pnpm seed:qa` creates no ports and only legs for July and August, so on a fresh database the home search has no ports and most booking specs have nothing to search for. Make the seed create ports and legs relative to today, or have each spec build its own (rule 2). Tracked here until `FEATURE_AI_TEST_AGENT.md` is finished.

## Order of work (proposal, the owner decides)

1. **Now, small and separate from the redesign:** B1 (security), then B2. Both are short; B1 first.
2. **Verify, then fix:** B8 and B9 (money) as soon as a test shows them. Do not wait for the redesign.
3. **During the redesign:** B3, B4, B10 and B11 are fixed in the stage that redesigns that page. The tracker row for the page lists the bug id.
4. **Later:** B5, B6, B7 after a test shows them.

## Re-test log

Fill after each run. "Same" means the bug is still reproduced by the same test; "Fixed" means the marker was removed and the test passes.

| Date | Run / stage | B1 | B2 | B3 | B4 | B5–B9 | Notes |
|---|---|---|---|---|---|---|---|
| 2026-10-31 | baseline (`docs/qa-runs/2026-10-31-baseline.md`) | open | open | open | open | not tested | first run; 221 passed, 0 failed, 10 skipped |
| 2026-10-31 | after B1, B2, B9 fixes (`docs/qa-runs/2026-10-31-after-b1-b2-b9.md`) | **fixed** | **fixed** | open | open | B8 ruled out, B9 fixed, B5-B7 not tested | unit 1307 passed; e2e 228 passed, 0 failed, 10 skipped |
| 2026-10-31 | phone-width run (`docs/qa-runs/2026-10-31-mobile.md`) | fixed | fixed | open | open | B12 found, B13 noted | desktop 100% green; at 375 px everything passes except B12 |

## Done when

- [x] B1 fixed, `AUTH-013` marker removed, unit test for the `next` helper.
- [x] B2 fixed, `BOOK-F05b` marker removed.
- [x] B8 ruled out (code and unit test); B9 confirmed by a test and fixed.
- [ ] B3, B4, B10, B11 fixed in the redesign stage of their page, markers removed.
- [ ] B5, B6, B7 each confirmed or ruled out.
- [ ] Re-test log filled after every redesign stage.
- [ ] Docs swept (rule 7): `CHANGELOG.md`, `docs/QA_MATRIX.md`, the redesign tracker rows, `docs/qa-runs/`.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` and `pnpm test:e2e` pass.
- [ ] QC recorded here: what ran, the result, what could not be verified.

## QC result

_(empty until implemented)_

# QA run: stage 3 baseline (booking, checkout, pay, detail, lookup, reschedule)

- **Date:** 2026-10-31. **Branch:** `ui/stage-2`. **Target:** local Docker Postgres, plain `pnpm exec playwright test --workers=2`, every spec as a first-time visitor.
- **Result:** **482 passed, 0 failed, 9 skipped, 0 flaky** (4.5 minutes). Before the new specs: 375 / 0 / 8.
- **New specs (4 files, 48 tests, run on `chromium` and `mobile-flow`):** `booking-search-extras` (BOOK-G01 to G03), `booking-form-extras` (G04 to G06), `booking-checkout-detail` (G07, G09 to G11, G18), `booking-layout-first-visit` (G17, G19 to G23, first visit on four pages at 1280x720 and 375x812, the 44 px floor). Helper `support/first-visit.ts`.
- **Known failures pinned as `test.fail` (they flip to red the day the bug is fixed):** B12, B13 (several pages), B15 sea-condition badge, B16 connection hours, B17 Pay button ignores a valid promo, B18 round-trip detail shows one leg, B19 banner over the checkout terms box. B15 and B16 were confirmed by reading the code; B17, B18 and B19 are from the tests only and still need a look at the code.
- **Skipped (9):** the 8 of the baseline plus 1 conditional in `booking-layout-first-visit`.

## How this run went

The specs were written by a background agent. It was stopped by the owner after about an hour, which looked like a stall but was the last step (the full suite). The owner's irritation was fair: the estimate ("about 20 tests") was wrong by more than twice (48), and nothing told the owner it was in its last step. The full suite was then run directly and passed. Lesson: report counts of tests written and run, not only "running".

## Still not covered

- Looks (nothing compares a page with its artboard), real payment, PayPal, WhatsApp and email, PDF and print, locale pages (`zh`, `ja`), Safari and Firefox: manual list, not automatable here.
- `/pay` has only the redirect cases; the QRIS and bank tabs of the checkout have neither a design nor a test (the checkout is in mock mode).
- Operator and admin access (55 gaps in the matrix) and stages 4 and 5 pages.

## After the stage 3 redesign (same day)

Full suite with the redesigned pages: **482 passed, 0 failed, 9 skipped**, same counts as the baseline above. Known failures that flipped and were released: B19 (`BOOK-G20`), B13 for the lookup (`BOOK-G23`), B4 for `/b` (`CONT-002c`, `fixme` before). Still pinned: B12, B13 (booking page), B15, B16, B17, B18. The reachability helper now scrolls to the middle of the screen (the fixed banner covered buttons at the lower edge). `/b` is in `REDESIGNED_ROUTES`.

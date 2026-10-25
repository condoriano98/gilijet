# Blog: Wahana Virendra check-in guide

**Status (2026-10-24):** implemented in v1.10.0 (tag `v1.10.0`), pushed to `staging`.
**Source:** the user's standalone page `wahana-virendra-checkin-guide.html` (outside the repo).

## What was built

- `src/content/blog/posts/wahana-virendra-checkin-guide.tsx`: one post module in the existing blog registry (`meta` + default component, Tailwind only). The seven harbours are one data array rendered as cards (region, landmark, story, tip chips, what to do, harbour tax, Maps link); the tips block follows. Registered in `src/content/blog/index.ts`, so `/blog` lists it (newest first) and `/blog/wahana-virendra-checkin-guide` serves it with the standard article header, JSON-LD and "Keep reading".
- The HTML's own hero, fonts and CSS were not carried over: the blog template already supplies the header and typography. Facts (counters, landmarks, tax amounts, map links) are copied as written.

## Left out of the source on purpose (check these)

- "Ticket format: to be confirmed" under the Sanur, Nusa Penida and Senggigi tax boxes: an internal placeholder, not for readers.
- The closing line "your H-24 reminder will include the exact check-in counter location and Maps link": we do not send that today. Replaced with a plain "Book your fast boat" link.
- The hero line "I almost missed my boat because I went to the wrong jetty" and the pull-quote story were not used (the blog header has its own title); the lead paragraph is a shortened version of the intro.

## QC (2026-10-24)

- **Unit:** `tests/unit/content/blog.test.ts` (unique slugs, newest first, the guide is registered).
- **E2E:** `tests/e2e/blog-checkin-guide.spec.ts`, 3 of 3 pass against `pnpm dev` (no data written): the blog index links to the post; the post shows all seven harbour headings and seven Maps links; no horizontal scroll at 393 px.
- **Dev server:** looked at the page in a headless browser at 900 px and 393 px (screenshots); fixed stray list bullets on the tip chips and the underline on the Maps button.
- **Not checked:** the Maps links were not opened (they are the user's links); tax amounts and landmarks are the user's content and were not verified; no Indonesian version; the page was not read in a real phone browser.

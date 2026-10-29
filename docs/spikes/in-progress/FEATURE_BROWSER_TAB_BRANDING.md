# Browser tab branding: favicon and a tab-friendly title

**Created:** 2026-10-29
**Status (2026-10-30):** implemented on `staging`'s working tree as v1.10.3, **not committed, not deployed**. Next 16 reference: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/app-icons.md`.
**Reported:** the browser tab shows the default globe icon and the title is cut off: "Gilifast — Boat tickets across…".

## What is wrong today

1. **No favicon or app icon exists.** There is no `src/app/favicon.ico`, `icon.*` or `apple-icon.*`, and nothing under `public/` (only `brand/` photos and payment logos). The browser falls back to the globe, and iOS/Android home-screen and bookmark icons are blank too.
2. **The default title is too long for a tab.** `SITE_TITLE` in `src/app/layout.tsx` is "Gilifast — Boat tickets across Indonesia" (41 characters); a tab shows about 25-30. The home page has no metadata of its own, so it gets this default.
3. **Titles are suffixed twice.** The root layout sets `title.template = '%s · Gilifast'`, and 12 customer pages also hard-code "· Gilifast" in their own title (`about`, `contact`, `privacy`, `refunds`, `change-plans`, `account` x5, `reschedule`, `reviews/new`). The expected result is "About · Gilifast · Gilifast". To be confirmed in the running app before fixing. The blog index uses "Gilifast Blog — …", which becomes "Gilifast Blog — … · Gilifast".
4. **Operator and admin tabs look like the customer site.** Operator pages set no title, so they show the customer default; admin pages use "X · Admin" with the same root suffix appended.

## Proposal

### Icons (no binary assets)

- `src/app/icon.tsx` (32 x 32 PNG) and `src/app/apple-icon.tsx` (180 x 180 PNG), generated with `ImageResponse` from `next/og`. Next adds the `<link rel="icon">` and `<link rel="apple-touch-icon">` tags by itself.
- The mark is the speedboat from `src/app/(customer)/_components/logo.tsx` in white on the brand blue `#103BE9` (the `themeColor` already in the root layout), on a rounded square. The wordmark is not used: it is unreadable at 16-32 px.
- The boat paths live in two places (the `Logo` component and `src/app/_components/brand-icon.tsx`, which both icon files use). The icon file carries a comment pointing to `logo.tsx`. The owner supplied a screenshot of the logo (about 160 x 60 px, raster); it was not used as the source because it would blur when scaled, the same speedboat already exists as SVG in `logo.tsx`.
- **Found while implementing:** the next-intl matcher in `src/proxy.ts` rewrote `/icon` and `/apple-icon` to `/en/icon`, which 404s. The two names are now excluded there.
- Not adding `favicon.ico`: every current browser follows the `<link rel="icon">`. A request for `/favicon.ico` by an old crawler gets a 404, as it does today.

### Titles

- Default (home and any page without its own title): **"Gilifast · Fast Boat Tickets"** (28 characters). "Indonesia", the keywords and the long sentence stay in the description, Open Graph and Twitter titles, which keep the long form.
- Template stays `%s · Gilifast`. Remove the hard-coded "· Gilifast" from the 12 pages above and from `change-plans`/`refunds`' longer titles so each tab reads "About · Gilifast". Blog index becomes "Blog · Gilifast" (its long form moves to `openGraph.title`).
- Operator layout: `title: { default: 'Operator · Gilifast', template: '%s · Operator' }`. Admin layout: `{ default: 'Admin · Gilifast', template: '%s · Admin' }`, and the pages that already say "· Admin" drop that suffix. This also stops admin tabs reading "Webhooks · Admin · Gilifast".

### Out of scope

- Translating titles for id/zh/ja (metadata is English-only today).
- A web app manifest / PWA install icons.
- A wider Open Graph share image.
- `noindex` on operator/admin.

## Open questions

1. Default title wording: _answered 2026-10-30_: "Gilifast · Fast Boat Tickets".
2. Tab icon: _answered 2026-10-30_: the logo's blue boat on white (as in the owner's screenshot), not white on blue.
3. Version: _answered 2026-10-30_: PATCH 1.10.3 (1.11.0 stays reserved for marketing measurement).

## Plan (after "implement")

1. Confirm the double suffix in `pnpm dev` before changing it (record in the QC log).
2. Add `icon.tsx` and `apple-icon.tsx`; set the new default title; strip the duplicated suffixes; add operator and admin title templates.
3. Unit test (`tests/unit/`): root metadata title default and template; no `src/app` page title hard-codes "· Gilifast" or "· Admin" (a guard so the double suffix cannot return); the icon routes return PNGs of the expected size.
4. E2E (`tests/e2e/`): the home page `<title>`, `link[rel=icon]` and `link[rel=apple-touch-icon]` resolve with 200 and an image content type; `/about` title is "About · Gilifast" exactly once; an operator login page and an admin login page show their own title. No fixtures or data are written.
5. QC in `pnpm dev`: look at the icons rendered at 16, 32 and 180 px and at the real tab; record what was and was not checked (a real browser tab, Safari pin, iOS home screen).
6. Docs: `CHANGELOG.md` and `package.json` PATCH bump; grep the docs for the old default title. Commit and push to `staging` only after the owner's go-ahead.

## Checklist

- [x] Open questions answered
- [x] Double suffix confirmed in the running app
- [x] Icons
- [x] Titles and templates
- [x] Unit tests (`tests/unit/app/tab-branding.test.ts`)
- [x] E2E (`tests/e2e/tab-branding.spec.ts`)
- [x] Dev-server QC (curl on `pnpm dev`, icon images viewed)
- [x] Docs (`STRUCTURE.md`), CHANGELOG, version 1.10.3
- [ ] Committed and pushed
- [ ] Staging verified in a real browser tab

## QC log

| Date | Check | How | Result |
|---|---|---|---|
| 2026-10-30 | Before the change | `pnpm dev` (dummy DB URL), curl `<title>` | `/about` = "About · Gilifast · Gilifast", `/privacy` and `/contact` doubled too; `/operator/login` and `/admin/login` carried the customer title; `/favicon.ico` 404 |
| 2026-10-30 | After the change | same | `/` "Gilifast · Fast Boat Tickets"; `/about` "About · Gilifast"; `/refunds`, `/blog` once; `/operator/login` "Operator · Gilifast"; `/admin/login` "Admin · Gilifast" |
| 2026-10-30 | Icon routes | curl; first attempt 404 because of `proxy.ts`, 200 after excluding `icon`/`apple-icon` | `/icon` 32 x 32 PNG, `/apple-icon` 180 x 180 PNG; both images viewed (blue boat on white) |
| 2026-10-30 | Unit | `vitest run tests/unit/app/tab-branding.test.ts` + full suite | pass |
| 2026-10-30 | E2E | `playwright test tab-branding.spec.ts` (3) and `marketing-consent.spec.ts` (5) on the dev server, reads only, payment/messaging keys blanked, `MARKETING_EVENTS_ENABLED=true`, `NEXT_PUBLIC_GTM_ID=GTM-E2ETEST` for the consent spec | 8 passed. Without those two env vars the consent spec fails (no banner); that is its documented precondition, not this change |

Not checked: a real browser tab and its rendering at 16 px, Safari pinned tabs, the iOS home screen; the titles of **logged-in** admin pages (their `template: '%s'` passes the page's own title through, relying on Next's nearest-template rule; only the login pages were observed); whether browsers and Google refresh a cached globe/old title quickly.

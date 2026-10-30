# Sunset gilibali.com: one production domain (gilifast.com)

**Update 2026-10-30:** the deployment this doc waited for has happened: `staging` was merged into `main` (PR #7, 2026-10-30 00:14 +0700). The checks it lists (`robots.txt`, canonical, `og:url`, `sitemap.xml` on `www.gilifast.com`) have not been done yet. Then move this doc to `done/`.
**Status (2026-10-25):** in progress. Done: Vercel `APP_BASE_URL` changed (Production `https://www.gilifast.com`, `staging` its own entry `https://gilijet.vercel.app`; the Production value is `sensitive` and could not be read back). DOKU Notify URL, Meta WhatsApp (callback and templates) checked by the owner and fine. Google OAuth left as is on purpose (a gilibali.com entry there is harmless now). **Not done: no deployment since the env change.** Live `www.gilifast.com` still answers `Disallow: /` and canonical `https://www.gilibali.com` (checked 2026-10-25). The new value takes effect with the next deployment, which will be the `staging` → `main` release; after it, check `robots.txt`, canonical, `og:url` and `sitemap.xml`, then move this doc to `done/`. PayPal not confirmed.
**Goal:** production answers on **one** domain, `www.gilifast.com`. `gilibali.com` stops being a second site and only redirects.

## What is true today (checked 2026-10-25)

Vercel project `gilifast` (`prj_YrULSDc6nOd2U77POldJ7c6y7OUU`) holds five domains:

| Domain | Today |
|---|---|
| `www.gilifast.com` | serves the app (200) |
| `gilifast.com` | 308 to `www.gilifast.com` |
| `www.gilibali.com` | **serves the app (200)**: a full second site, not a redirect |
| `gilibali.com` | 307 (temporary) to `www.gilibali.com` |
| `gilijet.vercel.app` | the `staging` custom environment |

### Finding 1: both domains currently say "do not index" and name gilibali.com as canonical (urgent, not only this ticket)

- `GET /robots.txt` on **both** `www.gilifast.com` and `www.gilibali.com` answers `Disallow: /` (no sitemap).
- `<link rel="canonical">` and `og:url` on **both** hosts are `https://www.gilibali.com`.
- Cause (from the code, not from reading the secret): `src/app/robots.ts` only allows crawling when `APP_BASE_URL`'s host is `gilifast.com` / `www.gilifast.com`; `src/app/layout.tsx` builds `metadataBase` and the canonical from `APP_BASE_URL`. The Production `APP_BASE_URL` is a `sensitive` variable (not readable here), but the rendered canonical shows it is `https://www.gilibali.com`. The same entry is shared with the `staging` custom environment (`PRE_PROD_STAGING_TO_MAIN.md` section 3).
- Effect since the v1.10.1 release: search engines are told not to crawl the live site, and every page canonicalises to the domain we want to retire. Fixing `APP_BASE_URL` is step 1 of this ticket and can ship ahead of the rest.

### Where the domain name leaks into behaviour

All of these follow `APP_BASE_URL` (`src/shared/server/env.ts`), so one value moves them together:

- Links in customer emails and WhatsApp: booking lookup `/b/<reference>` (`booking/notifications.ts`, `send-reminders`, admin refunds), password reset (`account/forgot-password`), e-ticket email blog link.
- `<link rel=canonical>`, `og:url`, sitemap, `robots.txt` host, blog JSON-LD (`layout.tsx`, `blog/[slug]/page.tsx`, `robots.ts`, `sitemap.ts`).
- `/admin/diagnostics` shows the DOKU notification URL built from it.

### Hard-coded names in the repo (not env-driven)

- `src/app/robots.ts`: `PRODUCTION_HOSTS` lists only `gilifast.com` and `www.gilifast.com`.
- Legal and copy pages say `gilifast.com` (terms, refunds). Support email and some copy use `balinusafast.com` (`contact`, `change-plans`, `best-price-guarantee`, `refunds`): a third brand name, **out of scope here, listed so it is a decision, not a surprise**.
- Docs that name `gilibali.com` as the live site: `BUG_DOKU_PAYMENT_CONFIRMATION.md`, `BUG_PAYMENT_STATUS_WEBHOOK.md`, `FEATURE_ETICKET_PIC_NOTIFICATION.md`. Historical records: add a dated status note, do not rewrite.

## Things outside the repo that may still use gilibali.com (check each, none verified yet)

| Where | Why it matters |
|---|---|
| Google OAuth client (customer sign-in): authorized JS origins and redirect URIs | Sign-in breaks on a host that is not listed. Both hosts must be listed during the move; remove gilibali.com last. |
| DOKU Back Office (brand gilifast.com): Notify URL, any return/callback URLs | Notify URL was already set to `https://www.gilifast.com/api/webhooks/doku` on 2026-10-25. Check the other URLs. A webhook must point at the final host directly, never through a redirect. |
| PayPal: webhook URL (`PAYPAL_WEBHOOK_ID`), return and cancel URLs | Same rule: final host directly. |
| Meta WhatsApp: callback URL, template buttons or footers containing a URL | Callback is `https://www.gilifast.com/api/webhooks/whatsapp`. Approved templates cannot be edited in place; a template that hard-codes gilibali.com needs a new version. Not checked. |
| Google Search Console, Google Business Profile, Instagram/Facebook bios, ads, QR printed on materials | Old links must keep working through the redirect; profiles should be updated to the new domain. |
| Operator side (Wahana email templates, PIC WhatsApp text) | Anything that tells the operator or customer a gilibali.com address. |
| DNS and registrar for `gilibali.com` | Must stay registered and pointing at Vercel, or the redirect dies. Renewal date to be noted. |

## Design

1. **One canonical host.** `APP_BASE_URL=https://www.gilifast.com` for Production (and the shared `staging` entry should get its own value, `https://gilijet.vercel.app`, which the release prep already asks for). Redeploy.
2. **Redirect gilibali.com permanently, with path and query.** In the Vercel project, set `gilibali.com` and `www.gilibali.com` to redirect to `https://www.gilifast.com` with status **308** (today the apex answers a temporary 307 to the www host). 308 keeps the HTTP method, so a stray POST (a webhook, a form) is not downgraded to GET. To verify after: `/b/<ref>`, `/search?...`, `/blog/...` keep their path and query, and `/api/*` is redirected (not served).
3. **Why not a code redirect.** A host check in middleware would also work, but it adds code to a path every request takes, and the Vercel domain redirect needs no deploy. Keep middleware as the fallback only if the dashboard redirect cannot preserve the path.
4. **Do not break old links.** Customers already hold emails and WhatsApp messages with `https://www.gilibali.com/b/<reference>` and sign-in sessions on that host. The redirect covers the links. Cookies are per host, so a customer who was signed in on gilibali.com is signed out once and signs in again on gilifast.com (accepted; say so in the changelog).
5. **Keep the domain.** Renew `gilibali.com` for at least 12 months after the sunset so the redirects keep working; do not release or repoint it.
6. **Robots.** After step 1 the live host is allowed again (`PRODUCTION_HOSTS` already contains it). gilibali.com never serves pages after step 2, so it needs no robots of its own. Leave `PRODUCTION_HOSTS` as is; do not add gilibali.com.

## Order of work (no step needs a schema change)

1. Production `APP_BASE_URL` to `https://www.gilifast.com`; give `staging` its own value; redeploy; check `robots.txt`, `canonical`, `og:url`, `sitemap.xml` and the diagnostics page on `www.gilifast.com`.
2. Google OAuth: add `www.gilifast.com` (JS origin and redirect URI) if missing; sign in on the new host.
3. Check DOKU, PayPal and Meta (table above); fix what still names gilibali.com.
4. Change the Vercel domain settings of `gilibali.com` and `www.gilibali.com` to a 308 redirect to `https://www.gilifast.com`.
5. Check the redirects with `curl -I` for `/`, a deep link, a query string and an `/api/` path; open an old `/b/<reference>` link from a real email.
6. Search Console: add the `www.gilifast.com` property, submit `sitemap.xml`; if gilibali.com has its own property, use "change of address".
7. Update profiles and printed or shared links over time; update the three docs above with a dated status note, `README.md` and `CHANGELOG.md` if any wording changes.
8. After a quiet period (suggest 2 weeks): remove `gilibali.com` from the Google OAuth client. Keep the Vercel redirect.

## Tests (to write when it is implemented)

- Unit: `robots()` allows crawling when `APP_BASE_URL` is `https://www.gilifast.com` and blocks it for any other host (extend the existing test if present); `layout` canonical follows `APP_BASE_URL`.
- E2E: nothing in the customer flow changes, so no new Playwright flow; the redirects are checked with the `curl` list above and recorded here as QC. A redirect cannot be tested against `pnpm dev`.

## Open questions

1. Is `www.gilifast.com` the canonical form (matches today's apex redirect), or should the apex `gilifast.com` be canonical?
2. Does any approved WhatsApp template, email footer or operator-facing text hard-code `gilibali.com`? (Needs a look in Meta Business Manager and the sent emails.)
3. Which Google OAuth client and which DOKU and PayPal accounts are used in production, and who can edit them?
4. When does `gilibali.com` renew, and where is it registered?
5. `balinusafast.com` in the support emails and refund copy: keep, or fold into this sunset as a separate ticket?
6. Should Finding 1 (`APP_BASE_URL`, robots, canonical) ship now as its own change, before the rest?

## Not verified

- The actual value of Production `APP_BASE_URL` (sensitive). Inferred from the rendered canonical and robots output.
- Whether the Vercel domain redirect keeps path and query for this project; verify in step 5.
- All third-party consoles in the table above.

## Update 2026-10-25: gilibali.com no longer exists

`gilibali.com` and `www.gilibali.com` no longer resolve in DNS (`curl`: could not resolve host) and are no longer domains of the Vercel project, so they do not 404 and cannot redirect. This replaces part of the design above:

- Design 2 (308 redirect), Design 4 (old links keep working), Design 5 (keep the domain) and order steps 4, 5 and 8 no longer apply. Links like `https://www.gilibali.com/b/<reference>` in emails and WhatsApp messages already sent are dead.
- Still applies: Design 1 (`APP_BASE_URL`, done in Vercel, live after the release), Design 6 (robots), the third-party checks (done except PayPal), Search Console (step 6) and the docs notes (step 7).
- Tests: the planned unit test for `robots()` and the canonical is still to write.

import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Only the customer-facing routes under app/(customer)/[locale] are
  // localized. Exclude the non-localized top-level sections (admin, operator,
  // legal, print) as well as api/_next/_vercel/static files, otherwise
  // next-intl rewrites e.g. /operator/login -> /en/operator/login, which has
  // no matching route and 404s.
  matcher: ["/((?!api|_next|_vercel|admin|operator|legal|print|.*\\..*).*)"],
};

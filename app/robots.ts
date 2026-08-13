import type { MetadataRoute } from "next";

/**
 * Only the canonical production host is crawlable.
 *
 * Staging runs as its own Vercel project whose production branch is `staging`,
 * so its deployments are `target: production` and `VERCEL_ENV` reads
 * "production" there too — it cannot tell the two apart. `APP_BASE_URL` is set
 * per project and is the one value that genuinely differs, so the host it
 * names is the signal.
 *
 * Anything that is not the live site returns a blanket disallow, which keeps
 * staging out of Google and stops it competing with the real domain for its
 * own content.
 */
const PRODUCTION_HOSTS = new Set(["gilifast.com", "www.gilifast.com"]);

function isProductionHost(base: string): boolean {
  try {
    return PRODUCTION_HOSTS.has(new URL(base).hostname);
  } catch {
    return false;
  }
}

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

  if (!isProductionHost(base)) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin/",
          "/operator/",
          "/account/",
          "/b/",
          "/checkout/",
          "/pay/",
          "/_next/",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}

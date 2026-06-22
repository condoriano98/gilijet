import type { MetadataRoute } from "next";
import { POSTS } from "@/content/blog";

const STATIC_PATHS = [
  { path: "", changeFrequency: "daily" as const, priority: 1.0 },
  { path: "/search", changeFrequency: "hourly" as const, priority: 0.9 },
  { path: "/blog", changeFrequency: "weekly" as const, priority: 0.8 },
  { path: "/about", changeFrequency: "monthly" as const, priority: 0.6 },
  { path: "/contact", changeFrequency: "monthly" as const, priority: 0.5 },
  { path: "/refunds", changeFrequency: "monthly" as const, priority: 0.5 },
  { path: "/terms", changeFrequency: "monthly" as const, priority: 0.3 },
  { path: "/privacy", changeFrequency: "monthly" as const, priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  const now = new Date();
  const staticEntries = STATIC_PATHS.map(({ path, changeFrequency, priority }) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));
  const postEntries = POSTS.map(({ meta }) => ({
    url: `${base}/blog/${meta.slug}`,
    lastModified: new Date(meta.publishedAt),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));
  return [...staticEntries, ...postEntries];
}

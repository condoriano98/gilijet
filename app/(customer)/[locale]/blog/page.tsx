import Link from "next/link";
import type { Metadata } from "next";
import { POSTS } from "@/content/blog";

export const metadata: Metadata = {
  title: "Blog — Boat travel guides for Indonesia",
  description:
    "Practical guides for boat travel across Indonesia: choosing operators, reading sea conditions, avoiding seasickness, and timing your crossing.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "Gilifast Blog — Boat travel guides for Indonesia",
    description:
      "Practical guides for boat travel across Indonesia: operators, sea conditions, seasonality, and trip planning.",
    type: "website",
  },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function BlogIndex() {
  return (
    <div className="container py-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-10">
          <p className="text-sm font-medium uppercase tracking-wide text-gilifast-ocean">
            Gilifast Blog
          </p>
          <h1 className="mt-2 text-3xl font-display font-extrabold text-slate-900 sm:text-4xl">
            Boat travel guides for Indonesia
          </h1>
          <p className="mt-3 text-base text-slate-600">
            Practical writing on choosing operators, reading sea conditions,
            and planning a trip that actually goes the way you hoped.
          </p>
        </header>

        <ul className="space-y-8">
          {POSTS.map(({ meta }) => (
            <li key={meta.slug} className="border-b border-slate-200 pb-8 last:border-b-0">
              <article>
                <h2 className="text-xl font-display font-bold text-slate-900 sm:text-2xl">
                  <Link
                    href={`/blog/${meta.slug}`}
                    className="hover:text-gilifast-ocean hover:underline"
                  >
                    {meta.title}
                  </Link>
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <time dateTime={meta.publishedAt}>{formatDate(meta.publishedAt)}</time>
                  <span>·</span>
                  <span>{meta.readingMinutes} min read</span>
                  <span>·</span>
                  <span>{meta.author}</span>
                </div>
                <p className="mt-3 text-sm text-slate-700">{meta.description}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {meta.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <Link
                  href={`/blog/${meta.slug}`}
                  className="mt-3 inline-block text-sm font-medium text-gilifast-ocean hover:underline"
                >
                  Read more →
                </Link>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

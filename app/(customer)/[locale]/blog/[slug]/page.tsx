import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { findPost, POSTS } from "@/content/blog";

type Params = { slug: string; locale: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = findPost(slug);
  if (!post) return { title: "Post not found" };
  return {
    title: post.meta.title,
    description: post.meta.description,
    alternates: { canonical: `/blog/${post.meta.slug}` },
    openGraph: {
      type: "article",
      title: post.meta.title,
      description: post.meta.description,
      publishedTime: post.meta.publishedAt,
      authors: [post.meta.author],
      tags: post.meta.tags,
    },
    twitter: {
      card: "summary_large_image",
      title: post.meta.title,
      description: post.meta.description,
    },
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function BlogPost({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const post = findPost(slug);
  if (!post) notFound();

  const base = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.meta.title,
    description: post.meta.description,
    datePublished: post.meta.publishedAt,
    author: { "@type": "Organization", name: post.meta.author },
    publisher: {
      "@type": "Organization",
      name: "Gilijet",
      logo: { "@type": "ImageObject", url: `${base}/apple-icon` },
    },
    mainEntityOfPage: `${base}/blog/${post.meta.slug}`,
    keywords: post.meta.tags.join(", "),
  };

  const Body = post.Body;
  const otherPosts = POSTS.filter((p) => p.meta.slug !== post.meta.slug).slice(0, 2);

  return (
    <div className="container py-10">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/blog"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to blog
        </Link>

        <header className="mt-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <time dateTime={post.meta.publishedAt}>{formatDate(post.meta.publishedAt)}</time>
            <span>·</span>
            <span>{post.meta.readingMinutes} min read</span>
            <span>·</span>
            <span>{post.meta.author}</span>
          </div>
          <h1 className="mt-3 text-3xl font-display font-extrabold leading-tight text-slate-900 sm:text-4xl">
            {post.meta.title}
          </h1>
          <p className="mt-3 text-lg text-slate-600">{post.meta.description}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {post.meta.tags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
              >
                {t}
              </span>
            ))}
          </div>
        </header>

        <div className="mt-8">
          <Body />
        </div>

        {otherPosts.length > 0 ? (
          <aside className="mt-12 border-t border-slate-200 pt-8">
            <h2 className="text-base font-semibold text-slate-900">Keep reading</h2>
            <ul className="mt-3 space-y-3 text-sm">
              {otherPosts.map(({ meta }) => (
                <li key={meta.slug}>
                  <Link
                    href={`/blog/${meta.slug}`}
                    className="font-medium text-gilijet-ocean hover:underline"
                  >
                    {meta.title}
                  </Link>
                  <span className="ml-2 text-xs text-slate-500">
                    · {meta.readingMinutes} min
                  </span>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </div>
    </div>
  );
}

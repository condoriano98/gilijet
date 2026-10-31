import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { findPost, POSTS } from '@/content/blog';
import { siteUrl } from '@/shared/server/site-url';

type Params = { slug: string; locale: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = findPost(slug);
  if (!post) return { title: 'Post not found' };
  return {
    title: post.meta.title,
    description: post.meta.description,
    alternates: { canonical: `/blog/${post.meta.slug}` },
    openGraph: {
      type: 'article',
      title: post.meta.title,
      description: post.meta.description,
      publishedTime: post.meta.publishedAt,
      authors: [post.meta.author],
      tags: post.meta.tags,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.meta.title,
      description: post.meta.description,
    },
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
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

  const base = siteUrl();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.meta.title,
    description: post.meta.description,
    datePublished: post.meta.publishedAt,
    author: { '@type': 'Organization', name: post.meta.author },
    publisher: {
      '@type': 'Organization',
      name: 'Gilifast',
    },
    mainEntityOfPage: `${base}/blog/${post.meta.slug}`,
    keywords: post.meta.tags.join(', '),
  };

  const Body = post.Body;
  const otherPosts = POSTS.filter((p) => p.meta.slug !== post.meta.slug).slice(0, 2);

  return (
    <div className="mx-auto max-w-[1080px] px-5 py-4 sm:px-6">
      <Link
        href="/blog"
        className="inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:underline"
      >
        ← Back to blog
      </Link>

      <article>
        <header className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 text-sm text-brand-muted">
            <time dateTime={post.meta.publishedAt}>{formatDate(post.meta.publishedAt)}</time>
            <span>·</span>
            <span>{post.meta.readingMinutes} min read</span>
            <span>·</span>
            <span>{post.meta.author}</span>
          </div>
          <h1 className="mt-3.5 font-display text-3xl font-extrabold leading-[1.1] tracking-tight text-brand-ink sm:text-[46px]">
            {post.meta.title}
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-brand-muted sm:text-xl">{post.meta.description}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {post.meta.tags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-brand-periwinkle px-3 py-1.5 text-[13px] font-semibold text-brand-dark"
              >
                {t}
              </span>
            ))}
          </div>
        </header>

        <div className="relative mt-8 h-[200px] overflow-hidden rounded-3xl sm:mt-9 sm:h-[360px] sm:rounded-[28px]">
          <Image
            src="/brand/hero-home.png"
            alt=""
            fill
            sizes="(min-width: 1080px) 1032px, 100vw"
            className="object-cover object-[25%_65%] sm:object-[center_65%]"
          />
        </div>

        <div className="mt-10 max-w-[760px] sm:mt-11">
          <Body />
        </div>

        {otherPosts.length > 0 ? (
          <aside className="mt-14 max-w-[760px] border-t border-brand-line pt-7">
            <h2 className="font-display text-xl font-extrabold tracking-tight text-brand-ink">Keep reading</h2>
            <ul className="mt-3.5 space-y-1.5 text-sm">
              {otherPosts.map(({ meta }) => (
                <li key={meta.slug} className="flex min-h-11 flex-wrap items-center">
                  <Link
                    href={`/blog/${meta.slug}`}
                    className="font-semibold text-brand hover:underline"
                  >
                    {meta.title}
                  </Link>
                  <span className="ml-2 text-xs text-brand-muted">
                    · {meta.readingMinutes} min
                  </span>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </article>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}

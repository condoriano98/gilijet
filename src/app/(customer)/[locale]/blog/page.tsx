import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { POSTS } from '@/content/blog';
import { Logo } from '@/app/(customer)/_components/logo';

export const metadata: Metadata = {
  title: 'Blog',
  description:
    'Practical guides for boat travel across Indonesia: choosing operators, reading sea conditions, avoiding seasickness, and timing your crossing.',
  alternates: { canonical: '/blog' },
  openGraph: {
    title: 'Gilifast Blog — Boat travel guides for Indonesia',
    description:
      'Practical guides for boat travel across Indonesia: operators, sea conditions, seasonality, and trip planning.',
    type: 'website',
  },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const TAG = 'rounded-full bg-brand-periwinkle px-3 py-1 text-xs font-semibold text-brand-dark';

export default function BlogIndex() {
  const [latest, ...others] = POSTS;
  return (
    <div className="mx-auto max-w-[1180px] px-5 pb-4 pt-4 sm:px-6">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-[32px] px-6 py-12 sm:px-12 sm:py-16">
        <Image
          src="/brand/hero-home.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[25%_60%] sm:object-[center_60%]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,34,142,0.8)_0%,rgba(0,34,142,0.6)_60%,rgba(0,34,142,0.2)_100%)]" />
        <div className="relative max-w-3xl text-white">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-periwinkle">
            Gilifast Blog
          </p>
          <h1 className="mt-2.5 font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
            Boat travel guides for Indonesia
          </h1>
          <p className="mt-4 text-base leading-relaxed text-white sm:text-lg">
            Practical writing on choosing operators, reading sea conditions,
            and planning a trip that actually goes the way you hoped.
          </p>
        </div>
      </header>

      {latest ? (
        <article className="mt-12 overflow-hidden rounded-[28px] border border-brand-line bg-white shadow-ambient sm:mt-14">
          <Link href={`/blog/${latest.meta.slug}`} className="flex flex-col md:flex-row">
            <div
              aria-hidden
              className="flex min-h-[180px] items-center justify-center bg-gradient-to-br from-brand to-brand-dark text-brand-periwinkle md:w-[46%] md:min-h-[320px]"
            >
              <Logo className="scale-[2] items-center text-brand-periwinkle" />
            </div>
            <div className="flex flex-1 flex-col justify-center p-6 sm:p-10">
              <span className="self-start rounded-full bg-brand-periwinkle px-3 py-1.5 text-xs font-bold text-brand-dark">
                Latest
              </span>
              <h2 className="mt-4 font-display text-2xl font-extrabold leading-tight tracking-tight text-brand-ink sm:text-3xl">
                {latest.meta.title}
              </h2>
              <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[13px] text-brand-muted">
                <time dateTime={latest.meta.publishedAt}>{formatDate(latest.meta.publishedAt)}</time>
                <span>·</span>
                <span>{latest.meta.readingMinutes} min read</span>
                <span>·</span>
                <span>{latest.meta.author}</span>
              </div>
              <p className="mt-3.5 text-[15px] leading-relaxed text-brand-text">{latest.meta.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {latest.meta.tags.map((t) => (
                  <span key={t} className={TAG}>{t}</span>
                ))}
              </div>
              <span className="mt-5 text-[15px] font-bold text-brand">Read more →</span>
            </div>
          </Link>
        </article>
      ) : null}

      {others.length > 0 ? (
        <section className="mt-12 sm:mt-14">
          <h2 className="font-display text-2xl font-extrabold tracking-tight text-brand-ink sm:text-[28px]">
            More guides
          </h2>
          <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            {others.map(({ meta }) => (
              <li key={meta.slug} className="flex">
                <article className="flex w-full flex-col overflow-hidden rounded-3xl border border-brand-line bg-white">
                  <Link href={`/blog/${meta.slug}`} className="flex flex-1 flex-col">
                    <div
                      aria-hidden
                      className="flex h-[150px] items-center justify-center bg-brand-periwinkle text-brand"
                    >
                      <Logo className="scale-125 items-center text-brand" />
                    </div>
                    <div className="flex flex-1 flex-col p-5 sm:p-[22px]">
                      <h3 className="font-display text-xl font-extrabold leading-tight tracking-tight text-brand-ink">
                        {meta.title}
                      </h3>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-brand-muted">
                        <time dateTime={meta.publishedAt}>{formatDate(meta.publishedAt)}</time>
                        <span>·</span>
                        <span>{meta.readingMinutes} min read</span>
                        <span>·</span>
                        <span>{meta.author}</span>
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-brand-text">{meta.description}</p>
                      <div className="mt-3.5 flex flex-wrap gap-1.5">
                        {meta.tags.map((t) => (
                          <span key={t} className={TAG}>{t}</span>
                        ))}
                      </div>
                      <span className="mt-auto pt-4 text-sm font-bold text-brand">Read more →</span>
                    </div>
                  </Link>
                </article>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

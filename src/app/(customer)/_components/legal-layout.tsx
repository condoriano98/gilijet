import Link from 'next/link';

export type LegalTocItem = { id: string; label: string };

/**
 * Shared frame of the legal pages (terms, privacy, refunds): a tinted title
 * panel, a sticky "On this page" list from `lg` up, and the article. The legal
 * text itself is passed in as `children` and is never touched here.
 */
export function LegalPage({
  title,
  kicker,
  meta,
  toc,
  children,
}: {
  title: React.ReactNode;
  kicker?: React.ReactNode;
  meta?: React.ReactNode;
  toc: LegalTocItem[];
  children: React.ReactNode;
}) {
  return (
    <div className="pb-4">
      <section className="mx-5 mt-4 rounded-[32px] bg-brand-surface px-6 py-10 sm:mx-6 sm:px-12 sm:py-14 lg:px-16">
        <div className="mx-auto max-w-[1180px]">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:underline"
          >
            ← Home
          </Link>
          {kicker ? <div className="mt-2 text-sm font-semibold text-brand-muted">{kicker}</div> : null}
          <h1 className="mt-2 font-display text-3xl font-extrabold leading-[1.1] tracking-tight text-brand-dark sm:text-[44px]">
            {title}
          </h1>
          {meta ? <div className="mt-4 space-y-1.5 text-sm text-brand-muted">{meta}</div> : null}
        </div>
      </section>

      <div className="mx-auto mt-10 flex max-w-[1180px] flex-col gap-8 px-5 sm:px-6 lg:flex-row lg:items-start lg:gap-14">
        <nav
          aria-label="Table of contents"
          className="rounded-[22px] border border-brand-line bg-white p-5 lg:sticky lg:top-24 lg:w-[260px] lg:shrink-0"
        >
          <div className="text-sm font-bold text-brand-dark">On this page</div>
          <ol className="mt-3 flex flex-col gap-0.5">
            {toc.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="flex min-h-9 items-center rounded-[10px] px-2.5 py-1 text-sm text-brand-text hover:bg-brand-surface hover:text-brand"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <article className="min-w-0 max-w-[720px] flex-1">{children}</article>
      </div>
    </div>
  );
}

/** One numbered section of a legal text; `id` is the anchor the contents list links to. */
export function LegalSection({
  id,
  n,
  title,
  children,
}: {
  id: string;
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-10 scroll-mt-24">
      <h2 className="font-display text-2xl font-extrabold tracking-tight text-brand-ink sm:text-[26px]">
        {n}. {title}
      </h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-brand-text sm:text-base sm:leading-[1.7]">
        {children}
      </div>
    </section>
  );
}

/** Class for a heading inside a prose article (privacy, refunds) that needs an anchor. */
export const PROSE_H2 =
  'mt-10 scroll-mt-24 font-display text-2xl font-extrabold tracking-tight text-brand-ink sm:text-[26px]';
export const PROSE_H3 = 'mt-6 text-lg font-bold text-brand-ink';
// The Tailwind Typography plugin is not installed, so `prose` classes do nothing: the spacing,
// bullets and link style are set here with child selectors.
export const PROSE_ARTICLE =
  'text-[15px] leading-relaxed text-brand-text sm:text-base [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-6 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-6 [&_a]:font-semibold [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2';

import Image from 'next/image';

/** Class names shared by the sign-in, register, forgot and reset pages. */
export const AUTH_INPUT = 'h-12 rounded-2xl border border-brand-line bg-white px-4 text-base text-brand-ink';
export const AUTH_LABEL = 'text-sm font-semibold text-brand-text';
export const AUTH_PRIMARY =
  'h-14 w-full rounded-2xl bg-brand text-base font-bold text-white hover:bg-brand-dark';
export const AUTH_SECONDARY =
  'h-14 w-full rounded-2xl border-brand-line bg-white text-base font-semibold text-brand-ink hover:bg-brand-surface';
export const AUTH_LINK = 'font-semibold text-brand hover:underline';
export const AUTH_ALERT_ERROR = 'rounded-[14px] bg-red-50 px-4 py-3 text-sm font-medium text-red-800';
export const AUTH_ALERT_WARN = 'rounded-[14px] bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900';
export const AUTH_ALERT_INFO = 'rounded-[14px] bg-brand-surface px-4 py-3 text-sm font-medium text-brand-text';
export const AUTH_ALERT_OK = 'rounded-[14px] bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900';

/**
 * Two-panel card of the redesign: a photo panel with the page title (the only
 * `h1`) and its description, and the form on the right (below it on a phone).
 */
export function AuthLayout({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[1180px] px-5 py-6 sm:px-6 sm:py-10">
      <div className="overflow-hidden rounded-[28px] bg-white shadow-ambient lg:grid lg:grid-cols-[46fr_54fr] lg:rounded-[32px]">
        <div className="relative overflow-hidden px-6 py-10 text-white sm:px-10 lg:py-14">
          <Image
            src="/brand/hero-home.png"
            alt=""
            fill
            sizes="(min-width: 1024px) 560px, 100vw"
            className="object-cover object-[25%_center]"
          />
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,34,142,0.82)_0%,rgba(0,34,142,0.6)_55%,rgba(0,34,142,0.1)_100%)]" />
          <div className="relative">
            <h1 className="max-w-md font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-[38px]">
              {title}
            </h1>
            <p className="mt-3 max-w-sm text-base leading-relaxed text-white">{description}</p>
          </div>
        </div>
        <div className="px-6 py-8 sm:px-10 lg:px-14 lg:py-14">{children}</div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Button } from '@/shared/ui/button';
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_SECONDS,
  parseConsent,
  serializeConsent,
  toGoogleConsentMode,
} from '@/features/marketing/consent';
import {
  CONSENT_CHANGED_EVENT,
  OPEN_CONSENT_EVENT,
  pushDataLayer,
  readCookie,
  writeCookie,
} from '@/features/marketing/data-layer';

// The banner sits outside next-intl's provider (it is mounted by the
// customer layout, above the [locale] segment), so it carries its own copy
// and picks the language from the URL prefix.
const COPY = {
  en: {
    title: 'Cookies on Gilifast',
    body: 'We use essential cookies to run bookings. With your permission we also use analytics cookies to understand how the site is used, and marketing cookies to measure our Google and Meta ads. You can change this any time under "Cookie settings" in the footer.',
    accept: 'Accept all',
    reject: 'Essential only',
    settings: 'Choose',
    save: 'Save choices',
    analytics: 'Analytics (Google Analytics)',
    marketing: 'Marketing (Google Ads, Meta)',
  },
  id: {
    title: 'Cookie di Gilifast',
    body: 'Kami memakai cookie penting untuk menjalankan pemesanan. Dengan izin Anda, kami juga memakai cookie analitik untuk memahami penggunaan situs, dan cookie pemasaran untuk mengukur iklan Google dan Meta. Anda dapat mengubahnya kapan saja lewat "Pengaturan cookie" di bagian bawah halaman.',
    accept: 'Terima semua',
    reject: 'Hanya yang penting',
    settings: 'Pilih',
    save: 'Simpan pilihan',
    analytics: 'Analitik (Google Analytics)',
    marketing: 'Pemasaran (Google Ads, Meta)',
  },
  zh: {
    title: 'Gilifast 的 Cookie',
    body: '我们使用必要的 Cookie 来处理预订。经您同意，我们还会使用分析 Cookie 了解网站使用情况，并使用营销 Cookie 衡量我们的 Google 和 Meta 广告效果。您可随时在页脚的“Cookie 设置”中更改。',
    accept: '全部接受',
    reject: '仅必要',
    settings: '选择',
    save: '保存选择',
    analytics: '分析（Google Analytics）',
    marketing: '营销（Google Ads、Meta）',
  },
  ja: {
    title: 'Gilifast の Cookie',
    body: '予約の処理には必須の Cookie を使用します。同意いただいた場合は、サイトの利用状況を把握する分析用 Cookie と、Google・Meta 広告の効果を測定するマーケティング用 Cookie も使用します。フッターの「Cookie 設定」からいつでも変更できます。',
    accept: 'すべて許可',
    reject: '必須のみ',
    settings: '選択する',
    save: '選択を保存',
    analytics: '分析（Google Analytics）',
    marketing: 'マーケティング（Google 広告、Meta）',
  },
} as const;

type Locale = keyof typeof COPY;

function localeFromPath(pathname: string | null): Locale {
  const seg = (pathname ?? '/').split('/')[1];
  return seg === 'id' || seg === 'zh' || seg === 'ja' ? seg : 'en';
}

/** Persist a choice, tell Google's tags, and let the runtime react. */
export function applyConsent(choice: { analytics: boolean; marketing: boolean }): void {
  const previous = parseConsent(readCookie(CONSENT_COOKIE));
  const withdraw = {
    analytics: previous.analytics && !choice.analytics,
    marketing: previous.marketing && !choice.marketing,
  };
  const visitorId = readCookie('gf_vid');
  // Read before the runtime deletes gf_vid: past bookings made by this
  // visitor stop feeding the platforms (see consent-withdrawal.ts).
  if ((withdraw.analytics || withdraw.marketing) && visitorId) {
    void fetch('/api/marketing/consent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ visitorId, withdraw }),
      keepalive: true,
    }).catch(() => undefined);
  }
  writeCookie(CONSENT_COOKIE, serializeConsent(choice), CONSENT_MAX_AGE_SECONDS);
  window.gtag?.('consent', 'update', toGoogleConsentMode(choice));
  pushDataLayer({ event: 'consent_update', analytics: choice.analytics, marketing: choice.marketing });
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: choice }));
}

export function ConsentBanner() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const current = parseConsent(readCookie(CONSENT_COOKIE));
    setAnalytics(current.analytics);
    setMarketing(current.marketing);
    if (!current.decided) setOpen(true);
    const reopen = () => {
      const now = parseConsent(readCookie(CONSENT_COOKIE));
      setAnalytics(now.analytics);
      setMarketing(now.marketing);
      setCustom(true);
      setOpen(true);
    };
    window.addEventListener(OPEN_CONSENT_EVENT, reopen);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, reopen);
  }, []);

  if (!open) return null;
  const t = COPY[localeFromPath(pathname)];
  const decide = (choice: { analytics: boolean; marketing: boolean }) => {
    applyConsent(choice);
    setOpen(false);
    setCustom(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="gf-consent-title"
      data-testid="consent-banner"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-black/10 bg-white p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] sm:inset-x-auto sm:bottom-4 sm:right-4 sm:max-w-md sm:rounded-2xl sm:border"
    >
      <h2 id="gf-consent-title" className="text-sm font-semibold text-brand-ink">
        {t.title}
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t.body}</p>
      {custom ? (
        <div className="mt-3 space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} />
            {t.analytics}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
            {t.marketing}
          </label>
          <Button size="sm" className="mt-1 w-full" onClick={() => decide({ analytics, marketing })}>
            {t.save}
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" className="bg-brand text-white hover:bg-brand-dark" onClick={() => decide({ analytics: true, marketing: true })}>
            {t.accept}
          </Button>
          <Button size="sm" variant="outline" onClick={() => decide({ analytics: false, marketing: false })}>
            {t.reject}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCustom(true)}>
            {t.settings}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Footer link that reopens the banner. */
export function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}>
      Cookie settings
    </button>
  );
}

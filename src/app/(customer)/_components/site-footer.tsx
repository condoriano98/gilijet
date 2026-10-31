import Link from 'next/link';
import { Logo } from '@/app/(customer)/_components/logo';
import { PaymentPartners } from '@/app/(customer)/_components/payment-partners';
import { CookieSettingsLink } from '@/features/marketing/components/consent-banner';

const LINK = 'hover:text-brand hover:underline';

/** Light footer of the redesign: periwinkle surface, no wave band. */
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-brand-line bg-brand-surface text-brand-text">
      <div className="container grid gap-10 py-12 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo className="items-start text-brand" />
          <p className="mt-3 max-w-xs text-brand-muted">
            Let Journey Begin with Gilifast! Book fast boats across Indonesia —
            verified operators, transparent prices, fair refunds.
          </p>
          <div className="mt-5 max-w-xs">
            <PaymentPartners />
          </div>
        </div>
        <div>
          <div className="mb-3 text-base font-semibold text-brand-dark">Company</div>
          <ul className="space-y-2">
            <li><Link href="/about" className={LINK}>About</Link></li>
            <li><Link href="/contact" className={LINK}>Contact</Link></li>
            <li><Link href="/blog" className={LINK}>Blog</Link></li>
            <li><Link href="/operator/login" className={LINK}>For operators</Link></li>
          </ul>
        </div>
        <div>
          <div className="mb-3 text-base font-semibold text-brand-dark">Legal</div>
          <ul className="space-y-2">
            <li><Link href="/terms" className={LINK}>Terms of Service</Link></li>
            <li><Link href="/privacy" className={LINK}>Privacy Policy</Link></li>
            <li><Link href="/refunds" className={LINK}>Refund Policy</Link></li>
            <li><Link href="/legal/wahana-virendra" className={LINK}>Wahana Virendra Terms</Link></li>
            <li><CookieSettingsLink className={LINK} /></li>
          </ul>
        </div>
        <div>
          <div className="mb-3 text-base font-semibold text-brand-dark">Support</div>
          <ul className="space-y-2">
            <li><Link href="/b" className={LINK}>Find my booking</Link></li>
            <li><Link href="/change-plans" className={LINK}>Change or refund a trip</Link></li>
            <li><a href="mailto:info@balinusafast.com" className={LINK}>info@balinusafast.com</a></li>
            <li><a href="https://wa.me/628133399869" className={LINK}>WhatsApp</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-brand-line">
        <div className="container py-5 text-xs text-brand-muted">
          © {year} CV Hi Bali Nusa Tenggara · Payments by DOKU licensed by Bank Indonesia
        </div>
      </div>
    </footer>
  );
}

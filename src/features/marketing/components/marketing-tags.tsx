import Script from 'next/script';
import { ConsentBanner } from '@/features/marketing/components/consent-banner';
import { MarketingRuntime } from '@/features/marketing/components/marketing-runtime';
import { gtmBootstrapScript, isValidGtmId } from '@/features/marketing/components/gtm-snippet';

/**
 * Customer-area measurement: the GTM container (sole tag owner), the consent
 * banner and the page-view/attribution runtime. Mounted only in the customer
 * layout; admin, operator and print pages never load a tag.
 *
 * Renders nothing unless a valid NEXT_PUBLIC_GTM_ID is set or internal events
 * are enabled, so an unconfigured environment shows no banner and loads no
 * third-party script.
 */
export function MarketingTags() {
  const gtmId = process.env.NEXT_PUBLIC_GTM_ID;
  const hasGtm = isValidGtmId(gtmId);
  const internal = process.env.MARKETING_EVENTS_ENABLED === 'true';
  if (!hasGtm && !internal) return null;
  return (
    <>
      {hasGtm ? (
        <Script id="gf-gtm" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: gtmBootstrapScript(gtmId) }} />
      ) : null}
      <MarketingRuntime />
      <ConsentBanner />
    </>
  );
}

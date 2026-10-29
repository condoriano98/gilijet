import { CONSENT_COOKIE, CONSENT_VERSION } from '@/features/marketing/consent';

const GTM_ID_RE = /^GTM-[A-Z0-9]{4,12}$/;

export function isValidGtmId(id: string | undefined | null): id is string {
  return !!id && GTM_ID_RE.test(id);
}

/**
 * One inline script, so ordering is guaranteed: Consent Mode defaults (all
 * denied) are set before gtm.js is requested, then immediately updated from
 * the visitor's stored choice. Google's docs require the default to run
 * before the container loads. The id is validated before interpolation.
 */
export function gtmBootstrapScript(gtmId: string): string {
  if (!isValidGtmId(gtmId)) throw new Error('Invalid GTM container id');
  return [
    'window.dataLayer=window.dataLayer||[];',
    'function gtag(){dataLayer.push(arguments);}window.gtag=gtag;',
    "gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',wait_for_update:500});",
    "gtag('set','ads_data_redaction',true);",
    `var m=document.cookie.match(/(?:^|; )${CONSENT_COOKIE}=v${CONSENT_VERSION}\\.a([01])\\.m([01])\\./);`,
    "if(m){var a=m[1]==='1'?'granted':'denied',k=m[2]==='1'?'granted':'denied';gtag('consent','update',{analytics_storage:a,ad_storage:k,ad_user_data:k,ad_personalization:k});}",
    "(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});",
    'var f=d.getElementsByTagName(s)[0],j=d.createElement(s);j.async=true;',
    `j.src='https://www.googletagmanager.com/gtm.js?id='+i;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');`,
  ].join('');
}

import { containsPii } from '@/features/marketing/privacy';

/**
 * Browser side of the event contract. GTM is the only tag owner: the app
 * pushes typed events here and the container decides which tags fire, with
 * Consent Mode applied. Nothing in this file may reach a server module.
 */
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** Push one event; refuses anything that looks like personal data. */
export function pushDataLayer(payload: Record<string, unknown>): boolean {
  if (typeof window === 'undefined') return false;
  if (containsPii(payload)) {
    console.warn('[marketing] dataLayer push refused: payload looks like personal data', payload.event);
    return false;
  }
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(payload);
  return true;
}

export function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : undefined;
}

export function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${value}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
}

export function deleteCookie(name: string): void {
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export const CONSENT_CHANGED_EVENT = 'gf:consent-changed';
export const OPEN_CONSENT_EVENT = 'gf:open-consent';

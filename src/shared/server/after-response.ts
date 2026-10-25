import { after } from 'next/server';

/**
 * Keep the function alive until `work` settles, after the response has gone out.
 * Vercel freezes a function as soon as it responds, so a bare floating promise
 * (an email or WhatsApp fired from a webhook) is dropped or only resumes on the
 * next request. Outside a request scope (scripts, tests) `after` throws and the
 * promise simply keeps running.
 */
export function afterResponse(work: Promise<unknown>): void {
  try {
    after(work);
  } catch {
    // not in a request scope
  }
}

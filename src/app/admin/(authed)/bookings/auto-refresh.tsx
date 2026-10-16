'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const BOOKINGS_REFRESH_MS = 30_000;

// Re-runs the server component so a payment webhook that lands while the page
// is open shows up without a manual reload. Skips hidden tabs.
export function AutoRefresh({ intervalMs = BOOKINGS_REFRESH_MS }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const id = setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [router, intervalMs]);

  return null;
}

'use client';

import * as React from 'react';
import { Input } from '@/shared/ui/input';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import { formatIDR } from '@/shared/lib/utils';
import { useBookingPrice } from '@/app/(customer)/[locale]/book/[legId]/_components/booking-price-provider';

type ValidationResult =
  | { valid: true; discountAmount: number; description: string | null }
  | { valid: false; error: string };

/**
 * Promo code input with inline validation. Hits /api/promos/validate
 * to show discount preview before form submit. The actual application
 * happens server-side in the booking engine.
 *
 * `legId` (the outbound leg for a round trip) and `legCount` let the preview
 * run the same route / operator / Nett rules as the booking.
 */
export function PromoCodeInput({
  legId,
  legCount = 1,
}: {
  legId: string;
  legCount?: 1 | 2;
}) {
  const { total: baseAmount, types } = useBookingPrice();
  const mixKey = `${types.join(',')}|${baseAmount}`;
  const [code, setCode] = React.useState('');
  const [status, setStatus] = React.useState<
    'idle' | 'checking' | 'valid' | 'invalid'
  >('idle');
  const [result, setResult] = React.useState<ValidationResult | null>(null);

  // A saving worked out for another passenger mix would be wrong: ask again.
  const lastMix = React.useRef(mixKey);
  React.useEffect(() => {
    if (lastMix.current === mixKey) return;
    lastMix.current = mixKey;
    setStatus('idle');
    setResult(null);
  }, [mixKey]);

  async function applyCode() {
    if (!code.trim()) return;
    setStatus('checking');
    try {
      const query = new URLSearchParams({
        code: code.trim(),
        amount: String(baseAmount),
        types: types.join(','),
        legId,
        legs: String(legCount),
      });
      const res = await fetch(`/api/promos/validate?${query}`);
      const data = (await res.json()) as ValidationResult;
      setResult(data);
      setStatus(data.valid ? 'valid' : 'invalid');
    } catch {
      setResult({ valid: false, error: 'Could not check promo code' });
      setStatus('invalid');
    }
  }

  function clearCode() {
    setCode('');
    setStatus('idle');
    setResult(null);
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="promoCode">Promo code (optional)</Label>
      <div className="flex gap-2">
        <Input
          id="promoCode"
          name="promoCode"
          placeholder="e.g. GILIFAST15"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            if (status !== 'idle') {
              setStatus('idle');
              setResult(null);
            }
          }}
          autoComplete="off"
        />
        {status === 'valid' ? (
          <Button type="button" variant="outline" onClick={clearCode}>
            Clear
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={applyCode}
            disabled={status === 'checking' || !code.trim()}
          >
            {status === 'checking' ? 'Checking...' : 'Apply'}
          </Button>
        )}
      </div>
      {result && result.valid ? (
        <p className="text-xs text-emerald-700">
          ✓ {result.description ?? 'Promo applied'} — saves{' '}
          <strong>{formatIDR(result.discountAmount)}</strong>
        </p>
      ) : null}
      {result && !result.valid ? (
        <p className="text-xs text-red-700">{result.error}</p>
      ) : null}
    </div>
  );
}

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
 */
export function PromoCodeInput() {
  const { total: baseAmount } = useBookingPrice();
  const [code, setCode] = React.useState('');
  const [status, setStatus] = React.useState<
    'idle' | 'checking' | 'valid' | 'invalid'
  >('idle');
  const [result, setResult] = React.useState<ValidationResult | null>(null);

  async function applyCode() {
    if (!code.trim()) return;
    setStatus('checking');
    try {
      const res = await fetch(
        `/api/promos/validate?code=${encodeURIComponent(code.trim())}&amount=${baseAmount}`,
      );
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
    <div className="space-y-1.5">
      <Label htmlFor="promoCode" className="text-[13px] font-semibold text-brand-text">Promo code (optional)</Label>
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
          className="h-12 rounded-[14px] border-brand-line px-3.5 text-base"
        />
        {status === 'valid' ? (
          <Button type="button" variant="outline" className="h-12 rounded-[14px] border-brand px-5 font-semibold text-brand hover:bg-brand-periwinkle" onClick={clearCode}>
            Clear
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-[14px] border-brand px-5 font-semibold text-brand hover:bg-brand-periwinkle"
            onClick={applyCode}
            disabled={status === 'checking' || !code.trim()}
          >
            {status === 'checking' ? 'Checking...' : 'Apply'}
          </Button>
        )}
      </div>
      {result && result.valid ? (
        <p className="text-sm text-emerald-700">
          ✓ {result.description ?? 'Promo applied'} — saves{' '}
          <strong>{formatIDR(result.discountAmount)}</strong>
        </p>
      ) : null}
      {result && !result.valid ? (
        <p className="text-sm text-rose-700">{result.error}</p>
      ) : null}
    </div>
  );
}

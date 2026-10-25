'use client';

import * as React from 'react';
import { Input } from '@/shared/ui/input';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { formatIDR } from '@/shared/lib/utils';
import { useBookingPrice } from '@/app/(customer)/[locale]/book/[legId]/_components/booking-price-provider';

type ValidationResult =
  | { valid: true; discountAmount: number; description: string | null }
  | { valid: false; error: string; reason?: 'FIRST_BOOKING_USED' };

/** How long the "not valid coupon" pop-up stays before it closes by itself. */
const NOT_VALID_POPUP_MS = 2000;

/** The buyer's email and phone as typed so far, read from the booking form. */
function readBuyer() {
  const email = document.querySelector<HTMLInputElement>('#customerEmail')?.value.trim() ?? '';
  const phone =
    document.querySelector<HTMLInputElement>('input[name="customerPhone"]')?.value.trim() ?? '';
  // The phone field starts as the dial code alone; that is not a number yet.
  return { email, phone: phone.replace(/\D/g, '').length >= 6 ? phone : '' };
}

/**
 * Promo code input with inline validation. Hits /api/promos/validate
 * to show discount preview before form submit. The actual application
 * happens server-side in the booking engine.
 *
 * `legId` (the outbound leg for a round trip) and `returnLegId` let the preview
 * run the same route / operator / Nett rules as the booking. The email and phone
 * typed in the form are sent too, so a first-booking-only code can turn away a
 * buyer who has booked before: a pop-up says so, and closes itself.
 */
export function PromoCodeInput({
  legId,
  returnLegId,
}: {
  legId: string;
  returnLegId?: string;
}) {
  const { total: baseAmount, types } = useBookingPrice();
  const mixKey = `${types.join(',')}|${baseAmount}`;
  const [code, setCode] = React.useState('');
  const [status, setStatus] = React.useState<
    'idle' | 'checking' | 'valid' | 'invalid'
  >('idle');
  const [result, setResult] = React.useState<ValidationResult | null>(null);
  const [notValidOpen, setNotValidOpen] = React.useState(false);

  // A saving worked out for another passenger mix would be wrong: ask again.
  const lastMix = React.useRef(mixKey);
  React.useEffect(() => {
    if (lastMix.current === mixKey) return;
    lastMix.current = mixKey;
    setStatus('idle');
    setResult(null);
  }, [mixKey]);

  React.useEffect(() => {
    if (!notValidOpen) return;
    const timer = setTimeout(() => setNotValidOpen(false), NOT_VALID_POPUP_MS);
    return () => clearTimeout(timer);
  }, [notValidOpen]);

  const check = React.useCallback(
    async (value: string) => {
      setStatus('checking');
      try {
        const buyer = readBuyer();
        const query = new URLSearchParams({
          code: value,
          amount: String(baseAmount),
          types: types.join(','),
          legId,
          email: buyer.email,
          phone: buyer.phone,
        });
        if (returnLegId) query.set('returnLegId', returnLegId);
        const res = await fetch(`/api/promos/validate?${query}`);
        const data = (await res.json()) as ValidationResult;
        setResult(data);
        setStatus(data.valid ? 'valid' : 'invalid');
        if (!data.valid && data.reason === 'FIRST_BOOKING_USED') setNotValidOpen(true);
      } catch {
        setResult({ valid: false, error: 'Could not check promo code' });
        setStatus('invalid');
      }
    },
    [baseAmount, types, legId, returnLegId],
  );

  // The code was accepted before the buyer typed an email or phone that has
  // booked before: ask again once they leave one of those fields.
  const appliedCode = status === 'valid' ? code.trim() : '';
  React.useEffect(() => {
    if (!appliedCode) return;
    const onFocusOut = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.id === 'customerEmail' || el?.getAttribute('type') === 'tel') {
        void check(appliedCode);
      }
    };
    document.addEventListener('focusout', onFocusOut);
    return () => document.removeEventListener('focusout', onFocusOut);
  }, [appliedCode, check]);

  function applyCode() {
    if (!code.trim()) return;
    void check(code.trim());
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
          placeholder="Enter promo code"
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

      <Dialog open={notValidOpen} onOpenChange={setNotValidOpen}>
        <DialogContent className="max-w-sm text-center" aria-describedby="not-valid-coupon-help">
          <DialogHeader>
            <DialogTitle>Not valid coupon</DialogTitle>
            <DialogDescription id="not-valid-coupon-help">
              This code is for a first booking only.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}

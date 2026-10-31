'use client';

import { useState, useEffect, useTransition } from 'react';
import { formatIDR } from '@/shared/lib/utils';

type Tab = 'card' | 'qris' | 'bank';

export function DummyCheckoutForm({
  reference,
  amount,
  customerEmail,
  expiresAtIso,
  simulateAction,
}: {
  reference: string;
  amount: number;
  customerEmail: string;
  expiresAtIso: string;
  simulateAction: (fd: FormData) => Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>('card');
  const [isPending, startTransition] = useTransition();
  const [timeLeft, setTimeLeft] = useState('');
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    const expires = new Date(expiresAtIso).getTime();
    const tick = () => {
      const ms = Math.max(0, expires - Date.now());
      const m = Math.floor(ms / 60_000);
      const s = Math.floor((ms % 60_000) / 1000);
      setTimeLeft(`${m}:${s.toString().padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAtIso]);

  function handleSubmit(outcome: 'success' | 'fail') {
    if (outcome === 'success' && !agreed) return;
    const fd = new FormData();
    fd.set('reference', reference);
    fd.set('outcome', outcome);
    fd.set('method', tab);
    startTransition(() => simulateAction(fd));
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'card', label: 'Card' },
    { id: 'qris', label: 'QRIS' },
    { id: 'bank', label: 'Bank Transfer' },
  ];

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-1 rounded-full bg-brand-surface p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={[
              'min-h-11 flex-1 rounded-full px-3 py-2 text-sm font-semibold transition-all',
              tab === t.id
                ? 'bg-white text-brand shadow-sm'
                : 'text-brand-muted hover:text-brand-ink',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Card tab */}
      {tab === 'card' && (
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-brand-text">
              Email
            </label>
            <input
              readOnly
              value={customerEmail}
              className="min-h-12 w-full rounded-[14px] border border-brand-line bg-brand-surface px-3.5 text-base text-brand-muted"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-brand-text">
              Card number
            </label>
            <input
              readOnly
              value="4242 4242 4242 4242"
              className="min-h-12 w-full rounded-[14px] border border-brand-line bg-brand-surface px-3.5 font-mono text-base text-brand-text"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-brand-text">
                Expiry
              </label>
              <input
                readOnly
                value="12 / 28"
                className="min-h-12 w-full rounded-[14px] border border-brand-line bg-brand-surface px-3.5 font-mono text-base text-brand-text"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-brand-text">
                CVC
              </label>
              <input
                readOnly
                value="123"
                className="min-h-12 w-full rounded-[14px] border border-brand-line bg-brand-surface px-3.5 font-mono text-base text-brand-text"
              />
            </div>
          </div>
          <p className="text-[13px] text-brand-muted">
            Test card pre-filled — no real charge.
          </p>
        </div>
      )}

      {/* QRIS tab */}
      {tab === 'qris' && (
        <div className="flex flex-col items-center gap-3 py-2">
          <QrisDummy amount={amount} />
          <p className="text-[13px] text-brand-muted">
            Scan with any e-wallet or banking app (demo)
          </p>
        </div>
      )}

      {/* Bank transfer tab */}
      {tab === 'bank' && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-brand-line bg-brand-surface p-4">
            <div className="text-[13px] font-semibold text-brand-muted">
              Bank BCA · Virtual Account
            </div>
            <div className="mt-1 font-mono text-lg font-semibold tracking-wider text-brand-ink">
              8808 1234 5678 9012
            </div>
          </div>
          <div className="rounded-2xl border border-brand-line bg-brand-surface p-4">
            <div className="text-[13px] font-semibold text-brand-muted">
              Amount to transfer
            </div>
            <div className="mt-1 font-mono text-lg font-semibold text-brand-ink">
              {formatIDR(amount)}
            </div>
          </div>
          <p className="text-[13px] text-brand-muted">
            Demo virtual account — click Pay to simulate transfer.
          </p>
        </div>
      )}

      {/* Timer */}
      <div className="rounded-2xl bg-amber-50 px-4 py-3 text-center text-sm font-semibold text-amber-900">
        Expires in{' '}
        <span className="font-mono text-base font-extrabold">
          {timeLeft}
        </span>
      </div>

      {/* Terms agreement gate */}
      <label className="flex items-start gap-3 rounded-2xl bg-brand-surface p-4 text-sm leading-relaxed text-brand-text">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-5 w-5 flex-shrink-0 accent-brand"
        />
        <span>
          I have read and agree to the{' '}
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-brand underline"
          >
            Terms &amp; Conditions and Refund Policy
          </a>
          . By paying I accept the cancellation schedule and confirm my booking
          details are correct.
        </span>
      </label>

      {/* Buttons */}
      <button
        type="button"
        disabled={isPending || !agreed}
        onClick={() => handleSubmit('success')}
        className="min-h-14 w-full rounded-2xl bg-brand px-4 py-3 text-base font-bold text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending
          ? 'Processing...'
          : agreed
            ? `Pay ${formatIDR(amount)}`
            : 'Accept the terms to pay'}
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => handleSubmit('fail')}
        className="min-h-12 w-full rounded-2xl border border-brand-line px-4 py-2.5 text-sm font-semibold text-brand-muted transition-colors hover:bg-brand-surface disabled:opacity-50"
      >
        Cancel payment
      </button>
    </div>
  );
}

function QrisDummy({ amount }: { amount: number }) {
  const cells = Array.from({ length: 225 }, (_, i) => {
    const seed = (i * 9301 + amount * 49297) % 233280;
    const on = seed % 100 < 45;
    const row = Math.floor(i / 15);
    const col = i % 15;
    const corner =
      (row < 3 && col < 3) ||
      (row < 3 && col > 11) ||
      (row > 11 && col < 3);
    return on || corner;
  });

  return (
    <div className="rounded-2xl border border-brand-line bg-white p-4">
      <div className="mx-auto grid h-40 w-40 grid-cols-[repeat(15,1fr)] gap-px">
        {cells.map((on, i) => (
          <div
            key={i}
            className={on ? 'bg-brand-ink rounded-[1px]' : 'bg-transparent'}
          />
        ))}
      </div>
    </div>
  );
}

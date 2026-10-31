import { redirect } from 'next/navigation';
import Image from 'next/image';
import { Search } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

async function lookupAction(formData: FormData) {
  'use server';
  const ref = String(formData.get('reference') ?? '').trim().toUpperCase();
  if (!ref) redirect('/b?error=missing');
  redirect(`/b/${encodeURIComponent(ref)}`);
}

export default async function BookingLookupHomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-8 sm:px-6 sm:py-12">
      <div className="overflow-hidden rounded-[32px] border border-brand-line bg-white md:grid md:grid-cols-2">
        <div className="relative flex min-h-[220px] items-end px-6 py-8 sm:px-10 sm:py-11 md:min-h-[480px]">
          <Image
            src="/brand/hero-home.png"
            alt=""
            fill
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover object-[25%_center]"
          />
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,34,142,0.35)_0%,rgba(0,34,142,0.86)_100%)]" />
          <h1 className="relative font-display text-3xl font-extrabold tracking-tight text-white sm:text-[38px]">
            Find your booking
          </h1>
        </div>
        <div className="px-6 py-8 sm:px-10 sm:py-12 md:px-14">
          <p className="text-[15px] leading-relaxed text-brand-muted">
            Enter the reference from your confirmation email
            (e.g. <span className="font-mono font-semibold text-brand-ink">BK-2026-05-A4C9F1</span>).
          </p>
          <form action={lookupAction} className="mt-6 space-y-5">
            {error ? (
              <p className="rounded-[14px] bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                Please enter a reference.
              </p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="reference" className="text-sm font-semibold text-brand-ink">
                Booking reference
              </Label>
              <Input
                id="reference"
                name="reference"
                required
                placeholder="BK-2026-05-XXXXXX"
                autoComplete="off"
                className="h-14 rounded-2xl border-brand-line px-[18px] font-mono text-[17px] font-semibold uppercase"
              />
            </div>
            <Button
              type="submit"
              className="h-14 w-full rounded-2xl bg-brand text-[17px] font-bold text-white hover:bg-brand-dark"
            >
              <Search size={20} className="mr-2.5" aria-hidden />
              Look up
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

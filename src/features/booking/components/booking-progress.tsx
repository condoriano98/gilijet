import { Check } from 'lucide-react';

const STEPS = [
  { label: 'Search' },
  { label: 'Details' },
  { label: 'Payment' },
  { label: 'Done' },
] as const;

export function BookingProgress({ currentStep }: { currentStep: 1 | 2 | 3 | 4 }) {
  return (
    <nav aria-label="Booking progress" className="mb-6">
      <ol className="flex items-center">
        {STEPS.map((step, idx) => {
          const num = (idx + 1) as 1 | 2 | 3 | 4;
          const done = num < currentStep;
          const active = num === currentStep;

          return (
            <li key={step.label} className="flex flex-1 items-center">
              {/* Circle */}
              <div className="flex flex-col items-center">
                <div
                  className={[
                    'flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                    done
                      ? 'bg-brand text-white'
                      : active
                        ? 'bg-brand text-white ring-4 ring-brand-periwinkle'
                        : 'bg-brand-periwinkle text-brand-dark',
                  ].join(' ')}
                  aria-current={active ? 'step' : undefined}
                >
                  {done ? <Check className="h-4 w-4" strokeWidth={3} /> : num}
                </div>
                <span
                  className={[
                    'mt-1 hidden text-xs sm:block',
                    active ? 'font-semibold text-brand' : 'text-brand-muted',
                  ].join(' ')}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line (not after last step) */}
              {idx < STEPS.length - 1 && (
                <div
                  className={[
                    'mx-1 h-0.5 flex-1',
                    num < currentStep ? 'bg-brand' : 'bg-brand-line',
                  ].join(' ')}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

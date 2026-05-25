"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { formatIDR } from "@/lib/utils";

export function SubmitBookingButton({ amount }: { amount: number }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? (
        <span className="flex items-center gap-2">
          <svg
            className="h-4 w-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Securing your seats...
        </span>
      ) : (
        `Pay ${formatIDR(amount)}`
      )}
    </Button>
  );
}

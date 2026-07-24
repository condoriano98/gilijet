"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { submitBankAccount } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Operator } from "@prisma/client";

export function Step7BankAccount({ operator }: { operator: Operator }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bankInfo = operator.bankAccountInfo as {
    bankName?: string;
    accountNumber?: string;
    accountHolder?: string;
  } | null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData(e.currentTarget);

      const result = await submitBankAccount(formData);
      if (result.success) {
        router.push("/operator?registered=true");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save bank account");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Banking Details</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Where we&apos;ll transfer your operator payouts
        </p>
      </div>

      <div className="rounded-md bg-blue-50 px-4 py-3 text-sm text-blue-700">
        <p className="font-semibold">What happens next:</p>
        <ul className="mt-2 list-inside space-y-1">
          <li>✓ Gilijet admin will review all your documents</li>
          <li>✓ We&apos;ll verify your KYB information</li>
          <li>✓ Your account will be activated</li>
          <li>✓ You&apos;ll receive an email confirmation</li>
        </ul>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="bankName">Bank Name *</Label>
          <Input
            id="bankName"
            name="bankName"
            defaultValue={bankInfo?.bankName || ""}
            placeholder="e.g., BCA, Mandiri, BNI"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="accountNumber">Account Number *</Label>
          <Input
            id="accountNumber"
            name="accountNumber"
            defaultValue={bankInfo?.accountNumber || ""}
            placeholder="e.g., 1234567890"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="accountHolder">Account Holder Name *</Label>
          <Input
            id="accountHolder"
            name="accountHolder"
            defaultValue={bankInfo?.accountHolder || ""}
            placeholder="Name as shown in bank"
            required
          />
        </div>

        <div className="rounded-md bg-yellow-50 px-4 py-3 text-sm text-yellow-700">
          <p className="font-semibold">⚠️ Important:</p>
          <p className="mt-1">
            Make sure the account holder name matches your business registration. Incorrect details may cause payout delays.
          </p>
        </div>

        <div className="flex gap-3">
          <Button type="submit" disabled={loading} className="flex-1">
            {loading ? "Submitting..." : "Complete Registration"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          By submitting this form, you confirm that all information is accurate and agree to Gilijet&apos;s terms of service.
        </p>
      </form>
    </div>
  );
}

"use client";

import Link from "next/link";
import { createOperatorAccount } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function Step1BasicInfo({ error }: { error?: string }) {
  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <form action={createOperatorAccount} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="companyName">Company Name *</Label>
            <Input
              id="companyName"
              name="companyName"
              required
              minLength={3}
              maxLength={100}
              placeholder="PT Gilifast Transportasi"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contactPerson">Contact Person *</Label>
            <Input
              id="contactPerson"
              name="contactPerson"
              required
              minLength={3}
              maxLength={100}
              placeholder="Budi Santoso"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              placeholder="operator@gilifast.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phoneNumber">Phone Number *</Label>
            <Input
              id="phoneNumber"
              name="phoneNumber"
              type="tel"
              required
              minLength={10}
              maxLength={20}
              placeholder="+62821234567"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="password">Password *</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              placeholder="Min 8 characters"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password *</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              minLength={8}
              placeholder="Confirm your password"
            />
          </div>
        </div>

        <div className="rounded-md bg-blue-50 px-4 py-3 text-sm text-blue-700">
          <p className="font-semibold">Next steps:</p>
          <ul className="mt-2 list-inside space-y-1">
            <li>✓ Create account with basic company information</li>
            <li>✓ Upload required documents (SIUP, NPWP, licenses)</li>
            <li>✓ Provide banking details for payouts</li>
            <li>✓ Admin review and approval</li>
          </ul>
        </div>

        <div className="flex gap-3">
          <Button type="submit" className="w-full sm:w-auto">
            Create Account & Continue
          </Button>
          <Button variant="outline" asChild>
            <Link href="/operator/login">Already have an account? Sign in</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}

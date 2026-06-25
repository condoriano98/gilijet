"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfile } from "./actions";

function isRedirectError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "digest" in e &&
    typeof (e as { digest: unknown }).digest === "string" &&
    (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export function ProfileForm({
  initial,
}: {
  initial: {
    companyName: string;
    contactPerson: string;
    phoneNumber: string;
    npwp?: string | null;
  };
}) {
  const [companyName, setCompanyName] = React.useState(initial.companyName);
  const [contactPerson, setContactPerson] = React.useState(initial.contactPerson);
  const [phoneNumber, setPhoneNumber] = React.useState(initial.phoneNumber);
  const [npwp, setNpwp] = React.useState(initial.npwp ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await updateProfile({
          companyName,
          contactPerson,
          phoneNumber,
          npwp: npwp || undefined,
        });
      } catch (err) {
        if (isRedirectError(err)) throw err;
        setError(err instanceof Error ? err.message : "Gagal menyimpan profil");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profil Operator</CardTitle>
        <CardDescription>Perbarui data perusahaan dan kontak.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
          <div className="space-y-2">
            <Label htmlFor="companyName">Nama Perusahaan</Label>
            <Input
              id="companyName"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contactPerson">Narahubung</Label>
            <Input
              id="contactPerson"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phoneNumber">Nomor Telepon</Label>
            <Input
              id="phoneNumber"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="npwp">NPWP</Label>
            <Input
              id="npwp"
              value={npwp}
              onChange={(e) => setNpwp(e.target.value)}
              placeholder="Opsional"
            />
          </div>
          <Button
            type="submit"
            disabled={pending}
            className="bg-mekari-primary hover:bg-mekari-primary-600"
          >
            {pending ? "Menyimpan..." : "Simpan Perubahan"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

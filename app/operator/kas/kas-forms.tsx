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
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatIDR } from "@/lib/utils";
import { formatLocalDateTime } from "@/lib/datetime";
import { openShift, closeShift } from "./actions";

// Server actions redirect() on success; re-throw that signal so Next can
// perform the client navigation instead of surfacing it as an error.
function isRedirectError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "digest" in e &&
    typeof (e as { digest: unknown }).digest === "string" &&
    (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

type StaffOption = { id: string; fullName: string };

export function OpenShiftForm({ staff }: { staff: StaffOption[] }) {
  const [staffId, setStaffId] = React.useState(staff[0]?.id ?? "");
  const [openingBalance, setOpeningBalance] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      try {
        await openShift({ staffId, openingBalance });
      } catch (e) {
        if (isRedirectError(e)) throw e;
        setError(e instanceof Error ? e.message : "Gagal membuka shift");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Buka Shift Kas</CardTitle>
        <CardDescription>
          Catat saldo awal kas di laci sebelum mulai menerima penjualan walk-in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {staff.length === 0 ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Belum ada staf aktif. Tambahkan staf di Pengaturan sebelum membuka shift.
          </p>
        ) : (
          <>
            {error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
            <div className="space-y-2">
              <Label htmlFor="staffId">Staf Bertugas</Label>
              <Select value={staffId} onValueChange={setStaffId}>
                <SelectTrigger id="staffId">
                  <SelectValue placeholder="Pilih staf" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="openingBalance">Saldo Awal Kas</Label>
              <MoneyInput id="openingBalance" value={openingBalance} onChange={setOpeningBalance} />
            </div>
            <div className="flex justify-end">
              <Button
                onClick={handleSubmit}
                disabled={pending || !staffId}
                className="bg-mekari-primary hover:bg-mekari-primary-600"
              >
                {pending ? "Membuka…" : "Buka Shift"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

type CloseShiftFormProps = {
  sessionId: string;
  staffName: string;
  openedAt: string;
  openingBalance: number;
  runningCash: number;
};

export function CloseShiftForm({
  sessionId,
  staffName,
  openedAt,
  openingBalance,
  runningCash,
}: CloseShiftFormProps) {
  const [closingBalanceCounted, setClosingBalanceCounted] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const expectedCash = openingBalance + runningCash;
  const variance = closingBalanceCounted - expectedCash;
  const varianceClass =
    variance === 0
      ? "text-mekari-neutral-900"
      : variance > 0
        ? "text-amber-700"
        : "text-red-700";

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      try {
        await closeShift({ sessionId, closingBalanceCounted });
      } catch (e) {
        if (isRedirectError(e)) throw e;
        setError(e instanceof Error ? e.message : "Gagal menutup shift");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shift Aktif</CardTitle>
        <CardDescription>
          Tutup shift dengan menghitung uang fisik di laci.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-4 rounded-md bg-mekari-neutral-50 p-4 text-sm">
          <div>
            <dt className="text-mekari-neutral-500">Staf</dt>
            <dd className="font-medium text-mekari-neutral-900">{staffName}</dd>
          </div>
          <div>
            <dt className="text-mekari-neutral-500">Dibuka</dt>
            <dd className="font-medium text-mekari-neutral-900">
              {formatLocalDateTime(openedAt)}
            </dd>
          </div>
          <div>
            <dt className="text-mekari-neutral-500">Saldo Awal</dt>
            <dd className="font-medium tabular-nums text-mekari-neutral-900">
              {formatIDR(openingBalance)}
            </dd>
          </div>
          <div>
            <dt className="text-mekari-neutral-500">Kas Berjalan</dt>
            <dd className="font-medium tabular-nums text-mekari-neutral-900">
              {formatIDR(runningCash)}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-mekari-neutral-500">Kas Diharapkan</dt>
            <dd className="text-base font-bold tabular-nums text-mekari-neutral-900">
              {formatIDR(expectedCash)}
            </dd>
          </div>
        </dl>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="space-y-2">
          <Label htmlFor="closingBalanceCounted">Saldo Fisik Dihitung</Label>
          <MoneyInput
            id="closingBalanceCounted"
            value={closingBalanceCounted}
            onChange={setClosingBalanceCounted}
          />
        </div>

        <div className="flex items-center justify-between rounded-md border border-mekari-neutral-200 p-4">
          <span className="text-sm text-mekari-neutral-500">Selisih (variance)</span>
          <span className={`text-base font-bold tabular-nums ${varianceClass}`}>
            {formatIDR(variance)}
          </span>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={handleSubmit}
            disabled={pending}
            className="bg-mekari-primary hover:bg-mekari-primary-600"
          >
            {pending ? "Menutup…" : "Tutup Shift"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

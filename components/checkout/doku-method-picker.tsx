"use client";

import { useState, useTransition } from "react";
import { QrCode, Landmark, Wallet, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";

const VA_BANKS = [
  ["BCA", "BCA"],
  ["BNI", "BNI"],
  ["BRI", "BRI"],
  ["MANDIRI", "Mandiri"],
  ["PERMATA", "Permata"],
] as const;

const WALLETS = [
  ["OVO", "OVO"],
  ["DANA", "DANA"],
  ["SHOPEEPAY", "ShopeePay"],
  ["LINKAJA", "LinkAja"],
] as const;

type Kind = "QRIS" | "VA" | "EWALLET" | "CARD";

const GROUPS: { kind: Kind; label: string; caption: string; icon: React.ReactNode }[] = [
  { kind: "QRIS", label: "QRIS", caption: "Scan with any bank or e-wallet app", icon: <QrCode size={20} /> },
  { kind: "VA", label: "Virtual Account", caption: "Transfer from any Indonesian bank", icon: <Landmark size={20} /> },
  { kind: "EWALLET", label: "E-Wallet", caption: "OVO, DANA, ShopeePay, LinkAja", icon: <Wallet size={20} /> },
  { kind: "CARD", label: "Credit / Debit Card", caption: "Visa, Mastercard, JCB", icon: <CreditCard size={20} /> },
];

export function DokuMethodPicker({
  reference,
  selectAction,
}: {
  reference: string;
  selectAction: (fd: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState<Kind>("QRIS");
  const [bank, setBank] = useState<string>("BCA");
  const [wallet, setWallet] = useState<string>("OVO");
  const [pending, start] = useTransition();

  function submit() {
    const fd = new FormData();
    fd.set("reference", reference);
    fd.set("kind", open);
    if (open === "VA") fd.set("bank", bank);
    if (open === "EWALLET") fd.set("wallet", wallet);
    start(() => selectAction(fd));
  }

  return (
    <div className="space-y-3">
      {GROUPS.map((g) => {
        const isOpen = open === g.kind;
        return (
          <div key={g.kind} className="overflow-hidden rounded-[10px] border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => setOpen(g.kind)}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                isOpen ? "bg-brand-periwinkle/40" : "hover:bg-slate-50"
              }`}
            >
              <span className={`flex h-9 w-9 items-center justify-center rounded-full ${isOpen ? "bg-brand text-white" : "bg-slate-100 text-slate-500"}`}>
                {g.icon}
              </span>
              <span className="flex-1">
                <span className="block text-sm font-semibold text-slate-900">{g.label}</span>
                <span className="block text-xs text-slate-500">{g.caption}</span>
              </span>
              <span className={`h-4 w-4 rounded-full border-2 ${isOpen ? "border-brand bg-brand" : "border-slate-300"}`} />
            </button>

            {isOpen && (g.kind === "VA" || g.kind === "EWALLET") && (
              <div className="grid grid-cols-2 gap-2 border-t border-slate-100 bg-slate-50 p-3 sm:grid-cols-3">
                {(g.kind === "VA" ? VA_BANKS : WALLETS).map(([val, name]) => {
                  const sel = g.kind === "VA" ? bank === val : wallet === val;
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => (g.kind === "VA" ? setBank(val) : setWallet(val))}
                      className={`rounded-md border bg-white px-3 py-2 text-sm transition-colors ${
                        sel ? "border-brand ring-2 ring-brand-periwinkle" : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <Button
        type="button"
        size="lg"
        onClick={submit}
        disabled={pending}
        className="mt-2 h-12 w-full rounded-pill bg-brand font-semibold text-white hover:bg-brand-dark"
      >
        {pending ? "Preparing payment…" : "Continue to pay"}
      </Button>
    </div>
  );
}

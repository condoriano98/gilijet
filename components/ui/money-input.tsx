"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";

type MoneyInputProps = Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: number;
  onChange: (value: number) => void;
  prefix?: string;
};

function formatRupiah(n: number): string {
  return n.toLocaleString("id-ID");
}

function parseRupiah(s: string): number {
  return Number(s.replace(/\D/g, "")) || 0;
}

export function MoneyInput({ value, onChange, prefix = "Rp", ...props }: MoneyInputProps) {
  const [display, setDisplay] = React.useState(formatRupiah(value));

  React.useEffect(() => {
    setDisplay(formatRupiah(value));
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = parseRupiah(e.target.value);
    setDisplay(formatRupiah(raw));
    onChange(raw);
  }

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-mekari-neutral-500">
        {prefix}
      </span>
      <Input
        {...props}
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        className="pl-10 tabular-nums"
      />
    </div>
  );
}

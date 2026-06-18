"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COUNTRIES, DIAL_CODES } from "@/lib/countries";

interface Props {
  defaultPhone?: string;
  defaultNationality?: string;
}

function parsePhone(raw: string): { dialCode: string; number: string } {
  if (raw.startsWith("+")) {
    const match = DIAL_CODES.find((d) => raw.startsWith(d.value));
    if (match) return { dialCode: match.value, number: raw.slice(match.value.length) };
  }
  return { dialCode: "+62", number: raw };
}

export function ContactFields({ defaultPhone = "", defaultNationality = "" }: Props) {
  const parsed = parsePhone(defaultPhone);
  const [dialCode, setDialCode] = useState(parsed.dialCode);
  const [number, setNumber] = useState(parsed.number);
  const [nationality, setNationality] = useState(defaultNationality || "Indonesia");

  return (
    <>
      <div className="space-y-2">
        <Label>Phone (WhatsApp preferred)</Label>
        <div className="flex gap-2">
          <Select value={dialCode} onValueChange={setDialCode}>
            <SelectTrigger className="w-28 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIAL_CODES.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="tel"
            autoComplete="tel-national"
            placeholder="812 3456 7890"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            className="flex-1"
          />
        </div>
        <input type="hidden" name="customerPhone" value={`${dialCode}${number}`} />
      </div>

      <div className="space-y-2">
        <Label>Nationality (optional)</Label>
        <Select value={nationality} onValueChange={setNationality}>
          <SelectTrigger>
            <SelectValue placeholder="Select nationality" />
          </SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.flag ? `${c.flag} ${c.label}` : c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input type="hidden" name="customerNationality" value={nationality} />
      </div>
    </>
  );
}

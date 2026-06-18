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
import {
  COUNTRIES,
  findCountryByCode,
  findCountryByName,
  parsePhone,
} from "@/lib/countries";

interface Props {
  defaultPhone?: string;
  defaultNationality?: string;
}

export function ContactFields({
  defaultPhone = "",
  defaultNationality = "",
}: Props) {
  const parsed = parsePhone(defaultPhone);
  const [phoneCountryCode, setPhoneCountryCode] = useState(parsed.countryCode);
  const [number, setNumber] = useState(parsed.number);

  const initialNationality =
    findCountryByName(defaultNationality)?.code ?? "ID";
  const [nationalityCode, setNationalityCode] = useState(initialNationality);

  const phoneCountry = findCountryByCode(phoneCountryCode);
  const phoneDialCode = phoneCountry?.dialCode ?? "+62";
  const phoneFlag = phoneCountry?.flag ?? "🇮🇩";
  const nationalityName = findCountryByCode(nationalityCode)?.name ?? "";

  return (
    <>
      <div className="space-y-2">
        <Label>Phone (WhatsApp preferred)</Label>
        <div className="flex gap-2">
          <Select value={phoneCountryCode} onValueChange={setPhoneCountryCode}>
            <SelectTrigger className="w-32 shrink-0">
              <SelectValue>
                <span className="truncate">
                  {phoneFlag} {phoneDialCode}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  <span>{c.flag}</span> {c.name}{" "}
                  <span className="text-muted-foreground">{c.dialCode}</span>
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
        <input
          type="hidden"
          name="customerPhone"
          value={`${phoneDialCode}${number}`}
        />
      </div>

      <div className="space-y-2">
        <Label>Nationality (optional)</Label>
        <Select value={nationalityCode} onValueChange={setNationalityCode}>
          <SelectTrigger>
            <SelectValue placeholder="Select nationality" />
          </SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.flag} {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          type="hidden"
          name="customerNationality"
          value={nationalityName}
        />
      </div>
    </>
  );
}

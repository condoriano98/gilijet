'use client';

import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import {
  COUNTRIES,
  findCountryByCode,
  findCountryByName,
  parsePhone,
} from '@/shared/lib/countries';

interface Props {
  defaultPhone?: string;
  defaultNationality?: string;
}

export function ContactFields({
  defaultPhone = '',
  defaultNationality = '',
}: Props) {
  const parsed = parsePhone(defaultPhone);
  const [phoneCountryCode, setPhoneCountryCode] = useState(parsed.countryCode);
  const [number, setNumber] = useState(parsed.number);

  const initialNationality =
    findCountryByName(defaultNationality)?.code ?? 'ID';
  const [nationalityCode, setNationalityCode] = useState(initialNationality);

  const phoneCountry = findCountryByCode(phoneCountryCode);
  const phoneDialCode = phoneCountry?.dialCode ?? '+62';
  const phoneFlag = phoneCountry?.flag ?? '🇮🇩';
  const nationalityName = findCountryByCode(nationalityCode)?.name ?? '';

  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-[13px] font-semibold text-brand-text">Phone (WhatsApp preferred)</Label>
        <div className="flex gap-2">
          <Select value={phoneCountryCode} onValueChange={setPhoneCountryCode}>
            <SelectTrigger className="h-12 w-24 shrink-0 rounded-[14px] border-brand-line text-base sm:w-32">
              <SelectValue>
                <span className="truncate">
                  {phoneFlag} {phoneDialCode}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  <span>{c.flag}</span> {c.name}{' '}
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
            className="h-12 rounded-[14px] border-brand-line px-3.5 text-base min-w-0 flex-1"
          />
        </div>
        <input
          type="hidden"
          name="customerPhone"
          value={`${phoneDialCode}${number}`}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-[13px] font-semibold text-brand-text">
          Nationality <span className="text-destructive">*</span>
        </Label>
        <Select value={nationalityCode} onValueChange={setNationalityCode}>
          <SelectTrigger className="h-12 rounded-[14px] border-brand-line text-base">
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

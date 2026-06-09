"use client";

import * as React from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { getPortsByRegion } from "@/lib/port-info";

type PortComboboxProps = {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  excludePort?: string;
};

export function PortCombobox({
  value,
  onValueChange,
  placeholder = "Select port...",
  excludePort,
}: PortComboboxProps) {
  const options = React.useMemo(() => {
    const regions = getPortsByRegion();
    const opts: ComboboxOption[] = [];
    regions.forEach((r) => {
      r.ports.forEach((port) => {
        if (port !== excludePort) {
          opts.push({
            value: port,
            label: port,
            group: r.region,
          });
        }
      });
    });
    return opts;
  }, [excludePort]);

  return (
    <Combobox
      options={options}
      value={value}
      onValueChange={onValueChange}
      placeholder={placeholder}
      searchPlaceholder="Search ports..."
    />
  );
}

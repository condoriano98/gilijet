"use client";

import * as React from "react";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PortsByRegion = Array<{
  region: string;
  ports: Array<{ name: string }>;
}>;

interface GroupedPortSelectProps {
  ports: PortsByRegion;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  disabledValue?: string;
  className?: string;
}

export function GroupedPortSelect({
  ports,
  value,
  onValueChange,
  placeholder = "Select a port",
  disabled,
  disabledValue,
  className,
}: GroupedPortSelectProps) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        className={cn("h-14 rounded-[10px] border-2 border-slate-100 px-3", className)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <MapPin size={20} className="shrink-0 text-brand" />
          <SelectValue placeholder={placeholder} />
        </div>
      </SelectTrigger>
      <SelectContent className="max-h-96">
        {ports.map((group) => (
          <React.Fragment key={group.region}>
            <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-500 pointer-events-none">
              <span>— {group.region.toUpperCase()} </span>
              <div className="flex-1 border-t border-slate-200" />
            </div>
            {group.ports.map((port) => {
              const isDisabled = disabledValue === port.name;
              return (
                <SelectItem
                  key={port.name}
                  value={port.name}
                  disabled={isDisabled}
                  className="py-2"
                >
                  {port.name} - {group.region}
                </SelectItem>
              );
            })}
          </React.Fragment>
        ))}
      </SelectContent>
    </Select>
  );
}

"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Command as CommandPrimitive } from "cmdk";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type ComboboxOption = {
  value: string;
  label: string;
  group?: string;
};

type ComboboxProps = {
  options: ComboboxOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
};

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyText = "No results found.",
  className,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const groups = React.useMemo(() => {
    const map = new Map<string, ComboboxOption[]>();
    options.forEach((opt) => {
      const group = opt.group ?? "Other";
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push(opt);
    });
    return Array.from(map.entries());
  }, [options]);

  const selectedOption = options.find((o) => o.value === value);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          <span className="truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="ml-2 h-4 w-4 shrink-0 opacity-50"
          >
            <path d="m7 15 5 5 5-5" />
            <path d="m7 9 5-5 5 5" />
          </svg>
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className="z-50 w-[var(--radix-popover-trigger-width)] rounded-md border bg-white shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <CommandPrimitive className="overflow-hidden">
            <div className="flex h-9 items-center border-b px-3">
              <CommandPrimitive.Input
                placeholder={searchPlaceholder}
                className="flex w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <CommandPrimitive.Empty className="py-6 text-center text-sm text-muted-foreground">
              {emptyText}
            </CommandPrimitive.Empty>
            <CommandPrimitive.List className="max-h-[300px] overflow-y-auto overflow-x-hidden p-1">
              {groups.map(([group, groupOptions]) => (
                <CommandPrimitive.Group
                  key={group}
                  heading={
                    <span className="text-xs font-semibold text-muted-foreground">
                      {group}
                    </span>
                  }
                  className="px-1 py-1"
                >
                  {groupOptions.map((option) => (
                    <CommandPrimitive.Item
                      key={option.value}
                      value={option.value}
                      onSelect={() => {
                        onValueChange(option.value);
                        setOpen(false);
                      }}
                      className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled]:pointer-events-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[disabled]:opacity-50"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === option.value
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                      {option.label}
                    </CommandPrimitive.Item>
                  ))}
                </CommandPrimitive.Group>
              ))}
            </CommandPrimitive.List>
          </CommandPrimitive>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

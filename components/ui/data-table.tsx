"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type DataTableColumn<T> = {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
};

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  /**
   * Base path for row links, joined with the row id — e.g. "/operator/awak"
   * links row `abc` to "/operator/awak/abc".
   *
   * Deliberately a string rather than a (row) => string callback: every caller
   * so far is a Server Component, and passing a function across that boundary
   * throws because functions are not serializable.
   */
  rowHrefBase?: string;
  emptyMessage?: string;
};

export function DataTable<T extends { id?: string }>({
  columns,
  data,
  onRowClick,
  rowHrefBase,
  emptyMessage = "Tidak ada data",
}: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-mekari-neutral-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-mekari-neutral-200 mekari-shadow">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-mekari-neutral-200 bg-mekari-neutral-50">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-mekari-neutral-500",
                  col.align === "right" && "text-right",
                  col.align === "center" && "text-center",
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-mekari-neutral-200">
          {data.map((row, i) => {
            const href =
              rowHrefBase && row.id
                ? `${rowHrefBase.replace(/\/$/, "")}/${row.id}`
                : undefined;
            const clickable = Boolean(onRowClick || href);
            return (
              <tr
                key={row.id ?? i}
                className={cn(
                  "bg-mekari-surface transition-colors",
                  clickable && "cursor-pointer hover:bg-mekari-primary-50",
                )}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "px-4 py-3 text-mekari-neutral-700",
                      col.align === "right" && "text-right tabular-nums",
                      col.align === "center" && "text-center",
                      col.className,
                    )}
                  >
                    {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

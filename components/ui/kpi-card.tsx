import { cn } from "@/lib/utils";

type KpiCardProps = {
  label: string;
  value: string;
  change?: number;
  hint?: string;
  icon?: React.ReactNode;
  accent?: "blue" | "green" | "orange" | "red";
};

const accentMap = {
  blue: "bg-mekari-primary-50 text-mekari-primary",
  green: "bg-emerald-50 text-emerald-700",
  orange: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
};

export function KpiCard({ label, value, change, hint, icon, accent = "blue" }: KpiCardProps) {
  return (
    <div className="rounded-lg border border-mekari-neutral-200 bg-mekari-surface p-5 mekari-shadow">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-mekari-neutral-500">{label}</p>
          <p className="text-2xl font-bold tabular-nums text-mekari-neutral-900">{value}</p>
        </div>
        {icon && (
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", accentMap[accent])}>
            {icon}
          </div>
        )}
      </div>
      {(change !== undefined || hint) && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          {change !== undefined && (
            <span className={cn("font-medium", change >= 0 ? "text-mekari-success" : "text-mekari-danger")}>
              {change >= 0 ? "↑" : "↓"} {Math.abs(change).toFixed(1)}%
            </span>
          )}
          {hint && <span className="text-mekari-neutral-500">{hint}</span>}
        </div>
      )}
    </div>
  );
}

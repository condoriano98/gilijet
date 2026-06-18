import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  variant: "success" | "warning" | "danger" | "neutral" | "info";
  children: React.ReactNode;
  className?: string;
};

const variantMap = {
  success: "bg-emerald-50 text-emerald-800",
  warning: "bg-amber-50 text-amber-800",
  danger: "bg-red-50 text-red-800",
  neutral: "bg-slate-100 text-slate-700",
  info: "bg-mekari-primary-50 text-mekari-primary",
};

export function StatusBadge({ variant, children, className }: StatusBadgeProps) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", variantMap[variant], className)}>
      {children}
    </span>
  );
}

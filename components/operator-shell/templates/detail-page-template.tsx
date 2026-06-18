import { StatusBadge } from "@/components/ui/status-badge";

type DetailPageTemplateProps = {
  title: string;
  status?: { label: string; variant: "success" | "warning" | "danger" | "neutral" | "info" };
  actions?: React.ReactNode;
  tabs?: { label: string; href: string; active?: boolean }[];
  children: React.ReactNode;
};

export function DetailPageTemplate({
  title,
  status,
  actions,
  tabs,
  children,
}: DetailPageTemplateProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-mekari-neutral-900">{title}</h1>
          {status && <StatusBadge variant={status.variant}>{status.label}</StatusBadge>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {tabs && tabs.length > 0 && (
        <div className="flex gap-1 border-b border-mekari-neutral-200">
          {tabs.map((tab) => (
            <a
              key={tab.label}
              href={tab.href}
              className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                tab.active
                  ? "border-mekari-primary text-mekari-primary"
                  : "border-transparent text-mekari-neutral-500 hover:text-mekari-neutral-700"
              }`}
            >
              {tab.label}
            </a>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}

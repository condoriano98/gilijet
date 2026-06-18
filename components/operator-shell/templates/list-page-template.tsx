import { Button } from "@/components/ui/button";
import Link from "next/link";

type ListPageTemplateProps = {
  title: string;
  subtitle?: string;
  primaryAction?: { label: string; href: string };
  secondaryActions?: { label: string; href?: string; onClick?: () => void }[];
  kpis?: React.ReactNode;
  children: React.ReactNode;
};

export function ListPageTemplate({
  title,
  subtitle,
  primaryAction,
  secondaryActions,
  kpis,
  children,
}: ListPageTemplateProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-mekari-neutral-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-mekari-neutral-500">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {secondaryActions?.map((a) =>
            a.href ? (
              <Button key={a.label} asChild variant="outline" size="sm">
                <Link href={a.href}>{a.label}</Link>
              </Button>
            ) : (
              <Button key={a.label} variant="outline" size="sm" onClick={a.onClick}>
                {a.label}
              </Button>
            ),
          )}
          {primaryAction && (
            <Button asChild size="sm" className="bg-mekari-primary hover:bg-mekari-primary-600">
              <Link href={primaryAction.href}>{primaryAction.label}</Link>
            </Button>
          )}
        </div>
      </div>
      {kpis && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{kpis}</div>}
      {children}
    </div>
  );
}

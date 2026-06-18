import { Button } from "@/components/ui/button";
import Link from "next/link";

type FormPageTemplateProps = {
  title: string;
  breadcrumb?: { label: string; href: string };
  cancelHref?: string;
  children: React.ReactNode;
};

export function FormPageTemplate({
  title,
  breadcrumb,
  cancelHref,
  children,
}: FormPageTemplateProps) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        {breadcrumb && (
          <Link href={breadcrumb.href} className="text-sm text-mekari-neutral-500 hover:underline">
            ← {breadcrumb.label}
          </Link>
        )}
        <h1 className="mt-1 text-2xl font-bold text-mekari-neutral-900">{title}</h1>
      </div>
      <div className="space-y-6">{children}</div>
      {cancelHref && (
        <div className="sticky bottom-0 flex items-center justify-between border-t border-mekari-neutral-200 bg-mekari-surface py-4">
          <Button asChild variant="ghost">
            <Link href={cancelHref}>Batal</Link>
          </Button>
          <Button type="submit" form="erp-form" className="bg-mekari-primary hover:bg-mekari-primary-600">
            Simpan
          </Button>
        </div>
      )}
    </div>
  );
}

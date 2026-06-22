import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function ConfirmationLoading() {
  return (
    <div className="container py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-2">
          <div className="h-9 w-72 animate-pulse rounded bg-slate-200" />
          <div className="h-5 w-56 animate-pulse rounded bg-slate-100" />
        </div>

        <Card>
          <CardHeader>
            <div className="h-6 w-40 animate-pulse rounded bg-slate-200" />
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
                <div className="h-5 w-32 animate-pulse rounded bg-slate-200" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="h-6 w-32 animate-pulse rounded bg-slate-200" />
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 rounded-md border bg-white p-3">
                <div className="h-32 w-32 shrink-0 animate-pulse rounded-md bg-slate-200 sm:h-40 sm:w-40" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 w-32 animate-pulse rounded bg-slate-200" />
                  <div className="h-4 w-48 animate-pulse rounded bg-slate-100" />
                  <div className="h-4 w-40 animate-pulse rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

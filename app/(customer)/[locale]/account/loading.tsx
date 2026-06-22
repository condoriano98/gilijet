import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function AccountLoading() {
  return (
    <div className="container py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="space-y-2">
          <div className="h-9 w-48 animate-pulse rounded bg-slate-200" />
          <div className="h-5 w-64 animate-pulse rounded bg-slate-100" />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="space-y-2 pt-6">
                <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
                <div className="h-7 w-16 animate-pulse rounded bg-slate-200" />
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <div className="h-6 w-32 animate-pulse rounded bg-slate-200" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-md border bg-white px-3 py-2"
              >
                <div className="space-y-1">
                  <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
                  <div className="h-3 w-48 animate-pulse rounded bg-slate-100" />
                </div>
                <div className="h-8 w-24 animate-pulse rounded-md bg-slate-200" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

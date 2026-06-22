import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function SearchLoading() {
  return (
    <div className="container py-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="h-9 w-48 animate-pulse rounded bg-slate-200" />
        <div className="h-5 w-72 animate-pulse rounded bg-slate-100" />

        <Card>
          <CardContent className="grid gap-3 pt-6 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <div className="h-3 w-16 animate-pulse rounded bg-slate-100" />
                <div className="h-10 w-full animate-pulse rounded-md bg-slate-200" />
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <div className="flex items-start gap-3">
                  <div className="hidden h-16 w-20 shrink-0 animate-pulse rounded-md bg-slate-200 sm:block" />
                  <div className="flex-1 space-y-2">
                    <div className="h-7 w-32 animate-pulse rounded bg-slate-200" />
                    <div className="h-4 w-52 animate-pulse rounded bg-slate-100" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-2">
                  <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
                  <div className="h-6 w-28 animate-pulse rounded bg-slate-200" />
                </div>
                <div className="h-10 w-32 animate-pulse rounded-md bg-slate-200" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

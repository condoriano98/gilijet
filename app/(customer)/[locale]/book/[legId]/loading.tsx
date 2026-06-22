import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BookingProgress } from "@/components/customer/booking-progress";

export default function BookLoading() {
  return (
    <div className="container py-8">
      <div className="mx-auto max-w-3xl">
        <BookingProgress currentStep={2} />
        <div className="mt-3 h-4 w-32 animate-pulse rounded bg-slate-100" />

        <Card className="mt-3">
          <CardHeader>
            <div className="space-y-2">
              <div className="h-7 w-64 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-80 animate-pulse rounded bg-slate-100" />
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="h-5 w-40 animate-pulse rounded bg-slate-100" />
            <div className="h-5 w-32 animate-pulse rounded bg-slate-100" />
          </CardContent>
        </Card>

        <div className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <div className="h-6 w-32 animate-pulse rounded bg-slate-200" />
              <div className="mt-2 h-4 w-72 animate-pulse rounded bg-slate-100" />
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 rounded-md border bg-card p-3 sm:grid-cols-[1fr_160px_180px]">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="space-y-1">
                    <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
                    <div className="h-10 w-full animate-pulse rounded-md bg-slate-200" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="h-6 w-36 animate-pulse rounded bg-slate-200" />
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-1">
                  <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
                  <div className="h-10 w-full animate-pulse rounded-md bg-slate-200" />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="h-12 w-full animate-pulse rounded-md bg-slate-200" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

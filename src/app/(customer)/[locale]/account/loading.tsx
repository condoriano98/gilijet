export default function AccountLoading() {
  return (
    <div className="mx-auto max-w-[1180px] px-5 pb-4 pt-6 sm:px-6">
      <div className="space-y-6">
        <div className="h-[132px] animate-pulse rounded-[32px] bg-brand-periwinkle sm:h-[148px]" />

        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2 rounded-[22px] border border-brand-line bg-white p-5">
              <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
              <div className="h-8 w-16 animate-pulse rounded bg-slate-200" />
            </div>
          ))}
        </div>

        <div className="space-y-3.5">
          <div className="h-7 w-40 animate-pulse rounded bg-slate-200" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-[22px] border border-brand-line bg-white px-6 py-5"
            >
              <div className="space-y-1.5">
                <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
                <div className="h-3 w-56 animate-pulse rounded bg-slate-100" />
              </div>
              <div className="h-11 w-24 animate-pulse rounded-[14px] bg-slate-200" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-5 px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-[22px] w-56 rounded-md" />
          <Skeleton className="h-[14px] w-[360px] max-w-full rounded-md opacity-70" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-7 w-28 rounded-full" />
        </div>
      </div>

      {/* Pricing cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, c) => (
          <div
            key={c}
            className="flex flex-col gap-4 rounded-2xl border border-[#E5E7EB] bg-white p-6"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-[16px] w-28 rounded-md" />
              <Skeleton className="h-[20px] w-16 rounded-full" />
            </div>
            <div className="flex items-end gap-2">
              <Skeleton className="h-[32px] w-24 rounded-md" />
              <Skeleton className="h-[12px] w-16 rounded-md opacity-70" />
            </div>
            <Skeleton className="h-[12px] w-[85%] rounded-md opacity-70" />
            <div className="flex flex-col gap-2 pt-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4 shrink-0 rounded-full" />
                  <Skeleton
                    className="h-[12px] rounded-md"
                    style={{ width: `${55 + ((i * 11 + c * 7) % 35)}%` }}
                  />
                </div>
              ))}
            </div>
            <Skeleton className="mt-2 h-10 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

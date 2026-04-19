import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-5 px-6 py-6">
      <div className="space-y-2">
        <Skeleton className="h-[22px] w-56 rounded-md" />
        <Skeleton className="h-[14px] w-[400px] max-w-full rounded-md opacity-70" />
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-4">
        <Skeleton className="h-[12px] w-24 rounded-md" />
        <Skeleton className="h-2 flex-1 rounded-full" />
        <Skeleton className="h-[12px] w-10 rounded-md" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-5"
            >
              <Skeleton className="h-[16px] w-[45%] rounded-md" />
              <Skeleton className="h-[12px] w-[80%] rounded-md opacity-70" />
              <Skeleton className="h-[88px] w-full rounded-lg" />
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-[26px] w-20 rounded-full" />
                <Skeleton className="h-[26px] w-24 rounded-full" />
                <Skeleton className="h-[26px] w-16 rounded-full" />
              </div>
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <Skeleton className="h-10 w-28 rounded-lg" />
            <Skeleton className="h-10 w-32 rounded-lg" />
          </div>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-6 flex flex-col gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-5">
            <Skeleton className="h-[14px] w-[40%] rounded-md" />
            <Skeleton className="h-[12px] w-[70%] rounded-md opacity-70" />
            <div className="mt-2 flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-[12px] rounded-md"
                  style={{ width: `${55 + ((i * 13) % 35)}%` }}
                />
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

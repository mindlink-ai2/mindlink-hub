import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-6 px-6 py-6">
      <div className="space-y-2">
        <Skeleton className="h-[22px] w-56 rounded-md" />
        <Skeleton className="h-[14px] w-[420px] max-w-full rounded-md opacity-70" />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-5"
          >
            <Skeleton className="h-[12px] w-[40%] rounded-md" />
            <Skeleton className="h-[26px] w-[30%] rounded-md" />
            <Skeleton className="h-[12px] w-[60%] rounded-md opacity-70" />
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <Skeleton className="h-[16px] w-40 rounded-md" />
          <Skeleton className="h-[28px] w-24 rounded-md" />
        </div>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b border-[#F3F4F6] pb-3 last:border-0"
            >
              <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
              <Skeleton
                className="h-[14px] rounded-md"
                style={{ width: `${18 + ((i * 7) % 12)}%` }}
              />
              <Skeleton
                className="h-[12px] rounded-md opacity-70"
                style={{ width: `${22 + ((i * 11) % 14)}%` }}
              />
              <Skeleton className="ml-auto h-[20px] w-16 rounded-full" />
              <Skeleton className="h-[12px] w-20 rounded-md opacity-60" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

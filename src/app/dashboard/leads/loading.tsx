import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-5 px-6 py-6">
      <div className="space-y-2">
        <Skeleton className="h-[22px] w-52 rounded-md" />
        <Skeleton className="h-[14px] w-[380px] max-w-full rounded-md opacity-70" />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-3">
        <Skeleton className="h-9 w-[240px] rounded-lg" />
        <Skeleton className="h-9 w-[120px] rounded-lg" />
        <Skeleton className="h-9 w-[120px] rounded-lg" />
        <Skeleton className="h-9 w-[100px] rounded-lg" />
        <Skeleton className="ml-auto h-9 w-[120px] rounded-full" />
      </div>

      {/* Lead cards grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-4 rounded-2xl border border-[#E5E7EB] bg-white p-5"
          >
            <div className="flex items-start gap-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-[14px] w-[50%] rounded-md" />
                <Skeleton className="h-[12px] w-[70%] rounded-md opacity-70" />
                <Skeleton className="h-[12px] w-[40%] rounded-md opacity-60" />
              </div>
              <Skeleton className="h-[20px] w-14 rounded-full" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-[10px] w-full rounded-md opacity-80" />
              <Skeleton className="h-[10px] w-[85%] rounded-md opacity-70" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-[22px] w-14 rounded-full" />
              <Skeleton className="h-[22px] w-20 rounded-full" />
              <Skeleton className="h-[22px] w-16 rounded-full" />
            </div>
            <div className="mt-auto flex items-center gap-2 border-t border-[#F3F4F6] pt-3">
              <Skeleton className="h-9 flex-1 rounded-lg" />
              <Skeleton className="h-9 w-9 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

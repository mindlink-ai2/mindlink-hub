import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-5 px-6 py-6">
      <div className="space-y-2">
        <Skeleton className="h-[22px] w-44 rounded-md" />
        <Skeleton className="h-[14px] w-[340px] max-w-full rounded-md opacity-70" />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-2xl border border-[#E5E7EB] bg-white p-4"
          >
            <Skeleton className="h-[11px] w-[55%] rounded-md" />
            <Skeleton className="h-[22px] w-[35%] rounded-md" />
          </div>
        ))}
      </div>

      {/* Followup cards grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-5"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-[14px] w-[45%] rounded-md" />
                <Skeleton className="h-[11px] w-[65%] rounded-md opacity-70" />
              </div>
              <Skeleton className="h-[20px] w-16 rounded-full" />
            </div>
            <Skeleton className="h-[10px] w-[90%] rounded-md opacity-80" />
            <Skeleton className="h-[10px] w-[70%] rounded-md opacity-70" />
            <div className="mt-1 flex items-center gap-2 border-t border-[#F3F4F6] pt-3">
              <Skeleton className="h-[12px] w-24 rounded-md opacity-60" />
              <Skeleton className="ml-auto h-8 w-[90px] rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

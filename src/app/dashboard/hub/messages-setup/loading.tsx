import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1000px] px-6 py-6">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-4 w-96 opacity-70" />
      </div>
      <div className="rounded-2xl border border-[#d7e3f4] bg-white">
        <div className="flex items-center gap-3 border-b border-[#d7e3f4] p-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-2.5 w-24 opacity-70" />
          </div>
        </div>
        <div className="space-y-4 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`flex gap-3 ${i % 2 === 0 ? "" : "flex-row-reverse"}`}
            >
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
              <Skeleton
                className={`h-16 rounded-2xl ${
                  i % 2 === 0 ? "w-3/5" : "w-2/5"
                }`}
              />
            </div>
          ))}
        </div>
        <div className="border-t border-[#d7e3f4] p-3">
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

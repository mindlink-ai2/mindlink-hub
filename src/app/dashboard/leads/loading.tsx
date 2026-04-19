import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1480px] px-6 py-6">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-80 opacity-70" />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Skeleton className="h-10 w-64 rounded-xl" />
        <Skeleton className="h-10 w-32 rounded-xl" />
        <Skeleton className="h-10 w-28 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-[#d7e3f4] bg-white p-4"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-2.5 w-24 opacity-70" />
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <Skeleton className="h-2.5 w-full" />
              <Skeleton className="h-2.5 w-3/4" />
            </div>
            <div className="mt-4 flex gap-2">
              <Skeleton className="h-8 flex-1 rounded-lg" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

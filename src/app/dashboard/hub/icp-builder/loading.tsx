import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1480px] px-6 py-6">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-60" />
        <Skeleton className="h-4 w-96 opacity-70" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-[#d7e3f4] bg-white p-5"
            >
              <Skeleton className="mb-3 h-4 w-48" />
              <Skeleton className="mb-2 h-3 w-full opacity-70" />
              <Skeleton className="h-3 w-3/4 opacity-70" />
              <div className="mt-4 flex flex-wrap gap-2">
                <Skeleton className="h-8 w-20 rounded-full" />
                <Skeleton className="h-8 w-28 rounded-full" />
                <Skeleton className="h-8 w-24 rounded-full" />
              </div>
            </div>
          ))}
        </div>
        <aside className="hidden lg:block">
          <div className="sticky top-6 space-y-4 rounded-2xl border border-[#d7e3f4] bg-white p-5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48 opacity-70" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        </aside>
      </div>
    </div>
  );
}

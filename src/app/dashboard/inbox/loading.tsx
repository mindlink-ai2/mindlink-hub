import {
  Skeleton,
  SkeletonThreadList,
  SkeletonMessages,
} from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-1 gap-4 px-4 py-4">
      <aside className="hidden w-[330px] shrink-0 flex-col overflow-hidden rounded-2xl border border-[#d7e3f4] bg-white md:flex">
        <div className="border-b border-[#d7e3f4] p-3">
          <Skeleton className="h-9 w-full rounded-xl" />
        </div>
        <SkeletonThreadList rows={8} />
      </aside>
      <section className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-[#d7e3f4] bg-white">
        <div className="flex items-center justify-between border-b border-[#d7e3f4] p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-2.5 w-20 opacity-70" />
            </div>
          </div>
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
        <div className="flex-1 overflow-hidden p-4">
          <SkeletonMessages rows={6} />
        </div>
        <div className="border-t border-[#d7e3f4] p-3">
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      </section>
    </div>
  );
}

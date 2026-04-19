import { Skeleton, SkeletonTable } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1480px] px-6 py-6">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-80 opacity-70" />
      </div>
      <div className="rounded-2xl border border-[#d7e3f4] bg-white p-2">
        <SkeletonTable rows={8} cols={5} />
      </div>
    </div>
  );
}

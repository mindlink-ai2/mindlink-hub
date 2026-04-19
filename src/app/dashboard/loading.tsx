import { SkeletonCard } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1480px] px-6 py-6">
      <div className="mb-6 space-y-2">
        <div className="h-7 w-60 animate-pulse rounded-md bg-[#dce8f5]" />
        <div className="h-4 w-96 animate-pulse rounded-md bg-[#dce8f5] opacity-70" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-2xl border border-[#d7e3f4] bg-white" />
        <div className="h-64 animate-pulse rounded-2xl border border-[#d7e3f4] bg-white" />
      </div>
    </div>
  );
}

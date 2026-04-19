import { Skeleton, SkeletonBillingCard } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[900px] px-6 py-6">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-80 opacity-70" />
      </div>
      <SkeletonBillingCard />
    </div>
  );
}

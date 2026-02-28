import { cn } from "@/lib/utils";

type MobileSkeletonProps = {
  rows?: number;
  className?: string;
};

export default function MobileSkeleton({ rows = 6, className }: MobileSkeletonProps) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="rounded-xl border border-[#d7e3f4] bg-white px-3 py-3 shadow-[0_10px_18px_-18px_rgba(18,43,86,0.65)]"
        >
          <div className="h-3.5 w-40 animate-pulse rounded bg-[#e9f1ff]" />
          <div className="mt-2 h-3 w-56 animate-pulse rounded bg-[#eef4fd]" />
          <div className="mt-2 h-2.5 w-28 animate-pulse rounded bg-[#eef4fd]" />
        </div>
      ))}
    </div>
  );
}

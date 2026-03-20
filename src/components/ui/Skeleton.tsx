import { cn } from "@/lib/utils";

// ─── Base ──────────────────────────────────────────────────────────────────────

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-[#dce8f5]",
        className
      )}
      {...props}
    />
  );
}

// ─── KPI card skeleton ─────────────────────────────────────────────────────────

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-[#d7e3f4] bg-white p-4 shadow-[0_12px_24px_-18px_rgba(14,45,96,0.45)]",
        className
      )}
    >
      <div className="space-y-3">
        <Skeleton className="h-2.5 w-24" />
        <Skeleton className="h-8 w-14" />
        <Skeleton className="h-2 w-32 opacity-60" />
      </div>
    </div>
  );
}

// ─── Table skeleton ────────────────────────────────────────────────────────────

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className={cn("h-4", i === 0 ? "w-32" : i === cols - 1 ? "w-16" : "w-24")} />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonTable({
  rows = 8,
  cols = 5,
  headers,
}: {
  rows?: number;
  cols?: number;
  headers?: string[];
}) {
  const colCount = headers ? headers.length : cols;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0">
        <thead>
          <tr className="bg-[#f8fbff] text-[11px] uppercase tracking-wide text-[#51627b]">
            {(headers ?? Array.from({ length: colCount })).map((h, i) => (
              <th key={i} className="border-b border-[#d7e3f4] px-4 py-3 text-left">
                {h ?? <Skeleton className="h-2.5 w-16" />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <SkeletonRow key={i} cols={colCount} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── KPI cards grid skeleton ───────────────────────────────────────────────────

export function SkeletonKPIGrid({ count = 5 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

// ─── Thread list skeleton (inbox sidebar) ──────────────────────────────────────

export function SkeletonThreadList({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-1 p-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-2.5 w-40 opacity-70" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Message list skeleton (inbox thread) ──────────────────────────────────────

export function SkeletonMessages({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-4 py-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={cn("flex gap-3", i % 2 === 0 ? "" : "flex-row-reverse")}>
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <Skeleton className={cn("h-12 rounded-2xl", i % 3 === 0 ? "w-48" : "w-64")} />
        </div>
      ))}
    </div>
  );
}

// ─── Billing card skeleton ──────────────────────────────────────────────────────

export function SkeletonBillingCard() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#d7e3f4] bg-white p-4 shadow-[0_16px_26px_-22px_rgba(18,43,86,0.7)]">
        <div className="space-y-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3.5 w-48 opacity-70" />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-10 rounded-xl" />
          </div>
          <Skeleton className="h-10 rounded-xl" />
        </div>
      </div>
      <div className="rounded-2xl border border-[#d7e3f4] bg-white p-4 shadow-[0_16px_26px_-22px_rgba(18,43,86,0.7)]">
        <div className="space-y-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3.5 w-48 opacity-70" />
          <Skeleton className="h-10 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard stats grid ──────────────────────────────────────────────────────

export function SkeletonDashboardStats() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}

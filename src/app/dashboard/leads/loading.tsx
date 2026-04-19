import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  const columnWidths = ["32px", "90px", "180px", "140px", "130px", "100px", "80px"];
  const rowWidthSeeds = [
    [32, 88, 170, 130, 115, 90, 72],
    [32, 76, 150, 120, 130, 95, 78],
    [32, 92, 190, 135, 110, 88, 70],
    [32, 80, 160, 125, 128, 92, 82],
    [32, 86, 175, 140, 118, 84, 74],
    [32, 78, 168, 115, 122, 96, 80],
    [32, 90, 155, 132, 106, 90, 76],
    [32, 82, 182, 128, 134, 88, 68],
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-4 px-6 py-6">
      {/* Row 1 — Top badges */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-7 w-[60px] rounded-full" />
        <Skeleton className="h-7 w-[100px] rounded-full" />
        <Skeleton className="h-7 w-[40px] rounded-full" />
      </div>

      {/* Row 2 — Title */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-[22px] w-[300px] max-w-full rounded-md" />
        <Skeleton className="h-[14px] w-[500px] max-w-full rounded-md opacity-70" />
      </div>

      {/* Row 3 — Alert */}
      <div className="h-10 w-full animate-pulse rounded-lg bg-[#FEF3C7]" />

      {/* Row 4 — Stats cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="relative flex flex-col gap-2 rounded-2xl border border-[#E5E7EB] bg-white p-4"
          >
            <span
              className="absolute right-3 top-3 h-2 w-2 rounded-full"
              style={{
                background: ["#2563EB", "#10B981", "#F59E0B", "#EF4444"][i],
              }}
            />
            <Skeleton className="h-[10px] w-[60px] rounded-md" />
            <Skeleton className="h-[32px] w-[80px] rounded-md" />
          </div>
        ))}
      </div>

      {/* Row 5 — Search + action buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-10 flex-1 min-w-[280px] rounded-lg" style={{ maxWidth: "50%" }} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-[80px] rounded-full" />
          <Skeleton className="h-9 w-[80px] rounded-full" />
          <Skeleton className="h-9 w-[80px] rounded-full" />
          <Skeleton className="h-9 w-[80px] rounded-full" />
        </div>
      </div>

      {/* Row 6 — Tabs + dropdowns */}
      <div className="flex flex-wrap items-center gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-[70px] rounded-full" />
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="h-8 w-[80px] rounded-lg" />
          <Skeleton className="h-8 w-[80px] rounded-lg" />
        </div>
      </div>

      {/* Row 7 — Table */}
      <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-[#E5E7EB] bg-[#F9FAFB] px-4 py-3">
          {columnWidths.map((w, i) => (
            <div
              key={i}
              className="flex-shrink-0"
              style={{ width: w }}
            >
              <Skeleton className="h-[10px] w-full rounded-md" />
            </div>
          ))}
        </div>
        {/* Rows */}
        {rowWidthSeeds.map((widths, r) => (
          <div
            key={r}
            className="flex items-center gap-4 border-b border-[#F3F4F6] px-4 py-3 last:border-0"
          >
            {widths.map((w, i) => (
              <div
                key={i}
                className="flex-shrink-0"
                style={{ width: `${w}px` }}
              >
                {i === 0 ? (
                  <Skeleton className="h-4 w-4 rounded" />
                ) : i === 2 ? (
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
                    <Skeleton className="h-[13px] flex-1 rounded-md" />
                  </div>
                ) : i === 1 ? (
                  <Skeleton className="h-[20px] w-full rounded-full" />
                ) : (
                  <Skeleton
                    className="h-[13px] w-full rounded-md"
                    style={{ opacity: i === 6 ? 0.6 : 0.85 }}
                  />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

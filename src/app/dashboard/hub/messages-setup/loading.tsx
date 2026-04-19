import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-5 px-6 py-6">
      <div className="space-y-2">
        <Skeleton className="h-[22px] w-64 rounded-md" />
        <Skeleton className="h-[14px] w-[420px] max-w-full rounded-md opacity-70" />
      </div>

      <div className="flex flex-col overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[#E5E7EB] p-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-[13px] w-32 rounded-md" />
            <Skeleton className="h-[11px] w-24 rounded-md opacity-70" />
          </div>
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>

        {/* Chat bubbles */}
        <div className="flex flex-col gap-4 p-5">
          {[0, 1, 2, 3].map((i) => {
            const mine = i % 2 === 1;
            const widths = ["60%", "45%", "75%", "50%"];
            return (
              <div
                key={i}
                className={`flex gap-3 ${mine ? "flex-row-reverse" : ""}`}
              >
                {!mine ? (
                  <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                ) : null}
                <div
                  className={`flex flex-col gap-1.5 ${mine ? "items-end" : ""}`}
                  style={{ width: widths[i] }}
                >
                  <Skeleton className="h-[14px] w-full rounded-xl" />
                  <Skeleton className="h-[14px] w-[85%] rounded-xl opacity-85" />
                  <Skeleton className="h-[10px] w-16 rounded-md opacity-60" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Input */}
        <div className="border-t border-[#E5E7EB] p-3">
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

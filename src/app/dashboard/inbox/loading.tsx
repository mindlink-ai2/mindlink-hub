import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-1 gap-4 px-4 py-4">
      {/* Thread list */}
      <aside className="hidden w-[330px] shrink-0 flex-col overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white md:flex">
        <div className="border-b border-[#E5E7EB] p-3">
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>
        <div className="flex flex-col gap-1 p-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg px-2 py-2.5"
            >
              <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Skeleton
                    className="h-[13px] rounded-md"
                    style={{ width: `${40 + ((i * 9) % 25)}%` }}
                  />
                  <Skeleton className="h-[10px] w-8 shrink-0 rounded-md opacity-60" />
                </div>
                <Skeleton
                  className="h-[11px] rounded-md opacity-70"
                  style={{ width: `${55 + ((i * 11) % 30)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Conversation */}
      <section className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
        <div className="flex items-center justify-between border-b border-[#E5E7EB] p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-[14px] w-32 rounded-md" />
              <Skeleton className="h-[11px] w-24 rounded-md opacity-70" />
            </div>
          </div>
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-hidden p-5">
          {Array.from({ length: 5 }).map((_, i) => {
            const mine = i % 2 === 1;
            const widths = ["55%", "40%", "70%", "50%", "60%"];
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
                  <Skeleton className="h-[14px] w-[80%] rounded-xl opacity-85" />
                  <Skeleton className="h-[10px] w-16 rounded-md opacity-60" />
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-[#E5E7EB] p-3">
          <Skeleton className="h-[72px] w-full rounded-xl" />
        </div>
      </section>
    </div>
  );
}

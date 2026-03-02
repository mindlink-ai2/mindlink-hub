import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

type MobileEmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export default function MobileEmptyState({
  title,
  description,
  action,
}: MobileEmptyStateProps) {
  return (
    <div className="rounded-2xl border border-[#d7e3f4] bg-white px-4 py-8 text-center shadow-[0_16px_28px_-24px_rgba(18,43,86,0.7)]">
      <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#d7e3f4] bg-[#f7fbff] text-[#607894]">
        <Inbox className="h-4 w-4" />
      </div>
      <h3 className="mt-3 text-[15px] font-semibold text-[#0b1c33]">{title}</h3>
      <p className="mt-1 text-[13px] text-[#607894]">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

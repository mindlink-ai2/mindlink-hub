import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type MobilePageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
};

export default function MobilePageHeader({
  title,
  subtitle,
  actions,
  className,
}: MobilePageHeaderProps) {
  return (
    <header
      className={cn(
        "rounded-2xl border border-[#d7e3f4] bg-white/95 px-4 py-3 shadow-[0_14px_26px_-24px_rgba(18,43,86,0.75)]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-[17px] font-semibold leading-tight text-[#0b1c33]">{title}</h1>
          {subtitle ? (
            <p className="mt-1 text-[12px] leading-relaxed text-[#5f7693]">{subtitle}</p>
          ) : null}
        </div>

        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </header>
  );
}

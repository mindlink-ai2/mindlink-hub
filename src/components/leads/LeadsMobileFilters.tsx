import { cn } from "@/lib/utils";

import type { LeadCardStatusKey } from "./LeadCard";

export type MobileLeadFilterKey = "all" | LeadCardStatusKey;

export type MobileLeadFilterOption = {
  key: MobileLeadFilterKey;
  label: string;
  count: number;
};

type LeadsMobileFiltersProps = {
  options: MobileLeadFilterOption[];
  activeKey: MobileLeadFilterKey;
  onChange: (key: MobileLeadFilterKey) => void;
};

export default function LeadsMobileFilters({
  options,
  activeKey,
  onChange,
}: LeadsMobileFiltersProps) {
  return (
    <div
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="tablist"
      aria-label="Filtres prospects"
    >
      {options.map((option) => {
        const isActive = option.key === activeKey;

        return (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(option.key)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition focus:outline-none focus:ring-2 focus:ring-[#dce8ff]",
              isActive
                ? "border-[#9ec0ff] bg-[#edf4ff] text-[#1f4f96]"
                : "border-[#d7e3f4] bg-white text-[#4b647f] hover:bg-[#f7fbff]"
            )}
          >
            <span>{option.label}</span>
            <span className="tabular-nums text-[11px] text-[#6f86a3]">{option.count}</span>
          </button>
        );
      })}
    </div>
  );
}

import { cn } from "@/lib/utils";

export type MobileChipOption<Key extends string = string> = {
  key: Key;
  label: string;
  count?: number;
};

type MobileChipsFiltersProps<Key extends string = string> = {
  options: MobileChipOption<Key>[];
  activeKey: Key;
  onChange: (key: Key) => void;
  ariaLabel?: string;
  className?: string;
};

export default function MobileChipsFilters<Key extends string = string>({
  options,
  activeKey,
  onChange,
  ariaLabel = "Filtres",
  className,
}: MobileChipsFiltersProps<Key>) {
  return (
    <div
      className={cn(
        "-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
      role="tablist"
      aria-label={ariaLabel}
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
            {typeof option.count === "number" ? (
              <span className="tabular-nums text-[11px] text-[#6f86a3]">{option.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

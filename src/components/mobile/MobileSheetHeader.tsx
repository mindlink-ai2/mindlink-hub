import type { ReactNode } from "react";
import { X } from "lucide-react";

type MobileSheetHeaderProps = {
  title: string;
  subtitle?: string;
  onClose: () => void;
  rightSlot?: ReactNode;
};

export default function MobileSheetHeader({
  title,
  subtitle,
  onClose,
  rightSlot,
}: MobileSheetHeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-[#d7e3f4] bg-white/95 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-[16px] font-semibold text-[#0b1c33]">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-[12px] text-[#5f7693]">{subtitle}</p> : null}
        </div>

        <div className="flex items-center gap-2">
          {rightSlot}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#d7e3f4] bg-white px-2.5 text-[12px] font-medium text-[#4b647f] transition hover:bg-[#f7fbff] focus:outline-none focus:ring-2 focus:ring-[#dce8ff]"
            aria-label="Fermer"
            title="Fermer"
          >
            <span>Fermer</span>
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

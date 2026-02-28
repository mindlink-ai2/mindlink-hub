"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type MobileSheetProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  panelClassName?: string;
};

export default function MobileSheet({
  open,
  onClose,
  children,
  className,
  panelClassName,
}: MobileSheetProps) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={cn("fixed inset-0 z-[110] md:hidden", className)}>
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 h-full w-full bg-[#0f172a]/45 backdrop-blur-[2px]"
        aria-label="Fermer"
      />
      <section
        role="dialog"
        aria-modal="true"
        className={cn(
          "absolute inset-x-0 bottom-0 top-[max(12svh,72px)] flex flex-col overflow-hidden rounded-t-3xl border border-[#d7e3f4] bg-white shadow-[0_-16px_36px_-22px_rgba(15,23,42,0.55)]",
          panelClassName
        )}
      >
        {children}
      </section>
    </div>
  );
}

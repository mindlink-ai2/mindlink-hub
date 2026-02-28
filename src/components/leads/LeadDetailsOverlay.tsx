"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type LeadDetailsOverlayProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  planLabel?: string;
  statusBadge?: ReactNode;
  children: ReactNode;
};

export default function LeadDetailsOverlay({
  open,
  onOpenChange,
  title,
  subtitle,
  planLabel,
  statusBadge,
  children,
}: LeadDetailsOverlayProps) {
  useEffect(() => {
    if (typeof document === "undefined") return;

    if (open) {
      document.body.dataset.leadsSidebarOpen = "1";
    } else {
      delete document.body.dataset.leadsSidebarOpen;
    }

    return () => {
      delete document.body.dataset.leadsSidebarOpen;
    };
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex h-screen min-h-0 touch-pan-y flex-col overflow-hidden border-l border-[#dbe5f3] bg-white p-0">
        <SheetHeader className="z-10 border-b border-[#e2e8f0] bg-white/95 p-6 pb-4 backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="truncate text-2xl font-semibold leading-tight text-[#0F172A]">
                {title}
              </SheetTitle>
              {subtitle ? (
                <SheetDescription className="mt-1 truncate text-[12px] text-[#4B5563]">
                  {subtitle}
                </SheetDescription>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              {planLabel ? (
                <span className="rounded-full border border-[#dbe5f3] bg-white px-3 py-1 text-[11px] text-[#4B5563] whitespace-nowrap">
                  {planLabel}
                </span>
              ) : null}
              <SheetClose asChild>
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#dbe5f3] bg-white px-3 text-[12px] font-medium text-[#334155] transition hover:bg-[#f8fbff] focus:outline-none focus:ring-2 focus:ring-[#bfdbfe]"
                  aria-label="Fermer"
                  title="Fermer"
                >
                  <span>Fermer</span>
                  <X className="h-4 w-4" />
                </button>
              </SheetClose>
            </div>
          </div>

          {statusBadge ? <div className="mt-3">{statusBadge}</div> : null}
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y p-6 [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch]">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}

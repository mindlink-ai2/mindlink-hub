import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type MobileLayoutProps = {
  children: ReactNode;
  className?: string;
};

export default function MobileLayout({ children, className }: MobileLayoutProps) {
  return (
    <div
      className={cn(
        "md:hidden flex min-h-0 flex-1 flex-col gap-3 pb-[calc(env(safe-area-inset-bottom,0px)+6.5rem)]",
        className
      )}
    >
      {children}
    </div>
  );
}

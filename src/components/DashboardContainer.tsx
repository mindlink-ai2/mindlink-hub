"use client";

import { usePathname } from "next/navigation";

export default function DashboardContainer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto w-full max-w-[1480px] px-4 sm:px-6 py-8">
      {children}
    </div>
  );
}
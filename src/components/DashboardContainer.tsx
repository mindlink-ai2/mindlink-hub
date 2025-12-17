"use client";

import { usePathname } from "next/navigation";

export default function DashboardContainer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isProspection = pathname?.includes("/dashboard/prospection");

  return <div className={isProspection ? "" : "max-w-6xl mx-auto px-4 py-8"}>{children}</div>;
}

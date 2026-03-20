"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { type ComponentProps } from "react";
import { queryKeys } from "@/lib/query-keys";

type PrefetchEntry = {
  queryKey: readonly unknown[];
  queryFn: () => Promise<unknown>;
};

const PREFETCH_MAP: Record<string, PrefetchEntry[]> = {
  "/dashboard": [
    {
      queryKey: queryKeys.dashboardStats(),
      queryFn: () => fetch("/api/dashboard/stats").then((r) => r.json()),
    },
  ],
  "/dashboard/leads": [
    {
      queryKey: queryKeys.leads(),
      queryFn: () => fetch("/api/get-leads").then((r) => r.json()),
    },
  ],
  "/dashboard/automation": [
    {
      queryKey: queryKeys.leads(),
      queryFn: () => fetch("/api/get-leads").then((r) => r.json()),
    },
  ],
  "/dashboard/followups": [
    {
      queryKey: queryKeys.leads(),
      queryFn: () => fetch("/api/get-leads").then((r) => r.json()),
    },
    {
      queryKey: queryKeys.mapLeads(),
      queryFn: () => fetch("/api/get-map-leads").then((r) => r.json()),
    },
  ],
  "/dashboard/hub/billing": [
    {
      queryKey: queryKeys.billingStatus(),
      queryFn: () => fetch("/api/billing/status").then((r) => r.json()),
    },
  ],
};

const STALE_TIME = 5 * 60 * 1000;

type Props = ComponentProps<typeof Link>;

export default function PrefetchNavLink({ href, onMouseEnter, ...props }: Props) {
  const queryClient = useQueryClient();

  const handleMouseEnter: React.MouseEventHandler<HTMLAnchorElement> = (e) => {
    const entries = PREFETCH_MAP[String(href)] ?? [];
    entries.forEach(({ queryKey, queryFn }) => {
      void queryClient.prefetchQuery({ queryKey, queryFn, staleTime: STALE_TIME });
    });
    onMouseEnter?.(e);
  };

  return <Link href={href} onMouseEnter={handleMouseEnter} {...props} />;
}

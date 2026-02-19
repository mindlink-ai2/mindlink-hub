"use client";

import dynamic from "next/dynamic";

const SupportWidget = dynamic(() => import("@/components/support/SupportWidget"), {
  ssr: false,
});

export default function SupportWidgetLoader() {
  return <SupportWidget />;
}

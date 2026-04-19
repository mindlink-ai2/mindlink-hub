"use client";

import Link from "next/link";

export default function IcpBuilderNavLink() {
  return (
    <Link
      href="/dashboard/hub/icp-builder"
      className="relative inline-flex items-center gap-1.5 rounded-full border border-transparent px-3 py-1.5 transition hover:border-[#d7e3f4] hover:bg-[#f3f8ff] hover:text-[#0b1c33]"
    >
      <span>Mon ciblage</span>
    </Link>
  );
}

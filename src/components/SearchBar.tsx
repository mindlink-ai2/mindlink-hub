"use client";

import { useState } from "react";

export default function SearchBar({ onSearch }: { onSearch: (value: string) => void }) {
  const [value, setValue] = useState("");

  return (
    <input
      type="text"
      placeholder="Rechercher un lead..."
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        onSearch(e.target.value);
      }}
      className="w-full rounded-2xl border border-[#d5e2fb] bg-white px-4 py-2.5 text-sm text-[#17345e] placeholder-[#7f95b9] shadow-sm transition focus:outline-none focus:ring-2 focus:ring-[#8eaef4]"
    />
  );
}

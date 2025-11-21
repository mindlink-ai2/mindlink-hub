"use client";

import { useState } from "react";

export default function TraiteCheckbox({
  leadId,
  defaultChecked,
}: {
  leadId: number;
  defaultChecked: boolean;
}) {
  const [checked, setChecked] = useState(defaultChecked);

  async function toggle() {
    const newValue = !checked;
    setChecked(newValue);

    await fetch("/dashboard/maps/traite", {
      method: "POST",
      body: JSON.stringify({
        id: leadId,
        traite: newValue,
      }),
    });
  }

  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={toggle}
      className="h-4 w-4 cursor-pointer accent-green-500"
    />
  );
}
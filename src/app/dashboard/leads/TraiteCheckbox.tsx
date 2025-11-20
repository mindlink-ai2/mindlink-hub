"use client";

import { useState } from "react";

type Props = {
  leadId: number;
  defaultChecked: boolean | null;
};

export default function TraiteCheckbox({ leadId, defaultChecked }: Props) {
  const [checked, setChecked] = useState<boolean>(!!defaultChecked);

  const handleChange = async () => {
    const next = !checked;
    setChecked(next); // UI optimiste

    try {
      await fetch("/api/leads/traite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, traite: next }),
      });
    } catch (e) {
      console.error(e);
      setChecked(checked); // rollback si gros souci réseau
    }
  };

  return (
    <input
      type="checkbox"
      className="h-4 w-4 rounded border-slate-700 bg-slate-900"
      checked={checked}
      onChange={handleChange}
    />
  );
}

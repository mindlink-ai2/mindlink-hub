"use client";

import { useState } from "react";

export default function TraiteCheckbox({
  leadId,
  defaultChecked = false,
}: {
  leadId: number;
  defaultChecked: boolean;
}) {
  const [checked, setChecked] = useState(defaultChecked);
  const [loading, setLoading] = useState(false);

  async function handleChange() {
    const newValue = !checked;

    // Optimistic update
    setChecked(newValue);
    setLoading(true);

    try {
      const res = await fetch("/api/leads/update-traite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: leadId,
          traite: newValue,
        }),
      });

      if (!res.ok) {
        throw new Error("Erreur mise à jour traite");
      }
    } catch (e) {
      console.error(e);
      // rollback si erreur
      setChecked(!newValue);
    } finally {
      setLoading(false);
    }
  }

  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={handleChange}
      disabled={loading}
      className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-0"
    />
  );
}

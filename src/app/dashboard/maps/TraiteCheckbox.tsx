"use client";

import { useState } from "react";

export default function TraiteCheckbox({
  leadId,
  defaultChecked,
}: {
  leadId: number | string;
  defaultChecked: boolean;
}) {
  const [checked, setChecked] = useState(defaultChecked);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const newValue = !checked;

    // Optimistic UI
    setChecked(newValue);
    setLoading(true);

    try {
      const res = await fetch("/dashboard/maps/traite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: leadId,
          traite: newValue,
        }),
      });

      if (!res.ok) throw new Error("Erreur update traite (maps)");

      // ✅ INFORME LA PAGE (comme LinkedIn)
      window.dispatchEvent(
        new CustomEvent("mindlink:lead-treated", {
          detail: {
            leadId: String(leadId), // 🔑 normalisé
            traite: newValue,
          },
        })
      );
    } catch (e) {
      console.error(e);
      // rollback
      setChecked(!newValue);
    } finally {
      setLoading(false);
    }
  }

  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={toggle}
      disabled={loading}
      className="h-4 w-4 cursor-pointer accent-green-500"
    />
  );
}
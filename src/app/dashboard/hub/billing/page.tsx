"use client";

import { useState } from "react";

export default function BillingPage() {
  const [loading, setLoading] = useState(false);

  const upgradeToPremium = async () => {
    setLoading(true);
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "premium" }),
    });

    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert("Erreur checkout");
      setLoading(false);
    }
  };

  const openPortal = async () => {
    const res = await fetch("/api/stripe/portal", {
      method: "POST",
    });

    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert("Erreur portail");
    }
  };

  return (
    <div style={{ padding: 40 }}>
      <h1>Facturation</h1>

      <button onClick={upgradeToPremium} disabled={loading}>
        {loading ? "Redirection..." : "Passer Premium"}
      </button>

      <br /><br />

      <button onClick={openPortal}>
        Gérer mon abonnement
      </button>
    </div>
  );
}
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function LinkedInSettingsPage() {
  const [loading, setLoading] = useState(false);

  const connect = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/unipile/connect", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "connect_failed");
      if (json?.url) window.location.href = json.url;
    } catch (e) {
      console.error(e);
      alert("Impossible de générer le lien de connexion LinkedIn.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Connexion LinkedIn</h1>
      <p className="text-sm text-muted-foreground mt-2">
        Connecte ton compte LinkedIn pour activer l’inbox Lidmeo.
      </p>

      <div className="mt-6">
        <Button onClick={connect} disabled={loading}>
          {loading ? "Connexion..." : "Connecter LinkedIn"}
        </Button>
      </div>
    </div>
  );
}
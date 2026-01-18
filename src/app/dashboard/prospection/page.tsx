"use client";

import { useEffect } from "react";

export default function ProspectionPage() {
  useEffect(() => {
    window.location.replace("/dashboard/leads");
  }, []);

  return (
    <div className="text-slate-400 text-sm">
      Redirection vers la prospection…
    </div>
  );
}
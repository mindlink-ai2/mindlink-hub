"use client";

import { useState } from "react";

export default function LeadsFilter({ onFilter }: { onFilter: any }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [range, setRange] = useState("all");

  const applyFilters = () => {
    onFilter({ search, status, range });
    setOpen(false);
  };

  return (
    <div className="relative">
      {/* BOUTON FILTRER */}
      <button
        onClick={() => setOpen(!open)}
        className="px-3 py-1 text-xs rounded-lg bg-slate-900 border border-slate-700 hover:bg-slate-800"
      >
        Filtrer
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-xl p-4 space-y-4 z-50">

          {/* Recherche */}
          <div>
            <label className="text-[11px] text-slate-400">Rechercher</label>
            <input
              type="text"
              className="mt-1 w-full px-2 py-1 text-xs rounded bg-slate-800 border border-slate-700 text-slate-200"
              placeholder="Nom, entreprise…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Statut */}
          <div>
            <label className="text-[11px] text-slate-400">Statut</label>
            <select
              className="mt-1 w-full px-2 py-1 text-xs rounded bg-slate-800 border border-slate-700 text-slate-200"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">Tous</option>
              <option value="treated">Traités</option>
              <option value="untreated">Non traités</option>
            </select>
          </div>

          {/* Période */}
          <div>
            <label className="text-[11px] text-slate-400">Période</label>
            <select
              className="mt-1 w-full px-2 py-1 text-xs rounded bg-slate-800 border border-slate-700 text-slate-200"
              value={range}
              onChange={(e) => setRange(e.target.value)}
            >
              <option value="all">Tous</option>
              <option value="7">7 derniers jours</option>
              <option value="30">30 derniers jours</option>
            </select>
          </div>

          <button
            onClick={applyFilters}
            className="w-full py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white"
          >
            Appliquer
          </button>
        </div>
      )}
    </div>
  );
}

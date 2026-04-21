"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Clock, Loader2 } from "lucide-react";

type QueueLead = {
  first_name: string;
  last_name_masked: string;
  title: string;
  company: string;
  email_masked: string;
};

type QueueDay = {
  label: string;
  date: string;
  leads: QueueLead[];
};

type QueueResponse = {
  total_in_queue: number;
  next_send: string | null;
  next_send_timestamp: string | null;
  days: QueueDay[];
};

async function fetchQueue(): Promise<QueueResponse> {
  const res = await fetch("/api/leads/queue", { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function computeCountdown(targetIso: string): string {
  const target = new Date(targetIso).getTime();
  const diff = target - Date.now();
  if (diff <= 0) return "maintenant";
  const totalMin = Math.floor(diff / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `dans ${h}h ${String(m).padStart(2, "0")}min`;
  return `dans ${m}min`;
}

export default function LeadsQueue() {
  const [expanded, setExpanded] = useState(false);
  const [activeDay, setActiveDay] = useState(0);
  const [countdown, setCountdown] = useState<string>("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data, isLoading, isError } = useQuery<QueueResponse>({
    queryKey: ["leads-queue"],
    queryFn: fetchQueue,
    staleTime: 5 * 60_000,
    retry: false,
  });

  // Client-side countdown that updates every minute
  useEffect(() => {
    if (!data?.next_send_timestamp) {
      setCountdown("");
      return;
    }
    setCountdown(computeCountdown(data.next_send_timestamp));
    intervalRef.current = setInterval(() => {
      setCountdown(computeCountdown(data.next_send_timestamp!));
    }, 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [data?.next_send_timestamp]);

  // Reset active day tab when data changes
  useEffect(() => {
    setActiveDay(0);
  }, [data]);

  if (isLoading) {
    return (
      <div className="mt-3 flex items-center gap-2 text-xs text-[#51627b]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Chargement de la file d&apos;attente…
      </div>
    );
  }

  if (isError || !data || data.total_in_queue === 0 || data.days.length === 0) {
    return null;
  }

  const currentDay = data.days[activeDay] ?? data.days[0];

  return (
    <div className="mt-3">
      {/* ── Compact banner ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100">
              <Clock className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-[#0b1c33]">File d&apos;attente</span>
                <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                  Nouveau
                </span>
              </div>
              <p className="mt-0.5 text-xs text-[#51627b]">
                <span className="font-medium text-[#0b1c33]">{data.total_in_queue} prospects</span>{" "}
                sélectionnés seront contactés au prochain import :{" "}
                <span className="font-medium text-blue-700">
                  {data.next_send}
                  {countdown ? ` (${countdown})` : ""}
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 shadow-sm transition hover:bg-blue-50 hover:border-blue-300"
          >
            {expanded ? "Masquer" : "Voir la file d'attente"}
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* ── Expanded detail ─────────────────────────────────────────────────── */}
      {expanded && (
        <div className="mt-2 rounded-xl border border-blue-100 bg-white shadow-sm">
          {/* Day tabs */}
          <div className="flex flex-wrap gap-1 border-b border-[#e8f0fb] px-4 pt-3 pb-0">
            {data.days.map((day: QueueDay, i: number) => (
              <button
                key={day.date}
                type="button"
                onClick={() => setActiveDay(i)}
                className={[
                  "mb-[-1px] rounded-t-lg border border-b-0 px-3 py-1.5 text-xs font-medium transition",
                  activeDay === i
                    ? "border-blue-200 bg-white text-blue-700"
                    : "border-transparent bg-transparent text-[#51627b] hover:text-[#0b1c33]",
                ].join(" ")}
              >
                Jour {i + 1}{" "}
                <span className="opacity-70">
                  ({day.label} — {day.leads.length} leads)
                </span>
              </button>
            ))}
          </div>

          {/* Mini-table */}
          <div className="overflow-x-auto px-4 pb-4 pt-3">
            <table className="w-full min-w-[560px] text-xs">
              <thead>
                <tr className="border-b border-[#e8f0fb] text-[11px] font-medium uppercase tracking-wide text-[#7a90ac]">
                  <th className="pb-2 pr-3 text-left">Prénom</th>
                  <th className="pb-2 pr-3 text-left">Nom</th>
                  <th className="pb-2 pr-3 text-left">Poste</th>
                  <th className="pb-2 pr-3 text-left">Entreprise</th>
                  <th className="pb-2 text-left">Email</th>
                </tr>
              </thead>
              <tbody>
                {currentDay.leads.map((lead: QueueLead, idx: number) => (
                  <tr
                    key={idx}
                    className="border-b border-[#f3f7fd] last:border-0 transition hover:bg-[#f8fbff]"
                  >
                    <td className="py-2 pr-3 font-medium text-[#0b1c33]">
                      {lead.first_name || "—"}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className="select-none text-[#9eafc2]"
                        style={{ filter: "blur(2.5px)" }}
                        aria-hidden="true"
                      >
                        {lead.last_name_masked}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-[#3f587a]">{lead.title || "—"}</td>
                    <td className="py-2 pr-3 text-[#3f587a]">{lead.company || "—"}</td>
                    <td className="py-2">
                      <span
                        className="select-none text-[#9eafc2]"
                        style={{ filter: "blur(2.5px)" }}
                        aria-hidden="true"
                      >
                        {lead.email_masked || "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-[#e8f0fb] px-4 py-2.5 text-[11px] text-[#7a90ac]">
            Les informations complètes seront disponibles après l&apos;envoi.
          </div>
        </div>
      )}
    </div>
  );
}

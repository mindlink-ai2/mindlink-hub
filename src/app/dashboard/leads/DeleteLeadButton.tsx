"use client";

type DeleteLeadButtonProps = {
  leadId: string | number;
  onDeleted?: () => void; // optionnel, compat future
};

export default function DeleteLeadButton({ leadId, onDeleted }: DeleteLeadButtonProps) {
  async function handleDelete() {
    const ok = confirm("Voulez-vous vraiment supprimer ce lead ?");
    if (!ok) return;

    try {
      const res = await fetch("/dashboard/leads/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: leadId }), // ✅ on envoie tel quel
      });

      if (!res.ok) {
        console.error("Erreur API suppression lead");
        alert("Impossible de supprimer ce lead. Réessayez plus tard.");
        return;
      }

      // ✅ Normalise en string pour éviter tout mismatch (number vs string vs uuid)
      const leadIdStr = String(leadId);

      window.dispatchEvent(
        new CustomEvent("mindlink:lead-deleted", {
          detail: { leadId: leadIdStr },
        })
      );

      if (onDeleted) onDeleted();
    } catch (err) {
      console.error(err);
      alert("Erreur réseau pendant la suppression.");
    }
  }

  return (
    <button
      onClick={handleDelete}
      className="inline-flex items-center rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-300"
    >
      Supprimer
    </button>
  );
}

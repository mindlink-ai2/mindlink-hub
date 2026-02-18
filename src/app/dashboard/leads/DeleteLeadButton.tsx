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
      className="inline-flex h-9 items-center justify-center rounded-xl border border-[#f5c2c7] bg-[#fff5f5] px-3 text-xs font-semibold text-[#b42318] transition hover:border-[#f1aeb5] hover:bg-[#ffe9ea] focus:outline-none focus:ring-2 focus:ring-[#f8c9cf]"
    >
      Supprimer
    </button>
  );
}

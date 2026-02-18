"use client";

export default function DeleteLeadButton({
  leadId,
}: {
  leadId: number | string;
}) {
  const handleDelete = async () => {
    const confirmDelete = confirm("Tu veux vraiment supprimer ce lead ?");
    if (!confirmDelete) return;

    const res = await fetch("/dashboard/maps/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: leadId }),
    });

    if (!res.ok) {
      alert("Erreur lors de la suppression");
      return;
    }

    // ✅ NORMALISATION ID + EVENT (clé)
    window.dispatchEvent(
      new CustomEvent("mindlink:lead-deleted", {
        detail: { leadId: String(leadId) },
      })
    );
  };

  return (
    <button
      onClick={handleDelete}
      className="inline-flex h-9 items-center justify-center rounded-xl border border-[#f5c2c7] bg-[#fff5f5] px-3 text-xs font-semibold text-[#b42318] transition hover:border-[#f1aeb5] hover:bg-[#ffe9ea] focus:outline-none focus:ring-2 focus:ring-[#f8c9cf]"
    >
      Supprimer
    </button>
  );
}

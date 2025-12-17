"use client";

export default function DeleteLeadButton({
  leadId,
}: {
  leadId: number;
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

    // ✅ informe la page pour update instantané
    window.dispatchEvent(
      new CustomEvent("mindlink:lead-deleted", {
        detail: { leadId },
      })
    );
  };

  return (
    <button
      onClick={handleDelete}
      className="text-red-500 hover:text-red-300 transition text-xs"
    >
      Supprimer
    </button>
  );
}
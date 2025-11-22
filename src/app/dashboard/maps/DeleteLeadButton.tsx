"use client";

export default function DeleteLeadButton({
  leadId,
}: {
  leadId: number;
}) {
  const handleDelete = async () => {
    const confirmDelete = confirm("Tu veux vraiment supprimer ce lead ?");
    if (!confirmDelete) return;

    await fetch("/dashboard/maps/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: leadId }),
    });

    // rafraîchit la page automatiquement
    window.location.reload();
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

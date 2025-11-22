"use client";

type DeleteLeadButtonProps = {
  leadId: number;
  onDeleted?: () => void; // on l’utilisera plus tard pour rafraîchir la liste
};

export default function DeleteLeadButton({
  leadId,
  onDeleted,
}: DeleteLeadButtonProps) {
  async function handleDelete() {
    const ok = confirm("Voulez-vous vraiment supprimer ce lead ?");
    if (!ok) return;

    try {
      const res = await fetch("/dashboard/leads/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: leadId }),
      });

      if (!res.ok) {
        console.error("Erreur API suppression lead");
        alert("Impossible de supprimer ce lead. Réessayez plus tard.");
        return;
      }

      if (onDeleted) onDeleted();
    } catch (err) {
      console.error(err);
      alert("Erreur réseau pendant la suppression.");
    }
  }

  return (
    <button
      onClick={handleDelete}
      className="text-red-400 hover:text-red-500 text-sm underline-offset-2 hover:underline"
    >
      Supprimer
    </button>
  );
}

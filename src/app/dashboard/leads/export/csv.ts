const columns: Array<{ header: string; key: string }> = [
  { header: "ID", key: "id" },
  { header: "Nom complet", key: "Name" },
  { header: "Prénom", key: "FirstName" },
  { header: "Nom", key: "LastName" },
  { header: "Entreprise", key: "Company" },
  { header: "Localisation", key: "location" },
  { header: "URL LinkedIn", key: "LinkedInURL" },
  { header: "Email", key: "email" },
  { header: "Téléphone", key: "phone" },
  { header: "Créé le", key: "created_at" },
  { header: "Traite", key: "traite" },
  { header: "Message envoyé", key: "message_sent" },
  { header: "Message envoyé le", key: "message_sent_at" },
  { header: "Prochaine relance", key: "next_followup_at" },
  { header: "Message LinkedIn", key: "internal_message" },
  { header: "Message email", key: "message_mail" },
];

export function buildLeadsCsv(leads: any[]) {
  const header = columns.map((c) => c.header);

  const rows = leads.map((l: any) =>
    columns.map((c) => {
      const value = l?.[c.key];
      if (typeof value === "boolean") return value ? "Oui" : "Non";
      return value ?? "";
    })
  );

  const csvLines = [
    header.join(";"),
    ...rows.map((r) =>
      r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")
    ),
  ];

  return csvLines.join("\n");
}

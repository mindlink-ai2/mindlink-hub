import { redirect } from "next/navigation";
import { getPlaybookContext } from "@/lib/playbook-auth";

export default async function PlaybookLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await getPlaybookContext();
  if (!context) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}

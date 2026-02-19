import { redirect } from "next/navigation";
import { getSupportAdminContext } from "@/lib/support-admin-auth";

export default async function AdminSupportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const adminContext = await getSupportAdminContext();
  if (!adminContext) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}

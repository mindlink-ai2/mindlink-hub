import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/platform-auth";

export default async function AdminAnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const adminContext = await getAdminContext();
  if (!adminContext) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}

import { redirect } from "next/navigation";
import { getAnalyticsAdminContext } from "@/lib/analytics/server";

export default async function AdminAnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const adminContext = await getAnalyticsAdminContext();
  if (!adminContext) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}

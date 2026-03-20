import { NextResponse } from "next/server";
import { getPlaybookContext } from "@/lib/playbook-auth";
import { getPlaybookHtml } from "./html";

export async function GET() {
  const context = await getPlaybookContext();
  if (!context) {
    return new NextResponse("Accès non autorisé", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new NextResponse(getPlaybookHtml(), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Frame-Options": "SAMEORIGIN",
      "Content-Security-Policy": "frame-ancestors 'self'",
      "Cache-Control": "no-store",
    },
  });
}

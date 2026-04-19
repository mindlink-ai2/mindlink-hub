import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Routes publiques (accessibles sans être connecté)
const isPublicRoute = createRouteMatcher([
  "/",            // page d'accueil
  "/sign-in(.*)", // pages de login Clerk
  "/sign-up(.*)", // pages de création de compte Clerk
  "/api/unipile/webhook(.*)", // webhook Unipile (protégé via secret header)
  "/api/prospection/flush-accepted-drafts(.*)", // cron flush (protégé via secret header)
]);

export default clerkMiddleware(async (auth, req) => {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", req.nextUrl.pathname);

  if (!isPublicRoute(req)) {
    await auth.protect();
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
});

export const config = {
  matcher: [
    "/((?!.*\\..*|_next).*)",
    "/",
  ],
};

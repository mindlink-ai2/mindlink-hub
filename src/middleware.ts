import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Routes publiques (accessibles sans être connecté)
const isPublicRoute = createRouteMatcher([
  "/",            // page d'accueil
  "/sign-in(.*)", // pages de login Clerk
  "/sign-up(.*)", // pages de création de compte Clerk
  "/api/unipile/webhook(.*)", // webhook Unipile (protégé via secret header)
  "/api/prospection/flush-accepted-drafts(.*)", // cron flush (protégé via secret header)
  "/api/stripe/webhook(.*)", // webhook Stripe subscriptions (protégé via signature Stripe)
  "/api/webhooks/stripe(.*)", // webhook Stripe leads J+0 (protégé via signature Stripe)
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) {
    return;
  }
  await auth.protect();
});

export const config = {
  matcher: [
    "/((?!.*\\..*|_next).*)",
    "/",
  ],
};

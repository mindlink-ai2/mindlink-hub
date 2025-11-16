import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Routes publiques (accessibles sans être connecté)
const isPublicRoute = createRouteMatcher([
  "/",            // page d'accueil
  "/sign-in(.*)", // pages de login Clerk
  "/sign-up(.*)", // pages de création de compte Clerk
]);

export default clerkMiddleware(async (auth, req) => {
  // Si la route est publique → on ne protège pas
  if (isPublicRoute(req)) {
    return;
  }

  // Sinon, on protège (utilisateur doit être connecté)
  await auth.protect();
});

export const config = {
  matcher: [
    "/((?!.*\\..*|_next).*)",
    "/",
  ],
};
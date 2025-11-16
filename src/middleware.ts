import { authMiddleware } from "@clerk/nextjs";

export default authMiddleware({
  // La page d'accueil reste publique
  publicRoutes: ["/"],
});

export const config = {
  matcher: [
    // Toutes les routes, sauf les assets statiques et _next
    "/((?!.*\\..*|_next).*)",
    "/",
  ],
};

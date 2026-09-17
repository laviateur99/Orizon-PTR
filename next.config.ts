import type { NextConfig } from "next";

// Les routes de génération de PDF fiscaux lisent les gabarits officiels dans public/forms/ via
// fs au moment de l'exécution (Node.js runtime) — ces fichiers ne sont jamais importés/require()és
// nulle part, donc le traçage automatique des fichiers de Next.js ne les inclurait pas dans le
// bundle de la fonction serverless sans cette déclaration explicite.
const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/tuition-tax-forms/pdf/**": ["./public/forms/**"]
  }
};

export default nextConfig;

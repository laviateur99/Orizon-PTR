import { execSync } from "node:child_process";
import type { NextConfig } from "next";

// Version affichée sur le tableau de bord : SHA du commit déployé (Vercel), sinon Git local.
const gitShortSha = () => {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "inconnue";
  }
};
const appVersion = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || gitShortSha();
// Date et heure du build (heure de Montréal), pour pouvoir comparer ce qui est affiché à ce qui vient d'être publié.
const buildStamp = new Date().toLocaleString("fr-CA", {
  timeZone: "America/Montreal", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
}).replace(",", "");

// Les routes de génération de PDF fiscaux lisent les gabarits officiels dans public/forms/ via
// fs au moment de l'exécution (Node.js runtime) — ces fichiers ne sont jamais importés/require()és
// nulle part, donc le traçage automatique des fichiers de Next.js ne les inclurait pas dans le
// bundle de la fonction serverless sans cette déclaration explicite.
const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: `${appVersion} · ${buildStamp}`
  },
  outputFileTracingIncludes: {
    "/api/tuition-tax-forms/pdf/**": ["./public/forms/**"]
  }
};

export default nextConfig;

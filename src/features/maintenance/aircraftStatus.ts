import type { Aircraft } from "@/features/fleet/types";

// Extrait de MaintenancePage.tsx pour être partagé avec MaintenanceDashboard.tsx sans import
// circulaire entre les deux composants.
export const effectiveStatus = (a: Aircraft): Aircraft["status"] =>
  a.status === "En maintenance" &&
  a.expectedReturnAt &&
  Date.now() > new Date(a.expectedReturnAt).getTime()
    ? "Retour en service retardé"
    : a.status;

export const statusClass = (status: Aircraft["status"]) =>
  status === "Disponible"
    ? "ok"
    : status === "Maintenance planifiée"
      ? "warn"
      : "danger";

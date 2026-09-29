import { redirect } from "next/navigation";

// D14, étape 1 : /oma devient une redirection vers l'onglet OMA de /maintenance — une seule porte
// d'entrée, pas deux. Le contenu (OmaPage) est désormais monté dans MaintenancePage.
export default function Page() {
  redirect("/maintenance?tab=oma");
}

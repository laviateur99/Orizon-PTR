import { DossierVolPage } from "@/features/oma/DossierVolPage";
import { DOSSIER_VOL_FIXTURE } from "@/features/oma/dossierVolFixture";

// Démonstration d'impression avec des données fictives (bandeau « EXEMPLE FICTIF »). Aucune écriture dans Firestore.
export default function Page() {
  return <DossierVolPage workOrderId={DOSSIER_VOL_FIXTURE.order.id} fixture={DOSSIER_VOL_FIXTURE} />;
}

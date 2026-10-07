import { OmaProjectPrintPage } from "@/features/oma/OmaProjectPrintPage";
import { DOSSIER_VOL_FIXTURE } from "@/features/oma/dossierVolFixture";

// Démonstration d'impression avec des données fictives. Aucune écriture dans Firestore.
export default function Page() {
  return <OmaProjectPrintPage workOrderId={DOSSIER_VOL_FIXTURE.order.id} fixture={DOSSIER_VOL_FIXTURE} />;
}

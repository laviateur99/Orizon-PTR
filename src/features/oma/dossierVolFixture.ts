import type { CardSignature, Project, WorkCard, WorkOrder } from "./types";

// EXEMPLE FICTIF pour tester l'impression du dossier de vol. Aucune donnée réelle, aucun NIP réel :
// les signatures sont des noms et numéros inventés. Ce jeu de données n'est jamais écrit dans Firestore.

const ACTOR = { uid: "exemple-prm", name: "PRM Exemple" };
const TEA = { uid: "exemple-tea", name: "TEA Exemple" };
const CREATED = "2026-09-01T13:00:00.000Z";
const SIGNED = "2026-09-16T18:30:00.000Z";

export type DossierVolFixture = {
  order: WorkOrder;
  project: Project;
  cards: WorkCard[];
  signatures: Record<string, CardSignature[]>;
};

const card = (id: string, ata: string, subject: string, rectification: string, extra: Partial<WorkCard> = {}): WorkCard => ({
  id, orgId: "exemple-ecole", workOrderOrgId: "exemple-ecole", projectId: "exemple-projet", ata, subject, type: "routine",
  assignedUserId: TEA.uid, assignedUserName: TEA.name, status: "ferme", rectification, parts: [],
  completedAirTime: 19442, completedDate: "2026-09-16", createdBy: ACTOR, createdAt: CREATED, updatedAt: SIGNED,
  ...extra,
});

const signature = (cardId: string, index: number): CardSignature => ({
  id: `exemple-sig-${cardId}`, cardId, projectId: "exemple-projet", orgId: "exemple-oma", workOrderOrgId: "exemple-ecole",
  signerUid: TEA.uid, signerName: TEA.name, licenseType: "ACA", licenseNumber: `FICTIF-${100 + index}`, licenseClass: "Maintenance",
  requiredClass: "", classMatch: "unspecified", contentHash: "0".repeat(64), hashAlgo: "sha256", contentVersion: 1, signedAt: SIGNED,
});

const cards: WorkCard[] = [
  card("exemple-carte-001", "05", "Inspection de 100 heures à effectuer selon le calendrier d'entretien (EXEMPLE)",
    "Inspection de 100 heures effectuée selon le manuel de service (EXEMPLE). Huile et filtre remplacés. Essai au sol satisfaisant.",
    { parts: [{ partNumber: "PN-EXEMPLE-FILTRE", removedSerial: "", installedSerial: "", quantity: 1 }], nextDue: { basis: "hours+calendar", dueAirTime: 19542, dueDate: "2027-09-16" } }),
  card("exemple-carte-002", "05", "Certification annuelle du tachymètre (EXEMPLE)",
    "Vérification annuelle effectuée, dans les limites de 4 % (EXEMPLE).",
    { nextDue: { basis: "intervalMonths", dueDate: "2027-09-16" } }),
  card("exemple-carte-003", "71", "Inspection 500 heures de la magnéto gauche (EXEMPLE)",
    "Magnéto retirée, inspectée puis remplacée par une magnéto révisée (EXEMPLE).",
    { parts: [{ partNumber: "PN-EXEMPLE-MAGNETO", removedSerial: "SN-EXEMPLE-0001", installedSerial: "SN-EXEMPLE-0002", quantity: 1 }], nextDue: { basis: "intervalHours", dueAirTime: 20042 } }),
  card("exemple-carte-004", "24", "Remplacement d'un composant de test (EXEMPLE)",
    "Composant remplacé, essai fonctionnel conforme (EXEMPLE).",
    { parts: [{ partNumber: "PN-EXEMPLE-TEST", removedSerial: "SN-EXEMPLE-0003", installedSerial: "SN-EXEMPLE-0004", quantity: 1 }] }),
];

export const DOSSIER_VOL_FIXTURE: DossierVolFixture = {
  order: {
    id: "exemple-bon-travail", orgId: "exemple-ecole", sharedWithOrgId: "exemple-oma", status: "cloture", source: "manuel",
    aircraftId: "exemple-avion", aircraftRegistration: "C-FICTIF", title: "PO EXEMPLE-001 · Programme d'inspection EXEMPLE",
    description: "Inspection de 100 heures et travaux associés (EXEMPLE FICTIF)", tasks: [], airTimeAtIssue: 19442,
    createdBy: ACTOR, createdAt: CREATED, rts: { by: ACTOR, at: SIGNED, comments: "", airTimeAtReturn: 19442 },
  },
  project: { id: "exemple-bon-travail", orgId: "exemple-oma", workOrderOrgId: "exemple-ecole", cardCount: cards.length, openCardCount: 0, signerUids: [TEA.uid], openedBy: ACTOR },
  cards,
  signatures: Object.fromEntries(cards.map((c, index) => [c.id, [signature(c.id, index)]])),
};

import {
  addDoc, collection, doc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where, writeBatch,
  type FirestoreError, type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "@/services/firebase/client";
import type { Actor, AircraftComponent, CardEntry, CardPart, CardSignature, ClassMatch, InventoryAction, InventoryHistory, InventoryItem, Project, TaskSnapshot, WorkCard, WorkOrder, WorkOrderSource } from "./types";
import type { LicenseClass } from "@/features/organizations/types";
import { mapAircraftComponent, mapCard, mapEntry, mapInventoryHistory, mapInventoryItem, mapProject, mapSignature, mapWorkOrder } from "./mappers";

type Next<T> = (items: T[]) => void;
type Err = (error: FirestoreError) => void;

// Requêtes de liste : chaque contrainte `where` correspond à ce que les règles exigent (voir firestore.rules).
export const subscribeIssuedWorkOrders = (orgId: string, next: Next<WorkOrder>, error: Err): Unsubscribe =>
  onSnapshot(query(collection(db, "workOrders"), where("orgId", "==", orgId)), snap => next(snap.docs.map(item => mapWorkOrder(item.id, item.data()))), error);

export const subscribeReceivedWorkOrders = (mroOrgId: string, next: Next<WorkOrder>, error: Err): Unsubscribe =>
  // "annule" est inclus pour qu'un bon annulé après transmission reste visible (lecture seule) côté
  // OMA plutôt que de disparaître silencieusement de la liste (D13).
  onSnapshot(query(collection(db, "workOrders"), where("sharedWithOrgId", "==", mroOrgId), where("status", "in", ["transmis", "pris_en_charge", "rapport_depose", "controle_prm", "cloture", "annule"])), snap => next(snap.docs.map(item => mapWorkOrder(item.id, item.data()))), error);

export const subscribeProject = (id: string, next: (value: Project | null) => void, error: Err): Unsubscribe =>
  onSnapshot(doc(db, "projects", id), snap => next(snap.exists() ? mapProject(snap.id, snap.data()) : null), error);

/** side "mro" : cartes de l'OMA; side "school" : cartes vues par l'école émettrice. */
export const subscribeCards = (side: "mro" | "school", orgId: string, projectId: string, next: Next<WorkCard>, error: Err): Unsubscribe =>
  onSnapshot(query(collection(db, "workCards"), where(side === "mro" ? "orgId" : "workOrderOrgId", "==", orgId), where("projectId", "==", projectId)), snap => next(snap.docs.map(item => mapCard(item.id, item.data()))), error);

export const subscribeSignatures = (side: "mro" | "school", orgId: string, cardId: string, next: Next<CardSignature>, error: Err): Unsubscribe =>
  onSnapshot(query(collection(db, "workCards", cardId, "signatures"), where(side === "mro" ? "orgId" : "workOrderOrgId", "==", orgId)), snap => next(snap.docs.map(item => mapSignature(item.id, item.data()))), error);

export const subscribeEntries = (side: "mro" | "school", orgId: string, cardId: string, next: Next<CardEntry>, error: Err): Unsubscribe =>
  onSnapshot(query(collection(db, "workCards", cardId, "entries"), where(side === "mro" ? "orgId" : "workOrderOrgId", "==", orgId)), snap => next(snap.docs.map(item => mapEntry(item.id, item.data()))), error);

/** Inventaire côté école (propriétaire) ou côté OMA (pièces partagées avec elle). */
export const subscribeInventory = (side: "school" | "mro", orgId: string, next: Next<InventoryItem>, error: Err): Unsubscribe =>
  onSnapshot(query(collection(db, "inventoryItems"), where(side === "school" ? "orgId" : "sharedWithOrgId", "==", orgId)), snap => next(snap.docs.map(item => mapInventoryItem(item.id, item.data()))), error);

/** Journal des mouvements de stock d'un côté (école ou OMA), filtré par organisation. */
export const subscribeInventoryHistory = (side: "school" | "mro", orgId: string, next: Next<InventoryHistory>, error: Err): Unsubscribe =>
  onSnapshot(query(collection(db, "inventoryHistory"), where(side === "school" ? "orgId" : "sharedWithOrgId", "==", orgId)), snap => next(snap.docs.map(item => mapInventoryHistory(item.id, item.data()))), error);

/** Mouvements d'une seule pièce (historique de la fiche). */
export const subscribeItemHistory = (orgId: string, itemId: string, next: Next<InventoryHistory>, error: Err): Unsubscribe =>
  onSnapshot(query(collection(db, "inventoryHistory"), where("orgId", "==", orgId), where("itemId", "==", itemId)), snap => next(snap.docs.map(item => mapInventoryHistory(item.id, item.data()))), error);

/** Composantes installées par l'OMA sur les avions de l'école. */
export const subscribeAircraftComponents = (schoolOrgId: string, next: Next<AircraftComponent>, error: Err): Unsubscribe =>
  onSnapshot(query(collection(db, "aircraftComponents"), where("workOrderOrgId", "==", schoolOrgId)), snap => next(snap.docs.map(item => mapAircraftComponent(item.id, item.data()))), error);

// ---------- École (émetteur) ----------

export type WorkOrderInput = {
  orgId: string; sharedWithOrgId: string;
  source: WorkOrderSource; aircraftId: string; aircraftRegistration: string;
  title: string; description: string; snagId?: string; tasks: TaskSnapshot[]; airTimeAtIssue?: number;
};

const clean = <T extends Record<string, unknown>>(value: T): T => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;

export async function createWorkOrder(input: WorkOrderInput, by: Actor): Promise<string> {
  const reference = await addDoc(collection(db, "workOrders"), clean({
    ...input, status: "brouillon", createdBy: by, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
  return reference.id;
}

export const transmitWorkOrder = (id: string) =>
  updateDoc(doc(db, "workOrders", id), { status: "transmis", transmittedAt: serverTimestamp(), updatedAt: serverTimestamp() });

/** Contrôle PRM de l'école. Refusé par les règles si l'utilisateur a signé une carte du projet. */
export const startPrmControl = (id: string, by: Actor, comments = "") =>
  updateDoc(doc(db, "workOrders", id), { status: "controle_prm", control: { by, at: new Date().toISOString(), comments }, updatedAt: serverTimestamp() });

/**
 * Annulation d'un bon de travail par l'école émettrice (D13) : refusée par les règles dès qu'une
 * carte du projet a été signée (`projects/{id}.signerUids` non vide), quel que soit le statut.
 * Jamais depuis `controle_prm` (le contrôle est déjà commencé) — voir docs/audit-maintenance.md, D13.
 */
export const cancelWorkOrder = (id: string, by: Actor, comments = "") =>
  updateDoc(doc(db, "workOrders", id), { status: "annule", cancelled: { by, at: new Date().toISOString(), comments }, updatedAt: serverTimestamp() });

/**
 * Clôture + remise en service par le PRM de l'école. Les règles exigent openCardCount == 0.
 * Applique ensuite les prochaines échéances calculées à la fermeture des cartes (choix de
 * modélisation D3 : l'OMA n'écrit jamais chez l'école) et libère l'avion s'il ne reste aucun SNAG ouvert.
 */
export async function closeWorkOrderAndReturnToService(workOrder: WorkOrder, cards: WorkCard[], by: Actor, comments: string, airTimeAtReturn?: number) {
  if (cards.some(card => card.status !== "ouvert" && card.status !== "ferme" && card.status !== "annulee")) throw new Error("État de carte inconnu.");
  if (cards.some(card => card.status === "ouvert")) throw new Error("Toutes les cartes du projet doivent être fermées avant la remise en service.");
  const openSnags = (await getDocs(query(collection(db, "snags"), where("aircraftId", "==", workOrder.aircraftId), where("orgId", "==", workOrder.orgId))))
    .docs.filter(item => item.data().status !== "Fermé" && item.id !== workOrder.snagId);
  const batch = writeBatch(db);
  batch.update(doc(db, "workOrders", workOrder.id), { status: "cloture", rts: clean({ by, at: new Date().toISOString(), comments, airTimeAtReturn }), updatedAt: serverTimestamp() });
  // Ferme le SNAG lié (même logique que l'ancien système, writeMaintenanceWorkOrder/snagStatusForWorkOrder,
  // qui ne tenait pas ce document à jour côté OMA jusqu'ici — carte 2/5 du plan D14).
  if (workOrder.snagId) {
    batch.update(doc(db, "snags", workOrder.snagId), clean({
      status: "Fermé", resolvedByWorkOrderId: workOrder.id, returnedToServiceBy: by.name, returnedToServiceAt: new Date(), updatedAt: new Date().toISOString(),
    }));
    batch.set(doc(collection(db, "snagHistory")), {
      action: "Fermeture par retour en service OMA", snagId: workOrder.snagId,
      aircraftId: workOrder.aircraftId, aircraftRegistration: workOrder.aircraftRegistration,
      actor: by.name, reason: comments || `Clôturé via le bon de travail OMA ${workOrder.id}`, createdAt: new Date().toISOString(),
    });
  }
  for (const card of cards) {
    if (!card.taskSnapshot?.taskId || !card.nextDue) continue;
    const patch: Record<string, unknown> = { completed: false };
    if (card.nextDue.dueAirTime !== undefined) patch.dueAirTime = card.nextDue.dueAirTime;
    if (card.nextDue.dueDate) patch.dueDate = card.nextDue.dueDate;
    if (card.nextDue.lastCompletedAirTime !== undefined) patch.lastCompletedAirTime = card.nextDue.lastCompletedAirTime;
    if (card.nextDue.lastCompletedDate) patch.lastCompletedDate = card.nextDue.lastCompletedDate;
    batch.update(doc(db, "maintenanceTasks", card.taskSnapshot.taskId), patch);
    batch.set(doc(collection(db, "maintenanceHistory")), {
      aircraftId: workOrder.aircraftId, taskId: card.taskSnapshot.taskId, workOrderId: workOrder.id,
      action: "Échéance mise à jour à la remise en service (carte OMA)", reason: `Carte ${card.id} certifiée; remise en service ${workOrder.aircraftRegistration}`,
      actorId: by.uid, actorName: by.name, actorRole: "PRM école", createdAt: new Date().toISOString(),
    });
  }
  if (!openSnags.length) {
    batch.update(doc(db, "aircraft", workOrder.aircraftId), { status: "Disponible", blockedForScheduling: false, returnedToServiceBy: by.name, returnedToServiceAt: new Date().toISOString() });
  }
  await batch.commit();
  return { aircraftReleased: !openSnags.length, openSnagCount: openSnags.length };
}

export type InventoryInput = { partNumber: string; description: string; serialNumber: string; quantity: number; location: string };

/** Ligne du journal côté école : chaque création, modification ou suppression passe par ici, dans le même batch. */
function historyLine(item: { id: string; orgId: string; sharedWithOrgId: string; partNumber: string; serialNumber: string }, action: InventoryAction, quantityBefore: number, quantityAfter: number, by: Actor) {
  return { orgId: item.orgId, sharedWithOrgId: item.sharedWithOrgId, itemId: item.id, partNumber: item.partNumber, serialNumber: item.serialNumber, action, quantityBefore, quantityAfter, quantityChange: quantityAfter - quantityBefore, actor: by, createdAt: serverTimestamp() };
}

/** Ajout d'une pièce à l'inventaire de l'école, partagé avec l'OMA indiquée (fiche + journal, un seul commit). */
export async function createInventoryItem(orgId: string, sharedWithOrgId: string, input: InventoryInput, by: Actor): Promise<string> {
  const ref = doc(collection(db, "inventoryItems"));
  const batch = writeBatch(db);
  batch.set(ref, { ...input, orgId, sharedWithOrgId, createdBy: by, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  batch.set(doc(collection(db, "inventoryHistory")), historyLine({ id: ref.id, orgId, sharedWithOrgId, partNumber: input.partNumber, serialNumber: input.serialNumber }, "Création", 0, input.quantity, by));
  await batch.commit();
  return ref.id;
}

/** Correction de la fiche et du stock. Le partage et la traçabilité de pose ne changent pas. */
export async function updateInventoryItem(item: InventoryItem, input: InventoryInput, by: Actor) {
  const batch = writeBatch(db);
  batch.update(doc(db, "inventoryItems", item.id), { ...input, updatedAt: serverTimestamp() });
  batch.set(doc(collection(db, "inventoryHistory")), historyLine({ ...item, partNumber: input.partNumber, serialNumber: input.serialNumber }, "Modification", item.quantity, input.quantity, by));
  await batch.commit();
}

export type InventoryImportRow = InventoryInput & { importKey: string };

/**
 * Import initial d'un inventaire (fichier JSON préparé à partir de l'export). Chaque ligne devient une fiche
 * + une ligne « Création » au journal, par lots de 200 (une seule écriture atomique par lot). Les lignes déjà
 * importées (même importKey) sont ignorées : relancer l'import ne crée pas de doublons.
 */
export async function importInventory(orgId: string, sharedWithOrgId: string, rows: InventoryImportRow[], existingKeys: Set<string>, by: Actor, onProgress: (done: number, total: number) => void) {
  const todo = rows.filter(row => !existingKeys.has(row.importKey));
  const batchSize = 200;
  for (let start = 0; start < todo.length; start += batchSize) {
    const batch = writeBatch(db);
    for (const row of todo.slice(start, start + batchSize)) {
      const ref = doc(collection(db, "inventoryItems"));
      const { importKey, ...input } = row;
      batch.set(ref, { ...input, orgId, sharedWithOrgId, importKey, createdBy: by, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      batch.set(doc(collection(db, "inventoryHistory")), historyLine({ id: ref.id, orgId, sharedWithOrgId, partNumber: input.partNumber, serialNumber: input.serialNumber }, "Création", 0, input.quantity, by));
    }
    await batch.commit();
    onProgress(Math.min(start + batchSize, todo.length), todo.length);
  }
  return todo.length;
}

/** Suppression refusée par les règles si la pièce a déjà été installée (traçabilité). */
export async function deleteInventoryItem(item: InventoryItem, by: Actor) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "inventoryItems", item.id));
  batch.set(doc(collection(db, "inventoryHistory")), historyLine(item, "Suppression", item.quantity, 0, by));
  await batch.commit();
}

// ---------- OMA (destinataire) ----------

/** Prise en charge : le projet est ouvert (même id que le bon) dans le même commit atomique. */
export async function acceptWorkOrder(workOrder: WorkOrder, by: Actor) {
  const batch = writeBatch(db);
  batch.update(doc(db, "workOrders", workOrder.id), { status: "pris_en_charge", acceptedBy: by, acceptedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  batch.set(doc(db, "projects", workOrder.id), {
    orgId: workOrder.sharedWithOrgId, workOrderOrgId: workOrder.orgId,
    cardCount: 0, openCardCount: 0, signerUids: [], openedBy: by, openedAt: serverTimestamp(),
  });
  await batch.commit();
}

export type CardInput = {
  ata: string; subject: string; type: WorkCard["type"];
  assignedUserId: string; assignedUserName: string;
  requiredClass?: LicenseClass; taskSnapshot?: TaskSnapshot;
};

/** Ajoute une carte : incrémente les compteurs du projet dans le même commit (validé par les règles). */
export async function addWorkCard(project: Project, input: CardInput, by: Actor): Promise<string> {
  const cardRef = doc(collection(db, "workCards"));
  const batch = writeBatch(db);
  batch.set(cardRef, clean({
    orgId: project.orgId, workOrderOrgId: project.workOrderOrgId, projectId: project.id,
    ata: input.ata, subject: input.subject, type: input.type,
    assignedUserId: input.assignedUserId, assignedUserName: input.assignedUserName,
    status: "ouvert", requiredClass: input.requiredClass, taskSnapshot: input.taskSnapshot,
    rectification: "", parts: [], createdBy: by, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
  batch.update(doc(db, "projects", project.id), { cardCount: project.cardCount + 1, openCardCount: project.openCardCount + 1, lastCardId: cardRef.id });
  await batch.commit();
  return cardRef.id;
}

export type CardContentPatch = { rectification: string; parts: CardPart[]; completedAirTime?: number; completedDate?: string; assignedUserId?: string; assignedUserName?: string };

/** Modification du contenu d'une carte encore ouverte. Une carte signée est en lecture seule (règles). */
export const updateWorkCardContent = (cardId: string, patch: CardContentPatch) =>
  updateDoc(doc(db, "workCards", cardId), clean({ ...patch, parts: patch.parts.map(part => clean(part)), updatedAt: serverTimestamp() }));

/**
 * Annulation d'une carte de travail (D13) : uniquement depuis `ouvert`, donc jamais sur une carte
 * signée (le statut 'ouvert' garantit déjà l'absence de signature — même mécanisme que la
 * fermeture). Décrémente `openCardCount` du projet dans le même commit; `cardCount` ne change pas
 * (la carte a existé, elle reste comptée historiquement, comme une fermeture normale).
 */
export async function cancelWorkCard(project: Project, card: WorkCard, by: Actor, comments = "") {
  const batch = writeBatch(db);
  batch.update(doc(db, "workCards", card.id), { status: "annulee", cancelled: { by, at: new Date().toISOString(), comments }, updatedAt: serverTimestamp() });
  batch.update(doc(db, "projects", project.id), { openCardCount: project.openCardCount - 1, lastCancelledCardId: card.id });
  await batch.commit();
}

export const depositReport = (id: string, report: { reference: string; summary: string }, by: Actor) =>
  updateDoc(doc(db, "workOrders", id), { status: "rapport_depose", report: { ...report, depositedBy: by, depositedAt: new Date().toISOString() }, updatedAt: serverTimestamp() });

/** Correction après signature : nouvelle inscription, l'ancienne (et la signature) restent intactes. */
export const addCardEntry = (card: WorkCard, entry: { kind: CardEntry["kind"]; text: string; supersedesSignatureId?: string }, by: Actor) =>
  addDoc(collection(db, "workCards", card.id, "entries"), clean({
    cardId: card.id, orgId: card.orgId, workOrderOrgId: card.workOrderOrgId, ...entry, createdBy: by, createdAt: serverTimestamp(),
  }));

/** Certification d'une carte : le NIP est vérifié et le hash calculé côté serveur (route API). */
export async function signWorkCard(cardId: string, pin: string): Promise<{ signatureId: string; contentHash: string; classMatch: ClassMatch }> {
  const user = auth.currentUser;
  if (!user) throw new Error("Session expirée.");
  const token = await user.getIdToken();
  const response = await fetch("/api/oma/sign-card", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ cardId, pin }),
  });
  if (!response.ok) throw new Error((await response.text()) || "Certification impossible.");
  return response.json();
}

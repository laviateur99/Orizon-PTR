import {
  addDoc, collection, doc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where, writeBatch,
  type FirestoreError, type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "@/services/firebase/client";
import type { Actor, CardEntry, CardPart, CardSignature, ClassMatch, Project, TaskSnapshot, WorkCard, WorkOrder, WorkOrderSource } from "./types";
import type { LicenseClass } from "@/features/organizations/types";
import { mapCard, mapEntry, mapProject, mapSignature, mapWorkOrder } from "./mappers";

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
  if (cards.some(card => card.status !== "ouvert" && card.status !== "ferme")) throw new Error("État de carte inconnu.");
  if (cards.some(card => card.status === "ouvert")) throw new Error("Toutes les cartes du projet doivent être fermées avant la remise en service.");
  const openSnags = (await getDocs(query(collection(db, "snags"), where("aircraftId", "==", workOrder.aircraftId), where("orgId", "==", workOrder.orgId))))
    .docs.filter(item => item.data().status !== "Fermé" && item.id !== workOrder.snagId);
  const batch = writeBatch(db);
  batch.update(doc(db, "workOrders", workOrder.id), { status: "cloture", rts: clean({ by, at: new Date().toISOString(), comments, airTimeAtReturn }), updatedAt: serverTimestamp() });
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
  updateDoc(doc(db, "workCards", cardId), clean({ ...patch, updatedAt: serverTimestamp() }));

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

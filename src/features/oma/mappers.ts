import type { DocumentData } from "firebase/firestore";
import type {
  Actor, AircraftComponent, CardEntry, CardPart, CardSignature, ClassMatch, InventoryHistory, InventoryItem, NextDue, Project, TaskSnapshot, WorkCard, WorkOrder, WorkOrderSource, WorkOrderStatus,
} from "./types";
import type { LicenseClass } from "@/features/organizations/types";

// Mappers purs (aucun accès à Firebase) : utilisables côté client et dans les routes serveur.
const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const num = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
const iso = (value: unknown) => value && typeof (value as { toDate?: unknown }).toDate === "function" ? (value as { toDate: () => Date }).toDate().toISOString() : text(value);
const actor = (value: unknown): Actor => { const data = (value && typeof value === "object" ? value : {}) as Record<string, unknown>; return { uid: text(data.uid), name: text(data.name) }; };
const optionalActor = (value: unknown) => value && typeof value === "object" ? actor(value) : undefined;

export function mapSnapshot(value: unknown): TaskSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined;
  const d = value as Record<string, unknown>;
  return { taskId: text(d.taskId), title: text(d.title), dueBasis: text(d.dueBasis) || undefined, dueAirTime: num(d.dueAirTime), dueDate: text(d.dueDate) || undefined, intervalHours: num(d.intervalHours), intervalDays: num(d.intervalDays), intervalMonths: num(d.intervalMonths) };
}

export function mapWorkOrder(id: string, d: DocumentData): WorkOrder {
  return {
    id, orgId: text(d.orgId), sharedWithOrgId: text(d.sharedWithOrgId),
    status: text(d.status, "brouillon") as WorkOrderStatus, source: text(d.source, "manuel") as WorkOrderSource,
    aircraftId: text(d.aircraftId), aircraftRegistration: text(d.aircraftRegistration),
    title: text(d.title), description: text(d.description), snagId: text(d.snagId) || undefined,
    tasks: Array.isArray(d.tasks) ? d.tasks.map(mapSnapshot).filter((item): item is TaskSnapshot => Boolean(item)) : [],
    airTimeAtIssue: num(d.airTimeAtIssue),
    createdBy: actor(d.createdBy), createdAt: iso(d.createdAt), transmittedAt: iso(d.transmittedAt) || undefined,
    acceptedBy: optionalActor(d.acceptedBy), acceptedAt: iso(d.acceptedAt) || undefined,
    report: d.report ? { reference: text(d.report.reference), summary: text(d.report.summary), depositedBy: actor(d.report.depositedBy), depositedAt: iso(d.report.depositedAt) } : undefined,
    control: d.control ? { by: actor(d.control.by), at: iso(d.control.at), comments: text(d.control.comments) } : undefined,
    rts: d.rts ? { by: actor(d.rts.by), at: iso(d.rts.at), comments: text(d.rts.comments), airTimeAtReturn: num(d.rts.airTimeAtReturn) } : undefined,
    cancelled: d.cancelled ? { by: actor(d.cancelled.by), at: iso(d.cancelled.at), comments: text(d.cancelled.comments) } : undefined,
  };
}

export function mapProject(id: string, d: DocumentData): Project {
  return {
    id, orgId: text(d.orgId), workOrderOrgId: text(d.workOrderOrgId),
    cardCount: num(d.cardCount) ?? 0, openCardCount: num(d.openCardCount) ?? 0,
    signerUids: Array.isArray(d.signerUids) ? d.signerUids.filter((item: unknown): item is string => typeof item === "string") : [],
    openedBy: actor(d.openedBy), openedAt: iso(d.openedAt),
  };
}

export function mapCard(id: string, d: DocumentData): WorkCard {
  const nextDue = d.nextDue && typeof d.nextDue === "object" ? d.nextDue as Record<string, unknown> : undefined;
  return {
    id, orgId: text(d.orgId), workOrderOrgId: text(d.workOrderOrgId), projectId: text(d.projectId),
    ata: text(d.ata), subject: text(d.subject), type: text(d.type, "routine") as WorkCard["type"],
    assignedUserId: text(d.assignedUserId), assignedUserName: text(d.assignedUserName),
    status: text(d.status, "ouvert") as WorkCard["status"],
    requiredClass: (text(d.requiredClass) || undefined) as LicenseClass | undefined,
    taskSnapshot: mapSnapshot(d.taskSnapshot),
    rectification: text(d.rectification),
    parts: Array.isArray(d.parts) ? d.parts.map((part: Record<string, unknown>): CardPart => ({ partNumber: text(part.partNumber), removedSerial: text(part.removedSerial), installedSerial: text(part.installedSerial), quantity: num(part.quantity) ?? 1, inventoryItemId: text(part.inventoryItemId) || undefined })) : [],
    completedAirTime: num(d.completedAirTime), completedDate: text(d.completedDate) || undefined,
    nextDue: nextDue ? { dueAirTime: num(nextDue.dueAirTime), dueDate: text(nextDue.dueDate) || undefined, lastCompletedAirTime: num(nextDue.lastCompletedAirTime), lastCompletedDate: text(nextDue.lastCompletedDate) || undefined, basis: text(nextDue.basis, "aucun_intervalle") as NextDue["basis"] } : undefined,
    signedAt: iso(d.signedAt) || undefined, signedBy: text(d.signedBy) || undefined, signedContentHash: text(d.signedContentHash) || undefined, signatureId: text(d.signatureId) || undefined,
    cancelled: d.cancelled ? { by: actor(d.cancelled.by), at: iso(d.cancelled.at), comments: text(d.cancelled.comments) } : undefined,
    createdBy: actor(d.createdBy), createdAt: iso(d.createdAt), updatedAt: iso(d.updatedAt),
  };
}

export const mapSignature = (id: string, d: DocumentData): CardSignature => ({
  id, cardId: text(d.cardId), projectId: text(d.projectId), orgId: text(d.orgId), workOrderOrgId: text(d.workOrderOrgId),
  signerUid: text(d.signerUid), signerName: text(d.signerName),
  licenseType: text(d.licenseType) as CardSignature["licenseType"], licenseNumber: text(d.licenseNumber), licenseClass: text(d.licenseClass) as CardSignature["licenseClass"],
  requiredClass: text(d.requiredClass) as CardSignature["requiredClass"], classMatch: text(d.classMatch, "unspecified") as ClassMatch,
  contentHash: text(d.contentHash), hashAlgo: "sha256", contentVersion: 1, signedAt: iso(d.signedAt),
});

export const mapEntry = (id: string, d: DocumentData): CardEntry => ({
  id, cardId: text(d.cardId), orgId: text(d.orgId), workOrderOrgId: text(d.workOrderOrgId),
  kind: text(d.kind, "note") as CardEntry["kind"], text: text(d.text), supersedesSignatureId: text(d.supersedesSignatureId) || undefined,
  createdBy: actor(d.createdBy), createdAt: iso(d.createdAt),
});

export const mapInventoryItem = (id: string, d: DocumentData): InventoryItem => ({
  id, orgId: text(d.orgId), sharedWithOrgId: text(d.sharedWithOrgId),
  partNumber: text(d.partNumber), description: text(d.description), serialNumber: text(d.serialNumber),
  quantity: num(d.quantity) ?? 0, location: text(d.location),
  lastInstalledCardId: text(d.lastInstalledCardId) || undefined,
  createdBy: actor(d.createdBy), createdAt: iso(d.createdAt) || undefined, updatedAt: iso(d.updatedAt) || undefined,
});

export const mapAircraftComponent = (id: string, d: DocumentData): AircraftComponent => ({
  id, orgId: text(d.orgId), workOrderOrgId: text(d.workOrderOrgId),
  aircraftId: text(d.aircraftId), aircraftRegistration: text(d.aircraftRegistration),
  partNumber: text(d.partNumber), description: text(d.description), serialNumber: text(d.serialNumber), quantity: num(d.quantity) ?? 1,
  cardId: text(d.cardId), workOrderId: text(d.workOrderId), inventoryItemId: text(d.inventoryItemId) || undefined,
  installedBy: actor(d.installedBy), installedAt: iso(d.installedAt) || undefined,
});

export const mapInventoryHistory = (id: string, d: DocumentData): InventoryHistory => ({
  id, orgId: text(d.orgId), sharedWithOrgId: text(d.sharedWithOrgId),
  itemId: text(d.itemId), partNumber: text(d.partNumber), serialNumber: text(d.serialNumber),
  action: text(d.action, "Modification") as InventoryHistory["action"],
  quantityBefore: num(d.quantityBefore) ?? 0, quantityAfter: num(d.quantityAfter) ?? 0, quantityChange: num(d.quantityChange) ?? 0,
  aircraftRegistration: text(d.aircraftRegistration) || undefined, cardId: text(d.cardId) || undefined,
  actor: actor(d.actor), createdAt: iso(d.createdAt) || undefined,
});

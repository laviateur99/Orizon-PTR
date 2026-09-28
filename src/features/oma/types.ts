import type { LicenseClass, LicenseType } from "@/features/organizations/types";

export type WorkOrderStatus = "brouillon" | "transmis" | "pris_en_charge" | "rapport_depose" | "controle_prm" | "cloture";
export const WORK_ORDER_STATUSES: WorkOrderStatus[] = ["brouillon", "transmis", "pris_en_charge", "rapport_depose", "controle_prm", "cloture"];
export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  brouillon: "Brouillon", transmis: "Transmis à l’OMA", pris_en_charge: "Pris en charge", rapport_depose: "Rapport déposé", controle_prm: "Contrôle PRM", cloture: "Clôturé",
};
export type WorkOrderSource = "status_board" | "snag" | "manuel";
export type Actor = { uid: string; name: string };

/** Paramètres de l'échéance de l'école, copiés à l'émission : l'OMA ne lit jamais les données de l'école. */
export type TaskSnapshot = {
  taskId: string; title: string;
  dueBasis?: string; dueAirTime?: number; dueDate?: string;
  intervalHours?: number; intervalDays?: number; intervalMonths?: number;
};

export type WorkOrder = {
  id: string;
  orgId: string;               // organisation émettrice (école)
  sharedWithOrgId: string;     // organisation destinataire (OMA)
  status: WorkOrderStatus;
  source: WorkOrderSource;
  aircraftId: string; aircraftRegistration: string;
  title: string; description: string;
  snagId?: string;
  tasks: TaskSnapshot[];
  airTimeAtIssue?: number;
  createdBy: Actor; createdAt?: string;
  transmittedAt?: string;
  acceptedBy?: Actor; acceptedAt?: string;
  report?: { reference: string; summary: string; depositedBy: Actor; depositedAt: string };
  control?: { by: Actor; at: string; comments: string };
  rts?: { by: Actor; at: string; comments: string; airTimeAtReturn?: number };
};

export type Project = {
  id: string;                  // = id du bon de travail (relation 1:1)
  orgId: string;               // OMA
  workOrderOrgId: string;      // école émettrice
  cardCount: number; openCardCount: number;
  signerUids: string[];        // croissant seulement : sert à la séparation des tâches
  openedBy: Actor; openedAt?: string;
};

export type CardType = "routine" | "snag";
export type CardStatus = "ouvert" | "ferme";
export type CardPart = { partNumber: string; removedSerial: string; installedSerial: string; quantity: number };

export type NextDue = {
  dueAirTime?: number; dueDate?: string; lastCompletedAirTime?: number; lastCompletedDate?: string;
  basis: "intervalHours" | "intervalDays" | "intervalMonths" | "hours+calendar" | "aucun_intervalle";
};

export type WorkCard = {
  id: string;
  orgId: string; workOrderOrgId: string; projectId: string;
  ata: string; subject: string; type: CardType;
  assignedUserId: string; assignedUserName: string;
  status: CardStatus;
  requiredClass?: LicenseClass;
  taskSnapshot?: TaskSnapshot;
  rectification: string;
  parts: CardPart[];
  completedAirTime?: number; completedDate?: string;
  nextDue?: NextDue;
  signedAt?: string; signedBy?: string; signedContentHash?: string; signatureId?: string;
  createdBy: Actor; createdAt?: string; updatedAt?: string;
};

export type ClassMatch = "match" | "mismatch" | "unspecified";

/** Enregistrement immuable (création seulement) créé à la certification d'une carte. */
export type CardSignature = {
  id: string; cardId: string; projectId: string; orgId: string; workOrderOrgId: string;
  signerUid: string; signerName: string;
  licenseType: LicenseType | ""; licenseNumber: string; licenseClass: LicenseClass | "";
  requiredClass: LicenseClass | "";
  classMatch: ClassMatch;
  contentHash: string; hashAlgo: "sha256"; contentVersion: 1;
  signedAt?: string;
};

/** Inscription ajoutée après signature (correction/note). Ne remplace jamais l'ancienne. */
export type CardEntry = {
  id: string; cardId: string; orgId: string; workOrderOrgId: string;
  kind: "correction" | "note"; text: string; supersedesSignatureId?: string;
  createdBy: Actor; createdAt?: string;
};

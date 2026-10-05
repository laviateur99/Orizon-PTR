import type { WorkCard } from "./types";

/** Champs qui font partie du contenu signé. Toute modification de l'un d'eux change le hash. */
export function canonicalCardContent(card: WorkCard): string {
  const content = {
    v: 1,
    id: card.id, projectId: card.projectId, orgId: card.orgId,
    ata: card.ata, subject: card.subject, type: card.type,
    assignedUserId: card.assignedUserId,
    requiredClass: card.requiredClass || "",
    taskId: card.taskSnapshot?.taskId || "",
    rectification: card.rectification,
    // inventoryItemId n'entre dans le hash que s'il existe : les cartes déjà signées gardent le même hash.
    parts: card.parts.map(part => ({ partNumber: part.partNumber, removedSerial: part.removedSerial, installedSerial: part.installedSerial, quantity: part.quantity, ...(part.inventoryItemId ? { inventoryItemId: part.inventoryItemId } : {}) })),
    completedAirTime: typeof card.completedAirTime === "number" ? card.completedAirTime : null,
    completedDate: card.completedDate || "",
  };
  return JSON.stringify(content);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export const cardContentHash = async (card: WorkCard) => sha256Hex(canonicalCardContent(card));

import { arrayUnion, collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch, type FirestoreError, type Unsubscribe } from "firebase/firestore";
import { db } from "@/services/firebase/client";
import { DEFAULT_ORGANIZATIONS, type LicenseClass, type LicenseType, type OrgMember, type OrgRole, type OrgType, type Organization } from "./types";

const text = (value: unknown) => typeof value === "string" ? value : "";

export function mapOrganization(id: string, data: Record<string, unknown>): Organization {
  return { id, name: text(data.name) || id, type: data.type === "mro" ? "mro" : "school" };
}

export function mapMember(orgId: string, userId: string, data: Record<string, unknown>): OrgMember {
  const licenseType = text(data.licenseType), licenseClass = text(data.licenseClass);
  return {
    userId, orgId,
    role: (text(data.role) || "staff") as OrgRole,
    active: data.active !== false,
    displayName: text(data.displayName),
    ...(licenseType ? { licenseType: licenseType as LicenseType } : {}),
    ...(text(data.licenseNumber) ? { licenseNumber: text(data.licenseNumber) } : {}),
    ...(licenseClass ? { licenseClass: licenseClass as LicenseClass } : {}),
  };
}

export function subscribeOrganizations(next: (items: Organization[]) => void, error: (e: FirestoreError) => void): Unsubscribe {
  return onSnapshot(collection(db, "organizations"), snap => next(snap.docs.map(item => mapOrganization(item.id, item.data()))), error);
}

export function subscribeOrgMembers(orgId: string, next: (items: OrgMember[]) => void, error: (e: FirestoreError) => void): Unsubscribe {
  return onSnapshot(collection(db, "organizations", orgId, "members"), snap => next(snap.docs.map(item => mapMember(orgId, item.id, item.data()))), error);
}

/** Crée (sans écraser) les deux organisations par défaut. Réservé à l'administrateur (règles). */
export async function ensureDefaultOrganizations(): Promise<{ created: string[]; existing: string[] }> {
  const created: string[] = [], existing: string[] = [];
  for (const org of DEFAULT_ORGANIZATIONS) {
    const ref = doc(db, "organizations", org.id);
    if ((await getDoc(ref)).exists()) { existing.push(org.id); continue; }
    await setDoc(ref, { name: org.name, type: org.type, orgId: org.id, createdAt: serverTimestamp() });
    created.push(org.id);
  }
  return { created, existing };
}

export type MemberInput = {
  role: OrgRole;
  displayName: string;
  licenseType?: LicenseType;
  licenseNumber?: string;
  licenseClass?: LicenseClass;
};

/**
 * Ajoute (ou met à jour) un membre : la fiche `members` fait foi pour les règles; les champs
 * `orgIds` / `schoolOrgId` / `mroOrgId` de users/{uid} ne sont qu'une commodité pour le client.
 */
export async function addOrgMember(orgId: string, orgType: OrgType, userId: string, input: MemberInput) {
  const batch = writeBatch(db);
  batch.set(doc(db, "organizations", orgId, "members", userId), {
    userId, orgId, role: input.role, active: true, displayName: input.displayName,
    ...(input.licenseType ? { licenseType: input.licenseType } : {}),
    ...(input.licenseNumber ? { licenseNumber: input.licenseNumber } : {}),
    ...(input.licenseClass ? { licenseClass: input.licenseClass } : {}),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  batch.update(doc(db, "users", userId), {
    orgIds: arrayUnion(orgId),
    ...(orgType === "school" ? { schoolOrgId: orgId } : { mroOrgId: orgId }),
  });
  await batch.commit();
}

/** Licence (ACA/SCA/AS) et classe d'un technicien : copiées dans chaque signature au moment de signer. */
export async function updateMemberLicense(orgId: string, userId: string, license: { licenseType: LicenseType; licenseNumber: string; licenseClass: LicenseClass }) {
  await updateDoc(doc(db, "organizations", orgId, "members", userId), { ...license, updatedAt: serverTimestamp() });
}

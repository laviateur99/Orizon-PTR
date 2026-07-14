import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type FirestoreError,
  type Unsubscribe
} from "firebase/firestore";
import { db } from "@/services/firebase/client";
import type { Aircraft } from "./types";

export type ManagedResourceType = "Simulateur" | "Local";

export type ManagedResource = {
  id: string;
  name: string;
  resourceType: ManagedResourceType;
  detail: string;
  active: boolean;
};

export type ResourceHandlers<T> = {
  next: (items: T[]) => void;
  error: (error: FirestoreError) => void;
};

export function subscribeManagedResources(
  handlers: ResourceHandlers<ManagedResource>
): Unsubscribe {
  return onSnapshot(
    collection(db, "resources"),
    snapshot => {
      handlers.next(
        snapshot.docs.map(item => {
          const data = item.data();
          const resourceKind =
            data.resourceKind === "simulator" ? "Simulateur" : "Local";
          return {
            id: item.id,
            name: typeof data.name === "string" ? data.name : item.id,
            resourceType: resourceKind,
            detail:
              typeof data.detail === "string" ? data.detail : resourceKind,
            active:
              typeof data.active === "boolean" ? data.active : true
          };
        })
      );
    },
    handlers.error
  );
}

export async function saveManagedResource(value: ManagedResource) {
  await setDoc(
    doc(db, "resources", value.id),
    {
      name: value.name,
      resourceKind:
        value.resourceType === "Simulateur" ? "simulator" : "room",
      typeLabel: value.resourceType,
      detail: value.detail,
      active: value.active,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function removeManagedResource(id: string) {
  await deleteDoc(doc(db, "resources", id));
}

export async function removeAircraft(id: string) {
  await deleteDoc(doc(db, "aircraft", id));
}

export function newAircraftTemplate(): Aircraft {
  return {
    id: `AIRCRAFT-${Date.now()}`,
    registration: "",
    manufacturer: "",
    model: "",
    typeLabel: "",
    status: "Disponible",
    active: true,
    maintenanceStart: "",
    maintenanceEnd: "",
    statusReason: ""
  };
}

export function newResourceTemplate(
  type: ManagedResourceType = "Local"
): ManagedResource {
  return {
    id: `RESOURCE-${Date.now()}`,
    name: "",
    resourceType: type,
    detail: type,
    active: true
  };
}

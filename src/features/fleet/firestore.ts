import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type FirestoreError,
  type Unsubscribe
} from "firebase/firestore";
import { db } from "@/services/firebase/client";
import { ORIZON_AIRCRAFT } from "./seed";
import type { Aircraft, ImpactedReservation, ImpactResolutionAction, Snag } from "./types";

export type LiveHandlers<T> = {
  next: (items: T[]) => void;
  error: (error: FirestoreError) => void;
};

const text = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const list = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Retire récursivement toutes les valeurs undefined avant un envoi Firestore.
 * Les objets spéciaux Firebase, comme serverTimestamp(), sont conservés tels quels.
 */
function cleanFirestoreValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter(item => item !== undefined)
      .map(item => cleanFirestoreValue(item)) as T;
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, cleanFirestoreValue(item)])
    ) as T;
  }

  return value;
}

function makeSnagNumber(date = new Date()) {
  const year = date.getFullYear();
  const stamp = [
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0")
  ].join("");
  return `SNAG-${year}-${stamp}`;
}

async function addSnagHistory(
  snag: Snag,
  action: string,
  actor: string,
  details: string
) {
  await addDoc(collection(db, "snagHistory"), cleanFirestoreValue({
    action,
    snagId: snag.id,
    snagNumber: snag.snagNumber || "",
    aircraftId: snag.aircraftId,
    aircraftRegistration: snag.aircraftRegistration,
    defectTitle: snag.defectTitle,
    actor,
    details,
    snagSnapshot: snag,
    eventAt: new Date().toISOString(),
    createdAt: serverTimestamp()
  }));
}

export function subscribeAircraft(handlers: LiveHandlers<Aircraft>): Unsubscribe {
  return onSnapshot(
    collection(db, "aircraft"),
    snapshot => handlers.next(snapshot.docs.map(item => {
      const data = item.data();
      return {
        id: item.id,
        registration: text(data.registration, item.id),
        manufacturer: text(data.manufacturer),
        model: text(data.model),
        typeLabel: text(data.typeLabel),
        status: text(data.status, "Disponible") as Aircraft["status"],
        active: typeof data.active === "boolean" ? data.active : true,
        maintenanceStart: text(data.maintenanceStart),
        maintenanceEnd: text(data.maintenanceEnd),
        statusReason: text(data.statusReason),
        blockedForScheduling:
          typeof data.blockedForScheduling === "boolean"
            ? data.blockedForScheduling
            : false
      };
    })),
    handlers.error
  );
}

export function subscribeSnags(handlers: LiveHandlers<Snag>): Unsubscribe {
  return onSnapshot(
    collection(db, "snags"),
    snapshot => handlers.next(snapshot.docs.map(item => {
      const data = item.data();
      return {
        id: item.id,
        snagNumber: text(data.snagNumber),
        aircraftId: text(data.aircraftId),
        aircraftRegistration: text(data.aircraftRegistration),
        reportedAt: text(data.reportedAt),
        reportedBy: text(data.reportedBy),
        reportedByRole: text(data.reportedByRole, "Dispatch") as Snag["reportedByRole"],
        category: text(data.category),
        severity: text(data.severity, "À surveiller") as Snag["severity"],
        defectTitle: text(data.defectTitle),
        description: text(data.description),
        tach: typeof data.tach === "number" ? data.tach : undefined,
        hobbs: typeof data.hobbs === "number" ? data.hobbs : undefined,
        status: text(data.status, "Ouvert") as Snag["status"],
        estimatedReturnDate: text(data.estimatedReturnDate),
        maintenanceNotes: text(data.maintenanceNotes),
        notifyRoles: list(data.notifyRoles) as Snag["notifyRoles"]
      };
    })),
    handlers.error
  );
}

export async function replaceFleet() {
  const existing = await getDocs(collection(db, "aircraft"));
  const batch = writeBatch(db);
  existing.docs.forEach(item => batch.delete(item.ref));
  ORIZON_AIRCRAFT.forEach(aircraft => {
    batch.set(doc(db, "aircraft", aircraft.id), {
      ...aircraft,
      updatedAt: new Date().toISOString()
    });
  });
  await batch.commit();
}

export async function saveAircraft(aircraft: Aircraft) {
  await setDoc(
    doc(db, "aircraft", aircraft.id),
    cleanFirestoreValue({
      ...aircraft,
      updatedAt: new Date().toISOString()
    }),
    { merge: true }
  );
}

export async function createSnag(
  value: Omit<Snag, "id" | "reportedAt" | "status" | "snagNumber">
) {
  const now = new Date();
  const reportedAt = now.toISOString();
  const snagNumber = makeSnagNumber(now);

  const payload = cleanFirestoreValue({
    ...value,
    snagNumber,
    reportedAt,
    status: "Ouvert",
    createdAt: serverTimestamp(),
    updatedAt: reportedAt
  });

  const reference = await addDoc(collection(db, "snags"), payload);

  const completeSnag: Snag = {
    ...value,
    id: reference.id,
    snagNumber,
    reportedAt,
    status: "Ouvert"
  };

  await addDoc(collection(db, "notifications"), cleanFirestoreValue({
    type: "SNAG",
    title: `${snagNumber} · ${value.aircraftRegistration} — ${value.defectTitle}`,
    message: value.description,
    targetRoles: value.notifyRoles,
    aircraftId: value.aircraftId,
    snagId: reference.id,
    createdAt: reportedAt,
    readBy: []
  }));

  await addSnagHistory(
    completeSnag,
    "Création",
    value.reportedBy,
    `SNAG signalé par ${value.reportedByRole}`
  );

  const blocked =
    value.severity !== "À surveiller" &&
    value.severity !== "Cosmétique";

  await updateDoc(doc(db, "aircraft", value.aircraftId), {
    status: "SNAG",
    statusReason: `${snagNumber} · ${value.defectTitle}: ${value.description}`,
    maintenanceStart: reportedAt.slice(0, 10),
    maintenanceEnd: value.estimatedReturnDate || "",
    blockedForScheduling: blocked,
    updatedAt: reportedAt
  });
  return {id:reference.id,snagNumber,completeSnag};
}

export async function updateSnag(
  id: string,
  patch: Partial<Snag>,
  actor = "Tableau des SNAG"
) {
  const snapshot = await getDocs(query(collection(db, "snags"), where("__name__", "==", id)));
  const currentDoc = snapshot.docs[0];
  const currentData = currentDoc?.data();

  await updateDoc(
    doc(db, "snags", id),
    cleanFirestoreValue({
      ...patch,
      updatedAt: new Date().toISOString()
    })
  );

  if (currentData) {
    const current: Snag = {
      id,
      snagNumber: text(currentData.snagNumber),
      aircraftId: text(currentData.aircraftId),
      aircraftRegistration: text(currentData.aircraftRegistration),
      reportedAt: text(currentData.reportedAt),
      reportedBy: text(currentData.reportedBy),
      reportedByRole: text(currentData.reportedByRole, "Dispatch") as Snag["reportedByRole"],
      category: text(currentData.category),
      severity: text(currentData.severity, "À surveiller") as Snag["severity"],
      defectTitle: text(currentData.defectTitle),
      description: text(currentData.description),
      tach: typeof currentData.tach === "number" ? currentData.tach : undefined,
      hobbs: typeof currentData.hobbs === "number" ? currentData.hobbs : undefined,
      status: text(currentData.status, "Ouvert") as Snag["status"],
      estimatedReturnDate: text(currentData.estimatedReturnDate),
      maintenanceNotes: text(currentData.maintenanceNotes),
      notifyRoles: list(currentData.notifyRoles) as Snag["notifyRoles"]
    };

    const updated = cleanFirestoreValue({ ...current, ...patch }) as Snag;
    await addSnagHistory(
      updated,
      "Modification",
      actor,
      patch.status ? `Statut changé à ${patch.status}` : "Dossier modifié"
    );
  }
}

export async function closeSnag(snag: Snag, actor = "Maintenance") {
  const now = new Date().toISOString();

  await updateDoc(doc(db, "snags", snag.id), {
    status: "Fermé",
    updatedAt: now
  });

  await addSnagHistory(
    { ...snag, status: "Fermé" },
    "Fermeture",
    actor,
    "Avion remis en service"
  );

  await updateDoc(doc(db, "aircraft", snag.aircraftId), {
    status: "Disponible",
    statusReason: "",
    maintenanceStart: "",
    maintenanceEnd: "",
    blockedForScheduling: false,
    updatedAt: now
  });
}

export type SnagDashboardAccess = {
  allowedRoles: string[];
};

export function subscribeSnagDashboardAccess(
  next: (value: SnagDashboardAccess) => void,
  error: (error: FirestoreError) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, "settings", "snagDashboardAccess"),
    snapshot => {
      const data = snapshot.data();
      const allowedRoles = Array.isArray(data?.allowedRoles)
        ? data.allowedRoles.filter(
            (item): item is string => typeof item === "string"
          )
        : ["Maintenance", "Directeur de maintenance", "Administrateur"];
      next({ allowedRoles });
    },
    error
  );
}

export async function saveSnagDashboardAccess(allowedRoles: string[]) {
  await setDoc(
    doc(db, "settings", "snagDashboardAccess"),
    {
      allowedRoles,
      updatedAt: new Date().toISOString()
    },
    { merge: true }
  );
}

export async function deleteSnagAsAdmin(
  snag: Snag,
  adminName: string,
  reason: string
) {
  const now = new Date().toISOString();

  // Le snapshot est nettoyé récursivement. Aucun champ undefined ne peut atteindre Firestore.
  const cleanedSnapshot = cleanFirestoreValue(snag);

  await addDoc(collection(db, "snagHistory"), cleanFirestoreValue({
    action: "Suppression administrative",
    snagId: snag.id,
    snagNumber: snag.snagNumber || "",
    aircraftId: snag.aircraftId,
    aircraftRegistration: snag.aircraftRegistration,
    defectTitle: snag.defectTitle,
    snagSnapshot: cleanedSnapshot,
    actor: adminName,
    deletedBy: adminName,
    details: reason,
    reason,
    deletedAt: now,
    eventAt: now,
    createdAt: serverTimestamp()
  }));

  const notifications = await getDocs(
    query(collection(db, "notifications"), where("snagId", "==", snag.id))
  );

  const batch = writeBatch(db);
  notifications.docs.forEach(item => batch.delete(item.ref));
  batch.delete(doc(db, "snags", snag.id));
  await batch.commit();

  const remaining = await getDocs(
    query(collection(db, "snags"), where("aircraftId", "==", snag.aircraftId))
  );

  const hasOpen = remaining.docs.some(
    item => String(item.data().status) !== "Fermé"
  );

  if (!hasOpen) {
    await updateDoc(doc(db, "aircraft", snag.aircraftId), {
      status: "Disponible",
      statusReason: "",
      maintenanceStart: "",
      maintenanceEnd: "",
      blockedForScheduling: false,
      updatedAt: now
    });
  }
}

export type SnagHistoryItem = {
  id: string;
  snagNumber: string;
  aircraftRegistration: string;
  defectTitle: string;
  action: string;
  actor: string;
  details: string;
  eventAt: string;
  deletedBy: string;
  reason: string;
  deletedAt: string;
};

export function subscribeSnagHistory(
  next: (items: SnagHistoryItem[]) => void,
  error: (value: FirestoreError) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, "snagHistory"),
    snapshot => {
      next(
        snapshot.docs
          .map(item => {
            const data = item.data();
            const snag =
              data.snagSnapshot &&
              typeof data.snagSnapshot === "object"
                ? data.snagSnapshot as Record<string, unknown>
                : {};

            return {
              id: item.id,
              snagNumber:
                text(data.snagNumber) || text(snag.snagNumber),
              aircraftRegistration:
                text(data.aircraftRegistration) ||
                text(snag.aircraftRegistration),
              defectTitle:
                text(data.defectTitle) || text(snag.defectTitle),
              action: text(data.action),
              actor:
                text(data.actor) ||
                text(data.deletedBy),
              details:
                text(data.details) ||
                text(data.reason),
              eventAt:
                text(data.eventAt) ||
                text(data.deletedAt),
              deletedBy: text(data.deletedBy),
              reason: text(data.reason),
              deletedAt: text(data.deletedAt)
            };
          })
          .sort((a, b) => b.eventAt.localeCompare(a.eventAt))
      );
    },
    error
  );
}

function reservationMinutes(v:unknown,f:number){if(typeof v==="number"&&Number.isFinite(v))return v;if(typeof v!=="string"||!/^\d{1,2}:\d{2}$/.test(v))return f;const[h,m]=v.split(":").map(Number);return h*60+m}
export async function findImpactedReservations(aircraftId:string,fromDate=new Date().toISOString().slice(0,10)):Promise<ImpactedReservation[]>{const snap=await getDocs(query(collection(db,"reservations"),where("aircraftId","==",aircraftId)));return snap.docs.map(i=>{const d=i.data();return{id:i.id,date:text(d.date),startMinutes:reservationMinutes(d.startMinutes??d.startTime,0),endMinutes:reservationMinutes(d.endMinutes??d.endTime,0),title:text(d.title)||text(d.lesson)||text(d.type,"Vol"),studentId:text(d.studentId),studentName:text(d.studentName)||text(d.student),instructorId:text(d.instructorId),aircraftId:text(d.aircraftId),status:text(d.status,"Planifié")}}).filter(x=>x.date>=fromDate&&!["Complété","Annulé"].includes(x.status)).sort((a,b)=>a.date.localeCompare(b.date)||a.startMinutes-b.startMinutes)}
export async function resolveImpactedReservation(r:ImpactedReservation,action:ImpactResolutionAction,replacementAircraftId:string,dispatchName:string,notes:string,snagId:string,snagNumber:string){const now=new Date().toISOString(),base={disruptionAction:action,disruptionNotes:notes,disruptedBy:dispatchName,disruptedAt:now,relatedSnagId:snagId,relatedSnagNumber:snagNumber,updatedAt:serverTimestamp()};if(action==="Déplacer vers un autre avion"){if(!replacementAircraftId)throw new Error("Sélectionne un avion de remplacement.");await updateDoc(doc(db,"reservations",r.id),{...base,aircraftId:replacementAircraftId,resourceId:replacementAircraftId,disruptionStatus:"Déplacé"})}else if(action==="Annuler le vol"){await updateDoc(doc(db,"reservations",r.id),{...base,status:"Annulé",disruptionStatus:"Annulé"})}else await updateDoc(doc(db,"reservations",r.id),{...base,disruptionStatus:action==="À décider plus tard"?"En attente":"Avis envoyé"});await addDoc(collection(db,"operationalNotifications"),cleanFirestoreValue({type:"IMPACT_SNAG",reservationId:r.id,studentId:r.studentId,studentName:r.studentName,instructorId:r.instructorId,originalAircraftId:r.aircraftId,replacementAircraftId:action==="Déplacer vers un autre avion"?replacementAircraftId:"",action,title:`${snagNumber} — ${r.title}`,message:notes||action,targetStudent:action==="Aviser l’élève"||action==="Aviser l’élève et l’instructeur",targetInstructor:action==="Aviser l’instructeur"||action==="Aviser l’élève et l’instructeur",createdBy:dispatchName,createdAt:now,relatedSnagId:snagId,relatedSnagNumber:snagNumber}));await addDoc(collection(db,"snagHistory"),cleanFirestoreValue({action:"Gestion d’un vol affecté",snagId,snagNumber,aircraftId:r.aircraftId,aircraftRegistration:r.aircraftId,defectTitle:r.title,actor:dispatchName,details:`${action}${replacementAircraftId?` — ${replacementAircraftId}`:""}${notes?` — ${notes}`:""}`,reservationId:r.id,eventAt:now,createdAt:serverTimestamp()}))}

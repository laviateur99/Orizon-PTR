import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type FirestoreError,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/services/firebase/client";
import { app } from "@/services/firebase/client";
import {
  collection as liteCollection,
  doc as liteDoc,
  getFirestore as getLiteFirestore,
  serverTimestamp as liteServerTimestamp,
  writeBatch as writeLiteBatch,
} from "firebase/firestore/lite";
import {
  dateTimeToFirestoreTimestamp,
  firestoreDateTimeToDate,
  firestoreDateTimeToIso,
  firestoreDateTimeToLocalInput,
  timeInputToMinutes,
} from "@/lib/quebecDateTime";
import { ORIZON_AIRCRAFT } from "./seed";
import type {
  Aircraft,
  ImpactedReservation,
  ImpactResolutionAction,
  MaintenanceHistory,
  MaintenanceTask,
  MaintenanceWorkOrder,
  Snag,
} from "./types";

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
      .filter((item) => item !== undefined)
      .map((item) => cleanFirestoreValue(item)) as T;
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, cleanFirestoreValue(item)]),
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
    String(date.getSeconds()).padStart(2, "0"),
  ].join("");
  return `SNAG-${year}-${stamp}`;
}

async function addSnagHistory(
  snag: Snag,
  action: string,
  actor: string,
  details: string,
) {
  await addDoc(
    collection(db, "snagHistory"),
    cleanFirestoreValue({
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
      createdAt: serverTimestamp(),
    }),
  );
}

export function subscribeAircraft(
  handlers: LiveHandlers<Aircraft>,
): Unsubscribe {
  return onSnapshot(
    collection(db, "aircraft"),
    (snapshot) =>
      handlers.next(
        snapshot.docs.map((item) => {
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
                : false,
            hobbsTotal:
              typeof data.hobbsTotal === "number" ? data.hobbsTotal : 0,
            airTimeTotal:
              typeof data.airTimeTotal === "number" ? data.airTimeTotal : 0,
            maintenanceStartAt: firestoreDateTimeToIso(data.maintenanceStartAt),
            expectedReturnAt: firestoreDateTimeToIso(data.expectedReturnAt),
            actualReturnAt: firestoreDateTimeToIso(data.actualReturnAt),
            maintenanceTitle: text(data.maintenanceTitle),
            maintenanceNotes: text(data.maintenanceNotes),
            returnedToServiceBy: text(data.returnedToServiceBy),
            returnedToServiceAt:
              firestoreDateTimeToIso(data.returnedToServiceAt) || undefined,
          };
        }),
      ),
    handlers.error,
  );
}

export function subscribeMaintenanceTasks(
  handlers: LiveHandlers<MaintenanceTask>,
): Unsubscribe {
  return onSnapshot(
    collection(db, "maintenanceTasks"),
    (snapshot) =>
      handlers.next(
        snapshot.docs.map((item) => {
          const data = item.data();
          return {
            id: item.id,
            aircraftId: text(data.aircraftId),
            title: text(data.title),
            category: text(data.category),
            dueBasis: text(
              data.dueBasis,
              "Air Time",
            ) as MaintenanceTask["dueBasis"],
            dueAirTime:
              typeof data.dueAirTime === "number" ? data.dueAirTime : undefined,
            dueDate: text(data.dueDate) || undefined,
            warningHours:
              typeof data.warningHours === "number"
                ? data.warningHours
                : undefined,
            warningDays:
              typeof data.warningDays === "number"
                ? data.warningDays
                : undefined,
            completed: data.completed === true,
            notApplicable: data.notApplicable === true,
            toleranceHours:
              typeof data.toleranceHours === "number"
                ? data.toleranceHours
                : undefined,
            toleranceMonths:
              typeof data.toleranceMonths === "number"
                ? data.toleranceMonths
                : undefined,
            toleranceRequiresInspection:
              data.toleranceRequiresInspection === true,
            toleranceAuthorized: data.toleranceAuthorized === true,
            intervalHours:
              typeof data.intervalHours === "number"
                ? data.intervalHours
                : undefined,
            intervalDays:
              typeof data.intervalDays === "number"
                ? data.intervalDays
                : undefined,
            intervalMonths:
              typeof data.intervalMonths === "number"
                ? data.intervalMonths
                : undefined,
            lastCompletedAirTime:
              typeof data.lastCompletedAirTime === "number"
                ? data.lastCompletedAirTime
                : undefined,
            lastCompletedDate: text(data.lastCompletedDate) || undefined,
            sourceSheet: text(data.sourceSheet) || undefined,
            sourceRow:
              typeof data.sourceRow === "number" ? data.sourceRow : undefined,
          };
        }),
      ),
    handlers.error,
  );
}

export function subscribeMaintenanceHistory(
  aircraftId: string,
  handlers: LiveHandlers<MaintenanceHistory>,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, "maintenanceHistory"),
      where("aircraftId", "==", aircraftId),
    ),
    (snapshot) =>
      handlers.next(
        snapshot.docs
          .map(
            (item) => ({ id: item.id, ...item.data() }) as MaintenanceHistory,
          )
          .sort((a, b) => b.eventAt.localeCompare(a.eventAt)),
      ),
    handlers.error,
  );
}

export function subscribeAllMaintenanceHistory(
  handlers: LiveHandlers<MaintenanceHistory>,
): Unsubscribe {
  return onSnapshot(
    collection(db, "maintenanceHistory"),
    (snapshot) =>
      handlers.next(
        snapshot.docs
          .map((item) => {
            const data = item.data();
            return {
              id: item.id,
              ...data,
              eventAt:
                firestoreDateTimeToIso(data.eventAt) || text(data.eventAt),
              actorId: text(data.actorId),
              actorName: text(data.actorName),
              actorRole: text(data.actorRole),
              aircraftId: text(data.aircraftId),
              aircraftRegistration: text(data.aircraftRegistration),
              action: text(data.action),
              reason: text(data.reason) || undefined,
            } as MaintenanceHistory;
          })
          .sort((a, b) => b.eventAt.localeCompare(a.eventAt)),
      ),
    handlers.error,
  );
}

const assignee = (value: unknown): MaintenanceWorkOrder["prm"] => {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>,
    uid = text(item.uid),
    name = text(item.name);
  return uid || name ? { uid, name } : undefined;
};
const maintenancePriority = (value: unknown): MaintenanceWorkOrder["priority"] => {
  const current = text(value, "Normale");
  if (current === "Urgente") return "Critique";
  if (current === "Surveillance") return "Haute";
  return ["Critique", "Haute", "Normale", "Basse"].includes(current)
    ? (current as MaintenanceWorkOrder["priority"])
    : "Normale";
};
const rtsActor = (value: unknown): MaintenanceWorkOrder["workCompletedBy"] => {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  return {
    uid: text(item.uid),
    name: text(item.name),
    role: text(item.role),
    at: firestoreDateTimeToIso(item.at) || text(item.at),
  };
};

export function subscribeMaintenanceWorkOrders(
  handlers: LiveHandlers<MaintenanceWorkOrder>,
): Unsubscribe {
  return onSnapshot(
    collection(db, "maintenanceWorkOrders"),
    (snapshot) =>
      handlers.next(
        snapshot.docs
          .map((item) => {
            const data = item.data();
            return {
              id: item.id,
              aircraftId: text(data.aircraftId),
              aircraftRegistration: text(data.aircraftRegistration),
              aircraftType: text(data.aircraftType),
              maintenanceTaskId: text(data.maintenanceTaskId) || undefined,
              snagId: text(data.snagId) || undefined,
              title: text(data.title),
              description: text(data.description) || undefined,
              source: text(
                data.source,
                "Intervention manuelle",
              ) as MaintenanceWorkOrder["source"],
              priority: maintenancePriority(data.priority),
              dueAirTime:
                typeof data.dueAirTime === "number"
                  ? data.dueAirTime
                  : undefined,
              dueDate: text(data.dueDate) || undefined,
              prm: assignee(data.prm),
              dom: assignee(data.dom),
              technician: assignee(data.technician),
              workStatus: text(
                data.workStatus,
                "Planifiée",
              ) as MaintenanceWorkOrder["workStatus"],
              assignedAt: firestoreDateTimeToIso(data.assignedAt) || undefined,
              plannedStartAt:
                firestoreDateTimeToIso(data.plannedStartAt) || undefined,
              plannedEndAt:
                firestoreDateTimeToIso(data.plannedEndAt) || undefined,
              actualStartAt:
                firestoreDateTimeToIso(data.actualStartAt) || undefined,
              workCompletedBy: rtsActor(data.workCompletedBy),
              workCompletedAt:
                firestoreDateTimeToIso(data.workCompletedAt) || undefined,
              inspectionRequired: data.inspectionRequired === true,
              inspectionPerformedBy: rtsActor(data.inspectionPerformedBy),
              inspectionResult:
                text(data.inspectionResult) === "Accepté" ||
                text(data.inspectionResult) === "Refusé"
                  ? (text(data.inspectionResult) as "Accepté" | "Refusé")
                  : undefined,
              rtsAuthorizedBy: rtsActor(data.rtsAuthorizedBy),
              returnedToServiceAt:
                firestoreDateTimeToIso(data.returnedToServiceAt) || undefined,
              rtsComments: text(data.rtsComments) || undefined,
              inspectionCompletedAt:
                firestoreDateTimeToIso(data.inspectionCompletedAt) || undefined,
              approvedForReturnAt:
                firestoreDateTimeToIso(data.approvedForReturnAt) || undefined,
              closedAt: firestoreDateTimeToIso(data.closedAt) || undefined,
              followUpComments: text(data.followUpComments) || undefined,
              schedulerReservationId:
                text(data.schedulerReservationId) || undefined,
              createdBy: (data.createdBy && typeof data.createdBy === "object"
                ? data.createdBy
                : {
                    uid: "",
                    name: "",
                    role: "",
                  }) as MaintenanceWorkOrder["createdBy"],
              createdAt: text(data.createdAt),
              updatedBy: (data.updatedBy && typeof data.updatedBy === "object"
                ? data.updatedBy
                : undefined) as MaintenanceWorkOrder["updatedBy"],
              updatedAt: text(data.updatedAt),
              documents: Array.isArray(data.documents) ? data.documents : undefined,
            };
          })
          .sort((a, b) =>
            a.workStatus === "Fermée" && b.workStatus !== "Fermée"
              ? 1
              : b.workStatus === "Fermée" && a.workStatus !== "Fermée"
                ? -1
                : (a.plannedStartAt || "9999").localeCompare(
                    b.plannedStartAt || "9999",
                  ),
          ),
      ),
    handlers.error,
  );
}

type MaintenanceActor = { id: string; name: string; role: string };
const responsible = (order: MaintenanceWorkOrder) =>
  JSON.stringify({
    prm: order.prm || null,
    dom: order.dom || null,
    technician: order.technician || null,
  });
const snagStatusForWorkOrder = (
  status: MaintenanceWorkOrder["workStatus"],
): Snag["status"] => {
  if (status === "Annulée") return "Ouvert";
  if (status === "En attente de pièces") return "Pièces commandées";
  if (
    [
      "Inspection requise",
      "Inspection complétée",
    ].includes(status)
  )
    return "Essai en vol";
  if (
    ["Autorisée pour retour en service", "Fermée"].includes(status)
  )
    return "Fermé";
  if (
    [
      "En cours",
      "Suspendue",
      "Travail terminé",
      "Retour en service refusé",
    ].includes(status)
  )
    return "En réparation";
  return "Pris en charge";
};
const rtsActorForWrite = (value: MaintenanceWorkOrder["workCompletedBy"]) =>
  value
    ? { ...value, at: firestoreDateTimeToDate(value.at) || value.at }
    : undefined;
async function writeMaintenanceWorkOrder(
  order: MaintenanceWorkOrder,
  actor: MaintenanceActor,
  reason: string,
  previous: MaintenanceWorkOrder | undefined,
  action: string,
) {
  if (!reason.trim()) throw new Error("La raison est obligatoire.");
  const liteDb = getLiteFirestore(app);
  const now = new Date().toISOString(),
    ref = liteDoc(liteDb, "maintenanceWorkOrders", order.id);
  const schedulerReservationId =
    order.schedulerReservationId ||
    previous?.schedulerReservationId ||
    (order.plannedStartAt && order.plannedEndAt
      ? `maintenance-${order.id}`
      : undefined);
  const next: MaintenanceWorkOrder = {
    ...order,
    schedulerReservationId,
    updatedBy: { uid: actor.id, name: actor.name, role: actor.role },
    updatedAt: now,
  };
  let remainingOpenSnag:
    | { snagNumber: string; defectTitle: string }
    | undefined;
  if (
    next.workStatus === "Autorisée pour retour en service" &&
    previous?.workStatus !== next.workStatus
  ) {
    const aircraftSnags = await getDocs(
      query(
        collection(db, "snags"),
        where("aircraftId", "==", next.aircraftId),
      ),
    );
    const other = aircraftSnags.docs.find(
      (item) =>
        item.id !== next.snagId && text(item.data().status) !== "Fermé",
    );
    if (other)
      remainingOpenSnag = {
        snagNumber: text(other.data().snagNumber, "SNAG"),
        defectTitle: text(other.data().defectTitle, "Défectuosité"),
      };
  }
  const changedFields = (
    Object.keys(next) as Array<keyof MaintenanceWorkOrder>
  ).filter(
    (key) => JSON.stringify(previous?.[key]) !== JSON.stringify(next[key]),
  );
  const batch = writeLiteBatch(liteDb);
  batch.set(
    ref,
    cleanFirestoreValue({
      ...next,
      assignedAt: firestoreDateTimeToDate(next.assignedAt),
      plannedStartAt: firestoreDateTimeToDate(next.plannedStartAt),
      plannedEndAt: firestoreDateTimeToDate(next.plannedEndAt),
      actualStartAt: firestoreDateTimeToDate(next.actualStartAt),
      workCompletedBy: rtsActorForWrite(next.workCompletedBy),
      workCompletedAt: firestoreDateTimeToDate(next.workCompletedAt),
      inspectionPerformedBy: rtsActorForWrite(next.inspectionPerformedBy),
      rtsAuthorizedBy: rtsActorForWrite(next.rtsAuthorizedBy),
      returnedToServiceAt: firestoreDateTimeToDate(next.returnedToServiceAt),
      inspectionCompletedAt: firestoreDateTimeToDate(
        next.inspectionCompletedAt,
      ),
      approvedForReturnAt: firestoreDateTimeToDate(next.approvedForReturnAt),
      closedAt: firestoreDateTimeToDate(next.closedAt),
      ...(!previous ? { createdAtServer: liteServerTimestamp() } : {}),
      updatedAtServer: liteServerTimestamp(),
    }),
    { merge: true },
  );
  const groundsAircraft = [
    "En cours",
    "Travail terminé",
    "En attente de pièces",
    "Suspendue",
    "Inspection requise",
    "Inspection complétée",
    "Retour en service refusé",
  ].includes(next.workStatus);
  if (groundsAircraft) {
    batch.set(
      liteDoc(liteDb, "aircraft", next.aircraftId),
      {
        status: "En maintenance",
        blockedForScheduling: true,
        maintenanceTitle: next.title,
        statusReason: next.title,
        maintenanceStartAt:
          firestoreDateTimeToDate(next.actualStartAt) || new Date(),
        expectedReturnAt: firestoreDateTimeToDate(next.plannedEndAt),
        updatedAt: liteServerTimestamp(),
      },
      { merge: true },
    );
  }
  if (
    next.workStatus === "Autorisée pour retour en service" &&
    previous?.workStatus !== next.workStatus
  ) {
    batch.set(
      liteDoc(liteDb, "aircraft", next.aircraftId),
      remainingOpenSnag
        ? {
            status: "SNAG",
            blockedForScheduling: true,
            actualReturnAt:
              firestoreDateTimeToDate(next.returnedToServiceAt) || new Date(),
            returnedToServiceBy: next.rtsAuthorizedBy?.name || actor.name,
            returnedToServiceAt:
              firestoreDateTimeToDate(next.returnedToServiceAt) || new Date(),
            maintenanceTitle: "",
            maintenanceNotes: "",
            statusReason: `${remainingOpenSnag.snagNumber} · ${remainingOpenSnag.defectTitle}`,
            updatedAt: liteServerTimestamp(),
          }
        : {
            status: "Disponible",
            blockedForScheduling: false,
        actualReturnAt:
          firestoreDateTimeToDate(next.returnedToServiceAt) || new Date(),
        returnedToServiceBy: next.rtsAuthorizedBy?.name || actor.name,
        returnedToServiceAt:
          firestoreDateTimeToDate(next.returnedToServiceAt) || new Date(),
        maintenanceTitle: "",
        maintenanceNotes: "",
        statusReason: "",
        updatedAt: liteServerTimestamp(),
          },
      { merge: true },
    );
  }
  const previousSchedule = previous
      ? `${firestoreDateTimeToLocalInput(previous.plannedStartAt)} - ${firestoreDateTimeToLocalInput(previous.plannedEndAt)}`
      : "",
    newSchedule = `${firestoreDateTimeToLocalInput(next.plannedStartAt)} - ${firestoreDateTimeToLocalInput(next.plannedEndAt)}`,
    scheduleChanged = previousSchedule !== newSchedule;
  let schedulerPayload: Record<string, unknown> | undefined;
  if (schedulerReservationId) {
    const start = firestoreDateTimeToLocalInput(next.plannedStartAt),
      plannedEnd = firestoreDateTimeToLocalInput(next.plannedEndAt),
      isHistorical = [
        "Autorisée pour retour en service",
        "Fermée",
      ].includes(next.workStatus),
      historicalEnd = isHistorical
        ? firestoreDateTimeToLocalInput(next.returnedToServiceAt) || plannedEnd
        : plannedEnd,
      visible =
        Boolean(start && historicalEnd) && next.workStatus !== "Annulée";
    schedulerPayload = cleanFirestoreValue(
      visible
        ? {
              date: start.slice(0, 10),
              rangeEndDate: historicalEnd.slice(0, 10),
              startAt: firestoreDateTimeToDate(next.plannedStartAt),
              endAt:
                (isHistorical &&
                  firestoreDateTimeToDate(next.returnedToServiceAt)) ||
                firestoreDateTimeToDate(next.plannedEndAt),
              resourceId: next.aircraftId,
              aircraftId: next.aircraftId,
              type: "Maintenance",
              reservationType: "Maintenance",
              source: "maintenanceWorkOrder",
              maintenanceWorkOrderId: next.id,
              title: next.title,
              lesson: next.title,
              notes: next.description || next.followUpComments || "",
              startMinutes: timeInputToMinutes(start.slice(11, 16)) || 0,
              endMinutes:
                timeInputToMinutes(historicalEnd.slice(11, 16)) || 0,
              startTime: start.slice(11, 16),
              endTime: historicalEnd.slice(11, 16),
              prmName: next.prm?.name || "",
              technicianName: next.technician?.name || "",
              status: isHistorical ? "Complété" : "Planifié",
              updatedAt: liteServerTimestamp(),
              ...(!previous ? { createdAt: liteServerTimestamp() } : {}),
          }
        : { status: "Annulé", updatedAt: liteServerTimestamp() },
    );
    batch.set(
      liteDoc(liteDb, "reservations", schedulerReservationId),
      schedulerPayload,
      { merge: true },
    );
  }
  if (next.source === "SNAG" && next.snagId) {
    const snagStatus = snagStatusForWorkOrder(next.workStatus),
      returnedToService = snagStatus === "Fermé";
    batch.set(
      liteDoc(liteDb, "snags", next.snagId),
      cleanFirestoreValue({
        workOrderId: next.workStatus === "Annulée" ? "" : next.id,
        status: snagStatus,
        maintenanceNotes: next.followUpComments || next.rtsComments || "",
        ...(returnedToService
          ? {
              resolvedByWorkOrderId: next.id,
              returnedToServiceAt:
                firestoreDateTimeToDate(next.returnedToServiceAt) ||
                new Date(),
              returnedToServiceBy:
                next.rtsAuthorizedBy?.name || actor.name,
            }
          : {}),
        updatedAt: now,
      }),
      { merge: true },
    );
    batch.set(
      liteDoc(liteCollection(liteDb, "snagHistory")),
      cleanFirestoreValue({
        action: returnedToService
          ? "Fermeture par retour en service MCM"
          : previous
            ? "Synchronisation ordre de travail"
            : "Ordre de travail créé",
        snagId: next.snagId,
        aircraftId: next.aircraftId,
        aircraftRegistration: next.aircraftRegistration,
        defectTitle: next.title,
        actor: actor.name,
        actorRole: actor.role,
        details: `${next.id} · ${next.workStatus}`,
        workOrderId: next.id,
        previousWorkStatus: previous?.workStatus || "",
        newWorkStatus: next.workStatus,
        returnedToServiceAt: returnedToService
          ? firestoreDateTimeToDate(next.returnedToServiceAt) || new Date()
          : undefined,
        eventAt: now,
        createdAt: liteServerTimestamp(),
      }),
    );
  }
  const historyActions: string[] = [];
  if (!previous) {
    historyActions.push(action);
    if (next.prm?.name) historyActions.push(`Assignation PRM — ${next.prm.name}`);
    if (next.dom?.name) historyActions.push(`Assignation DOM — ${next.dom.name}`);
    if (next.technician?.name)
      historyActions.push(`Assignation technicien — ${next.technician.name}`);
  } else {
    if (JSON.stringify(previous.prm) !== JSON.stringify(next.prm))
      historyActions.push(`Assignation PRM — ${next.prm?.name || "Non assigné"}`);
    if (JSON.stringify(previous.dom) !== JSON.stringify(next.dom))
      historyActions.push(`Assignation DOM — ${next.dom?.name || "Non assigné"}`);
    if (JSON.stringify(previous.technician) !== JSON.stringify(next.technician))
      historyActions.push(
        `Assignation technicien — ${next.technician?.name || "Non assigné"}`,
      );
    if (scheduleChanged) historyActions.push("Horaire maintenance modifié");
    if (previous.workStatus !== next.workStatus) {
      historyActions.push(
        next.workStatus === "Inspection complétée"
          ? "Inspection complétée"
          : next.workStatus === "Autorisée pour retour en service"
            ? "Retour en service autorisé"
            : next.workStatus === "Fermée"
              ? "Ordre de travail fermé"
              : `Statut modifié — ${previous.workStatus} → ${next.workStatus}`,
      );
    }
    if (!historyActions.length) historyActions.push(action);
  }
  const historyPayload = {
      aircraftId: order.aircraftId,
      aircraftRegistration: order.aircraftRegistration,
      workOrderId: order.id,
      snagId: next.snagId || "",
      changeType:
        previous?.workStatus !== next.workStatus ? "Statut" : "Échéance",
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      reason: reason.trim(),
      previousStatus: previous?.workStatus,
      newStatus: next.workStatus,
      previousResponsible: previous ? responsible(previous) : "",
      newResponsible: responsible(next),
      fieldName: changedFields.join(", "),
      previousValue: previous ? JSON.stringify(previous) : "",
      newValue: JSON.stringify(next),
      previousSchedule,
      newSchedule,
      previousStartAt: previous?.plannedStartAt || "",
      previousEndAt: previous?.plannedEndAt || "",
      newStartAt: next.plannedStartAt || "",
      newEndAt: next.plannedEndAt || "",
      workTitle: next.title,
      workCompletedBy: next.workCompletedBy?.name || "",
      inspectedBy: next.inspectionPerformedBy?.name || "",
      authorizedBy: next.rtsAuthorizedBy?.name || "",
      rtsComments: next.rtsComments || "",
      eventAt: now,
      createdAt: liteServerTimestamp(),
    };
  historyActions.forEach((historyAction) =>
    batch.set(
      liteDoc(liteCollection(liteDb, "maintenanceHistory")),
      cleanFirestoreValue({ ...historyPayload, action: historyAction }),
    ),
  );
  await batch.commit();
}

export async function createMaintenanceWorkOrder(
  order: MaintenanceWorkOrder,
  actor: MaintenanceActor,
  reason: string,
) {
  const current = await getDoc(doc(db, "maintenanceWorkOrders", order.id));
  if (current.exists()) throw new Error("Cet ordre de travail existe déjà.");
  await writeMaintenanceWorkOrder(
    order,
    actor,
    reason,
    undefined,
    `Ordre de travail créé — ${order.title}`,
  );
}

export async function updateMaintenanceWorkOrder(
  order: MaintenanceWorkOrder,
  actor: MaintenanceActor,
  reason: string,
  previous: MaintenanceWorkOrder,
) {
  if (order.workStatus !== previous.workStatus)
    throw new Error(
      "Utilisez la transition de statut pour modifier l’avancement.",
    );
  await writeMaintenanceWorkOrder(
    order,
    actor,
    reason,
    previous,
    `Ordre de travail modifié — ${order.title}`,
  );
}

export async function restoreMaintenanceSchedulerHistory(
  order: MaintenanceWorkOrder,
  actor: MaintenanceActor,
) {
  if (
    !order.schedulerReservationId ||
    !["Autorisée pour retour en service", "Fermée"].includes(
      order.workStatus,
    )
  )
    return;
  const reservation = await getDoc(
    doc(db, "reservations", order.schedulerReservationId),
  );
  if (reservation.exists() && reservation.data().status === "Complété") return;
  const start = firestoreDateTimeToLocalInput(order.plannedStartAt),
    end =
      firestoreDateTimeToLocalInput(order.returnedToServiceAt) ||
      firestoreDateTimeToLocalInput(order.plannedEndAt);
  if (!start || !end) return;
  const batch = writeBatch(db);
  batch.set(
    doc(db, "reservations", order.schedulerReservationId),
    cleanFirestoreValue({
      date: start.slice(0, 10),
      rangeEndDate: end.slice(0, 10),
      startAt: firestoreDateTimeToDate(order.plannedStartAt),
      endAt:
        firestoreDateTimeToDate(order.returnedToServiceAt) ||
        firestoreDateTimeToDate(order.plannedEndAt),
      resourceId: order.aircraftId,
      aircraftId: order.aircraftId,
      type: "Maintenance",
      reservationType: "Maintenance",
      source: "maintenanceWorkOrder",
      maintenanceWorkOrderId: order.id,
      title: order.title,
      lesson: order.title,
      notes: order.description || order.followUpComments || "",
      startMinutes: timeInputToMinutes(start.slice(11, 16)) || 0,
      endMinutes: timeInputToMinutes(end.slice(11, 16)) || 0,
      startTime: start.slice(11, 16),
      endTime: end.slice(11, 16),
      prmName: order.prm?.name || "",
      technicianName: order.technician?.name || "",
      status: "Complété",
      updatedAt: serverTimestamp(),
      ...(!reservation.exists() ? { createdAt: serverTimestamp() } : {}),
    }),
    { merge: true },
  );
  batch.set(
    doc(collection(db, "maintenanceHistory")),
    cleanFirestoreValue({
      aircraftId: order.aircraftId,
      aircraftRegistration: order.aircraftRegistration,
      workOrderId: order.id,
      action: `Créneau Scheduler historique restauré — ${order.title}`,
      changeType: "Horaire",
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      reason:
        "Restauration automatique du créneau historique après retour en service.",
      newStatus: order.workStatus,
      newStartAt: order.plannedStartAt || "",
      newEndAt: order.returnedToServiceAt || order.plannedEndAt || "",
      eventAt: new Date().toISOString(),
      createdAt: serverTimestamp(),
    }),
  );
  await batch.commit();
}

export async function changeMaintenanceWorkOrderStatus(
  order: MaintenanceWorkOrder,
  actor: MaintenanceActor,
  reason: string,
  previous: MaintenanceWorkOrder,
) {
  if (order.workStatus === previous.workStatus)
    throw new Error("Le statut doit changer.");
  await writeMaintenanceWorkOrder(
    order,
    actor,
    reason,
    previous,
    `Statut du travail — ${previous.workStatus} → ${order.workStatus}`,
  );
}

export async function saveMaintenanceTask(
  task: MaintenanceTask,
  actor: { id: string; name: string; role: string },
  reason: string,
  aircraftRegistration: string,
) {
  const ref = doc(db, "maintenanceTasks", task.id),
    current = await getDoc(ref),
    before = current.exists() ? current.data() : {};
  const historyRef = doc(collection(db, "maintenanceHistory")),
    batch = writeBatch(db),
    eventAt = new Date().toISOString();
  batch.set(
    ref,
    cleanFirestoreValue({ ...task, updatedAt: serverTimestamp() }),
    { merge: true },
  );
  batch.set(
    historyRef,
    cleanFirestoreValue({
      aircraftId: task.aircraftId,
      aircraftRegistration,
      action: current.exists()
        ? `Échéance modifiée — ${task.title}`
        : `Échéance ajoutée — ${task.title}`,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      reason,
      taskId: task.id,
      taskTitle: task.title,
      previousDueAirTime:
        typeof before.dueAirTime === "number" ? before.dueAirTime : undefined,
      dueAirTime: task.dueAirTime,
      previousDueDate: text(before.dueDate) || undefined,
      dueDate: task.dueDate,
      previousNotApplicable: before.notApplicable === true,
      notApplicable: task.notApplicable === true,
      previousToleranceAuthorized: before.toleranceAuthorized === true,
      toleranceAuthorized: task.toleranceAuthorized === true,
      taskSnapshot: task,
      eventAt,
      createdAt: serverTimestamp(),
    }),
  );
  await batch.commit();
}

export async function importMaintenanceSeed(seed: {
  aircraftAirTimes: Record<string, number>;
  tasks: MaintenanceTask[];
}) {
  for (const [aircraftId, airTimeTotal] of Object.entries(
    seed.aircraftAirTimes,
  )) {
    const ref = doc(db, "aircraft", aircraftId),
      snapshot = await getDoc(ref);
    if (
      snapshot.exists() &&
      (typeof snapshot.data().airTimeTotal !== "number" ||
        snapshot.data().airTimeTotal === 0)
    ) {
      await setDoc(
        ref,
        {
          airTimeTotal,
          airTimeUpdatedAt: serverTimestamp(),
          airTimeSource: "Excel status maintenance",
        },
        { merge: true },
      );
    }
  }
  for (let start = 0; start < seed.tasks.length; start += 400) {
    const batch = writeBatch(db);
    seed.tasks
      .slice(start, start + 400)
      .forEach((task) =>
        batch.set(
          doc(db, "maintenanceTasks", task.id),
          cleanFirestoreValue({
            ...task,
            importSource: "statut maintenance- flight director.xlsx",
            updatedAt: serverTimestamp(),
          }),
          { merge: true },
        ),
      );
    await batch.commit();
  }
}

export async function updateAircraftMaintenance(
  aircraft: Aircraft,
  actor: { id: string; name: string; role: string },
  reason: string,
  previous?: Aircraft,
) {
  const aircraftRef = doc(db, "aircraft", aircraft.id);
  const historyRef = doc(collection(db, "maintenanceHistory"));
  const previousExpectedReturnAt = previous?.expectedReturnAt || "";
  const changed =
    previousExpectedReturnAt !== (aircraft.expectedReturnAt || "");
  const batch = writeBatch(db);
  batch.set(
    aircraftRef,
    cleanFirestoreValue({
      ...aircraft,
      maintenanceStartAt: dateTimeToFirestoreTimestamp(
        aircraft.maintenanceStartAt,
      ),
      expectedReturnAt: dateTimeToFirestoreTimestamp(aircraft.expectedReturnAt),
      actualReturnAt: dateTimeToFirestoreTimestamp(aircraft.actualReturnAt),
      maintenanceStart: aircraft.maintenanceStartAt?.slice(0, 10) || "",
      maintenanceEnd: aircraft.expectedReturnAt?.slice(0, 10) || "",
      updatedAt: serverTimestamp(),
    }),
    { merge: true },
  );
  batch.set(
    historyRef,
    cleanFirestoreValue({
      aircraftId: aircraft.id,
      aircraftRegistration: aircraft.registration,
      action: changed ? "Retour prévu modifié" : "Maintenance modifiée",
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      reason,
      previousExpectedReturnAt,
      expectedReturnAt: aircraft.expectedReturnAt || "",
      snapshot: aircraft,
      eventAt: new Date().toISOString(),
      createdAt: serverTimestamp(),
    }),
  );
  await batch.commit();
}

export async function returnAircraftToService(
  aircraft: Aircraft,
  actor: { id: string; name: string; role: string },
  reason: string,
) {
  const now = new Date().toISOString();
  await setDoc(
    doc(db, "aircraft", aircraft.id),
    {
      status: "Disponible",
      blockedForScheduling: false,
      actualReturnAt: dateTimeToFirestoreTimestamp(now),
      maintenanceStartAt: null,
      expectedReturnAt: null,
      maintenanceTitle: "",
      maintenanceNotes: "",
      statusReason: "",
      maintenanceStart: "",
      maintenanceEnd: "",
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  await addDoc(collection(db, "maintenanceHistory"), {
    aircraftId: aircraft.id,
    aircraftRegistration: aircraft.registration,
    action: "Retour en service",
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    reason,
    eventAt: now,
    createdAt: serverTimestamp(),
  });
}

export function subscribeSnags(handlers: LiveHandlers<Snag>): Unsubscribe {
  return onSnapshot(
    collection(db, "snags"),
    (snapshot) =>
      handlers.next(
        snapshot.docs.map((item) => {
          const data = item.data();
          return {
            id: item.id,
            snagNumber: text(data.snagNumber),
            aircraftId: text(data.aircraftId),
            aircraftRegistration: text(data.aircraftRegistration),
            reportedAt: text(data.reportedAt),
            reportedBy: text(data.reportedBy),
            reportedByRole: text(
              data.reportedByRole,
              "Dispatch",
            ) as Snag["reportedByRole"],
            category: text(data.category),
            severity: text(data.severity, "À surveiller") as Snag["severity"],
            defectTitle: text(data.defectTitle),
            description: text(data.description),
            tach: typeof data.tach === "number" ? data.tach : undefined,
            hobbs: typeof data.hobbs === "number" ? data.hobbs : undefined,
            status: text(data.status, "Ouvert") as Snag["status"],
            estimatedReturnDate: text(data.estimatedReturnDate),
            maintenanceNotes: text(data.maintenanceNotes),
            workOrderId: text(data.workOrderId) || undefined,
            resolvedByWorkOrderId:
              text(data.resolvedByWorkOrderId) || undefined,
            returnedToServiceAt:
              firestoreDateTimeToIso(data.returnedToServiceAt) || undefined,
            returnedToServiceBy:
              text(data.returnedToServiceBy) || undefined,
            notifyRoles: list(data.notifyRoles) as Snag["notifyRoles"],
          };
        }),
      ),
    handlers.error,
  );
}

export async function replaceFleet() {
  const existing = await getDocs(collection(db, "aircraft"));
  const batch = writeBatch(db);
  existing.docs.forEach((item) => batch.delete(item.ref));
  ORIZON_AIRCRAFT.forEach((aircraft) => {
    batch.set(doc(db, "aircraft", aircraft.id), {
      ...aircraft,
      updatedAt: new Date().toISOString(),
    });
  });
  await batch.commit();
}

export async function saveAircraft(aircraft: Aircraft) {
  await setDoc(
    doc(db, "aircraft", aircraft.id),
    cleanFirestoreValue({
      ...aircraft,
      updatedAt: new Date().toISOString(),
    }),
    { merge: true },
  );
}

export async function initializeAircraftMaintenanceSchedule(
  aircraft: Aircraft,
  calendarType: "C152" | "C172" | "PA31",
  templateTasks: MaintenanceTask[],
  actor: { id: string; name: string; role: string },
) {
  const batch = writeBatch(db);
  const now = new Date().toISOString();
  templateTasks.forEach((template, index) => {
    const id = `calendar-${aircraft.id.replace(/[^A-Za-z0-9]/g, "")}-${String(index + 1).padStart(3, "0")}`;
    batch.set(
      doc(db, "maintenanceTasks", id),
      cleanFirestoreValue({
        ...template,
        id,
        aircraftId: aircraft.id,
        dueAirTime: undefined,
        dueDate: undefined,
        lastCompletedAirTime: undefined,
        lastCompletedDate: undefined,
        toleranceAuthorized: false,
        sourceSheet: `Calendrier initial ${calendarType}`,
        sourceRow: index + 1,
        completed: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });
  batch.set(
    doc(collection(db, "maintenanceHistory")),
    cleanFirestoreValue({
      aircraftId: aircraft.id,
      aircraftRegistration: aircraft.registration,
      action: `Calendrier ${calendarType} appliqué`,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      reason: `Création de l’avion avec ${templateTasks.length} items du calendrier ${calendarType}. Les dernières exécutions et échéances doivent être configurées individuellement.`,
      eventAt: now,
      createdAt: serverTimestamp(),
    }),
  );
  await batch.commit();
}

export async function createSnag(
  value: Omit<Snag, "id" | "reportedAt" | "status" | "snagNumber">,
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
    updatedAt: reportedAt,
  });

  const reference = await addDoc(collection(db, "snags"), payload);

  const completeSnag: Snag = {
    ...value,
    id: reference.id,
    snagNumber,
    reportedAt,
    status: "Ouvert",
  };

  await addDoc(
    collection(db, "notifications"),
    cleanFirestoreValue({
      type: "SNAG",
      title: `${snagNumber} · ${value.aircraftRegistration} — ${value.defectTitle}`,
      message: value.description,
      targetRoles: value.notifyRoles,
      aircraftId: value.aircraftId,
      snagId: reference.id,
      createdAt: reportedAt,
      readBy: [],
    }),
  );

  await addSnagHistory(
    completeSnag,
    "Création",
    value.reportedBy,
    `SNAG signalé par ${value.reportedByRole}`,
  );

  const blocked =
    value.severity !== "À surveiller" && value.severity !== "Cosmétique";

  await updateDoc(doc(db, "aircraft", value.aircraftId), {
    status: "SNAG",
    statusReason: `${snagNumber} · ${value.defectTitle}: ${value.description}`,
    maintenanceStart: reportedAt.slice(0, 10),
    maintenanceEnd: value.estimatedReturnDate || "",
    blockedForScheduling: blocked,
    updatedAt: reportedAt,
  });
  return { id: reference.id, snagNumber, completeSnag };
}

export async function updateSnag(
  id: string,
  patch: Partial<Snag>,
  actor = "Tableau des SNAG",
) {
  const currentDoc = await getDoc(doc(db, "snags", id));
  const currentData = currentDoc.exists() ? currentDoc.data() : undefined;
  if (patch.status === "Fermé")
    throw new Error(
      "Un SNAG doit être fermé par le retour en service de son ordre de travail.",
    );

  await updateDoc(
    doc(db, "snags", id),
    cleanFirestoreValue({
      ...patch,
      updatedAt: new Date().toISOString(),
    }),
  );

  if (currentData) {
    const current: Snag = {
      id,
      snagNumber: text(currentData.snagNumber),
      aircraftId: text(currentData.aircraftId),
      aircraftRegistration: text(currentData.aircraftRegistration),
      reportedAt: text(currentData.reportedAt),
      reportedBy: text(currentData.reportedBy),
      reportedByRole: text(
        currentData.reportedByRole,
        "Dispatch",
      ) as Snag["reportedByRole"],
      category: text(currentData.category),
      severity: text(currentData.severity, "À surveiller") as Snag["severity"],
      defectTitle: text(currentData.defectTitle),
      description: text(currentData.description),
      tach: typeof currentData.tach === "number" ? currentData.tach : undefined,
      hobbs:
        typeof currentData.hobbs === "number" ? currentData.hobbs : undefined,
      status: text(currentData.status, "Ouvert") as Snag["status"],
      estimatedReturnDate: text(currentData.estimatedReturnDate),
      maintenanceNotes: text(currentData.maintenanceNotes),
      workOrderId: text(currentData.workOrderId) || undefined,
      resolvedByWorkOrderId:
        text(currentData.resolvedByWorkOrderId) || undefined,
      returnedToServiceAt:
        firestoreDateTimeToIso(currentData.returnedToServiceAt) || undefined,
      returnedToServiceBy:
        text(currentData.returnedToServiceBy) || undefined,
      notifyRoles: list(currentData.notifyRoles) as Snag["notifyRoles"],
    };

    const updated = cleanFirestoreValue({ ...current, ...patch }) as Snag;
    await addSnagHistory(
      updated,
      "Modification",
      actor,
      patch.status ? `Statut changé à ${patch.status}` : "Dossier modifié",
    );

    if (patch.status) {
      await updateDoc(doc(db, "aircraft", current.aircraftId), {
        status: "SNAG",
        blockedForScheduling: true,
        statusReason: `${current.snagNumber || "SNAG"} · ${current.defectTitle}`,
        updatedAt: new Date().toISOString(),
      });
    }
  }
}

export async function closeSnag(snag: Snag, actor = "Maintenance") {
  void snag;
  void actor;
  throw new Error(
    "Le retour en service doit être autorisé dans l’ordre de travail lié au SNAG.",
  );
}

export type SnagDashboardAccess = {
  allowedRoles: string[];
};

export function subscribeSnagDashboardAccess(
  next: (value: SnagDashboardAccess) => void,
  error: (error: FirestoreError) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, "settings", "snagDashboardAccess"),
    (snapshot) => {
      const data = snapshot.data();
      const allowedRoles = Array.isArray(data?.allowedRoles)
        ? data.allowedRoles.filter(
            (item): item is string => typeof item === "string",
          )
        : ["Maintenance", "Directeur de maintenance", "Administrateur"];
      next({ allowedRoles });
    },
    error,
  );
}

export async function saveSnagDashboardAccess(allowedRoles: string[]) {
  await setDoc(
    doc(db, "settings", "snagDashboardAccess"),
    {
      allowedRoles,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

export async function deleteSnagAsAdmin(
  snag: Snag,
  adminName: string,
  reason: string,
) {
  const now = new Date().toISOString();

  // Le snapshot est nettoyé récursivement. Aucun champ undefined ne peut atteindre Firestore.
  const cleanedSnapshot = cleanFirestoreValue(snag);

  await addDoc(
    collection(db, "snagHistory"),
    cleanFirestoreValue({
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
      createdAt: serverTimestamp(),
    }),
  );

  const notifications = await getDocs(
    query(collection(db, "notifications"), where("snagId", "==", snag.id)),
  );

  const batch = writeBatch(db);
  notifications.docs.forEach((item) => batch.delete(item.ref));
  batch.delete(doc(db, "snags", snag.id));
  await batch.commit();

  const remaining = await getDocs(
    query(collection(db, "snags"), where("aircraftId", "==", snag.aircraftId)),
  );

  const hasOpen = remaining.docs.some(
    (item) => String(item.data().status) !== "Fermé",
  );

  if (!hasOpen) {
    await updateDoc(doc(db, "aircraft", snag.aircraftId), {
      status: "Disponible",
      statusReason: "",
      maintenanceStart: "",
      maintenanceEnd: "",
      blockedForScheduling: false,
      updatedAt: now,
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
  error: (value: FirestoreError) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, "snagHistory"),
    (snapshot) => {
      next(
        snapshot.docs
          .map((item) => {
            const data = item.data();
            const snag =
              data.snagSnapshot && typeof data.snagSnapshot === "object"
                ? (data.snagSnapshot as Record<string, unknown>)
                : {};

            return {
              id: item.id,
              snagNumber: text(data.snagNumber) || text(snag.snagNumber),
              aircraftRegistration:
                text(data.aircraftRegistration) ||
                text(snag.aircraftRegistration),
              defectTitle: text(data.defectTitle) || text(snag.defectTitle),
              action: text(data.action),
              actor: text(data.actor) || text(data.deletedBy),
              details: text(data.details) || text(data.reason),
              eventAt: text(data.eventAt) || text(data.deletedAt),
              deletedBy: text(data.deletedBy),
              reason: text(data.reason),
              deletedAt: text(data.deletedAt),
            };
          })
          .sort((a, b) => b.eventAt.localeCompare(a.eventAt)),
      );
    },
    error,
  );
}

function reservationMinutes(v: unknown, f: number) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string" || !/^\d{1,2}:\d{2}$/.test(v)) return f;
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
}
export async function findImpactedReservations(
  aircraftId: string,
  fromDate = new Date().toISOString().slice(0, 10),
): Promise<ImpactedReservation[]> {
  const snap = await getDocs(
    query(
      collection(db, "reservations"),
      where("aircraftId", "==", aircraftId),
    ),
  );
  return snap.docs
    .map((i) => {
      const d = i.data();
      return {
        id: i.id,
        date: text(d.date),
        startMinutes: reservationMinutes(d.startMinutes ?? d.startTime, 0),
        endMinutes: reservationMinutes(d.endMinutes ?? d.endTime, 0),
        title: text(d.title) || text(d.lesson) || text(d.type, "Vol"),
        studentId: text(d.studentId),
        studentName: text(d.studentName) || text(d.student),
        instructorId: text(d.instructorId),
        aircraftId: text(d.aircraftId),
        status: text(d.status, "Planifié"),
      };
    })
    .filter(
      (x) => x.date >= fromDate && !["Complété", "Annulé"].includes(x.status),
    )
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.startMinutes - b.startMinutes,
    );
}
export async function resolveImpactedReservation(
  r: ImpactedReservation,
  action: ImpactResolutionAction,
  replacementAircraftId: string,
  dispatchName: string,
  notes: string,
  snagId: string,
  snagNumber: string,
) {
  const now = new Date().toISOString(),
    base = {
      disruptionAction: action,
      disruptionNotes: notes,
      disruptedBy: dispatchName,
      disruptedAt: now,
      relatedSnagId: snagId,
      relatedSnagNumber: snagNumber,
      updatedAt: serverTimestamp(),
    };
  if (action === "Déplacer vers un autre avion") {
    if (!replacementAircraftId)
      throw new Error("Sélectionne un avion de remplacement.");
    await updateDoc(doc(db, "reservations", r.id), {
      ...base,
      aircraftId: replacementAircraftId,
      resourceId: replacementAircraftId,
      disruptionStatus: "Déplacé",
    });
  } else if (action === "Annuler le vol") {
    await updateDoc(doc(db, "reservations", r.id), {
      ...base,
      status: "Annulé",
      disruptionStatus: "Annulé",
    });
  } else
    await updateDoc(doc(db, "reservations", r.id), {
      ...base,
      disruptionStatus:
        action === "À décider plus tard" ? "En attente" : "Avis envoyé",
    });
  await addDoc(
    collection(db, "operationalNotifications"),
    cleanFirestoreValue({
      type: "IMPACT_SNAG",
      reservationId: r.id,
      studentId: r.studentId,
      studentName: r.studentName,
      instructorId: r.instructorId,
      originalAircraftId: r.aircraftId,
      replacementAircraftId:
        action === "Déplacer vers un autre avion" ? replacementAircraftId : "",
      action,
      title: `${snagNumber} — ${r.title}`,
      message: notes || action,
      targetStudent:
        action === "Aviser l’élève" ||
        action === "Aviser l’élève et l’instructeur",
      targetInstructor:
        action === "Aviser l’instructeur" ||
        action === "Aviser l’élève et l’instructeur",
      createdBy: dispatchName,
      createdAt: now,
      relatedSnagId: snagId,
      relatedSnagNumber: snagNumber,
    }),
  );
  await addDoc(
    collection(db, "snagHistory"),
    cleanFirestoreValue({
      action: "Gestion d’un vol affecté",
      snagId,
      snagNumber,
      aircraftId: r.aircraftId,
      aircraftRegistration: r.aircraftId,
      defectTitle: r.title,
      actor: dispatchName,
      details: `${action}${replacementAircraftId ? ` — ${replacementAircraftId}` : ""}${notes ? ` — ${notes}` : ""}`,
      reservationId: r.id,
      eventAt: now,
      createdAt: serverTimestamp(),
    }),
  );
}

import { canDeleteReservation } from "./types";
import { readStudentBreakConfirmations } from "@/features/duty/breaks";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type FirestoreError,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/services/firebase/client";
import type {
  Cancellation,
  FlightOperationUpdate,
  SchedulerEvent,
  SchedulerResource,
} from "./types";
import { DEFAULT_SCHEDULER_SETTINGS, type SchedulerSettings } from "./settings";
import {
  firestoreDateTimeToIso,
  firestoreDateTimeToLocalInput,
  dateTimeToFirestoreTimestamp,
  formatQuebecDateTime,
  quebecLocalInputToDate,
  quebecLocalInputToIso,
  quebecToday,
  timeInputToMinutes,
} from "@/lib/quebecDateTime";
export type LiveHandlers<T> = {
  next: (items: T[]) => void;
  error: (error: FirestoreError) => void;
};
const text = (v: unknown, f = "") => (typeof v === "string" ? v : f);
const optional = (v: unknown) => {
  const r = text(v).trim();
  return r || undefined;
};
const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const strings = (v: unknown) =>
  Array.isArray(v)
    ? v.filter((item): item is string => typeof item === "string")
    : [];
const attendance = (v: unknown) =>
  v && typeof v === "object"
    ? (Object.fromEntries(
        Object.entries(v).filter(
          ([, status]) => status === "Présent" || status === "Absent",
        ),
      ) as Record<string, "Présent" | "Absent">)
    : {};

function cleanFirestoreData<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => cleanFirestoreData(item)) as T;
  }

  if (value && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype === Object.prototype || prototype === null) {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .filter(([, item]) => item !== undefined)
          .map(([key, item]) => [key, cleanFirestoreData(item)]),
      ) as T;
    }
  }

  return value;
}

function minutes(v: unknown, f: number) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return f;
  return timeInputToMinutes(v.padStart(5, "0")) ?? f;
}
const addMonths = (date: string, monthsToAdd: number) => {
  const value = new Date(`${date}T23:59:59`);
  value.setMonth(value.getMonth() + monthsToAdd);
  return value;
};
export async function assertAircraftMaintenanceCompliance(
  aircraftId: string,
  flightDate: string,
  plannedHours: number,
  excludeReservationId = "",
) {
  if (!aircraftId) return;
  const [aircraftSnapshot, taskSnapshot, reservationSnapshot] =
    await Promise.all([
      getDoc(doc(db, "aircraft", aircraftId)),
      getDocs(
        query(
          collection(db, "maintenanceTasks"),
          where("aircraftId", "==", aircraftId),
        ),
      ),
      getDocs(
        query(
          collection(db, "reservations"),
          where("aircraftId", "==", aircraftId),
        ),
      ),
    ]);
  if (!aircraftSnapshot.exists())
    throw new Error("Vol bloqué : avion introuvable.");
  const aircraft = aircraftSnapshot.data(),
    registration = text(aircraft.registration, aircraftId),
    currentAirTime = num(aircraft.airTimeTotal) || 0;
  if (aircraft.blockedForScheduling === true)
    throw new Error(
      `Vol bloqué pour ${registration} : avion indisponible en maintenance ou en raison d’un SNAG.`,
    );
  if (text(aircraft.status) === "Maintenance planifiée") {
    const start = firestoreDateTimeToIso(aircraft.maintenanceStartAt),
      end = firestoreDateTimeToIso(aircraft.expectedReturnAt),
      dayStart = quebecLocalInputToDate(`${flightDate}T00:00`)?.getTime() ?? 0,
      dayEnd =
        quebecLocalInputToDate(`${flightDate}T23:59`)?.getTime() ??
        Number.MAX_SAFE_INTEGER;
    if (
      start &&
      end &&
      new Date(start).getTime() <= dayEnd &&
      new Date(end).getTime() >= dayStart
    )
      throw new Error(
        `Vol bloqué pour ${registration} : maintenance planifiée du ${formatQuebecDateTime(start)} au ${formatQuebecDateTime(end)}.`,
      );
  }
  const priorPlannedHours = reservationSnapshot.docs.reduce((total, item) => {
    const value = item.data(),
      status = text(value.status, "Planifié"),
      date = text(value.date);
    if (
      item.id === excludeReservationId ||
      status === "Annulé" ||
      status === "Complété" ||
      date > flightDate
    )
      return total;
    const start = minutes(value.startMinutes ?? value.startTime, 0),
      end = minutes(value.endMinutes ?? value.endTime, 0);
    return total + Math.max(0, end - start) / 60;
  }, 0);
  const projectedAirTime =
      currentAirTime + priorPlannedHours + Math.max(0, plannedHours),
    flightDayEnd = new Date(`${flightDate}T23:59:59`).getTime();
  for (const item of taskSnapshot.docs) {
    const task = item.data();
    if (task.completed === true || task.notApplicable === true) continue;
    const title = text(task.title, "Inspection"),
      isAD =
        /\bAD\s*\d|AIRWORTHINESS DIRECTIVE|DIRECTIVE DE NAVIGABILITÉ/i.test(
          title,
        ),
      kind = isAD ? "AD" : "inspection";
    const toleranceAllowed =
      task.toleranceRequiresInspection !== true ||
      task.toleranceAuthorized === true;
    const toleranceHours = toleranceAllowed ? num(task.toleranceHours) || 0 : 0,
      toleranceMonths = toleranceAllowed ? num(task.toleranceMonths) || 0 : 0;
    const dueAirTime = num(task.dueAirTime),
      dueDate = optional(task.dueDate);
    if (
      dueAirTime !== undefined &&
      projectedAirTime > dueAirTime + toleranceHours + 0.0001
    )
      throw new Error(
        `Vol bloqué pour ${registration} : ${kind} « ${title} » dépasserait sa limite de ${(dueAirTime + toleranceHours).toFixed(1)} h (projection ${projectedAirTime.toFixed(1)} h).`,
      );
    if (dueDate && flightDayEnd > addMonths(dueDate, toleranceMonths).getTime())
      throw new Error(
        `Vol bloqué pour ${registration} : ${kind} « ${title} » sera dépassé${isAD ? "" : "e"} à la date du vol (limite ${addMonths(dueDate, toleranceMonths).toLocaleDateString("fr-CA")}).`,
      );
  }
}
function mapResource(
  id: string,
  d: DocumentData,
  kind: SchedulerResource["kind"],
): SchedulerResource {
  const effective: SchedulerResource["kind"] =
    kind === "room" && text(d.resourceKind) === "simulator"
      ? "simulator"
      : kind;
  const name = text(d.name) || text(d.registration) || `${effective}-${id}`;
  const typeLabel = text(d.typeLabel) || text(d.type),
    status = text(d.status);
  const detail =
    text(d.detail) ||
    [typeLabel, text(d.classLevel), status].filter(Boolean).join(" · ");
  const groupLabel =
    effective === "aircraft"
      ? typeLabel || "Autres avions"
      : effective === "simulator"
        ? "Simulateurs"
        : effective === "instructor"
          ? "Instructeurs"
          : "Locaux";
  return {
    id,
    kind: effective,
    name,
    detail,
    status,
    statusReason: text(d.statusReason) || text(d.maintenanceTitle),
    groupLabel,
    order: typeof d.scheduleOrder === "number" ? d.scheduleOrder : 9999,
    maintenanceStartAt:
      firestoreDateTimeToIso(d.maintenanceStartAt) || undefined,
    expectedReturnAt:
      firestoreDateTimeToIso(d.expectedReturnAt) || undefined,
    blocked:
      effective === "aircraft" &&
      (d.blockedForScheduling === true ||
        [
          "Maintenance",
          "En maintenance",
          "Retour en service retardé",
          "Hors service",
          "SNAG",
        ].includes(status)),
  };
}
export function subscribeResources(
  h: LiveHandlers<SchedulerResource>,
): Unsubscribe {
  const values = new Map<string, SchedulerResource[]>();
  const emit = () =>
    h.next([
      ...(values.get("aircraft") ?? []),
      ...(values.get("instructors") ?? []),
      ...(values.get("resources") ?? []),
    ]);
  const configs = [
    { name: "aircraft", kind: "aircraft" as const },
    { name: "instructors", kind: "instructor" as const },
    { name: "resources", kind: "room" as const },
  ];
  const offs = configs.map((c) =>
    onSnapshot(
      collection(db, c.name),
      (s) => {
        values.set(
          c.name,
          s.docs
            .filter(
              (item) =>
                c.kind !== "aircraft" ||
                text(item.data().status) !== "Hors service",
            )
            .map((i) => mapResource(i.id, i.data(), c.kind)),
        );
        emit();
      },
      h.error,
    ),
  );
  return () => offs.forEach((x) => x());
}
function mapEvent(id: string, d: DocumentData): SchedulerEvent {
  const startAt = firestoreDateTimeToLocalInput(d.startAt),
    endAt = firestoreDateTimeToLocalInput(d.endAt);
  return {
    id,
    date: text(d.date, startAt.slice(0, 10) || quebecToday()),
    rangeEndDate:
      optional(d.rangeEndDate) || endAt.slice(0, 10) || undefined,
    resourceId:
      text(d.resourceId) ||
      text(d.aircraftId) ||
      text(d.instructorId) ||
      text(d.roomId),
    aircraftId: optional(d.aircraftId),
    instructorId: optional(d.instructorId),
    roomId: optional(d.roomId),
    studentId: optional(d.studentId),
    studentName: optional(d.studentName) || optional(d.student),
    participantStudentIds: strings(d.participantStudentIds),
    participantStudentNames: strings(d.participantStudentNames),
    theoreticalSessionId: optional(d.theoreticalSessionId),
    theoryAttendance: attendance(d.theoryAttendance),
    type: text(d.type, "Double commande") as SchedulerEvent["type"],
    startMinutes: minutes(
      d.startMinutes ?? d.startTime ?? startAt.slice(11, 16),
      420,
    ),
    endMinutes: minutes(
      d.endMinutes ?? d.endTime ?? endAt.slice(11, 16),
      480,
    ),
    title: text(d.title) || text(d.lesson) || text(d.type, "Réservation"),
    notes: optional(d.notes),
    source:
      text(d.source) === "maintenanceWorkOrder"
        ? "maintenanceWorkOrder"
        : "reservation",
    reservationType:
      text(d.reservationType) === "Maintenance"
        ? "Maintenance"
        : undefined,
    maintenanceWorkOrderId: optional(d.maintenanceWorkOrderId),
    prmName: optional(d.prmName),
    technicianName: optional(d.technicianName),
    status: text(d.status, "Planifié") as SchedulerEvent["status"],
    checkedInAt: optional(d.checkedInAt),
    checkedInBy: optional(d.checkedInBy),
    checkedOutAt: optional(d.checkedOutAt),
    checkedOutBy: optional(d.checkedOutBy),
    hobbsStart: num(d.hobbsStart),
    hobbsEnd: num(d.hobbsEnd),
    hobbsElapsed: num(d.hobbsElapsed),
    actualDurationHours: num(d.actualDurationHours),
    takeoffTime: optional(d.takeoffTime),
    landingTime: optional(d.landingTime),
    airtimeMinutes: num(d.airtimeMinutes),
    groundTimeHours: num(d.groundTimeHours),
    overdueAlertMinutes: num(d.overdueAlertMinutes),
    checkInMetar: optional(d.checkInMetar),
    checkOutMetar: optional(d.checkOutMetar),
    metarStation: optional(d.metarStation),
    flightCrewRole:
      text(d.flightCrewRole) === "PIC"
        ? "PIC"
        : text(d.flightCrewRole) === "Double"
          ? "Double"
          : undefined,
    dayHours: num(d.dayHours),
    nightHours: num(d.nightHours),
    instrumentAircraftHours: num(d.instrumentAircraftHours),
    ftdHours: num(d.ftdHours),
    crossCountryDayHours: num(d.crossCountryDayHours),
    crossCountryNightHours: num(d.crossCountryNightHours),
    routeFrom: optional(d.routeFrom),
    routeTo: optional(d.routeTo),
    studentBreakConfirmations: readStudentBreakConfirmations(d.studentBreakConfirmations),
    complianceOverrideReason: optional(d.complianceOverrideReason),
    lessonPlanId: optional(d.lessonPlanId),
    lessonTitle: optional(d.lessonTitle),
    lessonPdfPath: optional(d.lessonPdfPath),
    lessonComponentId: optional(d.lessonComponentId),
    simulatorTcId: optional(d.simulatorTcId),
  };
}
export function subscribeReservations(
  h: LiveHandlers<SchedulerEvent>,
): Unsubscribe {
  return onSnapshot(
    collection(db, "reservations"),
    (s) =>
      h.next(
        s.docs
          .filter((i) => text(i.data().status) !== "Annulé")
          .map((i) => mapEvent(i.id, i.data())),
      ),
    h.error,
  );
}
export function subscribeSnagBlocks(
  h: LiveHandlers<SchedulerEvent>,
): Unsubscribe {
  return onSnapshot(
    collection(db, "snags"),
    (snapshot) => {
      const blocks: SchedulerEvent[] = [];
      snapshot.docs.forEach((item) => {
        const data = item.data();
        const closed = text(data.status) === "Fermé";

        const reported = firestoreDateTimeToLocalInput(data.reportedAt);
        const returned = firestoreDateTimeToLocalInput(
          data.returnedToServiceAt,
        );
        if (closed && !returned) return;
        const startDate = reported.slice(0, 10) || quebecToday();
        const endDate = closed
          ? returned.slice(0, 10)
          : text(data.estimatedReturnDate) || startDate;
        const reportedTime = reported.slice(11, 16);
        const returnedTime = returned.slice(11, 16);
        const firstStart = minutes(reportedTime, 420);
        const finalEnd = closed ? minutes(returnedTime, 1440) : 1440;

        blocks.push({
          id: `snag-${item.id}`,
          date: startDate,
          rangeEndDate: endDate,
          resourceId: text(data.aircraftId),
          aircraftId: text(data.aircraftId),
          type: "Maintenance",
          startMinutes: firstStart,
          endMinutes: finalEnd,
          title: `SNAG — ${text(data.defectTitle, "Défectuosité")}`,
          notes: text(data.description),
          source: "snag",
          snagId: item.id,
          maintenanceWorkOrderId:
            text(data.workOrderId) ||
            text(data.resolvedByWorkOrderId) ||
            undefined,
          status: closed ? "Complété" : "Planifié",
        });
      });
      h.next(blocks);
    },
    h.error,
  );
}
export function subscribeLeaveBlocks(
  h: LiveHandlers<SchedulerEvent>,
): Unsubscribe {
  return onSnapshot(
    collection(db, "employeeAbsences"),
    (snapshot) => {
      h.next(
        snapshot.docs.flatMap((item) => {
          const data = item.data(),
            employeeId = text(data.employeeId);
          if (text(data.status) !== "Approuvé" || !employeeId) return [];
          return [
            {
              id: `leave-${item.id}`,
              date: text(data.startDate),
              rangeEndDate: text(data.endDate) || text(data.startDate),
              resourceId: employeeId,
              instructorId: employeeId,
              type: "Hors service" as const,
              startMinutes: 0,
              endMinutes: 1440,
              title: "Congé — indisponible",
              notes: "Congé approuvé",
              source: "leave" as const,
              status: "Planifié" as const,
            },
          ];
        }),
      );
    },
    h.error,
  );
}
export function subscribeCancellations(
  h: LiveHandlers<Cancellation>,
): Unsubscribe {
  const q = query(
    collection(db, "cancellations"),
    orderBy("cancelledAt", "desc"),
  );
  return onSnapshot(
    q,
    (s) =>
      h.next(
        s.docs.map((i) => {
          const d = i.data();
          return {
            id: i.id,
            eventId: text(d.eventId),
            eventTitle: text(d.eventTitle) || text(d.title, "Réservation"),
            reason: text(d.reason, "Autre"),
            comment: text(d.comment),
            cancelledAt: text(d.cancelledAt),
          };
        }),
      ),
    h.error,
  );
}
function time(v: number) {
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
}
export function schedulerEventPayload(e: SchedulerEvent) {
  return {
    date: e.date,
    rangeEndDate: e.rangeEndDate ?? "",
    startAt: dateTimeToFirestoreTimestamp(
      quebecLocalInputToIso(`${e.date}T${time(e.startMinutes)}`),
    ),
    endAt: dateTimeToFirestoreTimestamp(
      quebecLocalInputToIso(
        `${e.rangeEndDate || e.date}T${time(e.endMinutes)}`,
      ),
    ),
    resourceId: e.resourceId,
    aircraftId: e.aircraftId ?? "",
    instructorId: e.instructorId ?? "",
    roomId: e.roomId ?? "",
    studentId: e.studentId ?? "",
    studentName: e.studentName ?? "",
    participantStudentIds: e.participantStudentIds ?? [],
    participantStudentNames: e.participantStudentNames ?? [],
    theoreticalSessionId: e.theoreticalSessionId ?? "",
    theoryAttendance: e.theoryAttendance ?? {},
    type: e.type,
    startMinutes: e.startMinutes,
    endMinutes: e.endMinutes,
    startTime: time(e.startMinutes),
    endTime: time(e.endMinutes),
    title: e.title,
    lesson: e.title,
    notes: e.notes ?? "",
    status: e.status ?? "Planifié",
    checkedInAt: e.checkedInAt ?? "",
    checkedInBy: e.checkedInBy ?? "",
    checkedOutAt: e.checkedOutAt ?? "",
    checkedOutBy: e.checkedOutBy ?? "",
    hobbsStart: e.hobbsStart ?? null,
    hobbsEnd: e.hobbsEnd ?? null,
    takeoffTime: e.takeoffTime ?? "",
    landingTime: e.landingTime ?? "",
    airtimeMinutes: e.airtimeMinutes ?? null,
    groundTimeHours: e.groundTimeHours ?? null,
    overdueAlertMinutes: e.overdueAlertMinutes ?? null,
    checkInMetar: e.checkInMetar ?? "",
    checkOutMetar: e.checkOutMetar ?? "",
    metarStation: e.metarStation ?? "",
    flightCrewRole: e.flightCrewRole ?? "",
    dayHours: e.dayHours ?? null,
    nightHours: e.nightHours ?? null,
    instrumentAircraftHours: e.instrumentAircraftHours ?? null,
    ftdHours: e.ftdHours ?? null,
    crossCountryDayHours: e.crossCountryDayHours ?? null,
    crossCountryNightHours: e.crossCountryNightHours ?? null,
    routeFrom: e.routeFrom ?? "",
    routeTo: e.routeTo ?? "",
    lessonPlanId: e.lessonPlanId ?? "",
    lessonTitle: e.lessonTitle ?? "",
    lessonPdfPath: e.lessonPdfPath ?? "",
    lessonComponentId: e.lessonComponentId ?? "",
    simulatorTcId: e.simulatorTcId ?? "",
    studentBreakConfirmations: e.studentBreakConfirmations ?? [],
    complianceOverrideReason: e.complianceOverrideReason ?? "",
    reservationType: e.reservationType ?? "",
    source: e.source ?? "reservation",
    maintenanceWorkOrderId: e.maintenanceWorkOrderId ?? "",
    prmName: e.prmName ?? "",
    technicianName: e.technicianName ?? "",
    updatedAt: serverTimestamp(),
  };
}
export async function saveReservation(e: SchedulerEvent, exists: boolean) {
  if ((e.type === "Double commande" || e.type === "Solo") && e.aircraftId)
    await assertAircraftMaintenanceCompliance(
      e.aircraftId,
      e.date,
      Math.max(0, e.endMinutes - e.startMinutes) / 60,
      e.id,
    );
  const r = doc(db, "reservations", e.id);
  if (exists) await updateDoc(r, cleanFirestoreData(schedulerEventPayload(e)));
  else
    await setDoc(
      r,
      cleanFirestoreData({
        ...schedulerEventPayload(e),
        createdAt: serverTimestamp(),
      }),
    );
}
export async function updateMaintenanceReservationSchedule(
  event: SchedulerEvent,
  actor: { id: string; name: string; role: string },
  reason: string,
) {
  if (!event.maintenanceWorkOrderId)
    throw new Error("Ordre de travail lié introuvable.");
  if (!reason.trim()) throw new Error("La raison est obligatoire.");
  const workRef = doc(
      db,
      "maintenanceWorkOrders",
      event.maintenanceWorkOrderId,
    ),
    workSnapshot = await getDoc(workRef);
  if (!workSnapshot.exists()) throw new Error("Ordre de travail introuvable.");
  const work = workSnapshot.data(),
    previousStart = firestoreDateTimeToIso(work.plannedStartAt),
    previousEnd = firestoreDateTimeToIso(work.plannedEndAt),
    startIso = quebecLocalInputToIso(
      `${event.date}T${time(event.startMinutes)}`,
    ),
    endIso = quebecLocalInputToIso(`${event.date}T${time(event.endMinutes)}`),
    now = new Date().toISOString(),
    batch = writeBatch(db);
  const linkedEvent: SchedulerEvent = {
    ...event,
    resourceId: text(work.aircraftId),
    aircraftId: text(work.aircraftId),
    type: "Maintenance",
    reservationType: "Maintenance",
    source: "maintenanceWorkOrder",
    title: text(work.title, event.title),
    prmName:
      work.prm && typeof work.prm === "object"
        ? text((work.prm as Record<string, unknown>).name)
        : event.prmName,
    technicianName:
      work.technician && typeof work.technician === "object"
        ? text((work.technician as Record<string, unknown>).name)
        : event.technicianName,
  };
  batch.set(
    doc(db, "reservations", event.id),
    cleanFirestoreData({
      ...schedulerEventPayload(linkedEvent),
      source: "maintenanceWorkOrder",
      reservationType: "Maintenance",
      maintenanceWorkOrderId: event.maintenanceWorkOrderId,
    }),
    { merge: true },
  );
  batch.update(workRef, {
    plannedStartAt: dateTimeToFirestoreTimestamp(startIso),
    plannedEndAt: dateTimeToFirestoreTimestamp(endIso),
    schedulerReservationId: event.id,
    updatedBy: { uid: actor.id, name: actor.name, role: actor.role },
    updatedAt: now,
    updatedAtServer: serverTimestamp(),
  });
  batch.set(doc(collection(db, "maintenanceHistory")), {
    aircraftId: text(work.aircraftId),
    aircraftRegistration: text(work.aircraftRegistration),
    workOrderId: event.maintenanceWorkOrderId,
    action: "Horaire maintenance modifié",
    changeType: "Horaire",
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    reason: reason.trim(),
    previousSchedule: `${firestoreDateTimeToLocalInput(previousStart)} - ${firestoreDateTimeToLocalInput(previousEnd)}`,
    newSchedule: `${firestoreDateTimeToLocalInput(startIso)} - ${firestoreDateTimeToLocalInput(endIso)}`,
    previousStartAt: previousStart,
    previousEndAt: previousEnd,
    newStartAt: startIso,
    newEndAt: endIso,
    eventAt: now,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}
export async function updateFlightOperation(
  id: string,
  patch: FlightOperationUpdate,
) {
  const payload = cleanFirestoreData({
    ...patch,
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "reservations", id), payload);
}

/** Met à jour le vol et le compteur de maintenance sans toucher aux heures du PTR. */
export async function completeFlightAndApplyAirTime(
  id: string,
  aircraftId: string,
  patch: FlightOperationUpdate,
  airtimeMinutes: number,
) {
  await runTransaction(db, async (transaction) => {
    const reservationRef = doc(db, "reservations", id),
      aircraftRef = doc(db, "aircraft", aircraftId);
    const reservation = await transaction.get(reservationRef);
    const aircraft = await transaction.get(aircraftRef);
    const previous =
      reservation.exists() &&
      typeof reservation.data().maintenanceAirTimeMinutesApplied === "number"
        ? reservation.data().maintenanceAirTimeMinutesApplied
        : 0;
    const current =
      aircraft.exists() && typeof aircraft.data().airTimeTotal === "number"
        ? aircraft.data().airTimeTotal
        : 0;
    transaction.update(
      reservationRef,
      cleanFirestoreData({
        ...patch,
        maintenanceAirTimeMinutesApplied: airtimeMinutes,
        updatedAt: serverTimestamp(),
      }),
    );
    transaction.set(
      aircraftRef,
      {
        airTimeTotal:
          Math.round((current + (airtimeMinutes - previous) / 60) * 10) / 10,
        airTimeUpdatedAt: serverTimestamp(),
        lastAirTimeReservationId: id,
      },
      { merge: true },
    );
  });
}

export async function markLinkedPTRLessonAfterCheckout(event: SchedulerEvent) {
  if (!event.studentId || !event.lessonPlanId) return;

  const snapshot = await getDocs(
    query(
      collection(db, "ptrLessons"),
      where("studentId", "==", event.studentId),
    ),
  );

  const planLessonNumber =
    event.lessonPlanId.match(/-L(\d+)(?:-|$)/)?.[1] || "";
  const matching = snapshot.docs.filter((item) => {
    const data = item.data();
    return (
      data.lessonPlanId === event.lessonPlanId ||
      data.linkedReservationId === event.id ||
      (planLessonNumber && String(data.lessonNumber) === planLessonNumber)
    );
  });

  const linkage = cleanFirestoreData({
    studentId: event.studentId,
    lessonPlanId: event.lessonPlanId,
    lessonPdfPath: event.lessonPdfPath || "",
    linkedReservationId: event.id,
    lastFlightStatus: "Complété",
    lastCheckoutAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const flightRecord = cleanFirestoreData({
    reservationId: event.id,
    lessonComponentId: event.lessonComponentId,
    simulatorTcId: event.simulatorTcId,
    date: event.date,
    type: event.type,
    aircraftId: event.aircraftId || "",
    instructorId: event.instructorId || "",
    scheduledStartMinutes: event.startMinutes,
    scheduledEndMinutes: event.endMinutes,
    hobbsStart: event.hobbsStart,
    hobbsEnd: event.hobbsEnd,
    hobbsElapsed:
      event.hobbsStart !== undefined && event.hobbsEnd !== undefined
        ? Math.round((event.hobbsEnd - event.hobbsStart) * 10) / 10
        : undefined,
    takeoffTime: event.takeoffTime || "",
    landingTime: event.landingTime || "",
    airtimeMinutes: event.airtimeMinutes,
    groundTimeHours: event.groundTimeHours,
    flightCrewRole: event.flightCrewRole,
    dayHours: event.dayHours,
    nightHours: event.nightHours,
    instrumentAircraftHours: event.instrumentAircraftHours,
    ftdHours: event.ftdHours,
    crossCountryDayHours: event.crossCountryDayHours,
    crossCountryNightHours: event.crossCountryNightHours,
    routeFrom: event.routeFrom || "",
    routeTo: event.routeTo || "",
    checkInMetar: event.checkInMetar || "",
    checkOutMetar: event.checkOutMetar || "",
    metarStation: event.metarStation || "",
    checkedInAt: event.checkedInAt || "",
    checkedInBy: event.checkedInBy || "",
    checkedOutAt: event.checkedOutAt || "",
    checkedOutBy: event.checkedOutBy || "",
    recordedAt: new Date().toISOString(),
  });

  if (matching.length) {
    const batch = writeBatch(db);
    matching.forEach((item) => {
      const existing = Array.isArray(item.data().flightRecords)
        ? item
            .data()
            .flightRecords.filter(
              (record: unknown) =>
                record &&
                typeof record === "object" &&
                (record as Record<string, unknown>).reservationId !== event.id,
            )
        : [];
      batch.set(
        item.ref,
        { ...linkage, flightRecords: [...existing, flightRecord] },
        { merge: true },
      );
    });
    await batch.commit();
  } else {
    await assignLessonToStudentPTR(event);
    await setDoc(
      doc(db, "ptrLessons", `${event.studentId}-${event.lessonPlanId}`),
      { ...linkage, flightRecords: [flightRecord] },
      { merge: true },
    );
  }
}

export async function removeReservation(e: SchedulerEvent, reason: string, comment = "") {
  if (!canDeleteReservation(e)) throw new Error("Suppression interdite : cette réservation possède déjà un check-in ou une activité enregistrée.");
  const reservationRef = doc(db, "reservations", e.id);
  const cancellationRef = doc(collection(db, "cancellations"));
  const lessons = e.studentId ? await getDocs(query(collection(db, "ptrLessons"), where("studentId", "==", e.studentId))) : null;
  await runTransaction(db, async transaction => {
    const current = await transaction.get(reservationRef);
    if (!current.exists()) throw new Error("Cette réservation n’existe plus.");
    const saved = mapEvent(current.id, current.data());
    if (!canDeleteReservation(saved)) throw new Error("Suppression interdite : un check-in a été enregistré pour cette réservation.");
    const currentLessons = await Promise.all((lessons?.docs || []).map(item => transaction.get(item.ref)));
    transaction.set(cancellationRef, cleanFirestoreData({eventId:e.id,eventTitle:saved.title,reason,comment:comment.trim(),cancelledAt:new Date().toISOString(),reservation:schedulerEventPayload(saved)}));
    transaction.delete(reservationRef);
    currentLessons.forEach(item => {
      const data = item.data();
      const records = Array.isArray(data?.flightRecords) ? data.flightRecords : [];
      const filtered = records.filter((record: unknown) => record && typeof record === "object" && (record as Record<string,unknown>).reservationId !== e.id);
      if (filtered.length !== records.length) transaction.set(item.ref,{flightRecords:filtered,updatedAt:new Date().toISOString()},{merge:true});
    });
  });
}

export type StudentOption = {
  id: string;
  name: string;
  status: string;
  preSoloAuthorized: boolean;
  preSoloRequired: boolean;
  rentalAgreementSigned: boolean;
  trainingProgramAgreementSigned: boolean;
};
export function subscribeStudents(h: LiveHandlers<StudentOption>): Unsubscribe {
  return onSnapshot(
    collection(db, "students"),
    (s) =>
      h.next(
        s.docs.map((i) => {
          const d = i.data();
          const status = text(d.status, "Actif"),
            program = text(d.program) || text(d.path);
          return {
            id: i.id,
            name:
              text(d.name) ||
              `${text(d.firstName)} ${text(d.lastName)}`.trim() ||
              i.id,
            status,
            preSoloAuthorized: d.preSoloAuthorized === true,
            preSoloRequired:
              status.trim().toLocaleLowerCase("fr-CA") !== "locataire",
            rentalAgreementSigned: d.rentalAgreementSigned === true,
            trainingProgramAgreementSigned:
              d.trainingProgramAgreementSigned === true &&
              text(d.trainingProgramAgreementProgram) === program,
          };
        }),
      ),
    h.error,
  );
}

export function subscribeSchedulerSettings(
  h: LiveHandlers<SchedulerSettings>,
): Unsubscribe {
  return onSnapshot(
    doc(db, "appSettings", "scheduler"),
    (snapshot) => {
      if (!snapshot.exists()) {
        h.next([DEFAULT_SCHEDULER_SETTINGS]);
        return;
      }
      const d = snapshot.data();
      const start =
        typeof d.startHour === "number"
          ? d.startHour
          : DEFAULT_SCHEDULER_SETTINGS.startHour;
      const end =
        typeof d.endHour === "number"
          ? d.endHour
          : DEFAULT_SCHEDULER_SETTINGS.endHour;
      const slot =
        d.slotMinutes === 15 || d.slotMinutes === 30 || d.slotMinutes === 60
          ? d.slotMinutes
          : DEFAULT_SCHEDULER_SETTINGS.slotMinutes;
      h.next([
        {
          startHour: start,
          endHour: end,
          slotMinutes: slot,
          updatedAt: text(d.updatedAt),
          updatedBy: text(d.updatedBy),
        },
      ]);
    },
    h.error,
  );
}

export type ResourceOrderSettings = {
  groups: string[];
  resources: Record<string, string[]>;
};

export function resourceGroupKey(resource: SchedulerResource) {
  if (resource.kind === "aircraft") {
    return `Avions — ${resource.groupLabel || resource.detail.split(" · ")[0] || "Autres"}`;
  }
  if (resource.kind === "simulator") return "Simulateurs";
  if (resource.kind === "instructor") return "Instructeurs";
  return "Locaux";
}

export function subscribeResourceOrderSettings(
  next: (value: ResourceOrderSettings) => void,
  error: (value: FirestoreError) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, "appSettings", "schedulerResourceOrder"),
    (snapshot) => {
      const data = snapshot.data();
      next({
        groups: Array.isArray(data?.groups)
          ? data.groups.filter(
              (item): item is string => typeof item === "string",
            )
          : [],
        resources:
          data?.resources && typeof data.resources === "object"
            ? (data.resources as Record<string, string[]>)
            : {},
      });
    },
    error,
  );
}

export async function saveResourceOrderSettings(value: ResourceOrderSettings) {
  await setDoc(
    doc(db, "appSettings", "schedulerResourceOrder"),
    {
      groups: value.groups,
      resources: value.resources,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

export async function saveResourceScheduleOrder(
  items: Array<{ id: string; kind: SchedulerResource["kind"]; order: number }>,
) {
  const batch = writeBatch(db);
  items.forEach((item) => {
    const collectionName =
      item.kind === "aircraft"
        ? "aircraft"
        : item.kind === "instructor"
          ? "instructors"
          : "resources";
    batch.set(
      doc(db, collectionName, item.id),
      { scheduleOrder: item.order, updatedAt: new Date().toISOString() },
      { merge: true },
    );
  });
  await batch.commit();
}

export async function saveSchedulerSettings(value: SchedulerSettings) {
  await setDoc(
    doc(db, "appSettings", "scheduler"),
    { ...value, updatedAt: new Date().toISOString() },
    { merge: true },
  );
}

export async function assignLessonToStudentPTR(event: SchedulerEvent) {
  if (!event.studentId || !event.lessonPlanId) return;

  const planLessonNumber =
    event.lessonPlanId.match(/-L(\d+)(?:-|$)/)?.[1] || "";
  if (planLessonNumber) {
    const snapshot = await getDocs(
      query(
        collection(db, "ptrLessons"),
        where("studentId", "==", event.studentId),
      ),
    );
    const official = snapshot.docs.find(
      (item) => String(item.data().lessonNumber) === planLessonNumber,
    );
    if (official) {
      await setDoc(
        official.ref,
        {
          linkedReservationId: event.id,
          lessonPlanId: event.lessonPlanId,
          lessonPdfPath: event.lessonPdfPath || "",
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      return;
    }
  }

  const lessonId = `${event.studentId}-${event.lessonPlanId}`;
  await setDoc(
    doc(db, "ptrLessons", lessonId),
    {
      studentId: event.studentId,
      phase: event.lessonPlanId.split("-")[0] || "Programme",
      lessonNumber: planLessonNumber || event.lessonPlanId,
      title: event.lessonTitle || event.title,
      objective: "Voir le plan de leçon officiel associé.",
      exercises: [],
      status: "Non commencé",
      linkedReservationId: event.id,
      lessonPlanId: event.lessonPlanId,
      lessonPdfPath: event.lessonPdfPath || "",
      updatedAt: new Date().toISOString(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );
}

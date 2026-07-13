import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
  type FirestoreError,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/services/firebase/client";
import type { Cancellation, SchedulerEvent, SchedulerResource } from "./types";

export type LiveHandlers<T> = {
  next: (items: T[]) => void;
  error: (error: FirestoreError) => void;
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function optionalText(value: unknown) {
  const result = text(value).trim();
  return result || undefined;
}

function minutesFromTime(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !/^\d{1,2}:\d{2}$/.test(value)) return fallback;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function mapResource(id: string, data: DocumentData, kind: SchedulerResource["kind"]): SchedulerResource {
  const name = text(data.name) || text(data.registration) || `${kind}-${id}`;
  const detail = text(data.detail) || [text(data.type), text(data.classLevel), text(data.status)].filter(Boolean).join(" · ");
  return { id, kind, name, detail };
}

export function subscribeResources(handlers: LiveHandlers<SchedulerResource>): Unsubscribe {
  const values = new Map<string, SchedulerResource[]>();
  const emit = () => handlers.next([
    ...(values.get("aircraft") ?? []),
    ...(values.get("instructors") ?? []),
    ...(values.get("resources") ?? []),
  ]);

  const configs = [
    { collectionName: "aircraft", kind: "aircraft" as const },
    { collectionName: "instructors", kind: "instructor" as const },
    { collectionName: "resources", kind: "room" as const },
  ];

  const unsubscribers = configs.map(({ collectionName, kind }) =>
    onSnapshot(
      collection(db, collectionName),
      (snapshot) => {
        values.set(collectionName, snapshot.docs.map((item) => mapResource(item.id, item.data(), kind)));
        emit();
      },
      handlers.error,
    ),
  );

  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

function mapEvent(id: string, data: DocumentData): SchedulerEvent {
  return {
    id,
    date: text(data.date, new Date().toISOString().slice(0, 10)),
    resourceId: text(data.resourceId) || text(data.aircraftId) || text(data.instructorId) || text(data.roomId),
    aircraftId: optionalText(data.aircraftId),
    instructorId: optionalText(data.instructorId),
    roomId: optionalText(data.roomId),
    studentId: optionalText(data.studentId),
    studentName: optionalText(data.studentName) || optionalText(data.student),
    type: text(data.type, "Double commande") as SchedulerEvent["type"],
    startMinutes: minutesFromTime(data.startMinutes ?? data.startTime, 7 * 60),
    endMinutes: minutesFromTime(data.endMinutes ?? data.endTime, 8 * 60),
    title: text(data.title) || text(data.lesson) || text(data.type, "Réservation"),
    notes: optionalText(data.notes),
  };
}

export function subscribeReservations(handlers: LiveHandlers<SchedulerEvent>): Unsubscribe {
  return onSnapshot(
    collection(db, "reservations"),
    (snapshot) => handlers.next(snapshot.docs.map((item) => mapEvent(item.id, item.data()))),
    handlers.error,
  );
}

export function subscribeCancellations(handlers: LiveHandlers<Cancellation>): Unsubscribe {
  const cancellationsQuery = query(collection(db, "cancellations"), orderBy("cancelledAt", "desc"));
  return onSnapshot(
    cancellationsQuery,
    (snapshot) => handlers.next(snapshot.docs.map((item) => {
      const data = item.data();
      return {
        id: item.id,
        eventId: text(data.eventId),
        eventTitle: text(data.eventTitle) || text(data.title, "Réservation"),
        reason: text(data.reason, "Autre"),
        cancelledAt: text(data.cancelledAt),
      };
    })),
    handlers.error,
  );
}

function eventPayload(event: SchedulerEvent) {
  return {
    date: event.date,
    resourceId: event.resourceId,
    aircraftId: event.aircraftId ?? "",
    instructorId: event.instructorId ?? "",
    roomId: event.roomId ?? "",
    studentId: event.studentId ?? "",
    studentName: event.studentName ?? "",
    type: event.type,
    startMinutes: event.startMinutes,
    endMinutes: event.endMinutes,
    startTime: `${String(Math.floor(event.startMinutes / 60)).padStart(2, "0")}:${String(event.startMinutes % 60).padStart(2, "0")}`,
    endTime: `${String(Math.floor(event.endMinutes / 60)).padStart(2, "0")}:${String(event.endMinutes % 60).padStart(2, "0")}`,
    title: event.title,
    lesson: event.title,
    notes: event.notes ?? "",
    status: "Planifié",
    updatedAt: serverTimestamp(),
  };
}

export async function saveReservation(event: SchedulerEvent, exists: boolean) {
  const reference = doc(db, "reservations", event.id);
  if (exists) {
    await updateDoc(reference, eventPayload(event));
  } else {
    await setDoc(reference, { ...eventPayload(event), createdAt: serverTimestamp() });
  }
}

export async function removeReservation(event: SchedulerEvent, reason: string) {
  await addDoc(collection(db, "cancellations"), {
    eventId: event.id,
    eventTitle: event.title,
    reason,
    cancelledAt: new Date().toISOString(),
    reservation: eventPayload(event),
  });
  await deleteDoc(doc(db, "reservations", event.id));
}

export type StudentOption = { id: string; name: string };

export function subscribeStudents(handlers: LiveHandlers<StudentOption>): Unsubscribe {
  return onSnapshot(
    collection(db, "students"),
    (snapshot) => handlers.next(snapshot.docs.map((item) => {
      const data = item.data();
      const name = text(data.name) || `${text(data.firstName)} ${text(data.lastName)}`.trim() || item.id;
      return { id: item.id, name };
    })),
    handlers.error,
  );
}

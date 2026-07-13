import {
  addDoc, collection, doc, onSnapshot, query, serverTimestamp, setDoc,
  updateDoc, where, type DocumentData, type FirestoreError, type Unsubscribe
} from "firebase/firestore";
import { db } from "@/services/firebase/client";
import type { InstructorOption, PTREvaluation, PTRLesson, ReservationOption, TCScore } from "./types";

export type LiveHandlers<T> = { next: (items: T[]) => void; error: (error: FirestoreError) => void };
const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const list = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const score = (value: unknown): TCScore | undefined => value === 1 || value === 2 || value === 3 || value === 4 ? value : undefined;

function scoped<T>(name: string, studentId: string, map: (id: string, data: DocumentData) => T, handlers: LiveHandlers<T>): Unsubscribe {
  const q = query(collection(db, name), where("studentId", "==", studentId));
  return onSnapshot(q, snap => handlers.next(snap.docs.map(item => map(item.id, item.data()))), handlers.error);
}

export function subscribeLessons(studentId: string, handlers: LiveHandlers<PTRLesson>) {
  return scoped("ptrLessons", studentId, (id, data) => ({
    id, studentId,
    phase: text(data.phase, "Phase 1"),
    lessonNumber: text(data.lessonNumber),
    title: text(data.title, "Leçon"),
    objective: text(data.objective),
    exercises: list(data.exercises),
    status: text(data.status, "Non commencé") as PTRLesson["status"],
    linkedReservationId: text(data.linkedReservationId),
    updatedAt: text(data.updatedAt)
  }), handlers);
}

export async function saveLesson(lesson: PTRLesson, exists: boolean) {
  const payload = {
    studentId: lesson.studentId,
    phase: lesson.phase,
    lessonNumber: lesson.lessonNumber,
    title: lesson.title,
    objective: lesson.objective,
    exercises: lesson.exercises,
    status: lesson.status,
    linkedReservationId: lesson.linkedReservationId,
    updatedAt: new Date().toISOString()
  };
  const ref = doc(db, "ptrLessons", lesson.id);
  if (exists) await updateDoc(ref, payload);
  else await setDoc(ref, { ...payload, createdAt: serverTimestamp() });
}

export function subscribeEvaluations(studentId: string, handlers: LiveHandlers<PTREvaluation>) {
  return scoped("ptrEvaluations", studentId, (id, data) => ({
    id, studentId,
    lessonId: text(data.lessonId),
    reservationId: text(data.reservationId),
    instructorId: text(data.instructorId),
    instructorName: text(data.instructorName),
    date: text(data.date),
    pilotage: score(data.pilotage),
    technical: score(data.technical),
    situationalAwareness: score(data.situationalAwareness),
    flightManagement: score(data.flightManagement),
    safetyMargins: score(data.safetyMargins),
    finalScore: score(data.finalScore),
    strengths: text(data.strengths),
    improvements: text(data.improvements),
    comments: text(data.comments),
    actions: list(data.actions),
    lessonStatus: text(data.lessonStatus, "En cours") as PTREvaluation["lessonStatus"],
    instructorSignature: text(data.instructorSignature),
    studentSignature: text(data.studentSignature),
    signedAt: text(data.signedAt)
  }), handlers);
}

export async function addEvaluation(value: Omit<PTREvaluation, "id">) {
  await addDoc(collection(db, "ptrEvaluations"), { ...value, createdAt: serverTimestamp() });
}

export function subscribeReservations(studentId: string, handlers: LiveHandlers<ReservationOption>) {
  return scoped("reservations", studentId, (id, data) => ({
    id,
    date: text(data.date),
    startTime: text(data.startTime),
    endTime: text(data.endTime),
    title: text(data.title) || text(data.lesson) || text(data.type),
    type: text(data.type),
    instructorId: text(data.instructorId)
  }), handlers);
}

export function subscribeInstructors(handlers: LiveHandlers<InstructorOption>): Unsubscribe {
  return onSnapshot(collection(db, "instructors"), snap => handlers.next(snap.docs.map(item => {
    const data = item.data();
    const name = text(data.name) || `${text(data.firstName)} ${text(data.lastName)}`.trim();
    return { id: item.id, name: name || item.id };
  })), handlers.error);
}

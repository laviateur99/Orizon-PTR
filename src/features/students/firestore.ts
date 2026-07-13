import {
  addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query,
  serverTimestamp, setDoc, updateDoc, where,
  type DocumentData, type FirestoreError, type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/services/firebase/client";
import type {
  InstructorOption, Student, StudentDocument, StudentHistoryItem,
  StudentLesson, StudentNote, StudentReservation,
} from "./types";

export type LiveHandlers<T> = { next: (items: T[]) => void; error: (error: FirestoreError) => void };
const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : Number(value) || 0;

function mapStudent(id: string, data: DocumentData): Student {
  const splitName = text(data.name).trim().split(/\s+/);
  return {
    id,
    firstName: text(data.firstName) || splitName[0] || "",
    lastName: text(data.lastName) || splitName.slice(1).join(" "),
    email: text(data.email), phone: text(data.phone), address: text(data.address),
    emergencyContact: text(data.emergencyContact), emergencyPhone: text(data.emergencyPhone),
    program: text(data.program) || text(data.path) || "PPL",
    programType: (text(data.programType) || text(data.pathType) || "Intégré") as Student["programType"],
    language: (text(data.language) || "Français") as Student["language"],
    status: (text(data.status) || "Actif") as Student["status"],
    primaryInstructorId: text(data.primaryInstructorId), startDate: text(data.startDate),
    flightHours: number(data.flightHours), groundHours: number(data.groundHours), notes: text(data.notes),
  };
}

export function subscribeStudents(handlers: LiveHandlers<Student>): Unsubscribe {
  return onSnapshot(collection(db, "students"), snap => handlers.next(snap.docs.map(x => mapStudent(x.id, x.data()))), handlers.error);
}
export function subscribeStudent(id: string, next: (value: Student | null) => void, error: (e: FirestoreError) => void): Unsubscribe {
  return onSnapshot(doc(db, "students", id), snap => next(snap.exists() ? mapStudent(snap.id, snap.data()) : null), error);
}
export async function saveStudent(student: Student, exists: boolean) {
  const payload = { ...student, name: `${student.firstName} ${student.lastName}`.trim(), updatedAt: serverTimestamp() };
  delete (payload as Partial<Student>).id;
  const ref = doc(db, "students", student.id);
  if (exists) await updateDoc(ref, payload); else await setDoc(ref, { ...payload, createdAt: serverTimestamp() });
}
export async function removeStudent(id: string) { await deleteDoc(doc(db, "students", id)); }

export function subscribeInstructors(handlers: LiveHandlers<InstructorOption>): Unsubscribe {
  return onSnapshot(collection(db, "instructors"), snap => handlers.next(snap.docs.map(x => {
    const d=x.data(); return { id:x.id, name: text(d.name) || `${text(d.firstName)} ${text(d.lastName)}`.trim() || x.id };
  })), handlers.error);
}

function scoped<T>(collectionName: string, studentId: string, map: (id:string,d:DocumentData)=>T, handlers: LiveHandlers<T>): Unsubscribe {
  const q = query(collection(db, collectionName), where("studentId", "==", studentId));
  return onSnapshot(q, snap => handlers.next(snap.docs.map(x => map(x.id,x.data()))), handlers.error);
}

export function subscribeDocuments(id:string,h:LiveHandlers<StudentDocument>){ return scoped("studentDocuments",id,(docId,d)=>({
  id:docId, studentId:id, type:text(d.type,"Autre") as StudentDocument["type"], number:text(d.number), issueDate:text(d.issueDate), expiryDate:text(d.expiryDate), notes:text(d.notes), status:text(d.status,"Sans expiration") as StudentDocument["status"]
}),h); }
export async function addStudentDocument(item: Omit<StudentDocument,"id">){ await addDoc(collection(db,"studentDocuments"),{...item,createdAt:serverTimestamp()}); }
export async function deleteStudentDocument(id:string){ await deleteDoc(doc(db,"studentDocuments",id)); }

export function subscribeNotes(id:string,h:LiveHandlers<StudentNote>){ return scoped("studentNotes",id,(docId,d)=>({ id:docId,studentId:id,text:text(d.text),author:text(d.author,"Équipe Orizon"),createdAt:text(d.createdAt) }),h); }
export async function addStudentNote(item: Omit<StudentNote,"id"|"createdAt">){ await addDoc(collection(db,"studentNotes"),{...item,createdAt:new Date().toISOString()}); }
export async function deleteStudentNote(id:string){ await deleteDoc(doc(db,"studentNotes",id)); }

export function subscribeHistory(id:string,h:LiveHandlers<StudentHistoryItem>){ return scoped("studentHistory",id,(docId,d)=>({ id:docId,studentId:id,type:text(d.type,"Modification") as StudentHistoryItem["type"],title:text(d.title),detail:text(d.detail),createdAt:text(d.createdAt) }),h); }
export async function addHistory(item: Omit<StudentHistoryItem,"id"|"createdAt">){ await addDoc(collection(db,"studentHistory"),{...item,createdAt:new Date().toISOString()}); }

export function subscribeLessons(id:string,h:LiveHandlers<StudentLesson>){ return scoped("ptrLessons",id,(docId,d)=>({ id:docId,studentId:id,phase:text(d.phase,"Phase 1"),lessonNumber:text(d.lessonNumber),title:text(d.title,"Leçon"),status:text(d.status,"Non commencé") as StudentLesson["status"],score:typeof d.score==="number"?(d.score as 1 | 2 | 3 | 4):undefined }),h); }
export function subscribeReservations(id:string,h:LiveHandlers<StudentReservation>){ return scoped("reservations",id,(docId,d)=>({ id:docId,studentId:id,date:text(d.date),startTime:text(d.startTime),endTime:text(d.endTime),type:text(d.type),title:text(d.title)||text(d.lesson),aircraftId:text(d.aircraftId),instructorId:text(d.instructorId),status:text(d.status,"Planifié") }),h); }

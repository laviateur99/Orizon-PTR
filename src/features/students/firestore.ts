import {
  addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query,
  serverTimestamp, setDoc, updateDoc, where,
  type DocumentData, type FirestoreError, type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/services/firebase/client";
import type {
  InstructorOption, Student, StudentDocument, StudentHistoryItem,
  StudentLesson, StudentNote, StudentReservation, StudentProgram,
  PreSoloChecklist, FlightTestRecommendation,
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
    program: (() => {
      const value = text(data.program) || text(data.path);
      if (value === "Modulaire" || value.startsWith("ATP(A) modulaire — Phase ")) return value;
      if (value === "CPL IR/ME intégré") return "CPL IR/ME intégré";
      if (value === "CPL intégré") return "CPL intégré";
      return "ATP(A) intégré";
    })() as StudentProgram,
    programType: (text(data.programType) || text(data.pathType) || "Intégré") as Student["programType"],
    trainingProgramId: text(data.trainingProgramId),
    trainingProgramName: text(data.trainingProgramName),
    language: (text(data.language) || "Français") as Student["language"],
    status: (text(data.status) || "Actif") as Student["status"],
    primaryInstructorId: text(data.primaryInstructorId), theoryCohortId:text(data.theoryCohortId), startDate: text(data.startDate),
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

export function subscribePreSoloChecklist(studentId:string,next:(value:PreSoloChecklist|null)=>void,error:(e:FirestoreError)=>void):Unsubscribe {
  return onSnapshot(doc(db,"preSoloChecklists",studentId),snap=>next(snap.exists()?snap.data() as PreSoloChecklist:null),error);
}
export async function savePreSoloChecklist(checklist:PreSoloChecklist){
  const now=new Date().toISOString();
  await setDoc(doc(db,"preSoloChecklists",checklist.studentId),{...checklist,updatedAt:serverTimestamp()},{merge:true});
  await setDoc(doc(db,"students",checklist.studentId),{
    preSoloAuthorized:checklist.authorized,
    preSoloAuthorizedAt:checklist.authorized?(checklist.completedAt||now):"",
    updatedAt:serverTimestamp()
  },{merge:true});
}

export function subscribeFlightTestRecommendation(studentId:string,next:(value:FlightTestRecommendation|null)=>void,error:(e:FirestoreError)=>void):Unsubscribe {
  return onSnapshot(doc(db,"flightTestRecommendations",studentId),snap=>next(snap.exists()?snap.data() as FlightTestRecommendation:null),error);
}
export async function saveFlightTestRecommendation(recommendation:FlightTestRecommendation){
  const now=new Date().toISOString();
  await setDoc(doc(db,"flightTestRecommendations",recommendation.studentId),{
    ...recommendation,
    completedAt:recommendation.valid?(recommendation.completedAt||now):"",
    updatedAt:serverTimestamp()
  },{merge:true});
  await setDoc(doc(db,"students",recommendation.studentId),{
    flightTestRecommended:recommendation.valid,
    flightTestRecommendedAt:recommendation.valid?(recommendation.completedAt||now):"",
    updatedAt:serverTimestamp()
  },{merge:true});
}

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

export function subscribeLessons(id:string,h:LiveHandlers<StudentLesson>){
  return scoped("ptrLessons",id,(docId,d)=>({
    id:docId,
    studentId:id,
    phase:text(d.phase,"Phase 1"),
    lessonNumber:text(d.lessonNumber),
    title:text(d.title,"Leçon"),
    status:text(d.status,"Non commencé") as StudentLesson["status"],
    score:[1,2,3,4].includes(d.lastFinalScore)
      ? d.lastFinalScore as 1|2|3|4
      : [1,2,3,4].includes(d.score)
        ? d.score as 1|2|3|4
        : undefined,
    lessonPlanId:text(d.lessonPlanId),
    lessonPdfPath:text(d.lessonPdfPath),
    linkedReservationId:text(d.linkedReservationId),
    componentCount:Array.isArray(d.components)?d.components.length:0,
    componentStatuses:d.componentStatuses&&typeof d.componentStatuses==="object"
      ?Object.fromEntries(Object.entries(d.componentStatuses).filter(([,value])=>["Non commencé","En cours","Réussi","À reprendre"].includes(String(value)))) as StudentLesson["componentStatuses"]
      :{}
  }),h);
}
export type StudentLessonEvaluation={lessonId:string;status:StudentLesson["status"];signedAt:string;componentKey?:string;reservationId?:string;instructorSignature?:string;studentSignature?:string};
export function subscribeLessonEvaluations(id:string,h:LiveHandlers<StudentLessonEvaluation>){
  return scoped("ptrEvaluations",id,(_docId,d)=>{
    const finalScore=typeof d.finalScore==="number"?d.finalScore:undefined;
    const groundResult=text(d.groundResult);
    const status:StudentLesson["status"]=groundResult==="Réussi"||groundResult==="À reprendre"
      ?groundResult
      :finalScore!==undefined ? finalScore>=3?"Réussi":"À reprendre"
      :text(d.lessonStatus)==="En cours"?"À reprendre":text(d.lessonStatus,"Non commencé") as StudentLesson["status"];
    return{lessonId:text(d.lessonId),status,signedAt:text(d.signedAt)||text(d.date),componentKey:text(d.componentKey),reservationId:text(d.reservationId),instructorSignature:text(d.instructorSignature),studentSignature:text(d.studentSignature)};
  },h);
}
export function subscribeReservations(id:string,h:LiveHandlers<StudentReservation>){
  const values=new Map<string,StudentReservation>();
  const mapped=(docId:string,d:DocumentData):StudentReservation=>{const status=d.theoryAttendance&&typeof d.theoryAttendance==="object"?(d.theoryAttendance as Record<string,unknown>)[id]:undefined;return{id:docId,studentId:id,date:text(d.date),startTime:text(d.startTime),endTime:text(d.endTime),type:text(d.type),title:text(d.title)||text(d.lesson),aircraftId:text(d.aircraftId),instructorId:text(d.instructorId),status:text(d.status,"Planifié"),hobbsStart:typeof d.hobbsStart==="number"?d.hobbsStart:undefined,hobbsEnd:typeof d.hobbsEnd==="number"?d.hobbsEnd:undefined,airtimeMinutes:typeof d.airtimeMinutes==="number"?d.airtimeMinutes:undefined,groundTimeHours:typeof d.groundTimeHours==="number"?d.groundTimeHours:undefined,attendanceStatus:status==="Présent"||status==="Absent"?status:undefined};};
  const emit=()=>h.next(Array.from(values.values()));
  const direct=query(collection(db,"reservations"),where("studentId","==",id));
  const group=query(collection(db,"reservations"),where("participantStudentIds","array-contains",id));
  const a=onSnapshot(direct,snapshot=>{snapshot.docChanges().forEach(change=>change.type==="removed"?values.delete(change.doc.id):values.set(change.doc.id,mapped(change.doc.id,change.doc.data())));emit();},h.error);
  const b=onSnapshot(group,snapshot=>{snapshot.docChanges().forEach(change=>change.type==="removed"?values.delete(change.doc.id):values.set(change.doc.id,mapped(change.doc.id,change.doc.data())));emit();},h.error);
  return()=>{a();b();};
}

import {
  addDoc, collection, doc, onSnapshot, query, serverTimestamp, setDoc,
  runTransaction, updateDoc, where, type DocumentData, type FirestoreError, type Unsubscribe
} from "firebase/firestore";
import { db } from "@/services/firebase/client";
import type { AircraftOption, InstructorOption, PTREvaluation, PTRFlightRecord, PTRLesson, PTRLessonHistory, ReservationOption, TCScore } from "./types";

export type LiveHandlers<T> = { next: (items: T[]) => void; error: (error: FirestoreError) => void };
const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const list = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const objects = (value: unknown) => Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
const score = (value: unknown): TCScore | undefined => value === 1 || value === 2 || value === 3 || value === 4 ? value : undefined;
const statuses = (value: unknown): Record<string, PTRLesson["status"]> => {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, PTRLesson["status"]] =>
    ["Non commencé","En cours","Réussi","À reprendre"].includes(String(entry[1]))
  ));
};
function cleanFirestoreData<T>(value:T):T{
  if(Array.isArray(value)){
    return value.filter(item=>item!==undefined).map(item=>cleanFirestoreData(item)) as T;
  }
  if(value&&typeof value==="object"){
    const prototype=Object.getPrototypeOf(value);
    if(prototype===Object.prototype||prototype===null){
      return Object.fromEntries(
        Object.entries(value as Record<string,unknown>)
          .filter(([,item])=>item!==undefined)
          .map(([key,item])=>[key,cleanFirestoreData(item)])
      ) as T;
    }
  }
  return value;
}
const flightRecords=(value:unknown):PTRFlightRecord[]=>objects(value).map(record=>({
  reservationId:text(record.reservationId),lessonComponentId:text(record.lessonComponentId)||undefined,simulatorTcId:text(record.simulatorTcId)||undefined,date:text(record.date),type:text(record.type),
  aircraftId:text(record.aircraftId),instructorId:text(record.instructorId),
  scheduledStartMinutes:typeof record.scheduledStartMinutes==="number"?record.scheduledStartMinutes:undefined,
  scheduledEndMinutes:typeof record.scheduledEndMinutes==="number"?record.scheduledEndMinutes:undefined,
  hobbsStart:typeof record.hobbsStart==="number"?record.hobbsStart:undefined,
  hobbsEnd:typeof record.hobbsEnd==="number"?record.hobbsEnd:undefined,
  hobbsElapsed:typeof record.hobbsElapsed==="number"?record.hobbsElapsed:undefined,
  takeoffTime:text(record.takeoffTime),landingTime:text(record.landingTime),
  airtimeMinutes:typeof record.airtimeMinutes==="number"?record.airtimeMinutes:undefined,
  groundTimeHours:typeof record.groundTimeHours==="number"?record.groundTimeHours:undefined,
  flightCrewRole:(text(record.flightCrewRole)==="PIC"?"PIC":text(record.flightCrewRole)==="Double"?"Double":undefined) as PTRFlightRecord["flightCrewRole"],
  dayHours:typeof record.dayHours==="number"?record.dayHours:undefined,nightHours:typeof record.nightHours==="number"?record.nightHours:undefined,
  instrumentAircraftHours:typeof record.instrumentAircraftHours==="number"?record.instrumentAircraftHours:undefined,ftdHours:typeof record.ftdHours==="number"?record.ftdHours:undefined,
  crossCountryDayHours:typeof record.crossCountryDayHours==="number"?record.crossCountryDayHours:undefined,crossCountryNightHours:typeof record.crossCountryNightHours==="number"?record.crossCountryNightHours:undefined,
  routeFrom:text(record.routeFrom),routeTo:text(record.routeTo),
  checkInMetar:text(record.checkInMetar),checkOutMetar:text(record.checkOutMetar),
  metarStation:text(record.metarStation),checkedInAt:text(record.checkedInAt),
  checkedInBy:text(record.checkedInBy),checkedOutAt:text(record.checkedOutAt),
  checkedOutBy:text(record.checkedOutBy),recordedAt:text(record.recordedAt)
}));

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
    lessonPlanId: text(data.lessonPlanId),
    lessonPdfPath: text(data.lessonPdfPath),
    lastEvaluationId: text(data.lastEvaluationId),
    lastFinalScore: typeof data.lastFinalScore==="number"&&Number.isFinite(data.lastFinalScore)?data.lastFinalScore:undefined,
    updatedAt: text(data.updatedAt),
    programId: text(data.programId),
    programRevision: text(data.programRevision),
    sourceManual: text(data.sourceManual),
    successCriteria: list(data.successCriteria),
    componentStatuses: statuses(data.componentStatuses),
    flightRecords:flightRecords(data.flightRecords),
    components: objects(data.components).map(component => ({
      modality: text(component.modality),
      category: text(component.category),
      title: text(component.title),
      objective: text(component.objective),
      hours: {
        sol: typeof (component.hours as Record<string, unknown> | undefined)?.sol === "number" ? Number((component.hours as Record<string, unknown>).sol) : 0,
        dev: typeof (component.hours as Record<string, unknown> | undefined)?.dev === "number" ? Number((component.hours as Record<string, unknown>).dev) : 0,
        doubleCommande: typeof (component.hours as Record<string, unknown> | undefined)?.doubleCommande === "number" ? Number((component.hours as Record<string, unknown>).doubleCommande) : 0,
        solo: typeof (component.hours as Record<string, unknown> | undefined)?.solo === "number" ? Number((component.hours as Record<string, unknown>).solo) : 0
      },
      exercises: list(component.exercises),
      nextLesson: text(component.nextLesson),
      successCriteria: text(component.successCriteria),
      manualPage: typeof component.manualPage === "number" ? component.manualPage : 0
    }))
  }), handlers);
}

export async function saveLesson(lesson: PTRLesson, exists: boolean) {
  const payload = cleanFirestoreData({
    studentId: lesson.studentId,
    phase: lesson.phase,
    lessonNumber: lesson.lessonNumber,
    title: lesson.title,
    objective: lesson.objective,
    exercises: lesson.exercises,
    status: lesson.status,
    linkedReservationId: lesson.linkedReservationId,
    lessonPlanId: lesson.lessonPlanId || "",
    lessonPdfPath: lesson.lessonPdfPath || "",
    lastEvaluationId: lesson.lastEvaluationId || "",
    lastFinalScore: lesson.lastFinalScore ?? null,
    updatedAt: new Date().toISOString(),
    programId: lesson.programId || "",
    programRevision: lesson.programRevision || "",
    sourceManual: lesson.sourceManual || "",
    successCriteria: lesson.successCriteria || [],
    components: lesson.components || [],
    componentStatuses: lesson.componentStatuses || {},
    flightRecords:lesson.flightRecords||[]
  });
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
    finalScore: typeof data.finalScore==="number"&&Number.isFinite(data.finalScore)?data.finalScore:undefined,
    strengths: text(data.strengths),
    improvements: text(data.improvements),
    comments: text(data.comments),
    actions: list(data.actions),
    lessonStatus: text(data.lessonStatus, "En cours") as PTREvaluation["lessonStatus"],
    instructorSignature: text(data.instructorSignature),
    studentSignature: text(data.studentSignature),
    signedAt: text(data.signedAt),
    evaluationType: (text(data.evaluationType) === "ground" ? "ground" : "flight") as PTREvaluation["evaluationType"],
    groundResult: (text(data.groundResult) === "Réussi" ? "Réussi" : text(data.groundResult) === "À reprendre" ? "À reprendre" : undefined) as PTREvaluation["groundResult"]
    ,componentKey:text(data.componentKey),componentModality:text(data.componentModality)
  }), handlers);
}

export async function addEvaluation(value: Omit<PTREvaluation, "id">) {
  const reference = await addDoc(
    collection(db, "ptrEvaluations"),
    cleanFirestoreData({ ...value, createdAt: serverTimestamp() })
  );
  return reference.id;
}

export function subscribeLessonHistory(studentId:string,handlers:LiveHandlers<PTRLessonHistory>){
  return scoped("ptrLessonHistory",studentId,(id,data)=>({
    id,studentId,lessonId:text(data.lessonId),lessonTitle:text(data.lessonTitle),
    action:(text(data.action)==="Activité désassociée"?"Activité désassociée":"Activité supprimée") as PTRLessonHistory["action"],
    activityType:(text(data.activityType)==="Sol"?"Sol":text(data.activityType)==="Simulateur"?"Simulateur":"Vol") as PTRLessonHistory["activityType"],
    activityId:text(data.activityId),previousStatus:text(data.previousStatus,"Non commencé") as PTRLessonHistory["previousStatus"],
    newStatus:"Non commencé" as const,reason:text(data.reason),
    deletedBy:{uid:text((data.deletedBy as Record<string,unknown>|undefined)?.uid),name:text((data.deletedBy as Record<string,unknown>|undefined)?.name),role:text((data.deletedBy as Record<string,unknown>|undefined)?.role)},
    createdAt:text(data.createdAt)
  }),handlers);
}

export async function resetLessonAfterActivityRemoval(value:{
  lesson:PTRLesson;
  activityId:string;
  activityType:PTRLessonHistory["activityType"];
  action:PTRLessonHistory["action"];
  reason:string;
  deletedBy:PTRLessonHistory["deletedBy"];
  requireMissingReservation?:boolean;
}){
  const lessonRef=doc(db,"ptrLessons",value.lesson.id);
  const reservationRef=doc(db,"reservations",value.activityId);
  const historyRef=doc(collection(db,"ptrLessonHistory"));
  return runTransaction(db,async transaction=>{
    const [lessonSnapshot,reservationSnapshot]=await Promise.all([
      transaction.get(lessonRef),transaction.get(reservationRef)
    ]);
    if(!lessonSnapshot.exists())return false;
    if(value.requireMissingReservation&&reservationSnapshot.exists())return false;
    const data=lessonSnapshot.data();
    if(text(data.linkedReservationId)!==value.activityId)return false;
    const previousStatus=text(data.status,"Non commencé") as PTRLesson["status"];
    transaction.update(lessonRef,{
      status:"Non commencé",linkedReservationId:"",componentStatuses:{},updatedAt:new Date().toISOString()
    });
    transaction.set(historyRef,cleanFirestoreData({
      studentId:value.lesson.studentId,lessonId:value.lesson.id,lessonTitle:value.lesson.title,
      action:value.action,activityType:value.activityType,activityId:value.activityId,
      previousStatus,newStatus:"Non commencé",reason:value.reason.trim(),deletedBy:value.deletedBy,
      createdAt:new Date().toISOString(),createdAtServer:serverTimestamp()
    }));
    return true;
  });
}

export function subscribeReservations(studentId: string, handlers: LiveHandlers<ReservationOption>) {
  return scoped("reservations", studentId, (id, data) => ({
    id,
    date: text(data.date),
    startTime: text(data.startTime),
    endTime: text(data.endTime),
    title: text(data.title) || text(data.lesson) || text(data.type),
    type: text(data.type),
    instructorId: text(data.instructorId),
    aircraftId:text(data.aircraftId),lessonPlanId:text(data.lessonPlanId),lessonComponentId:text(data.lessonComponentId)||undefined,simulatorTcId:text(data.simulatorTcId)||undefined,
    status:text(data.status),hobbsStart:typeof data.hobbsStart==="number"?data.hobbsStart:undefined,
    hobbsEnd:typeof data.hobbsEnd==="number"?data.hobbsEnd:undefined,
    takeoffTime:text(data.takeoffTime),landingTime:text(data.landingTime),
    airtimeMinutes:typeof data.airtimeMinutes==="number"?data.airtimeMinutes:undefined,
    groundTimeHours:typeof data.groundTimeHours==="number"?data.groundTimeHours:undefined,
    flightCrewRole:(text(data.flightCrewRole)==="PIC"?"PIC":text(data.flightCrewRole)==="Double"?"Double":undefined) as ReservationOption["flightCrewRole"],
    dayHours:typeof data.dayHours==="number"?data.dayHours:undefined,nightHours:typeof data.nightHours==="number"?data.nightHours:undefined,
    instrumentAircraftHours:typeof data.instrumentAircraftHours==="number"?data.instrumentAircraftHours:undefined,ftdHours:typeof data.ftdHours==="number"?data.ftdHours:undefined,
    crossCountryDayHours:typeof data.crossCountryDayHours==="number"?data.crossCountryDayHours:undefined,crossCountryNightHours:typeof data.crossCountryNightHours==="number"?data.crossCountryNightHours:undefined,
    routeFrom:text(data.routeFrom),routeTo:text(data.routeTo),
    checkInMetar:text(data.checkInMetar),checkOutMetar:text(data.checkOutMetar),
    metarStation:text(data.metarStation),checkedInAt:text(data.checkedInAt),
    checkedInBy:text(data.checkedInBy),checkedOutAt:text(data.checkedOutAt),
    checkedOutBy:text(data.checkedOutBy)
  }), handlers);
}

export function subscribeInstructors(handlers: LiveHandlers<InstructorOption>): Unsubscribe {
  return onSnapshot(collection(db, "instructors"), snap => handlers.next(snap.docs.map(item => {
    const data = item.data();
    const name = text(data.name) || `${text(data.firstName)} ${text(data.lastName)}`.trim();
    return { id: item.id, name: name || item.id };
  })), handlers.error);
}
export function subscribeAircraft(handlers:LiveHandlers<AircraftOption>):Unsubscribe{
  return onSnapshot(collection(db,"aircraft"),snap=>handlers.next(snap.docs.map(item=>{
    const data=item.data();
    return{id:item.id,registration:text(data.registration)||text(data.name)||item.id,type:text(data.typeLabel)||text(data.type)||"Type non précisé"};
  })),handlers.error);
}


export async function saveProfessionalEvaluation(
  lesson: PTRLesson,
  evaluation: import("./types").PTRProfessionalEvaluation
) {
  const reference = await addDoc(
    collection(db, "ptrEvaluations"),
    {
      ...evaluation,
      createdAt: serverTimestamp()
    }
  );

  await setDoc(
    doc(db, "ptrLessons", lesson.id),
    {
      status: evaluation.finalScore >= 3 ? "Réussi" : "À reprendre",
      linkedReservationId: evaluation.reservationId,
      lastEvaluationId: reference.id,
      lastFinalScore: evaluation.finalScore,
      averageScore: evaluation.averageScore,
      weakItems: evaluation.weakItems,
      unseenItems: evaluation.unseenItems,
      updatedAt: new Date().toISOString()
    },
    { merge: true }
  );

  return reference.id;
}

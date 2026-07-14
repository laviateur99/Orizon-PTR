import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, writeBatch, type DocumentData, type FirestoreError, type Unsubscribe } from "firebase/firestore";
import { db } from "@/services/firebase/client";
import type { Cancellation, FlightOperationUpdate, SchedulerEvent, SchedulerResource } from "./types";
import { DEFAULT_SCHEDULER_SETTINGS, type SchedulerSettings } from "./settings";
export type LiveHandlers<T>={next:(items:T[])=>void;error:(error:FirestoreError)=>void};
const text=(v:unknown,f="")=>typeof v==="string"?v:f; const optional=(v:unknown)=>{const r=text(v).trim();return r||undefined};
const num=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)?v:undefined;

function cleanFirestoreData<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter(item => item !== undefined)
      .map(item => cleanFirestoreData(item)) as T;
  }

  if (value && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype === Object.prototype || prototype === null) {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .filter(([, item]) => item !== undefined)
          .map(([key, item]) => [key, cleanFirestoreData(item)])
      ) as T;
    }
  }

  return value;
}

function minutes(v:unknown,f:number){if(typeof v==="number"&&Number.isFinite(v))return v;if(typeof v!=="string"||!/^\d{1,2}:\d{2}$/.test(v))return f;const [h,m]=v.split(":").map(Number);return h*60+m;}
function mapResource(id:string,d:DocumentData,kind:SchedulerResource["kind"]):SchedulerResource{const effective:SchedulerResource["kind"]=kind==="room"&&text(d.resourceKind)==="simulator"?"simulator":kind;const name=text(d.name)||text(d.registration)||`${effective}-${id}`;const typeLabel=text(d.typeLabel)||text(d.type);const detail=text(d.detail)||[typeLabel,text(d.classLevel),text(d.status)].filter(Boolean).join(" · ");const groupLabel=effective==="aircraft"?(typeLabel||"Autres avions"):effective==="simulator"?"Simulateurs":effective==="instructor"?"Instructeurs":"Locaux";return{id,kind:effective,name,detail,groupLabel,order:typeof d.scheduleOrder==="number"?d.scheduleOrder:9999,blocked:effective==="aircraft"&&(d.blockedForScheduling===true||["Maintenance","Hors service","SNAG"].includes(text(d.status)))}}
export function subscribeResources(h:LiveHandlers<SchedulerResource>):Unsubscribe{const values=new Map<string,SchedulerResource[]>();const emit=()=>h.next([...(values.get("aircraft")??[]),...(values.get("instructors")??[]),...(values.get("resources")??[])]);const configs=[{name:"aircraft",kind:"aircraft" as const},{name:"instructors",kind:"instructor" as const},{name:"resources",kind:"room" as const}];const offs=configs.map(c=>onSnapshot(collection(db,c.name),s=>{values.set(c.name,s.docs.map(i=>mapResource(i.id,i.data(),c.kind)));emit();},h.error));return()=>offs.forEach(x=>x());}
function mapEvent(id:string,d:DocumentData):SchedulerEvent{return {id,date:text(d.date,new Date().toISOString().slice(0,10)),resourceId:text(d.resourceId)||text(d.aircraftId)||text(d.instructorId)||text(d.roomId),aircraftId:optional(d.aircraftId),instructorId:optional(d.instructorId),roomId:optional(d.roomId),studentId:optional(d.studentId),studentName:optional(d.studentName)||optional(d.student),type:text(d.type,"Double commande") as SchedulerEvent["type"],startMinutes:minutes(d.startMinutes??d.startTime,420),endMinutes:minutes(d.endMinutes??d.endTime,480),title:text(d.title)||text(d.lesson)||text(d.type,"Réservation"),notes:optional(d.notes),source:"reservation",status:text(d.status,"Planifié") as SchedulerEvent["status"],checkedInAt:optional(d.checkedInAt),checkedInBy:optional(d.checkedInBy),checkedOutAt:optional(d.checkedOutAt),checkedOutBy:optional(d.checkedOutBy),hobbsStart:num(d.hobbsStart),hobbsEnd:num(d.hobbsEnd),takeoffTime:optional(d.takeoffTime),landingTime:optional(d.landingTime),airtimeMinutes:num(d.airtimeMinutes),overdueAlertMinutes:num(d.overdueAlertMinutes),
lessonPlanId:optional(d.lessonPlanId),
lessonTitle:optional(d.lessonTitle),
lessonPdfPath:optional(d.lessonPdfPath),
lessonComponentId:optional(d.lessonComponentId)};}
export function subscribeReservations(h:LiveHandlers<SchedulerEvent>):Unsubscribe{return onSnapshot(collection(db,"reservations"),s=>h.next(s.docs.map(i=>mapEvent(i.id,i.data()))),h.error);}
export function subscribeSnagBlocks(h:LiveHandlers<SchedulerEvent>):Unsubscribe{
  return onSnapshot(collection(db,"snags"),snapshot=>{
    const blocks:SchedulerEvent[]=[];
    snapshot.docs.forEach(item=>{
      const data=item.data();
      if(text(data.status)==="Fermé")return;

      const reported=text(data.reportedAt);
      const startDate=reported.slice(0,10)||new Date().toISOString().slice(0,10);
      const endDate=text(data.estimatedReturnDate)||startDate;
      const reportedTime=reported.slice(11,16);
      const firstStart=minutes(reportedTime,420);

      const cursor=new Date(`${startDate}T12:00:00`);
      const end=new Date(`${endDate}T12:00:00`);
      let dayIndex=0;

      while(cursor<=end && dayIndex<370){
        const date=cursor.toISOString().slice(0,10);
        blocks.push({
          id:`snag-${item.id}-${date}`,
          date,
          rangeEndDate:endDate,
          resourceId:text(data.aircraftId),
          aircraftId:text(data.aircraftId),
          type:"Maintenance",
          startMinutes:dayIndex===0?firstStart:0,
          endMinutes:1440,
          title:`SNAG ${reportedTime ? `(${reportedTime})` : ""} — ${text(data.defectTitle,"Défectuosité")}`,
          notes:text(data.description),
          source:"snag",
          snagId:item.id,
          status:"Planifié"
        });
        cursor.setDate(cursor.getDate()+1);
        dayIndex+=1;
      }
    });
    h.next(blocks);
  },h.error);
}
export function subscribeCancellations(h:LiveHandlers<Cancellation>):Unsubscribe{const q=query(collection(db,"cancellations"),orderBy("cancelledAt","desc"));return onSnapshot(q,s=>h.next(s.docs.map(i=>{const d=i.data();return{id:i.id,eventId:text(d.eventId),eventTitle:text(d.eventTitle)||text(d.title,"Réservation"),reason:text(d.reason,"Autre"),cancelledAt:text(d.cancelledAt)}})),h.error);}
function time(v:number){return`${String(Math.floor(v/60)).padStart(2,"0")}:${String(v%60).padStart(2,"0")}`}
function payload(e:SchedulerEvent){return{date:e.date,resourceId:e.resourceId,aircraftId:e.aircraftId??"",instructorId:e.instructorId??"",roomId:e.roomId??"",studentId:e.studentId??"",studentName:e.studentName??"",type:e.type,startMinutes:e.startMinutes,endMinutes:e.endMinutes,startTime:time(e.startMinutes),endTime:time(e.endMinutes),title:e.title,lesson:e.title,notes:e.notes??"",status:e.status??"Planifié",checkedInAt:e.checkedInAt??"",checkedInBy:e.checkedInBy??"",checkedOutAt:e.checkedOutAt??"",checkedOutBy:e.checkedOutBy??"",hobbsStart:e.hobbsStart??null,hobbsEnd:e.hobbsEnd??null,takeoffTime:e.takeoffTime??"",landingTime:e.landingTime??"",airtimeMinutes:e.airtimeMinutes??null,overdueAlertMinutes:e.overdueAlertMinutes??null,
lessonPlanId:e.lessonPlanId??"",
lessonTitle:e.lessonTitle??"",
lessonPdfPath:e.lessonPdfPath??"",
lessonComponentId:e.lessonComponentId??"",
updatedAt:serverTimestamp()};}
export async function saveReservation(e:SchedulerEvent,exists:boolean){const r=doc(db,"reservations",e.id);if(exists)await updateDoc(r,cleanFirestoreData(payload(e)));else await setDoc(r,cleanFirestoreData({...payload(e),createdAt:serverTimestamp()}));}
export async function updateFlightOperation(
  id: string,
  patch: FlightOperationUpdate
) {
  const payload = cleanFirestoreData({
    ...patch,
    updatedAt: serverTimestamp()
  });
  await updateDoc(doc(db, "reservations", id), payload);
}

export async function markLinkedPTRLessonAfterCheckout(event: SchedulerEvent) {
  if (!event.studentId || !event.lessonPlanId) return;
  const lessonId = `${event.studentId}-${event.lessonPlanId}`;
  await setDoc(
    doc(db, "ptrLessons", lessonId),
    {
      studentId: event.studentId,
      lessonPlanId: event.lessonPlanId,
      lessonPdfPath: event.lessonPdfPath || "",
      linkedReservationId: event.id,
      status: "En cours",
      lastFlightStatus: "Complété",
      lastCheckoutAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    { merge: true }
  );
}
export async function removeReservation(e:SchedulerEvent,reason:string){await addDoc(collection(db,"cancellations"),cleanFirestoreData({eventId:e.id,eventTitle:e.title,reason,cancelledAt:new Date().toISOString(),reservation:payload(e)}));await deleteDoc(doc(db,"reservations",e.id));}
export type StudentOption={id:string;name:string};
export function subscribeStudents(h:LiveHandlers<StudentOption>):Unsubscribe{return onSnapshot(collection(db,"students"),s=>h.next(s.docs.map(i=>{const d=i.data();return{id:i.id,name:text(d.name)||`${text(d.firstName)} ${text(d.lastName)}`.trim()||i.id}})),h.error);}

export function subscribeSchedulerSettings(h:LiveHandlers<SchedulerSettings>):Unsubscribe{
  return onSnapshot(doc(db,"appSettings","scheduler"),snapshot=>{
    if(!snapshot.exists()){h.next([DEFAULT_SCHEDULER_SETTINGS]);return;}
    const d=snapshot.data();
    const start=typeof d.startHour==="number"?d.startHour:DEFAULT_SCHEDULER_SETTINGS.startHour;
    const end=typeof d.endHour==="number"?d.endHour:DEFAULT_SCHEDULER_SETTINGS.endHour;
    const slot=(d.slotMinutes===15||d.slotMinutes===30||d.slotMinutes===60)?d.slotMinutes:DEFAULT_SCHEDULER_SETTINGS.slotMinutes;
    h.next([{startHour:start,endHour:end,slotMinutes:slot,updatedAt:text(d.updatedAt),updatedBy:text(d.updatedBy)}]);
  },h.error);
}
export async function saveResourceScheduleOrder(
  items: Array<{id:string;kind:SchedulerResource["kind"];order:number}>
){
  const batch = writeBatch(db);
  items.forEach(item=>{
    const collectionName =
      item.kind==="aircraft" ? "aircraft" :
      item.kind==="instructor" ? "instructors" : "resources";
    batch.set(
      doc(db,collectionName,item.id),
      {scheduleOrder:item.order,updatedAt:new Date().toISOString()},
      {merge:true}
    );
  });
  await batch.commit();
}

export async function saveSchedulerSettings(value:SchedulerSettings){
  await setDoc(doc(db,"appSettings","scheduler"),{...value,updatedAt:new Date().toISOString()},{merge:true});
}


export async function assignLessonToStudentPTR(
  event: SchedulerEvent
) {
  if (!event.studentId || !event.lessonPlanId) return;

  const lessonId = `${event.studentId}-${event.lessonPlanId}`;
  await setDoc(
    doc(db, "ptrLessons", lessonId),
    {
      studentId: event.studentId,
      phase: event.lessonPlanId.split("-")[0] || "Programme",
      lessonNumber: event.lessonPlanId,
      title: event.lessonTitle || event.title,
      objective: "Voir le plan de leçon officiel associé.",
      exercises: [],
      status: "Non commencé",
      linkedReservationId: event.id,
      lessonPlanId: event.lessonPlanId,
      lessonPdfPath: event.lessonPdfPath || "",
      updatedAt: new Date().toISOString(),
      createdAt: serverTimestamp()
    },
    { merge: true }
  );
}

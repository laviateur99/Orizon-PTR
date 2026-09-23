import {arrayRemove,arrayUnion,collection,deleteDoc,doc,getDocs,onSnapshot,query,serverTimestamp,setDoc,where,writeBatch,type DocumentData,type FirestoreError,type Unsubscribe} from "firebase/firestore";
import {db} from "@/services/firebase/client";
import type{SchedulerEvent}from"@/features/scheduler/types";
import{schedulerEventPayload}from"@/features/scheduler/firestore";
import type{TheoryCohort,TheorySession}from"./types";

const text=(value:unknown)=>typeof value==="string"?value:"";
const strings=(value:unknown)=>Array.isArray(value)?value.filter((item):item is string=>typeof item==="string"):[];
const attendance=(value:unknown)=>value&&typeof value==="object"?Object.fromEntries(Object.entries(value).filter(([,status])=>status==="Présent"||status==="Absent")) as Record<string,"Présent"|"Absent">:{};
const withoutUndefined=(value:Record<string,unknown>)=>Object.fromEntries(Object.entries(value).filter(([,item])=>item!==undefined));
const mapCohort=(id:string,data:DocumentData):TheoryCohort=>({id,name:text(data.name),program:text(data.program),studentIds:strings(data.studentIds),...(data.theoryCourseType==="PPL"||data.theoryCourseType==="CPL"||data.theoryCourseType==="OTHER"?{theoryCourseType:data.theoryCourseType}:{})});
const mapSession=(id:string,data:DocumentData):TheorySession=>({id,title:text(data.title),program:text(data.program),topic:text(data.topic),date:text(data.date),startTime:text(data.startTime),endTime:text(data.endTime),instructorId:text(data.instructorId),instructorName:text(data.instructorName),roomId:text(data.roomId),roomName:text(data.roomName),cohortId:text(data.cohortId),cohortName:text(data.cohortName),studentIds:strings(data.studentIds),studentNames:strings(data.studentNames),additionalStudentIds:strings(data.additionalStudentIds),additionalParticipantsVersion:typeof data.additionalParticipantsVersion==="number"?data.additionalParticipantsVersion:undefined,attendance:attendance(data.attendance),status:(text(data.status)||"Planifiée") as TheorySession["status"],notes:text(data.notes)});
export function subscribeTheoryCohorts(next:(values:TheoryCohort[])=>void,error:(value:FirestoreError)=>void):Unsubscribe{return onSnapshot(collection(db,"theoryCohorts"),snapshot=>next(snapshot.docs.map(item=>mapCohort(item.id,item.data()))),error);}
export function subscribeTheorySessions(next:(values:TheorySession[])=>void,error:(value:FirestoreError)=>void):Unsubscribe{return onSnapshot(collection(db,"theorySessions"),snapshot=>next(snapshot.docs.map(item=>mapSession(item.id,item.data()))),error);}
export function subscribeTheorySessionsForStudent(studentId:string,next:(values:TheorySession[])=>void,error:(value:FirestoreError)=>void):Unsubscribe{return onSnapshot(query(collection(db,"theorySessions"),where("studentIds","array-contains",studentId)),snapshot=>next(snapshot.docs.map(item=>mapSession(item.id,item.data()))),error);}
export async function saveTheoryCohort(value:TheoryCohort){
  const cohortRef=doc(db,"theoryCohorts",value.id);
  const [sessionsSnapshot,studentsSnapshot]=await Promise.all([getDocs(collection(db,"theorySessions")),getDocs(collection(db,"students"))]);
  const studentNames=new Map(studentsSnapshot.docs.map(item=>{const data=item.data();return[item.id,text(data.name)||`${text(data.firstName)} ${text(data.lastName)}`.trim()||item.id]}));
  const batch=writeBatch(db);
  batch.set(cohortRef,{...withoutUndefined(value as unknown as Record<string,unknown>),updatedAt:serverTimestamp()},{merge:true});
  sessionsSnapshot.docs.forEach(item=>{
    const data=item.data();
    if(text(data.cohortId)!==value.id||text(data.status)==="Complétée")return;
    const additionalStudentIds=data.additionalParticipantsVersion===2?strings(data.additionalStudentIds):[];
    const participantIds=Array.from(new Set([...value.studentIds,...additionalStudentIds]));
    const participantNames=participantIds.map(id=>studentNames.get(id)||id);
    const previousAttendance=attendance(data.attendance);
    const nextAttendance=Object.fromEntries(Object.entries(previousAttendance).filter(([id])=>participantIds.includes(id)));
    batch.update(item.ref,{cohortName:value.name,studentIds:participantIds,studentNames:participantNames,additionalStudentIds,additionalParticipantsVersion:2,attendance:nextAttendance,updatedAt:serverTimestamp()});
    batch.set(doc(db,"reservations",`theory-${item.id}`),{participantStudentIds:participantIds,participantStudentNames:participantNames,theoryAttendance:nextAttendance,updatedAt:serverTimestamp()},{merge:true});
  });
  await batch.commit();
}
export async function deleteTheoryCohort(id:string){await deleteDoc(doc(db,"theoryCohorts",id));}
export async function assignStudentToTheoryCohort(studentId:string,cohortId:string){
  const snapshot=await getDocs(collection(db,"theoryCohorts"));
  const batch=writeBatch(db);
  snapshot.docs.forEach(item=>{
    if(item.id===cohortId)batch.update(item.ref,{studentIds:arrayUnion(studentId),updatedAt:serverTimestamp()});
    else if(strings(item.data().studentIds).includes(studentId))batch.update(item.ref,{studentIds:arrayRemove(studentId),updatedAt:serverTimestamp()});
  });
  await batch.commit();
}
const minutes=(value:string)=>{const[hour,minute]=value.split(":").map(Number);return hour*60+minute;};
export async function saveTheorySession(value:TheorySession){
  const event:SchedulerEvent={
    id:`theory-${value.id}`,theoreticalSessionId:value.id,date:value.date,resourceId:value.instructorId,
    instructorId:value.instructorId,roomId:value.roomId||undefined,participantStudentIds:value.studentIds,participantStudentNames:value.studentNames,theoryAttendance:value.attendance,
    type:"Sol",startMinutes:minutes(value.startTime),endMinutes:minutes(value.endTime),
    title:`Théorie — ${value.title}`,notes:[value.topic,value.cohortName,value.notes].filter(Boolean).join(" · "),
    groundTimeHours:value.status==="Complétée"?Math.round((minutes(value.endTime)-minutes(value.startTime))/6)/10:undefined,
    status:value.status==="Complétée"?"Complété":value.status==="Annulée"?"Annulé":"Planifié"
  };
  const batch=writeBatch(db);
  batch.set(doc(db,"theorySessions",value.id),{...value,additionalStudentIds:value.additionalStudentIds||[],additionalParticipantsVersion:2,updatedAt:serverTimestamp()},{merge:true});
  batch.set(doc(db,"reservations",event.id),{...schedulerEventPayload(event),updatedAt:serverTimestamp()},{merge:true});
  await batch.commit();
}
export async function deleteTheorySession(value:TheorySession){
  await Promise.all([deleteDoc(doc(db,"theorySessions",value.id)),deleteDoc(doc(db,"reservations",`theory-${value.id}`))]);
}

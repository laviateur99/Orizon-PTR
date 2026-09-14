import {addDoc,collection,deleteDoc,deleteField,doc,getDoc,getDocs,onSnapshot,query,serverTimestamp,setDoc,updateDoc,where,writeBatch,type DocumentData,type FirestoreError,type Unsubscribe} from "firebase/firestore";
import {db} from "@/services/firebase/client";
import type {UserRole} from "@/features/auth/types";
import type {SchedulerEvent} from "@/features/scheduler/types";
import type {CommunicationAcknowledgement,EmployeeAircraftQualification,EmployeeCommunication,EmployeeComplianceRecord,EmployeeLeave,EmployeePayrollProfile,EmployeeTrainingRecord,PayPeriod,PayrollActor,PayrollClass,PayrollClassRate,PayrollExport,TimeClockEntry,TimeEntry,TimeEntryStatus} from "./types";
import {requiredAdjustmentHours,schedulerTimeEntryComponents} from "./timeEntrySync";
import{payrollPeriodForDate,type PayrollPeriodWindow}from"./payPeriods";

const text=(value:unknown)=>typeof value==="string"?value:"";
const mapCommunication=(id:string,data:DocumentData):EmployeeCommunication=>({id,title:text(data.title),body:text(data.body),audienceRoles:Array.isArray(data.audienceRoles)?data.audienceRoles as UserRole[]:[],required:data.required===true,active:data.active!==false,createdAt:text(data.createdAt),createdBy:text(data.createdBy),createdByName:text(data.createdByName)});
export function subscribeCommunications(next:(values:EmployeeCommunication[])=>void,error:(value:FirestoreError)=>void):Unsubscribe{return onSnapshot(collection(db,"employeeCommunications"),snapshot=>next(snapshot.docs.map(item=>mapCommunication(item.id,item.data())).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))),error);}
export function subscribeAcknowledgements(uid:string,next:(values:CommunicationAcknowledgement[])=>void,error:(value:FirestoreError)=>void):Unsubscribe{const q=query(collection(db,"communicationAcknowledgements"),where("uid","==",uid));return onSnapshot(q,snapshot=>next(snapshot.docs.map(item=>({id:item.id,...item.data()} as CommunicationAcknowledgement))),error);}
export function subscribeAllAcknowledgements(next:(values:CommunicationAcknowledgement[])=>void,error:(value:FirestoreError)=>void):Unsubscribe{return onSnapshot(collection(db,"communicationAcknowledgements"),snapshot=>next(snapshot.docs.map(item=>({id:item.id,...item.data()} as CommunicationAcknowledgement))),error);}
export async function createCommunication(value:Omit<EmployeeCommunication,"id"|"createdAt">){await addDoc(collection(db,"employeeCommunications"),{...value,createdAt:new Date().toISOString(),createdAtServer:serverTimestamp()});}
export async function setCommunicationActive(id:string,active:boolean){await updateDoc(doc(db,"employeeCommunications",id),{active,updatedAt:serverTimestamp()});}
export async function acknowledgeCommunication(communicationId:string,uid:string,name:string,email:string){await setDoc(doc(db,"communicationAcknowledgements",`${communicationId}_${uid}`),{communicationId,uid,name,email,readAt:new Date().toISOString(),readAtServer:serverTimestamp()});}

const number=(value:unknown,fallback=0)=>typeof value==="number"&&Number.isFinite(value)?value:fallback;
const mapLeave=(id:string,data:DocumentData):EmployeeLeave=>({
 id,employeeId:text(data.employeeId),employeeName:text(data.employeeName),employeeRole:data.employeeRole as EmployeeLeave["employeeRole"],
 type:data.type as EmployeeLeave["type"],startDate:text(data.startDate),endDate:text(data.endDate),hoursPerDay:number(data.hoursPerDay,8),
 status:(text(data.status)||"En attente") as EmployeeLeave["status"],notes:text(data.notes),requestedBy:text(data.requestedBy),
 requestedAt:text(data.requestedAt),reviewedBy:text(data.reviewedBy)||undefined,reviewedByName:text(data.reviewedByName)||undefined,reviewedAt:text(data.reviewedAt)||undefined
});
export function subscribeEmployeeLeaves(employeeId:string|undefined,manager:boolean,next:(values:EmployeeLeave[])=>void,error:(value:FirestoreError)=>void):Unsubscribe{
 const reference=manager||!employeeId?collection(db,"employeeLeaves"):query(collection(db,"employeeLeaves"),where("employeeId","==",employeeId));
 return onSnapshot(reference,snapshot=>next(snapshot.docs.map(item=>mapLeave(item.id,item.data())).sort((a,b)=>b.startDate.localeCompare(a.startDate))),error);
}
export async function saveEmployeeLeave(value:EmployeeLeave){
 await setDoc(doc(db,"employeeLeaves",value.id),{...value,updatedAt:serverTimestamp(),createdAtServer:serverTimestamp()},{merge:true});
 if(value.status==="Approuvé")await setDoc(doc(db,"employeeAbsences",value.id),{employeeId:value.employeeId,startDate:value.startDate,endDate:value.endDate,status:"Approuvé",updatedAt:serverTimestamp()},{merge:true});
}
export async function reviewEmployeeLeave(id:string,status:EmployeeLeave["status"],reviewerId:string,reviewerName:string){
 await updateDoc(doc(db,"employeeLeaves",id),{status,reviewedBy:reviewerId,reviewedByName:reviewerName,reviewedAt:new Date().toISOString(),updatedAt:serverTimestamp()});
 if(status==="Approuvé"){
  const match=await getDoc(doc(db,"employeeLeaves",id));
  if(match.exists()){const data=match.data();await setDoc(doc(db,"employeeAbsences",id),{employeeId:text(data.employeeId),startDate:text(data.startDate),endDate:text(data.endDate),status:"Approuvé",updatedAt:serverTimestamp()},{merge:true});}
 }else await deleteDoc(doc(db,"employeeAbsences",id));
}
export async function deleteEmployeeLeave(id:string){await Promise.all([deleteDoc(doc(db,"employeeLeaves",id)),deleteDoc(doc(db,"employeeAbsences",id))]);}
export async function createCamilleExampleLeave(requestedBy:string){
 const date=new Date();date.setHours(12,0,0,0);date.setDate(date.getDate()+3);
 const value=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
 await setDoc(doc(db,"employeeLeaves","demo-payroll-camille-pending-vacation"),{
  employeeId:"demo-payroll-instructor-b",employeeName:"Camille Bérubé",employeeRole:"Instructeur",type:"Vacances",
  startDate:value,endDate:value,hoursPerDay:8,status:"En attente",notes:"Exemple — demande de vacances à approuver",
  requestedBy,requestedAt:new Date().toISOString(),isTestData:true,updatedAt:serverTimestamp(),createdAtServer:serverTimestamp()
 },{merge:true});
}

const mapClock=(id:string,data:DocumentData):TimeClockEntry=>({
 id,employeeId:text(data.employeeId),employeeName:text(data.employeeName),date:text(data.date),clockIn:text(data.clockIn),clockOut:text(data.clockOut),
 breakMinutes:number(data.breakMinutes),notes:text(data.notes),status:(text(data.status)||"Ouvert") as TimeClockEntry["status"],createdBy:text(data.createdBy)
});
export function subscribeTimeClockEntries(employeeId:string|undefined,manager:boolean,next:(values:TimeClockEntry[])=>void,error:(value:FirestoreError)=>void):Unsubscribe{
 const reference=manager||!employeeId?collection(db,"employeeTimeClock"):query(collection(db,"employeeTimeClock"),where("employeeId","==",employeeId));
 return onSnapshot(reference,snapshot=>next(snapshot.docs.map(item=>mapClock(item.id,item.data())).sort((a,b)=>b.date.localeCompare(a.date)||b.clockIn.localeCompare(a.clockIn))),error);
}
export async function saveTimeClockEntry(value:TimeClockEntry){
 await setDoc(doc(db,"employeeTimeClock",value.id),{...value,updatedAt:serverTimestamp()},{merge:true});
}
export async function deleteTimeClockEntry(id:string){await deleteDoc(doc(db,"employeeTimeClock",id));}

const actor=(value:unknown):PayrollActor=>{const data=value&&typeof value==="object"?value as Record<string,unknown>:{};return{uid:text(data.uid),name:text(data.name),role:text(data.role)}};
const mapTimeEntry=(id:string,data:DocumentData):TimeEntry=>({
 id,employeeId:text(data.employeeId),employeeName:text(data.employeeName),category:data.category as TimeEntry["category"],workDate:text(data.workDate),durationHours:number(data.durationHours),
 source:data.source as TimeEntry["source"],sourceId:text(data.sourceId),sourceComponent:data.sourceComponent as TimeEntry["sourceComponent"],payPeriodId:text(data.payPeriodId),status:((text(data.status)==="Soumis"?"Soumis employé":text(data.status)==="Approuvé"?"Approuvé administration":text(data.status))||"Brouillon") as TimeEntryStatus,
 reservationId:text(data.reservationId)||undefined,studentId:text(data.studentId)||undefined,aircraftId:text(data.aircraftId)||undefined,activityType:text(data.activityType)||undefined,description:text(data.description)||undefined,
 rateSnapshot:typeof data.rateSnapshot==="number"?data.rateSnapshot:undefined,bonusSnapshot:typeof data.bonusSnapshot==="number"?data.bonusSnapshot:undefined,amountSnapshot:typeof data.amountSnapshot==="number"?data.amountSnapshot:undefined,
 createdBy:actor(data.createdBy),createdAt:text(data.createdAt),updatedBy:data.updatedBy?actor(data.updatedBy):undefined,updatedAt:text(data.updatedAt),submittedBy:data.submittedBy?actor(data.submittedBy):undefined,submittedAt:text(data.submittedAt)||undefined,approvedBy:data.approvedBy?actor(data.approvedBy):undefined,approvedAt:text(data.approvedAt)||undefined,
 correctionReason:text(data.correctionReason)||undefined,replacesEntryId:text(data.replacesEntryId)||undefined,validationMode:data.validationMode==="Tests internes Flight Director"?"Tests internes Flight Director":undefined
});
export function subscribeTimeEntries(employeeId:string|undefined,manager:boolean,next:(values:TimeEntry[])=>void,error:(value:FirestoreError)=>void):Unsubscribe{
 if(!manager&&!employeeId){next([]);return()=>undefined;}
 const reference=manager?collection(db,"timeEntries"):query(collection(db,"timeEntries"),where("employeeId","==",employeeId));
 return onSnapshot(reference,snapshot=>next(snapshot.docs.map(item=>mapTimeEntry(item.id,item.data())).sort((a,b)=>b.workDate.localeCompare(a.workDate)||a.category.localeCompare(b.category))),error);
}
const historyRef=()=>doc(collection(db,"timeEntryHistory"));
export async function saveTimeEntryDraft(value:TimeEntry,currentActor:PayrollActor,reason:string){
 if(!reason.trim())throw new Error("La raison est obligatoire.");
 if(value.status!=="Brouillon")throw new Error("Seule une entrée en brouillon peut être enregistrée directement.");
 const reference=doc(db,"timeEntries",value.id),previous=await getDoc(reference),now=new Date().toISOString(),batch=writeBatch(db),period=payrollPeriodForDate(value.workDate),periodRef=doc(db,"payPeriods",period.id),periodSnapshot=await getDoc(periodRef);
 if(!periodSnapshot.exists())batch.set(periodRef,{...period,status:"Ouverte",validationMode:"Tests internes Flight Director",createdBy:currentActor,createdAt:now,createdAtServer:serverTimestamp(),updatedAt:now});
 batch.set(reference,{...value,payPeriodId:period.id,createdBy:previous.exists()?previous.data().createdBy:currentActor,createdAt:previous.exists()?text(previous.data().createdAt):now,updatedBy:currentActor,updatedAt:now,updatedAtServer:serverTimestamp(),...(!previous.exists()?{createdAtServer:serverTimestamp()}:{})},{merge:true});
 batch.set(historyRef(),{timeEntryId:value.id,employeeId:value.employeeId,action:previous.exists()?"Entrée de temps modifiée":"Entrée de temps créée",previousValue:previous.exists()?previous.data():null,newValue:value,reason:reason.trim(),actorId:currentActor.uid,actorName:currentActor.name,actorRole:currentActor.role,eventAt:now,createdAt:serverTimestamp()});
 await batch.commit();
}
export async function submitTimeEntryPeriod(employeeId:string,payPeriodId:string,currentActor:PayrollActor){
 const entries=await getDocs(query(collection(db,"timeEntries"),where("employeeId","==",employeeId),where("payPeriodId","==",payPeriodId))),drafts=entries.docs.filter(item=>["Brouillon","Ajustement"].includes(text(item.data().status)));
 if(!drafts.length)throw new Error("Cette période ne contient aucune entrée en brouillon.");
 if(drafts.some(item=>!text(item.data().employeeId)||!text(item.data().category)||!text(item.data().workDate)||number(item.data().durationHours)<=0))throw new Error("Une entrée obligatoire est incomplète.");
 const now=new Date().toISOString(),batch=writeBatch(db);
 for(const item of drafts){const previousStatus=text(item.data().status);batch.update(item.ref,{status:"Soumis employé",submittedBy:currentActor,submittedAt:now,updatedBy:currentActor,updatedAt:now,updatedAtServer:serverTimestamp()});batch.set(historyRef(),{timeEntryId:item.id,employeeId,action:"Période soumise par l’employé",previousValue:{status:previousStatus},newValue:{status:"Soumis employé"},reason:"Soumission de la période par l’employé.",actorId:currentActor.uid,actorName:currentActor.name,actorRole:currentActor.role,eventAt:now,createdAt:serverTimestamp()});}
 await batch.commit();
}
export async function requestTimeEntryCorrection(id:string,currentActor:PayrollActor,comment:string){
 if(!comment.trim())throw new Error("Le commentaire de correction est obligatoire.");
 const reference=doc(db,"timeEntries",id),snapshot=await getDoc(reference);if(!snapshot.exists())throw new Error("Entrée de temps introuvable.");
 const before=snapshot.data(),status=text(before.status);if(!["Brouillon","Soumis employé"].includes(status))throw new Error("Une entrée approuvée ou verrouillée ne peut pas être modifiée par l’employé.");
 const now=new Date().toISOString(),batch=writeBatch(db);batch.update(reference,{status:"Correction requise",correctionReason:comment.trim(),updatedBy:currentActor,updatedAt:now,updatedAtServer:serverTimestamp()});batch.set(historyRef(),{timeEntryId:id,employeeId:text(before.employeeId),action:"Correction demandée par l’employé",previousValue:{status},newValue:{status:"Correction requise",comment:comment.trim()},reason:comment.trim(),actorId:currentActor.uid,actorName:currentActor.name,actorRole:currentActor.role,eventAt:now,createdAt:serverTimestamp()});await batch.commit();
}
export type PayrollReviewAction="approve"|"correction"|"refuse";
export async function reviewTimeEntryPeriod(employeeId:string,payPeriodId:string,action:PayrollReviewAction,currentActor:PayrollActor,reason:string,snapshots:Record<string,{rate:number;bonus:number;amount:number}>={}){
 if(!reason.trim())throw new Error("La raison est obligatoire.");
 const entries=await getDocs(query(collection(db,"timeEntries"),where("employeeId","==",employeeId),where("payPeriodId","==",payPeriodId))),targets=entries.docs.filter(item=>text(item.data().status)==="Soumis employé");
 if(!targets.length)throw new Error("Aucune entrée soumise à traiter.");
 const status:TimeEntryStatus=action==="approve"?"Approuvé administration":action==="correction"?"Correction requise":"Refusé",now=new Date().toISOString(),batch=writeBatch(db);
 for(const item of targets){const frozen=snapshots[item.id],approval=action==="approve"?{approvedBy:currentActor,approvedAt:now,rateSnapshot:frozen?.rate||0,bonusSnapshot:frozen?.bonus||0,amountSnapshot:frozen?.amount||0}:{};batch.update(item.ref,{status,...approval,correctionReason:action==="correction"||action==="refuse"?reason.trim():text(item.data().correctionReason),updatedBy:currentActor,updatedAt:now,updatedAtServer:serverTimestamp()});batch.set(historyRef(),{timeEntryId:item.id,employeeId,action:action==="approve"?"Entrée approuvée par l’administration":action==="correction"?"Entrée retournée pour correction":"Entrée refusée",previousValue:{status:"Soumis employé"},newValue:{status,...(frozen?{rateSnapshot:frozen.rate,bonusSnapshot:frozen.bonus,amountSnapshot:frozen.amount}:{})},reason:reason.trim(),actorId:currentActor.uid,actorName:currentActor.name,actorRole:currentActor.role,eventAt:now,createdAt:serverTimestamp()});}
 await batch.commit();
}
const mapPayPeriod=(id:string,data:DocumentData):PayPeriod=>({id,startDate:text(data.startDate),endDate:text(data.endDate),status:data.status as PayPeriod["status"],validationMode:data.validationMode==="Tests internes Flight Director"?"Tests internes Flight Director":undefined,administrationApprovedBy:data.administrationApprovedBy?actor(data.administrationApprovedBy):undefined,administrationApprovedAt:text(data.administrationApprovedAt)||undefined,accountingApprovedBy:data.accountingApprovedBy?actor(data.accountingApprovedBy):undefined,accountingApprovedAt:text(data.accountingApprovedAt)||undefined,approvedBy:data.approvedBy?actor(data.approvedBy):undefined,approvedAt:text(data.approvedAt)||undefined,lockedBy:data.lockedBy?actor(data.lockedBy):undefined,lockedAt:text(data.lockedAt)||undefined,createdAt:text(data.createdAt),updatedAt:text(data.updatedAt)});
export function subscribePayPeriods(next:(values:PayPeriod[])=>void,error:(value:FirestoreError)=>void):Unsubscribe{return onSnapshot(collection(db,"payPeriods"),snapshot=>next(snapshot.docs.map(item=>mapPayPeriod(item.id,item.data())).sort((a,b)=>b.startDate.localeCompare(a.startDate))),error);}
export async function ensurePayrollPeriod(period:PayrollPeriodWindow,currentActor:PayrollActor){const reference=doc(db,"payPeriods",period.id),snapshot=await getDoc(reference);if(snapshot.exists())return;const now=new Date().toISOString();await setDoc(reference,{...period,status:"Ouverte",validationMode:"Tests internes Flight Director",createdBy:currentActor,createdAt:now,createdAtServer:serverTimestamp(),updatedAt:now});}
export async function ensurePayrollPeriodsForEntries(entries:TimeEntry[],currentActor:PayrollActor){const groups=new Map<string,PayrollPeriodWindow>();for(const entry of entries){if(!entry.payPeriodId||groups.has(entry.payPeriodId))continue;if(entry.payPeriodId.startsWith("pay-")){groups.set(entry.payPeriodId,payrollPeriodForDate(entry.workDate));continue;}const related=entries.filter(item=>item.payPeriodId===entry.payPeriodId).map(item=>item.workDate).filter(Boolean).sort();groups.set(entry.payPeriodId,{id:entry.payPeriodId,startDate:related[0]||entry.workDate,endDate:related.at(-1)||entry.workDate});}for(const period of groups.values())await ensurePayrollPeriod(period,currentActor);}
export async function savePayPeriod(value:PayPeriod,currentActor:PayrollActor){const now=new Date().toISOString();await setDoc(doc(db,"payPeriods",value.id),{...value,updatedAt:now,updatedBy:currentActor,updatedAtServer:serverTimestamp(),createdAt:value.createdAt||now,createdAtServer:serverTimestamp()},{merge:true});}
export async function approvePayPeriodStage(id:string,stage:"administration"|"comptabilité",currentActor:PayrollActor){
 const reference=doc(db,"payPeriods",id),snapshot=await getDoc(reference);if(!snapshot.exists())throw new Error("Période de paie introuvable.");
 const data=snapshot.data(),now=new Date().toISOString();
 if(stage==="administration"){
  if(!["Validation","Approbation administration"].includes(text(data.status)))throw new Error("La période doit être en validation administrative.");
  await updateDoc(reference,{status:"Approbation comptabilité",administrationApprovedBy:currentActor,administrationApprovedAt:now,updatedBy:currentActor,updatedAt:now,updatedAtServer:serverTimestamp()});return;
 }
 if(text(data.status)!=="Approbation comptabilité"||!data.administrationApprovedBy)throw new Error("L’approbation administrative doit être complétée en premier.");
 if(actor(data.administrationApprovedBy).uid===currentActor.uid)throw new Error("L’approbation comptable doit être effectuée par une autre personne.");
 await updateDoc(reference,{status:"Approuvée",accountingApprovedBy:currentActor,accountingApprovedAt:now,approvedBy:currentActor,approvedAt:now,updatedBy:currentActor,updatedAt:now,updatedAtServer:serverTimestamp()});
}
const mapPayrollExport=(id:string,data:DocumentData):PayrollExport=>({id,payPeriodId:text(data.payPeriodId),format:"CSV",entryCount:number(data.entryCount),employeeCount:number(data.employeeCount),totalHours:number(data.totalHours),totalAmount:number(data.totalAmount),generatedBy:actor(data.generatedBy),generatedAt:text(data.generatedAt),checksum:text(data.checksum),fileName:text(data.fileName),version:text(data.version)});
export function subscribePayrollExports(next:(values:PayrollExport[])=>void,error:(value:FirestoreError)=>void):Unsubscribe{return onSnapshot(collection(db,"payrollExports"),snapshot=>next(snapshot.docs.map(item=>mapPayrollExport(item.id,item.data())).sort((a,b)=>b.generatedAt.localeCompare(a.generatedAt))),error);}
export async function logPayrollAction(payPeriodId:string,action:string,currentActor:PayrollActor,reason:string,details:Record<string,unknown>={}){await addDoc(collection(db,"payrollHistory"),{payPeriodId,action,actorId:currentActor.uid,actorName:currentActor.name,actorRole:currentActor.role,reason:reason.trim()||action,eventAt:new Date().toISOString(),details,createdAt:serverTimestamp()});}
export async function confirmPayrollExport(value:Omit<PayrollExport,"id"|"generatedAt">,currentActor:PayrollActor,reason:string,periodStart:string,periodEnd:string){if(!reason.trim())throw new Error("La raison de confirmation est obligatoire.");const now=new Date().toISOString(),id=`payroll-export-${Date.now()}-${crypto.randomUUID()}`,batch=writeBatch(db),periodRef=doc(db,"payPeriods",value.payPeriodId),period=await getDoc(periodRef),locked=period.exists()&&text(period.data().status)==="Verrouillée";batch.set(doc(db,"payrollExports",id),{...value,id,generatedBy:currentActor,generatedAt:now,generatedAtServer:serverTimestamp()});if(!locked)batch.set(periodRef,{id:value.payPeriodId,startDate:periodStart,endDate:periodEnd,status:"Exportée",validationMode:"Tests internes Flight Director",updatedBy:currentActor,updatedAt:now,updatedAtServer:serverTimestamp(),exportedBy:currentActor,exportedAt:now},{merge:true});batch.set(doc(collection(db,"payrollHistory")),{payPeriodId:value.payPeriodId,action:locked?"Réexport comptable confirmé":"Export comptable confirmé",actorId:currentActor.uid,actorName:currentActor.name,actorRole:currentActor.role,reason:reason.trim(),eventAt:now,details:{exportId:id,checksum:value.checksum,fileName:value.fileName,entryCount:value.entryCount,totalAmount:value.totalAmount},createdAt:serverTimestamp()});await batch.commit();return id;}
export async function lockPayrollPeriod(payPeriodId:string,currentActor:PayrollActor,reason:string){if(!reason.trim())throw new Error("La raison du verrouillage est obligatoire.");const entries=await getDocs(query(collection(db,"timeEntries"),where("payPeriodId","==",payPeriodId))),blocking=entries.docs.filter(item=>!["Approuvé administration","Verrouillé","Refusé"].includes(text(item.data().status)));if(blocking.length)throw new Error(`${blocking.length} entrée(s) empêchent le verrouillage.`);const now=new Date().toISOString(),batch=writeBatch(db);for(const item of entries.docs.filter(item=>text(item.data().status)==="Approuvé administration"))batch.update(item.ref,{status:"Verrouillé",lockedBy:currentActor,lockedAt:now,updatedBy:currentActor,updatedAt:now,updatedAtServer:serverTimestamp()});batch.set(doc(db,"payPeriods",payPeriodId),{id:payPeriodId,status:"Verrouillée",lockedBy:currentActor,lockedAt:now,updatedBy:currentActor,updatedAt:now,updatedAtServer:serverTimestamp()},{merge:true});batch.set(doc(collection(db,"payrollHistory")),{payPeriodId,action:"Période de paie verrouillée",actorId:currentActor.uid,actorName:currentActor.name,actorRole:currentActor.role,reason:reason.trim(),eventAt:now,details:{entryCount:entries.size},createdAt:serverTimestamp()});await batch.commit();}

export async function syncCompletedActivityTimeEntries(event:SchedulerEvent,currentActor:PayrollActor){
 if(event.status!=="Complété"||!event.instructorId)return;
 const instructor=await getDoc(doc(db,"instructors",event.instructorId));
 if(!instructor.exists())throw new Error("La réservation ne correspond à aucune fiche instructeur.");
 const instructorData=instructor.data();
 if(instructorData.active===false||text(instructorData.status)==="Inactif")throw new Error("La fiche instructeur liée à la réservation est inactive.");
 const employeeName=text(instructorData.name)||[text(instructorData.firstName),text(instructorData.lastName)].filter(Boolean).join(" ");
 if(!employeeName)throw new Error("La fiche instructeur liée ne contient aucun nom d’employé.");
 const components=schedulerTimeEntryComponents(event);
 if(!components.length)throw new Error("Aucune durée réelle validée n’est disponible pour créer l’entrée de temps.");
 const now=new Date().toISOString(),period=payrollPeriodForDate(event.date),payPeriodId=period.id,periodRef=doc(db,"payPeriods",period.id),periodSnapshot=await getDoc(periodRef),entries=components.map(item=>({id:`scheduler:${event.id}:${event.instructorId}:${item.sourceComponent}`,category:item.category,hours:item.durationHours,component:item.sourceComponent}));let periodNeedsCreation=!periodSnapshot.exists();
 for(const item of entries){
  const reference=doc(db,"timeEntries",item.id),existing=await getDoc(reference);
  if(existing.exists()&&text(existing.data().status)!=="Brouillon"){
   const adjustments=await getDocs(query(collection(db,"timeEntries"),where("source","==","scheduler"),where("replacesEntryId","==",item.id))),previousHours=number(existing.data().durationHours),adjustedHours=adjustments.docs.reduce((sum,entry)=>sum+number(entry.data().durationHours),0),delta=requiredAdjustmentHours(item.hours,previousHours,adjustedHours);if(Math.abs(delta)<0.01)continue;
   const originalPeriod=await getDoc(doc(db,"payPeriods",text(existing.data().payPeriodId)||payPeriodId)),locked=originalPeriod.exists()&&text(originalPeriod.data().status)==="Verrouillée",adjustmentPeriod=locked?{...payrollPeriodForDate(now.slice(0,10)),id:`adjustment-${payrollPeriodForDate(now.slice(0,10)).startDate}`}:period,adjustmentPayPeriodId=adjustmentPeriod.id,adjustmentPeriodRef=doc(db,"payPeriods",adjustmentPayPeriodId),adjustmentPeriodSnapshot=await getDoc(adjustmentPeriodRef),adjustmentId=`${item.id}:adjustment:${now.replace(/[^0-9]/g,"")}`,adjustmentRef=doc(db,"timeEntries",adjustmentId),batch=writeBatch(db);
   if(!adjustmentPeriodSnapshot.exists())batch.set(adjustmentPeriodRef,{...adjustmentPeriod,status:"Ouverte",validationMode:"Tests internes Flight Director",createdBy:currentActor,createdAt:now,createdAtServer:serverTimestamp(),updatedAt:now});
   batch.set(adjustmentRef,{id:adjustmentId,employeeId:event.instructorId,employeeName,category:item.category,workDate:event.date,durationHours:delta,source:"scheduler",sourceId:event.id,sourceComponent:"adjustment",payPeriodId:adjustmentPayPeriodId,status:"Ajustement",reservationId:event.id,studentId:event.studentId||"",aircraftId:event.aircraftId||"",activityType:event.type,description:`Ajustement — ${event.title}`,createdBy:currentActor,createdAt:now,updatedBy:currentActor,updatedAt:now,correctionReason:"Correction d’une activité complétée après approbation.",replacesEntryId:item.id,validationMode:"Tests internes Flight Director",createdAtServer:serverTimestamp(),updatedAtServer:serverTimestamp()});
   batch.set(historyRef(),{timeEntryId:adjustmentId,employeeId:event.instructorId,action:"Ajustement créé",previousValue:{durationHours:previousHours+adjustedHours,status:text(existing.data().status)},newValue:{durationHours:item.hours,adjustmentHours:delta,status:"Ajustement"},reason:"Correction d’une activité complétée après approbation; l’entrée originale est conservée.",actorId:currentActor.uid,actorName:currentActor.name,actorRole:currentActor.role,eventAt:now,createdAt:serverTimestamp()});await batch.commit();continue;
  }
  if(existing.exists()&&number(existing.data().durationHours)===item.hours&&text(existing.data().employeeId)===event.instructorId&&text(existing.data().category)===item.category)continue;
  const batch=writeBatch(db),payload={id:item.id,employeeId:event.instructorId,employeeName,category:item.category,workDate:event.date,durationHours:item.hours,source:"scheduler",sourceId:event.id,sourceComponent:item.component,payPeriodId,status:"Brouillon",reservationId:event.id,studentId:event.studentId||"",aircraftId:event.aircraftId||"",activityType:event.type,description:event.title,createdBy:existing.exists()?existing.data().createdBy:currentActor,createdAt:existing.exists()?text(existing.data().createdAt):now,updatedBy:currentActor,updatedAt:now,validationMode:"Tests internes Flight Director",updatedAtServer:serverTimestamp(),...(!existing.exists()?{createdAtServer:serverTimestamp()}:{})};
  if(periodNeedsCreation){batch.set(periodRef,{...period,status:"Ouverte",validationMode:"Tests internes Flight Director",createdBy:currentActor,createdAt:now,createdAtServer:serverTimestamp(),updatedAt:now});periodNeedsCreation=false;}
  batch.set(reference,payload,{merge:true});batch.set(historyRef(),{timeEntryId:item.id,employeeId:event.instructorId,action:existing.exists()?"Entrée Scheduler synchronisée":"Entrée Scheduler créée",previousValue:existing.exists()?{durationHours:number(existing.data().durationHours)}:null,newValue:{durationHours:item.hours,status:"Brouillon"},reason:"Activité réellement complétée dans le Scheduler.",actorId:currentActor.uid,actorName:currentActor.name,actorRole:currentActor.role,eventAt:now,createdAt:serverTimestamp()});await batch.commit();
 }
}

 const mapPayrollProfile=(id:string,data:DocumentData):EmployeePayrollProfile=>({
 id,employeeId:text(data.employeeId)||id,employeeName:text(data.employeeName),payrollEmployeeId:text(data.payrollEmployeeId)||undefined,flightRate:number(data.flightRate),groundRate:number(data.groundRate),
 payrollClass:text(data.payrollClass)?text(data.payrollClass) as PayrollClass:undefined,
 isSupervisor:data.isSupervisor===true,
 theoryRate:number(data.theoryRate),simulatorRate:number(data.simulatorRate),leaveRate:number(data.leaveRate),vacationDays:number(data.vacationDays),
 holidayDays:number(data.holidayDays),sickDays:number(data.sickDays),standardDayHours:number(data.standardDayHours,8),effectiveDate:text(data.effectiveDate),
 updatedAt:text(data.updatedAt)||undefined,updatedBy:text(data.updatedBy)||undefined
});
export function subscribePayrollProfiles(employeeId:string|undefined,manager:boolean,next:(values:EmployeePayrollProfile[])=>void,error:(value:FirestoreError)=>void):Unsubscribe{
 if(!manager&&!employeeId){next([]);return()=>undefined;}
 const reference=manager?collection(db,"employeePayrollProfiles"):query(collection(db,"employeePayrollProfiles"),where("employeeId","==",employeeId));
 return onSnapshot(reference,snapshot=>next(snapshot.docs.map(item=>mapPayrollProfile(item.id,item.data()))),error);
}
export async function savePayrollProfile(value:EmployeePayrollProfile,updatedBy:string){
 await setDoc(doc(db,"employeePayrollProfiles",value.employeeId),{...value,id:value.employeeId,updatedBy,updatedAt:new Date().toISOString(),updatedAtServer:serverTimestamp()},{merge:true});
}
const mapPayrollClassRate=(id:string,data:DocumentData):PayrollClassRate=>({
 id:id as PayrollClass,payrollClass:(text(data.payrollClass)||id) as PayrollClass,flightRate:number(data.flightRate),groundRate:number(data.groundRate),theoryRate:number(data.theoryRate),simulatorRate:number(data.simulatorRate),leaveRate:number(data.leaveRate),developmentRate:number(data.developmentRate,25),updatedAt:text(data.updatedAt)||undefined,updatedBy:text(data.updatedBy)||undefined
});
export const DEFAULT_PAYROLL_CLASS_RATES:PayrollClassRate[]=[
 {id:"Classe 1",payrollClass:"Classe 1",flightRate:50,groundRate:50,theoryRate:50,simulatorRate:50,leaveRate:50,developmentRate:50},
 {id:"Classe 2",payrollClass:"Classe 2",flightRate:40,groundRate:40,theoryRate:40,simulatorRate:40,leaveRate:40,developmentRate:40},
 {id:"Classe 3",payrollClass:"Classe 3",flightRate:35,groundRate:35,theoryRate:35,simulatorRate:35,leaveRate:35,developmentRate:35},
 {id:"Classe 4",payrollClass:"Classe 4",flightRate:27,groundRate:27,theoryRate:27,simulatorRate:27,leaveRate:27,developmentRate:27},
 {id:"ADM",payrollClass:"ADM",flightRate:20,groundRate:20,theoryRate:20,simulatorRate:20,leaveRate:20,developmentRate:25}
];
export function subscribePayrollClassRates(next:(values:PayrollClassRate[])=>void,error:(value:FirestoreError)=>void):Unsubscribe{return onSnapshot(collection(db,"payrollClassRates"),snapshot=>{const saved=snapshot.docs.map(item=>mapPayrollClassRate(item.id,item.data()));next(DEFAULT_PAYROLL_CLASS_RATES.map(defaultRate=>saved.find(item=>item.payrollClass===defaultRate.payrollClass)||defaultRate))},error);}
export async function savePayrollClassRate(value:PayrollClassRate,updatedBy:string){await setDoc(doc(db,"payrollClassRates",value.payrollClass),{...value,id:value.payrollClass,updatedBy,updatedAt:new Date().toISOString(),updatedAtServer:serverTimestamp()},{merge:true});}

const mapTraining=(id:string,data:DocumentData):EmployeeTrainingRecord=>({
 id,employeeId:text(data.employeeId),employeeName:text(data.employeeName),employeeRole:text(data.employeeRole),subjectId:text(data.subjectId),subject:text(data.subject),
 completedDate:text(data.completedDate),validityYears:number(data.validityYears),expiryDate:text(data.expiryDate),trainer:text(data.trainer),notes:text(data.notes),
 recordedBy:text(data.recordedBy),recordedAt:text(data.recordedAt)
});
export function subscribeEmployeeTraining(employeeId:string|undefined,next:(values:EmployeeTrainingRecord[])=>void,error:(value:FirestoreError)=>void):Unsubscribe{
 const reference=employeeId?query(collection(db,"employeeTraining"),where("employeeId","==",employeeId)):collection(db,"employeeTraining");
 return onSnapshot(reference,snapshot=>next(snapshot.docs.map(item=>mapTraining(item.id,item.data())).sort((a,b)=>b.completedDate.localeCompare(a.completedDate))),error);
}
export async function saveEmployeeTraining(value:EmployeeTrainingRecord){await setDoc(doc(db,"employeeTraining",value.id),{...value,updatedAtServer:serverTimestamp()});}
export async function deleteEmployeeTraining(id:string){await deleteDoc(doc(db,"employeeTraining",id));}

const mapAircraftQualification=(id:string,data:DocumentData):EmployeeAircraftQualification=>({
 id,employeeId:text(data.employeeId),aircraftType:text(data.aircraftType),qualificationType:text(data.qualificationType)==="flight"?"flight":"aircraft",qualificationName:text(data.qualificationName),completedAt:text(data.completedAt)||undefined,expiresAt:text(data.expiresAt)||undefined,status:text(data.status)==="not-applicable"?"not-applicable":"valid",notes:text(data.notes),source:"employee-aircraft-qualification",createdBy:actor(data.createdBy),createdAt:text(data.createdAt),updatedBy:actor(data.updatedBy),updatedAt:text(data.updatedAt)
});
export function subscribeEmployeeAircraftQualifications(employeeId:string|undefined,next:(values:EmployeeAircraftQualification[])=>void,error:(value:FirestoreError)=>void):Unsubscribe{
 const reference=employeeId?query(collection(db,"employeeQualifications"),where("employeeId","==",employeeId)):collection(db,"employeeQualifications");
 return onSnapshot(reference,snapshot=>next(snapshot.docs.map(item=>mapAircraftQualification(item.id,item.data())).sort((a,b)=>a.aircraftType.localeCompare(b.aircraftType)||a.qualificationName.localeCompare(b.qualificationName))),error);
}
export async function saveEmployeeAircraftQualification(value:EmployeeAircraftQualification,currentActor:PayrollActor,reason:string){
 if(!reason.trim())throw new Error("La raison de la modification est obligatoire.");
 const reference=doc(db,"employeeQualifications",value.id),previous=await getDoc(reference),now=new Date().toISOString(),batch=writeBatch(db);
 const cleanPayload:Record<string,unknown>={id:value.id,employeeId:value.employeeId,aircraftType:value.aircraftType,qualificationType:value.qualificationType,qualificationName:value.qualificationName,status:value.status,source:value.source,createdBy:previous.exists()?previous.data().createdBy:currentActor,createdAt:previous.exists()?text(previous.data().createdAt):now,updatedBy:currentActor,updatedAt:now};
 if(value.completedAt)cleanPayload.completedAt=value.completedAt;
 if(value.expiresAt)cleanPayload.expiresAt=value.expiresAt;
 if(value.notes)cleanPayload.notes=value.notes;
 const writePayload:Record<string,unknown>={...cleanPayload,updatedAtServer:serverTimestamp(),...(!previous.exists()?{createdAtServer:serverTimestamp()}:{})};
 if(previous.exists()&&!value.completedAt)writePayload.completedAt=deleteField();
 if(previous.exists()&&!value.expiresAt)writePayload.expiresAt=deleteField();
 if(previous.exists()&&!value.notes)writePayload.notes=deleteField();
 batch.set(reference,writePayload,{merge:true});
 batch.set(doc(collection(db,"employeeQualificationHistory")),{employeeId:value.employeeId,qualificationId:value.id,action:previous.exists()?"Qualification modifiée":"Qualification ajoutée",previousValue:previous.exists()?previous.data():null,newValue:cleanPayload,reason:reason.trim(),actor:currentActor,eventAt:now,createdAt:serverTimestamp()});
 await batch.commit();
}

const mapCompliance=(id:string,data:DocumentData):EmployeeComplianceRecord=>({id,...data,employeeId:text(data.employeeId),recordType:text(data.recordType),updatedBy:actor(data.updatedBy),updatedAt:text(data.updatedAt)} as EmployeeComplianceRecord);
export function subscribeEmployeeCompliance(employeeId:string|undefined,next:(values:EmployeeComplianceRecord[])=>void,error:(value:FirestoreError)=>void):Unsubscribe{
 const reference=employeeId?query(collection(db,"employeeCompliance"),where("employeeId","==",employeeId)):collection(db,"employeeCompliance");
 return onSnapshot(reference,snapshot=>next(snapshot.docs.map(item=>mapCompliance(item.id,item.data()))),error);
}
export async function saveEmployeeCompliance(value:EmployeeComplianceRecord,currentActor:PayrollActor,reason:string){
 if(!reason.trim())throw new Error("Le motif de la modification est obligatoire.");
 const reference=doc(db,"employeeCompliance",value.id),previous=await getDoc(reference),now=new Date().toISOString(),batch=writeBatch(db),clean:Record<string,unknown>={id:value.id,employeeId:value.employeeId,recordType:value.recordType,updatedBy:currentActor,updatedAt:now};
 for(const[key,item]of Object.entries(value)){if(!["id","employeeId","recordType","updatedBy","updatedAt"].includes(key)&&item!==undefined&&item!=="")clean[key]=item}
 const writePayload:Record<string,unknown>={...clean,updatedAtServer:serverTimestamp(),createdAt:previous.exists()?previous.data().createdAt:now,...(!previous.exists()?{createdAtServer:serverTimestamp()}:{})};
 if(previous.exists())for(const key of["officialExpiry","manualOverrideReason","previousExpiry","renewalMethod","instrumentExperienceAsOf","notes"]){if(!(key in clean)&&previous.data()[key]!==undefined)writePayload[key]=deleteField()}
 batch.set(reference,writePayload,{merge:true});
 batch.set(doc(collection(db,"employeeComplianceHistory")),{employeeId:value.employeeId,complianceId:value.id,recordType:value.recordType,action:previous.exists()?"Conformité modifiée":"Conformité créée",previousValue:previous.exists()?previous.data():null,newValue:clean,reason:reason.trim(),actor:currentActor,eventAt:now,createdAt:serverTimestamp()});
 await batch.commit();
}

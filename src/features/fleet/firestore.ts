import { addDoc, collection, doc, getDocs, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch, type FirestoreError, type Unsubscribe } from "firebase/firestore";
import { db } from "@/services/firebase/client";
import { ORIZON_AIRCRAFT } from "./seed";
import type { Aircraft, Snag } from "./types";

export type LiveHandlers<T> = { next:(items:T[])=>void; error:(error:FirestoreError)=>void };
const text=(value:unknown,fallback="")=>typeof value==="string"?value:fallback;
const list=(value:unknown)=>Array.isArray(value)?value.filter((x):x is string=>typeof x==="string"):[];
function compact(value:Record<string,unknown>){return Object.fromEntries(Object.entries(value).filter(([,item])=>item!==undefined));}

export function subscribeAircraft(h:LiveHandlers<Aircraft>):Unsubscribe {
  return onSnapshot(collection(db,"aircraft"),s=>h.next(s.docs.map(d=>{const x=d.data();return {
    id:d.id,registration:text(x.registration,d.id),manufacturer:text(x.manufacturer),model:text(x.model),typeLabel:text(x.typeLabel),
    status:text(x.status,"Disponible") as Aircraft["status"],active:typeof x.active==="boolean"?x.active:true,
    maintenanceStart:text(x.maintenanceStart),maintenanceEnd:text(x.maintenanceEnd),statusReason:text(x.statusReason),
    blockedForScheduling:typeof x.blockedForScheduling==="boolean"?x.blockedForScheduling:false
  };})),h.error);
}

export function subscribeSnags(h:LiveHandlers<Snag>):Unsubscribe {
  return onSnapshot(collection(db,"snags"),s=>h.next(s.docs.map(d=>{const x=d.data();return {
    id:d.id,aircraftId:text(x.aircraftId),aircraftRegistration:text(x.aircraftRegistration),reportedAt:text(x.reportedAt),reportedBy:text(x.reportedBy),
    reportedByRole:text(x.reportedByRole,"Dispatch") as Snag["reportedByRole"],category:text(x.category),severity:text(x.severity,"À surveiller") as Snag["severity"],
    defectTitle:text(x.defectTitle),description:text(x.description),tach:typeof x.tach==="number"?x.tach:undefined,hobbs:typeof x.hobbs==="number"?x.hobbs:undefined,
    status:text(x.status,"Ouvert") as Snag["status"],estimatedReturnDate:text(x.estimatedReturnDate),maintenanceNotes:text(x.maintenanceNotes),notifyRoles:list(x.notifyRoles) as Snag["notifyRoles"]
  };})),h.error);
}

export async function replaceFleet(){const existing=await getDocs(collection(db,"aircraft"));const batch=writeBatch(db);existing.docs.forEach(d=>batch.delete(d.ref));ORIZON_AIRCRAFT.forEach(a=>batch.set(doc(db,"aircraft",a.id),{...a,updatedAt:new Date().toISOString()}));await batch.commit();}
export async function saveAircraft(a:Aircraft){await setDoc(doc(db,"aircraft",a.id),compact({...a,updatedAt:new Date().toISOString()}),{merge:true});}

export async function createSnag(value:Omit<Snag,"id"|"reportedAt"|"status">){
  const now=new Date().toISOString();
  const payload=compact({...value,reportedAt:now,status:"Ouvert",createdAt:serverTimestamp(),updatedAt:now});
  const ref=await addDoc(collection(db,"snags"),payload);
  await addDoc(collection(db,"notifications"),{type:"SNAG",title:`${value.aircraftRegistration} — ${value.defectTitle}`,message:value.description,targetRoles:value.notifyRoles,aircraftId:value.aircraftId,snagId:ref.id,createdAt:now,readBy:[]});
  const blocked=value.severity!=="À surveiller"&&value.severity!=="Cosmétique";
  await updateDoc(doc(db,"aircraft",value.aircraftId),{status:"SNAG",statusReason:`${value.defectTitle}: ${value.description}`,maintenanceStart:now.slice(0,10),maintenanceEnd:value.estimatedReturnDate||"",blockedForScheduling:blocked,updatedAt:now});
}
export async function updateSnag(id:string,patch:Partial<Snag>){await updateDoc(doc(db,"snags",id),compact({...patch,updatedAt:new Date().toISOString()}));}
export async function closeSnag(s:Snag){await updateDoc(doc(db,"snags",s.id),{status:"Fermé",updatedAt:new Date().toISOString()});await updateDoc(doc(db,"aircraft",s.aircraftId),{status:"Disponible",statusReason:"",maintenanceStart:"",maintenanceEnd:"",blockedForScheduling:false,updatedAt:new Date().toISOString()});}

import {
  addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, serverTimestamp,
  setDoc, updateDoc, where, query, type DocumentData, type FirestoreError, type Unsubscribe
} from "firebase/firestore";
import { db } from "@/services/firebase/client";
import type { Instructor, InstructorDocument } from "./types";

export type LiveHandlers<T> = { next:(items:T[])=>void; error:(error:FirestoreError)=>void };
const text = (value:unknown, fallback="") => typeof value === "string" ? value : fallback;

function mapInstructor(id:string, data:DocumentData):Instructor {
  const parts = text(data.name).trim().split(/\s+/);
  return {
    id,
    firstName: text(data.firstName) || parts[0] || "",
    lastName: text(data.lastName) || parts.slice(1).join(" "),
    email: text(data.email),
    phone: text(data.phone),
    classLevel: (text(data.classLevel) || "Classe 4") as Instructor["classLevel"],
    classHistory:Array.isArray(data.classHistory)?data.classHistory.filter(item=>item&&typeof item==="object").map(item=>({from:text(item.from) as Instructor["classLevel"],to:text(item.to) as Instructor["classLevel"],effectiveDate:text(item.effectiveDate),recordedAt:text(item.recordedAt)})).filter(item=>item.from&&item.to&&item.effectiveDate):[],
    status: (text(data.status) || (data.active === false ? "Inactif" : "Actif")) as Instructor["status"],
    employeeNumber: text(data.employeeNumber),
    licenseNumber: text(data.licenseNumber),
    hiredDate: text(data.hiredDate),
    birthDate: text(data.birthDate),
    notes: text(data.notes)
  };
}

export function subscribeInstructors(h:LiveHandlers<Instructor>):Unsubscribe {
  return onSnapshot(collection(db,"instructors"), snap => h.next(snap.docs.map(x=>mapInstructor(x.id,x.data()))), h.error);
}
export function subscribeInstructor(id:string,next:(value:Instructor|null)=>void,error:(error:FirestoreError)=>void):Unsubscribe {
  return onSnapshot(doc(db,"instructors",id),snap=>next(snap.exists()?mapInstructor(snap.id,snap.data()):null),error);
}

export async function saveInstructor(value:Instructor, exists:boolean, classEffectiveDate?:string) {
  const ref=doc(db,"instructors",value.id);
  let classHistory=value.classHistory||[];
  if(exists){const current=await getDoc(ref);if(current.exists()){const previous=mapInstructor(current.id,current.data());if(previous.classLevel!==value.classLevel){classHistory=[...previous.classHistory,{from:previous.classLevel,to:value.classLevel,effectiveDate:classEffectiveDate||new Date().toISOString().slice(0,10),recordedAt:new Date().toISOString()}]}}}
  const payload = {
    firstName:value.firstName,
    lastName:value.lastName,
    name:`${value.firstName} ${value.lastName}`.trim(),
    email:value.email,
    phone:value.phone,
    classLevel:value.classLevel,
    classHistory,
    status:value.status,
    active:value.status==="Actif",
    employeeNumber:value.employeeNumber,
    licenseNumber:value.licenseNumber,
    hiredDate:value.hiredDate,
    birthDate:value.birthDate,
    notes:value.notes,
    updatedAt:serverTimestamp()
  };
  if(exists) await updateDoc(ref,payload);
  else await setDoc(ref,{...payload,createdAt:serverTimestamp()});
}

export async function deleteInstructor(id:string){ await deleteDoc(doc(db,"instructors",id)); }

export function subscribeInstructorDocuments(instructorId:string,h:LiveHandlers<InstructorDocument>):Unsubscribe {
  const q=query(collection(db,"instructorDocuments"),where("instructorId","==",instructorId));
  return onSnapshot(q,snap=>h.next(snap.docs.map(x=>{const d=x.data();return{
    id:x.id,instructorId,type:text(d.type),number:text(d.number),expiryDate:text(d.expiryDate),notes:text(d.notes)
  }})),h.error);
}

export function subscribeAllInstructorDocuments(h:LiveHandlers<InstructorDocument>):Unsubscribe {
  return onSnapshot(collection(db,"instructorDocuments"),snap=>h.next(snap.docs.map(x=>{const d=x.data();return{
    id:x.id,instructorId:text(d.instructorId),type:text(d.type),number:text(d.number),expiryDate:text(d.expiryDate),notes:text(d.notes)
  }})),h.error);
}

export async function addInstructorDocument(value:Omit<InstructorDocument,"id">){
  await addDoc(collection(db,"instructorDocuments"),{...value,createdAt:serverTimestamp()});
}

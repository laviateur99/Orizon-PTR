import {doc,onSnapshot,serverTimestamp,setDoc,type FirestoreError,type Unsubscribe} from "firebase/firestore";
import {db} from "@/services/firebase/client";
export function subscribeProgramName(id:string,defaultName:string,next:(name:string)=>void,error:(e:FirestoreError)=>void):Unsubscribe{return onSnapshot(doc(db,"trainingPrograms",id),s=>{const d=s.data();next(typeof d?.displayName==="string"&&d.displayName.trim()?d.displayName:defaultName)},error)}
export async function saveProgramName(id:string,name:string,by:string){await setDoc(doc(db,"trainingPrograms",id),{displayName:name.trim(),updatedBy:by.trim()||"Administrateur",updatedAt:new Date().toISOString(),updatedAtServer:serverTimestamp()},{merge:true})}

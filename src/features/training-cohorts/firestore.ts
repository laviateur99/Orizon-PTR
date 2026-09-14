import{arrayRemove,collection,doc,getDocs,onSnapshot,serverTimestamp,writeBatch,type DocumentData,type FirestoreError,type Unsubscribe}from"firebase/firestore";
import{db}from"@/services/firebase/client";
import type{TrainingCohort}from"./types";

const text=(value:unknown)=>typeof value==="string"?value:"";
const strings=(value:unknown)=>Array.isArray(value)?value.filter((item):item is string=>typeof item==="string"):[];
const mapCohort=(id:string,data:DocumentData):TrainingCohort=>({id,name:text(data.name),programId:text(data.programId),startDate:text(data.startDate),endDate:text(data.endDate)||undefined,status:(text(data.status)||"Planifiée") as TrainingCohort["status"],studentIds:strings(data.studentIds),createdBy:text(data.createdBy),createdAt:text(data.createdAt),updatedBy:text(data.updatedBy),updatedAt:text(data.updatedAt)});

export function subscribeTrainingCohorts(next:(values:TrainingCohort[])=>void,error:(value:FirestoreError)=>void):Unsubscribe{
 return onSnapshot(collection(db,"trainingCohorts"),snapshot=>next(snapshot.docs.map(item=>mapCohort(item.id,item.data())).sort((a,b)=>a.name.localeCompare(b.name,"fr"))),error);
}

export async function saveTrainingCohort(value:TrainingCohort){
 if(!value.name.trim()||!value.programId||!value.startDate)throw new Error("Le nom, le programme et la date de début sont obligatoires.");
 const snapshot=await getDocs(collection(db,"trainingCohorts")),batch=writeBatch(db),clean=JSON.parse(JSON.stringify(value)) as TrainingCohort;
 snapshot.docs.forEach(item=>{if(item.id!==value.id){const members=strings(item.data().studentIds),duplicates=value.studentIds.filter(id=>members.includes(id));if(duplicates.length)batch.update(item.ref,{studentIds:arrayRemove(...duplicates),updatedBy:value.updatedBy,updatedAt:value.updatedAt,updatedAtServer:serverTimestamp()});}});
 batch.set(doc(db,"trainingCohorts",value.id),{...clean,updatedAtServer:serverTimestamp()},{merge:true});
 await batch.commit();
}

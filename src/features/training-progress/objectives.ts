import{collection,doc,onSnapshot,serverTimestamp,writeBatch,type FirestoreError,type Unsubscribe}from"firebase/firestore";
import{db}from"@/services/firebase/client";
import type{TrainingProgressMilestone}from"@/features/programs/types";

const cleanObjective=(value:TrainingProgressMilestone):TrainingProgressMilestone=>{
 const legacy=value as TrainingProgressMilestone&{targetHours?:number;targetLessonCount?:number;lessonId?:string};
 const{targetHours:_hours,targetLessonCount:_lessons,lessonId:_lesson,...objective}=legacy;
 return JSON.parse(JSON.stringify(objective));
};

export function subscribeTrainingProgressObjectives(next:(values:TrainingProgressMilestone[])=>void,error:(value:FirestoreError)=>void):Unsubscribe{
 return onSnapshot(collection(db,"trainingProgressObjectives"),snapshot=>next(snapshot.docs.map(item=>({id:item.id,...item.data()} as TrainingProgressMilestone)).filter(item=>item.scope==="cohort"||item.scope==="student")),error);
}

export async function saveTrainingProgressObjective(value:TrainingProgressMilestone,existing:TrainingProgressMilestone[],audit:{author:string;reason:string}){
 if(value.scope==="cohort"&&!value.cohortId)throw new Error("Une cohorte est obligatoire.");
 if(value.scope==="student"&&!value.studentId)throw new Error("Un étudiant est obligatoire.");
 if(!audit.reason.trim())throw new Error("La raison de la modification est obligatoire.");
 const objective=cleanObjective(value),identity=(item:TrainingProgressMilestone)=>[item.phaseId||"programme",item.milestoneType,item.title.trim().toLowerCase()].join("|"),previous=existing.find(item=>item.id===objective.id)||(objective.scope==="student"?existing.find(item=>item.scope==="cohort"&&item.cohortId===objective.cohortId&&identity(item)===identity(objective)):undefined),objectiveRef=doc(db,"trainingProgressObjectives",objective.id),historyRef=doc(collection(db,"trainingProgressObjectiveHistory")),batch=writeBatch(db);
 batch.set(objectiveRef,{...objective,updatedAtServer:serverTimestamp()});
 batch.set(historyRef,{objectiveId:objective.id,programId:objective.programId,scope:objective.scope,cohortId:objective.cohortId||"",studentId:objective.studentId||"",previousValue:previous||null,newValue:objective,author:audit.author,changedAt:new Date().toISOString(),changedAtServer:serverTimestamp(),reason:audit.reason.trim()});
 await batch.commit();
}

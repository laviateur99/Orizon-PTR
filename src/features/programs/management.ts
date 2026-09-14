import {collection,deleteDoc,doc,getDocs,limit,onSnapshot,query,serverTimestamp,setDoc,where,type FirestoreError,type Unsubscribe} from "firebase/firestore";
import {db} from "@/services/firebase/client";
import {programPhases,type TrainingProgram} from "./types";
import {OFFICIAL_PROGRAM_IDS} from "./modularPrograms";

export type ManagedTrainingProgram=TrainingProgram&{managed?:boolean;status?:"active"|"inactive";updatedAt?:string;updatedBy?:string};
export type ProgramUsage={students:number;cohorts:number;ptrLessons:number;objectives:number;history:number};

export function classifyTrainingProgram(program:ManagedTrainingProgram,fallbackDisplayOrder=Number.MAX_SAFE_INTEGER):ManagedTrainingProgram{
 const lessons=Array.isArray(program.lessons)?program.lessons:[],storedPhases=programPhases(program),phases=storedPhases.length?storedPhases:[...new Map(lessons.map(lesson=>[lesson.phase,{number:lesson.phase,name:lesson.phaseName||`Phase ${lesson.phase}`}])).values()].sort((a,b)=>a.number-b.number),name=typeof program.name==="string"&&program.name.trim()?program.name:program.id||"Élément de formation sans nom",programType=program.programType==="integrated"||program.programType==="modular"?program.programType:phases.length>1?"integrated":"modular",singlePhase=phases.length<=1,looksLikeBlock=/\b(phase|module|bloc)\b/i.test(name),incomplete=phases.length===0||lessons.length===0,catalogKind=program.catalogKind==="program"||program.catalogKind==="template"||program.catalogKind==="module"?program.catalogKind:singlePhase&&(looksLikeBlock||incomplete)?"module":"program";
 return{...program,name,organization:program.organization||"Orizon Aviation",revision:program.revision||"—",effectiveDate:program.effectiveDate||"",source:program.source||"Donnée existante conservée",programType,catalogKind,status:program.status==="inactive"?"inactive":"active",displayOrder:Number.isFinite(program.displayOrder)?Math.trunc(program.displayOrder!):fallbackDisplayOrder,moduleIds:Array.isArray(program.moduleIds)?program.moduleIds:[],phases,lessons,lessonCount:typeof program.lessonCount==="number"?program.lessonCount:lessons.length,componentCount:typeof program.componentCount==="number"?program.componentCount:lessons.reduce((sum,lesson)=>sum+(Array.isArray(lesson.components)?lesson.components.length:0),0)};
}

export function subscribeManagedPrograms(next:(programs:ManagedTrainingProgram[])=>void,error:(value:FirestoreError)=>void):Unsubscribe{
 return onSnapshot(collection(db,"trainingPrograms"),snapshot=>{
  next(snapshot.docs.map((item,index)=>classifyTrainingProgram({id:item.id,...item.data()} as ManagedTrainingProgram,index+2)).filter(item=>item.managed===true));
 },error);
}

export async function saveManagedProgram(program:ManagedTrainingProgram,by:string){
 if(OFFICIAL_PROGRAM_IDS.has(program.id))throw new Error("Ce programme officiel est protégé et ne peut pas être modifié.");
 const{progressMilestones:_legacyObjectives,progressMilestonesUpdatedAt:_legacyUpdatedAt,...stableProgram}=program as ManagedTrainingProgram&{progressMilestones?:unknown;progressMilestonesUpdatedAt?:unknown};
 const normalized=classifyTrainingProgram(stableProgram as ManagedTrainingProgram),clean=JSON.parse(JSON.stringify({...normalized,managed:true,lessonCount:normalized.lessons.length,componentCount:normalized.lessons.reduce((sum,lesson)=>sum+(Array.isArray(lesson.components)?lesson.components.length:0),0),updatedAt:new Date().toISOString(),updatedBy:by||"Administration"}));
 await setDoc(doc(db,"trainingPrograms",program.id),{...clean,updatedAtServer:serverTimestamp()});
}

export async function getProgramUsage(id:string):Promise<ProgramUsage>{
 const collections=["students","trainingCohorts","ptrLessons","trainingProgressObjectives","trainingProgressObjectiveHistory"] as const;
 const snapshots=await Promise.all(collections.map(name=>getDocs(query(collection(db,name),where(name==="students"?"trainingProgramId":"programId","==",id),limit(1)))));
 return{students:snapshots[0].size,cohorts:snapshots[1].size,ptrLessons:snapshots[2].size,objectives:snapshots[3].size,history:snapshots[4].size};
}

export async function deleteManagedProgram(id:string){
 if(OFFICIAL_PROGRAM_IDS.has(id))throw new Error("Ce programme officiel est protégé et ne peut pas être supprimé.");
 const usage=await getProgramUsage(id),used=Object.values(usage).some(Boolean);
 if(used)throw new Error("Ce programme est utilisé par des étudiants, cohortes ou dossiers de formation. Désactivation recommandée.");
 await deleteDoc(doc(db,"trainingPrograms",id));
}

export function cloneProgram(program:TrainingProgram):ManagedTrainingProgram{return JSON.parse(JSON.stringify(program));}

export function blankProgram(name="Nouveau programme"):ManagedTrainingProgram{
 return{id:`programme-${Date.now()}`,name,organization:"Orizon Aviation",revision:"1",effectiveDate:new Date().toISOString().slice(0,10),source:"Créé manuellement",programType:"integrated",catalogKind:"program",status:"active",displayOrder:1000,moduleIds:[],lessonCount:0,componentCount:0,phases:[{number:1,name:"Phase 1"}],lessons:[],managed:true};
}

import {collection,doc,onSnapshot,serverTimestamp,writeBatch,type FirestoreError,type Unsubscribe} from "firebase/firestore";
import {db} from "@/services/firebase/client";
import type {Student,StudentProgram} from "./types";

export const MODULAR_TRACKS=["Permis de pilote loisir","Licence de pilote privé","Licence de pilote professionnel","Qualification vol de nuit","Qualification multimoteur","Qualification de vol aux instruments","Qualification instructeur de vol"] as const;

export type ProgramAgreementDefinition={key:string;title:string;version:string;pdfPath:string;sha256:string;track:string;pageCount:number};

export function programAgreementFor(student:Student,modularTrack:string):ProgramAgreementDefinition{
 if(student.programType==="Modulaire")return{key:"modulaire-2026-02-10",title:"Programmes d’entraînement en vol - formations modulaires",version:"2026-02-10",pdfPath:"/documents/programme-entrainement-modulaire-2026-02-10.pdf",sha256:"012fcb6a1c5d88286c56bcb8cd0f10ed2bf43b6226e5ded39aa2c2f1ceb128cc",track:student.trainingProgramName||(student.program==="Modulaire"?modularTrack:student.program),pageCount:20};
 const tracks:Partial<Record<StudentProgram,string>>={"CPL intégré":"Programme intégré CPL(A)","CPL IR/ME intégré":"Programme intégré CPL(A)/IR","ATP(A) intégré":"Programme intégré ATP(A)"};
 return{key:"integre-2025-02-10",title:"Programmes d’entraînement en vol - formations intégrées",version:"2025-02-10",pdfPath:"/documents/programme-entrainement-integre-2025-02-10.pdf",sha256:"449271d9e572b260724f17a05fa09528a24a9c19fca395170ee33ae5f8eed03c",track:tracks[student.program]||student.program,pageCount:17};
}

export type StudentProgramAgreement={studentId:string;studentProgram:StudentProgram;programTrack:string;documentKey:string;documentTitle:string;documentVersion:string;documentSha256:string;candidateName:string;candidateLicense:string;accepted:boolean;candidateSignature:string;signedAt:string;signedByUid:string;signedByEmail:string};

export function subscribeProgramAgreement(studentId:string,key:string,next:(value:StudentProgramAgreement|null)=>void,error:(value:FirestoreError)=>void):Unsubscribe{
 return onSnapshot(doc(collection(db,"students",studentId,"programAgreements"),key),snapshot=>next(snapshot.exists()?snapshot.data() as StudentProgramAgreement:null),error);
}

export async function signProgramAgreement(value:StudentProgramAgreement){
 const batch=writeBatch(db),agreementRef=doc(collection(db,"students",value.studentId,"programAgreements"),value.documentKey),studentRef=doc(db,"students",value.studentId);
 batch.set(agreementRef,{...value,createdAtServer:serverTimestamp()});
 batch.update(studentRef,{trainingProgramAgreementSigned:true,trainingProgramAgreementSignedAt:value.signedAt,trainingProgramAgreementVersion:value.documentVersion,trainingProgramAgreementProgram:value.studentProgram,trainingProgramAgreementKey:value.documentKey,updatedAt:serverTimestamp()});
 await batch.commit();
}

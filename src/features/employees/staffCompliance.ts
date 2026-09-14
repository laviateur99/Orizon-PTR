import type {Instructor,InstructorDocument} from "@/features/instructors/types";
import type {EmployeeAircraftQualification,EmployeeComplianceRecord,EmployeeLeave,EmployeeQualification,EmployeeQualificationStatus,EmployeeTrainingRecord} from "./types";
import{calculateIfrRecency}from"./complianceCalculations";

export const AIRCRAFT_QUALIFICATIONS=["PA31","C172","C152","PPC"] as const;
export type TrainingSubject={id:string;label:string;years:number;required:boolean};
export type StaffCategory="Instructeurs"|"Maintenance"|"Administration"|"Dispatch"|"Autre";
export type StaffDeadline={name:string;date:string;days:number;status:EmployeeQualificationStatus}|null;
export type StaffRow={id:string;name:string;role:string;category:StaffCategory;classLevel:string;status:string;absent:boolean;qualifications:EmployeeQualification[];training:EmployeeQualification[];nextDeadline:StaffDeadline;hasMissing:boolean};

const normalized=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const dayNumber=(value:string)=>Date.parse(`${value}T00:00:00Z`)/86400000;
export function daysUntil(value:string,today=new Date().toISOString().slice(0,10)){return dayNumber(value)-dayNumber(today)}
export function statusForExpiry(expiresAt:string|undefined,today=new Date().toISOString().slice(0,10)):EmployeeQualificationStatus{
 if(!expiresAt)return"valid";
 const days=daysUntil(expiresAt,today);
 return days<0?"expired":days<=90?"expiring":"valid";
}
export function documentName(type:string):string{
 const value=normalized(type);
 if(value.includes("medical"))return"Médical";
 if(value.includes("ppc"))return"PPC";
 if(value.includes("ifr")||value.includes("instrument"))return"IFR";
 if(value.includes("multi"))return"Multi";
 if(value.includes("pa31")||value.includes("pa-31")||value.includes("navajo"))return"PA31";
 if(value.includes("172"))return"C172";
 if(value.includes("152"))return"C152";
 return type.trim()||"Autre qualification";
}
const categoryFor=(role:string):StaffCategory=>{const value=normalized(role);if(value.includes("instructeur"))return"Instructeurs";if(value.includes("maintenance")||value.includes("mecan"))return"Maintenance";if(value.includes("dispatch")||value.includes("repart"))return"Dispatch";if(value.includes("admin")||value.includes("comptab"))return"Administration";return"Autre"};
const latestBySubject=(records:EmployeeTrainingRecord[])=>{const result=new Map<string,EmployeeTrainingRecord>();for(const record of records){const current=result.get(record.subjectId);if(!current||record.completedDate>current.completedDate)result.set(record.subjectId,record)}return result};
const qualification=(employeeId:string,name:string,source:EmployeeQualification["source"],today:string,expiresAt?:string,issuedAt?:string,id=`${employeeId}-${name}`):EmployeeQualification=>({id,employeeId,qualificationType:source==="employee-training"?"mandatory-training":(["PA31","C172","C152"].includes(name)?"aircraft":"flight"),qualificationName:name,issuedAt,expiresAt,status:statusForExpiry(expiresAt,today),source});

export function buildStaffRows(instructors:Instructor[],documents:InstructorDocument[],records:EmployeeTrainingRecord[],leaves:EmployeeLeave[],subjects:readonly TrainingSubject[],aircraftQualifications:EmployeeAircraftQualification[]=[],compliance:EmployeeComplianceRecord[]=[],today=new Date().toISOString().slice(0,10)):StaffRow[]{
 const people=new Map<string,{id:string;name:string;role:string;classLevel:string;status:string}>();
 instructors.forEach(item=>people.set(item.id,{id:item.id,name:`${item.firstName} ${item.lastName}`.trim(),role:"Instructeur",classLevel:item.classLevel,status:item.status}));
 records.forEach(item=>{if(!people.has(item.employeeId))people.set(item.employeeId,{id:item.employeeId,name:item.employeeName,role:item.employeeRole||"Autre",classLevel:"—",status:"Non consigné"})});
 return[...people.values()].map(person=>{
  const isInstructor=person.role==="Instructeur";
  const docs=documents.filter(item=>item.instructorId===person.id).map(item=>qualification(person.id,documentName(item.type),"instructor-document",today,item.expiryDate,undefined,item.id)).filter(item=>!["Médical","IFR","PA31","C172","C152","PPC"].includes(item.qualificationName));
  const aircraft=aircraftQualifications.filter(item=>item.employeeId===person.id).map(item=>({...item,qualificationName:item.qualificationType==="flight"?"PPC":item.aircraftType,status:item.status==="not-applicable"?"not-applicable" as const:statusForExpiry(item.expiresAt,today)}));
  docs.push(...aircraft);
  const medical=compliance.find(item=>item.employeeId===person.id&&item.recordType==="medical");if(medical?.recordType==="medical"){const expiry=medical.officialExpiry||medical.calculatedExpiry;docs.push({...qualification(person.id,"Médical","employee-compliance",today,expiry,medical.examDate,medical.id),notes:"Politique interne Orizon"})}else if(isInstructor)docs.push({id:`${person.id}:medical-missing`,employeeId:person.id,qualificationType:"other",qualificationName:"Médical",status:"missing",notes:"Date de naissance et examen médical requis",source:"employee-compliance"});
  const rating=compliance.find(item=>item.employeeId===person.id&&item.recordType==="instructor-rating");if(rating?.recordType==="instructor-rating"){const expiry=rating.officialExpiry||rating.calculatedExpiry;docs.push({...qualification(person.id,`${rating.instructorClass} · valide jusqu’au ${expiry}`,"employee-compliance",today,expiry,rating.testDate,rating.id),qualificationType:"instructor-class",notes:rating.renewalMethod})}else if(isInstructor)docs.push({id:`${person.id}:rating-missing`,employeeId:person.id,qualificationType:"other",qualificationName:"Classe instructeur",status:"missing",source:"employee-compliance"});
  const ifr=compliance.find(item=>item.employeeId===person.id&&item.recordType==="ifr-recency");if(ifr?.recordType==="ifr-recency"&&ifr.ifrHeld){const state=calculateIfrRecency(ifr.eventDate,{instrumentHours:ifr.instrumentHours,instrumentApproaches:ifr.instrumentApproaches},today),status=state?.status==="recent"?"valid":state?.status==="six-six-required"||state?.status==="expiring"?"expiring":"expired",next=state?(today<state.sixSixRequiredFrom?state.sixSixRequiredFrom:state.cycleEnd):undefined;docs.push({id:ifr.id,employeeId:person.id,qualificationType:"flight",qualificationName:"IFR",issuedAt:ifr.eventDate,expiresAt:next,status,notes:`${ifr.ifrGroup} · ${ifr.eventType} ${ifr.eventDate}`,source:"employee-compliance"})}
  const latest=latestBySubject(records.filter(item=>item.employeeId===person.id));
  const training=subjects.map(subject=>{const item=latest.get(subject.id);if(!item)return{id:`missing-${person.id}-${subject.id}`,employeeId:person.id,qualificationType:"mandatory-training" as const,qualificationName:subject.label,status:subject.required?"missing" as const:"not-applicable" as const,source:"employee-training" as const};return qualification(person.id,subject.label,"employee-training",today,item.expiryDate,item.completedDate,item.id)});
  const absent=leaves.some(item=>item.employeeId===person.id&&item.status==="Approuvé"&&item.startDate<=today&&item.endDate>=today);
  const dated=[...docs,...training].filter((item):item is EmployeeQualification&{expiresAt:string}=>Boolean(item.expiresAt)).sort((a,b)=>a.expiresAt.localeCompare(b.expiresAt));
  const deadlineItem=dated[0];
  const nextDeadline=deadlineItem?{name:deadlineItem.qualificationName,date:deadlineItem.expiresAt,days:daysUntil(deadlineItem.expiresAt,today),status:deadlineItem.status}:null;
  return{...person,category:categoryFor(person.role),absent,qualifications:docs,training,nextDeadline,hasMissing:training.some(item=>item.status==="missing")};
 }).sort((a,b)=>a.name.localeCompare(b.name,"fr"));
}

export function rowCompliance(row:StaffRow){const values=[...row.qualifications,...row.training];return{expired:values.some(item=>item.status==="expired"),expiring:values.some(item=>item.status==="expiring"),missing:values.some(item=>item.status==="missing")};}

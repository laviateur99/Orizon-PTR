"use client";
import{useEffect,useMemo,useState}from"react";
import{useAuth}from"@/features/auth/AuthProvider";
import{subscribeInstructors}from"@/features/instructors/firestore";
import type{Instructor}from"@/features/instructors/types";
import{deleteEmployeeTraining,saveEmployeeTraining,subscribeEmployeeTraining}from"./firestore";
import type{EmployeeTrainingRecord}from"./types";
import{EmployeeAircraftQualificationsPanel}from"./EmployeeAircraftQualificationsPanel";
import{EmployeeCoreCompliancePanel}from"./EmployeeCoreCompliancePanel";

export const EMPLOYEE_TRAINING_SUBJECTS=[
 {id:"company-introduction",label:"Introduction à la compagnie",years:0,required:true},
 {id:"human-factors",label:"Facteurs humains",years:2,required:true},
 {id:"operations-training-manual",label:"Manuel d’exploitation et de formation au pilotage",years:2,required:true},
 {id:"operational-control",label:"Procédures de contrôle opérationnel",years:2,required:true},
 {id:"emergency-procedures",label:"Procédures d’intervention d’urgence",years:2,required:true},
 {id:"car",label:"RAC",years:2,required:true},
 {id:"aircraft-type",label:"Formation sur type",years:2,required:false},
 {id:"flight-following",label:"Suivi des vols",years:2,required:true},
 {id:"surface-contamination",label:"Contamination des surfaces au sol et en vol",years:2,required:false},
 {id:"cfit",label:"CFIT",years:2,required:false},
 {id:"high-altitude",label:"Formation haute altitude (si besoin)",years:3,required:false}
] as const;
const today=()=>new Date().toISOString().slice(0,10);
const addYears=(date:string,years:number)=>{if(!years)return"";const value=new Date(`${date}T12:00:00`);value.setFullYear(value.getFullYear()+years);return value.toISOString().slice(0,10)};
export const trainingState=(record:EmployeeTrainingRecord|undefined)=>{
 if(!record)return{key:"missing",label:"Non consignée",days:-1};
 if(!record.expiryDate)return{key:"valid",label:"Valide sans renouvellement",days:99999};
 const days=Math.ceil((new Date(`${record.expiryDate}T12:00:00`).getTime()-new Date(`${today()}T12:00:00`).getTime())/86400000);
 return days<0?{key:"expired",label:`Expirée depuis ${Math.abs(days)} jour${Math.abs(days)>1?"s":""}`,days}:days<=60?{key:"urgent",label:`Échéance dans ${days} jour${days>1?"s":""}`,days}:days<=90?{key:"warning",label:`À renouveler dans ${days} jours`,days}:{key:"valid",label:"Valide",days};
};

export function EmployeeTrainingPanel({initialEmployeeId=""}:{initialEmployeeId?:string}){
 const{user,profile}=useAuth(),manager=profile?.role==="Administrateur"||profile?.role==="Chef instructeur";
 const[instructors,setInstructors]=useState<Instructor[]>([]),[records,setRecords]=useState<EmployeeTrainingRecord[]>([]),[selected,setSelected]=useState(profile?.linkedInstructorId||"");
 const[custom,setCustom]=useState(false),[customName,setCustomName]=useState(""),[customRole,setCustomRole]=useState("Dispatch");
 const[subjectId,setSubjectId]=useState<string>(EMPLOYEE_TRAINING_SUBJECTS[0].id),[completedDate,setCompletedDate]=useState(today()),[trainer,setTrainer]=useState(""),[notes,setNotes]=useState("");
 const[message,setMessage]=useState(""),[error,setError]=useState("");
 useEffect(()=>subscribeInstructors({next:setInstructors,error:value=>setError(value.message)}),[]);
 useEffect(()=>subscribeEmployeeTraining(manager?undefined:profile?.linkedInstructorId,setRecords,value=>setError(value.message)),[manager,profile?.linkedInstructorId]);
 const knownPeople=useMemo(()=>{
  const map=new Map<string,{id:string;name:string;role:string}>();
  instructors.filter(item=>item.status!=="Inactif").forEach(item=>map.set(item.id,{id:item.id,name:`${item.firstName} ${item.lastName}`,role:"Instructeur"}));
  records.forEach(item=>{if(!map.has(item.employeeId))map.set(item.employeeId,{id:item.employeeId,name:item.employeeName,role:item.employeeRole})});
  return[...map.values()].sort((a,b)=>a.name.localeCompare(b.name));
 },[instructors,records]);
 useEffect(()=>{if(!selected&&knownPeople.length)setSelected(knownPeople[0].id)},[knownPeople,selected]);
 useEffect(()=>{if(initialEmployeeId)setSelected(initialEmployeeId)},[initialEmployeeId]);
 const employeeId=custom?`employee-${customName.trim().toLowerCase().replace(/[^a-z0-9]+/g,"-")}`:selected;
 const person=custom?{id:employeeId,name:customName.trim(),role:customRole}:knownPeople.find(item=>item.id===selected);
 const latest=useMemo(()=>{const result=new Map<string,EmployeeTrainingRecord>();records.filter(item=>item.employeeId===selected).forEach(item=>{const current=result.get(item.subjectId);if(!current||item.completedDate>current.completedDate)result.set(item.subjectId,item)});return result},[records,selected]);
 const alerts=EMPLOYEE_TRAINING_SUBJECTS.filter(subject=>subject.required&&["missing","expired","urgent"].includes(trainingState(latest.get(subject.id)).key)).length;
 async function save(event:React.FormEvent){event.preventDefault();if(!user||!person?.name)return;const subject=EMPLOYEE_TRAINING_SUBJECTS.find(item=>item.id===subjectId)!;const record:EmployeeTrainingRecord={id:`training-${crypto.randomUUID()}`,employeeId:person.id,employeeName:person.name,employeeRole:person.role,subjectId:subject.id,subject:subject.label,completedDate,validityYears:subject.years,expiryDate:addYears(completedDate,subject.years),trainer:trainer.trim(),notes:notes.trim(),recordedBy:user.uid,recordedAt:new Date().toISOString()};await saveEmployeeTraining(record);setCustom(false);setSelected(person.id);setNotes("");setMessage("Formation consignée au dossier de l’employé.")}
 return <section className="employee-workspace">
  <section className="card employee-section-head"><div><h2>Formation du personnel</h2><p>Suivi conforme à la section 9 du Manuel de contrôle et au registre OAQ-3.</p></div>{alerts>0&&<span className="training-alert-count">{alerts} action{alerts>1?"s":""} requise{alerts>1?"s":""}</span>}</section>
  {error&&<div className="notice error">{error}</div>}{message&&<div className="notice">{message}</div>}
  {manager&&<section className="card training-entry"><h2>Consigner une formation</h2><form onSubmit={save}>
   <label>Employé<select value={custom?"__other":selected} onChange={event=>{setCustom(event.target.value==="__other");if(event.target.value!=="__other")setSelected(event.target.value)}}><option value="">Choisir…</option>{knownPeople.map(item=><option value={item.id} key={item.id}>{item.name} · {item.role}</option>)}<option value="__other">Autre employé opérationnel…</option></select></label>
   {custom&&<><label>Nom de l’employé<input required value={customName} onChange={event=>setCustomName(event.target.value)}/></label><label>Fonction<select value={customRole} onChange={event=>setCustomRole(event.target.value)}><option>Dispatch</option><option>Instructeur au sol</option><option>Maintenance</option><option>Administration</option><option>Autre</option></select></label></>}
   <label>Sujet<select value={subjectId} onChange={event=>setSubjectId(event.target.value)}>{EMPLOYEE_TRAINING_SUBJECTS.map(item=><option value={item.id} key={item.id}>{item.label} · {item.years?`${item.years} ans`:"initiale seulement"}</option>)}</select></label>
   <label>Date de formation<input type="date" required max={today()} value={completedDate} onChange={event=>setCompletedDate(event.target.value)}/></label><label>Formateur<input value={trainer} onChange={event=>setTrainer(event.target.value)}/></label><label className="wide">Notes / référence<input value={notes} onChange={event=>setNotes(event.target.value)}/></label><button className="button" disabled={!person?.name}>Consigner la formation</button>
  </form></section>}
  <section className="card training-register"><header><div><h2>Dossier de formation</h2><p>Alertes à 90 jours, avertissement prioritaire à 60 jours et statut expiré dès la date dépassée.</p></div>{manager&&<select value={selected} onChange={event=>{setCustom(false);setSelected(event.target.value)}}>{knownPeople.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select>}</header>
   <div className="training-row head"><span>Sujet</span><span>Dernière formation</span><span>Échéance</span><span>État</span><span>Formateur</span><span/></div>
   {EMPLOYEE_TRAINING_SUBJECTS.map(subject=>{const record=latest.get(subject.id),state=trainingState(record);return <div className={`training-row ${state.key}`} key={subject.id}><div><strong>{subject.label}</strong><small>{subject.required?"Formation requise":"Selon les besoins / recommandée"} · {subject.years?`${subject.years} ans`:"une fois seulement"}</small></div><span>{record?.completedDate||"—"}</span><span>{record?.expiryDate||(record?"Sans échéance":"—")}</span><strong>{state.label}</strong><span>{record?.trainer||"—"}</span><span>{manager&&record&&<button className="button secondary small" onClick={async()=>{if(confirm("Supprimer cette inscription de formation?"))await deleteEmployeeTraining(record.id)}}>Supprimer</button>}</span></div>})}
   {!selected&&<p>Choisissez un employé pour afficher son dossier.</p>}
  </section>
  {instructors.find(item=>item.id===person?.id)&&<EmployeeCoreCompliancePanel instructor={instructors.find(item=>item.id===person!.id)!} manager={manager}/>} 
  {person&&<EmployeeAircraftQualificationsPanel employeeId={person.id} employeeName={person.name} manager={manager}/>} 
 </section>;
}

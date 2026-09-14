"use client";
import {useEffect,useMemo,useState} from "react";
import {PageHeader} from "@/components/ui/PageHeader";
import {useAuth} from "@/features/auth/AuthProvider";
import {roles,type UserRole} from "@/features/auth/types";
import {acknowledgeCommunication,createCamilleExampleLeave,createCommunication,setCommunicationActive,subscribeAcknowledgements,subscribeAllAcknowledgements,subscribeCommunications,subscribeEmployeeLeaves} from "./firestore";
import type {CommunicationAcknowledgement,EmployeeCommunication,EmployeeLeave} from "./types";
import {LeavePanel} from "./LeavePanel";
import {TimeClockPanel} from "./TimeClockPanel";
import {EmployeeManagementPanel} from "./EmployeeManagementPanel";
import {EmployeeTrainingPanel} from "./EmployeeTrainingPanel";
import {TimeEntriesValidationPanel} from "./TimeEntriesValidationPanel";
import {PayrollExportPanel} from "./PayrollExportPanel";
import {StaffComplianceOverview} from "./StaffComplianceOverview";

export function EmployeesPage(){
 const{user,profile}=useAuth(),manager=profile?.role==="Administrateur"||profile?.role==="Chef instructeur";
 const[tab,setTab]=useState<"overview"|"my-hours"|"payroll-validation"|"payroll-export"|"leave"|"management"|"clock"|"training"|"communications">("overview"),[selectedEmployeeId,setSelectedEmployeeId]=useState("");
 const[communications,setCommunications]=useState<EmployeeCommunication[]>([]),[acks,setAcks]=useState<CommunicationAcknowledgement[]>([]),[error,setError]=useState(""),[message,setMessage]=useState("");
 const[leaveRequests,setLeaveRequests]=useState<EmployeeLeave[]>([]);
 const[form,setForm]=useState({title:"",body:"",required:true,audienceRoles:["Dispatch","Instructeur","Maintenance","Directeur de maintenance"] as UserRole[]});
 useEffect(()=>subscribeCommunications(setCommunications,value=>setError(value.message)),[]);
 useEffect(()=>manager?subscribeAllAcknowledgements(setAcks,value=>setError(value.message)):user?subscribeAcknowledgements(user.uid,setAcks,value=>setError(value.message)):undefined,[manager,user]);
 useEffect(()=>manager?subscribeEmployeeLeaves(undefined,true,setLeaveRequests,value=>setError(value.message)):undefined,[manager]);
 useEffect(()=>{const requested=new URLSearchParams(window.location.search).get("tab");if(requested==="leave"||requested==="training"||requested==="management"||requested==="overview")setTab(requested)},[]);
 useEffect(()=>{if(profile&&!manager&&tab==="overview")setTab("my-hours")},[profile,manager,tab]);
 useEffect(()=>{if(!manager||!user||new URLSearchParams(window.location.search).get("createCamilleExample")!=="1")return;setTab("leave");createCamilleExampleLeave(user.uid).then(()=>{setMessage("Demande fictive de Camille créée. Elle est en attente d’approbation.");window.history.replaceState({},"","/employees?tab=leave")}).catch(value=>setError(value instanceof Error?value.message:"Création impossible."))},[manager,user]);
 const pendingLeaves=leaveRequests.filter(item=>item.status==="En attente").length;
 const acknowledged=new Set(acks.filter(item=>item.uid===user?.uid).map(item=>item.communicationId));
 const visible=useMemo(()=>communications.filter(item=>manager||Boolean(profile&&item.audienceRoles.includes(profile.role))),[communications,manager,profile]);
 const toggleRole=(role:UserRole)=>setForm(current=>({...current,audienceRoles:current.audienceRoles.includes(role)?current.audienceRoles.filter(item=>item!==role):[...current.audienceRoles,role]}));
 async function publish(event:React.FormEvent){event.preventDefault();if(!user||!profile||!form.audienceRoles.length)return;await createCommunication({...form,active:true,createdBy:user.uid,createdByName:profile.name||profile.email});setForm(current=>({...current,title:"",body:""}));setMessage("Communication publiée.")}
 async function confirmRead(item:EmployeeCommunication){if(!user||!profile)return;await acknowledgeCommunication(item.id,user.uid,profile.name,profile.email);setMessage(`Lecture de « ${item.title} » confirmée.`)}
 return <>
  <PageHeader title="Employés" subtitle="Feuilles de temps, congés, pointage et communications"/>
  {error&&<div className="notice error">{error}</div>}{message&&<div className="notice">{message}</div>}
  <nav className="employee-tabs" aria-label="Sections des employés">
   {manager&&<button className={tab==="overview"?"active":""} onClick={()=>setTab("overview")}>Vue du personnel</button>}
   <button className={tab==="my-hours"?"active":""} onClick={()=>setTab("my-hours")}>Mes heures</button>
   {manager&&<button className={tab==="payroll-validation"?"active":""} onClick={()=>setTab("payroll-validation")}>Validation paie</button>}
   {manager&&<button className={tab==="payroll-export"?"active":""} onClick={()=>setTab("payroll-export")}>Export</button>}
   <button className={tab==="leave"?"active":""} onClick={()=>setTab("leave")}>Congés{manager&&pendingLeaves>0&&<span className="tab-count">{pendingLeaves}</span>}</button>
   {manager&&<button className={tab==="management"?"active":""} onClick={()=>setTab("management")}>Gestion des employés</button>}
   {(profile?.role==="Maintenance"||profile?.role==="Directeur de maintenance"||profile?.role==="Administrateur")&&<button className={tab==="clock"?"active":""} onClick={()=>setTab("clock")}>Pointage</button>}
   <button className={tab==="training"?"active":""} onClick={()=>setTab("training")}>Formations</button>
   <button className={tab==="communications"?"active":""} onClick={()=>setTab("communications")}>Communications</button>
  </nav>
  {tab==="overview"&&manager&&<StaffComplianceOverview onOpenEmployee={id=>{setSelectedEmployeeId(id);setTab("training");window.history.replaceState({},"","/employees?tab=training")}}/>}
  {tab==="my-hours"&&<TimeEntriesValidationPanel mode="employee"/>}
  {tab==="payroll-validation"&&manager&&<TimeEntriesValidationPanel mode="admin"/>}
  {tab==="payroll-export"&&manager&&<PayrollExportPanel/>}
  {tab==="leave"&&<LeavePanel/>}
  {tab==="management"&&manager&&<EmployeeManagementPanel initialEmployeeId={selectedEmployeeId}/>}
  {tab==="clock"&&<TimeClockPanel/>}
  {tab==="training"&&<EmployeeTrainingPanel initialEmployeeId={selectedEmployeeId}/>}
  {tab==="communications"&&<>
  {manager&&<section className="card employee-compose"><h2>Nouvelle communication</h2><form onSubmit={publish}><label>Titre<input required value={form.title} onChange={event=>setForm({...form,title:event.target.value})}/></label><label>Message<textarea required rows={6} value={form.body} onChange={event=>setForm({...form,body:event.target.value})}/></label><fieldset><legend>Rôles visés</legend><div className="employee-role-grid">{roles.filter(role=>role!=="Étudiant").map(role=><label key={role}><input type="checkbox" checked={form.audienceRoles.includes(role)} onChange={()=>toggleRole(role)}/>{role}</label>)}</div></fieldset><label className="active-check"><input type="checkbox" checked={form.required} onChange={event=>setForm({...form,required:event.target.checked})}/>Confirmation de lecture obligatoire</label><button className="button" disabled={!form.audienceRoles.length}>Publier</button></form></section>}
  <section className="employee-communications">{visible.map(item=>{const read=acknowledged.has(item.id),receipts=acks.filter(ack=>ack.communicationId===item.id).sort((a,b)=>b.readAt.localeCompare(a.readAt));return <article className={`card employee-communication ${item.required&&!read&&item.active&&!manager?"unread":""}`} key={item.id}><header><div><span className={`badge ${item.active?item.required?"warn":"ok":""}`}>{item.active?item.required?"Lecture obligatoire":"Information":"Archivée"}</span><h2>{item.title}</h2><small>Publié par {item.createdByName||"Administration"} · {item.createdAt?new Date(item.createdAt).toLocaleString("fr-CA"):""}</small></div>{manager&&<button className="button secondary small" onClick={()=>setCommunicationActive(item.id,!item.active)}>{item.active?"Archiver":"Réactiver"}</button>}</header><p className="employee-message">{item.body}</p>{manager&&<section className="employee-read-receipts"><h3>Confirmations de lecture ({receipts.length})</h3>{receipts.length?<div className="employee-receipt-list">{receipts.map(receipt=><div key={receipt.id}><div><strong>{receipt.name||receipt.email}</strong>{receipt.name&&receipt.email&&<small>{receipt.email}</small>}</div><time dateTime={receipt.readAt}>{receipt.readAt?new Date(receipt.readAt).toLocaleString("fr-CA",{dateStyle:"long",timeStyle:"short"}):"Date non disponible"}</time></div>)}</div>:<p>Aucune confirmation reçue.</p>}</section>}<div className="employee-confirmation">{read?<span className="badge ok">Lecture confirmée</span>:item.active&&item.audienceRoles.includes(profile!.role)?<button className="button" onClick={()=>confirmRead(item)}>Je confirme avoir lu cette communication</button>:null}</div></article>})}{!visible.length&&<section className="card"><p>Aucune communication disponible.</p></section>}</section>
  </>}
 </>;
}

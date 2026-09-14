"use client";
import{useEffect,useMemo,useState}from"react";
import{useAuth}from"@/features/auth/AuthProvider";
import{createCamilleExampleLeave,deleteEmployeeLeave,reviewEmployeeLeave,saveEmployeeLeave,subscribeEmployeeLeaves,subscribePayrollProfiles}from"./firestore";
import type{EmployeeLeave,EmployeePayrollProfile,LeaveType}from"./types";
import{subscribeInstructors}from"@/features/instructors/firestore";
import type{Instructor}from"@/features/instructors/types";

const today=()=>new Date().toISOString().slice(0,10);
const year=new Date().getFullYear();
const daysInYear=(leave:EmployeeLeave)=>{const cursor=new Date(`${leave.startDate}T12:00:00`),end=new Date(`${leave.endDate}T12:00:00`);let count=0;while(cursor<=end){if(cursor.getFullYear()===year)count+=1;cursor.setDate(cursor.getDate()+1)}return count};
export function LeavePanel(){
 const{user,profile}=useAuth(),manager=profile?.role==="Administrateur"||profile?.role==="Chef instructeur";
 const[items,setItems]=useState<EmployeeLeave[]>([]),[instructors,setInstructors]=useState<Instructor[]>([]),[payrollProfiles,setPayrollProfiles]=useState<EmployeePayrollProfile[]>([]),[error,setError]=useState(""),[message,setMessage]=useState("");
 const[form,setForm]=useState({employeeId:profile?.linkedInstructorId||user?.uid||"",employeeName:profile?.name||"",employeeRole:profile?.role||"Instructeur",type:"Vacances" as LeaveType,startDate:today(),endDate:today(),hoursPerDay:8,notes:""});
 useEffect(()=>subscribeEmployeeLeaves(manager?undefined:profile?.linkedInstructorId||user?.uid,manager,setItems,value=>setError(value.message)),[manager,profile?.linkedInstructorId,user?.uid]);
 useEffect(()=>manager?subscribeInstructors({next:setInstructors,error:value=>setError(value.message)}):undefined,[manager]);
 useEffect(()=>manager?undefined:subscribePayrollProfiles(profile?.linkedInstructorId||user?.uid,false,setPayrollProfiles,value=>setError(value.message)),[manager,profile?.linkedInstructorId,user?.uid]);
 const days=(start:string,end:string)=>Math.max(1,Math.round((new Date(`${end}T12:00:00`).getTime()-new Date(`${start}T12:00:00`).getTime())/86400000)+1);
 const ordered=useMemo(()=>[...items].sort((a,b)=>b.startDate.localeCompare(a.startDate)),[items]);
 const payrollProfile=payrollProfiles.find(item=>item.employeeId===(profile?.linkedInstructorId||user?.uid));
 const used=useMemo(()=>{
  const approved=items.filter(item=>item.status==="Approuvé"&&new Date(`${item.startDate}T12:00:00`).getFullYear()<=year&&new Date(`${item.endDate}T12:00:00`).getFullYear()>=year);
  return{
   Vacances:approved.filter(item=>item.type==="Vacances").reduce((sum,item)=>sum+daysInYear(item),0),
   Férié:approved.filter(item=>item.type==="Férié").length,
   Maladie:approved.filter(item=>item.type==="Maladie").reduce((sum,item)=>sum+daysInYear(item),0)
  };
 },[items]);
 async function submit(event:React.FormEvent){event.preventDefault();if(!user||!form.employeeId)return;const normalized=form.type==="Férié"?{...form,endDate:form.startDate}:form;await saveEmployeeLeave({id:`leave-${Date.now()}`,...normalized,employeeRole:form.employeeRole as EmployeeLeave["employeeRole"],status:manager?"Approuvé":"En attente",requestedBy:user.uid,requestedAt:new Date().toISOString()});setMessage(manager?"Congé ajouté et approuvé.":"Demande de congé transmise.");}
 return <section className="employee-workspace">
  {!manager&&payrollProfile&&<section className="card employee-bank-summary"><div className="employee-bank-title"><div><h2>Mes banques de congés — {year}</h2><p>Les jours utilisés comprennent uniquement les congés approuvés.</p></div></div><div className="employee-bank-grid">{[
   {label:"Vacances",allowed:payrollProfile.vacationDays,used:used.Vacances},
   {label:"Fériés",allowed:payrollProfile.holidayDays,used:used.Férié},
   {label:"Maladie",allowed:payrollProfile.sickDays,used:used.Maladie}
  ].map(bank=><article key={bank.label}><span>{bank.label}</span><strong>{Math.max(0,bank.allowed-bank.used)} jour{Math.max(0,bank.allowed-bank.used)!==1?"s":""} restant{Math.max(0,bank.allowed-bank.used)!==1?"s":""}</strong><div><small>{bank.allowed} accordé{bank.allowed!==1?"s":""}</small><small>{bank.used} utilisé{bank.used!==1?"s":""}</small></div></article>)}</div></section>}
  {!manager&&!payrollProfile&&<div className="notice warn">Vos banques de congés ne sont pas encore configurées. Communiquez avec votre gestionnaire.</div>}
  <section className="card"><div className="leave-heading"><div><h2>{manager?"Gestion des congés":"Mes congés"}</h2><p>Vacances, jours fériés, maladie et congés sans solde.</p></div>{manager&&<button className="button secondary" type="button" onClick={async()=>{if(!user)return;await createCamilleExampleLeave(user.uid);setMessage("Demande fictive de Camille créée. Elle est maintenant en attente d’approbation.")}}>Créer l’exemple de Camille</button>}</div><form className="leave-form" onSubmit={submit}>
   {manager&&<label>Employé<select required value={form.employeeId} onChange={event=>{const person=instructors.find(item=>item.id===event.target.value);setForm({...form,employeeId:event.target.value,employeeName:person?`${person.firstName} ${person.lastName}`:"",employeeRole:"Instructeur"})}}><option value="">Choisir…</option>{instructors.map(item=><option value={item.id} key={item.id}>{item.firstName} {item.lastName}</option>)}</select></label>}
   <label>Type<select value={form.type} onChange={event=>{const type=event.target.value as LeaveType;setForm({...form,type,endDate:type==="Férié"?form.startDate:form.endDate})}}><option>Vacances</option><option>Férié</option><option>Maladie</option><option>Sans solde</option></select></label>
   <label>Date de début<input type="date" required value={form.startDate} onChange={event=>setForm({...form,startDate:event.target.value,endDate:form.type==="Férié"||event.target.value>form.endDate?event.target.value:form.endDate})}/></label>
   <label>Date de fin<input type="date" min={form.startDate} required value={form.type==="Férié"?form.startDate:form.endDate} disabled={form.type==="Férié"} onChange={event=>setForm({...form,endDate:event.target.value})}/></label>
   <label>Heures par jour<input type="number" min="0" max="24" step="0.1" value={form.hoursPerDay} onChange={event=>setForm({...form,hoursPerDay:Number(event.target.value)})}/></label>
   <label className="wide">Note<textarea rows={2} value={form.notes} onChange={event=>setForm({...form,notes:event.target.value})}/></label>
   <button className="button">{manager?"Ajouter le congé":"Soumettre la demande"}</button>
  </form></section>
  {message&&<div className="notice">{message}</div>}{error&&<div className="notice error">{error}</div>}
  <section className="card leave-list"><div className="leave-row head"><span>Employé</span><span>Période</span><span>Type</span><span>Heures</span><span>État</span><span>Actions</span></div>{ordered.map(item=><div className="leave-row" key={item.id}><strong>{item.employeeName}</strong><span>{item.type==="Férié"||item.startDate===item.endDate?item.startDate:`${item.startDate} au ${item.endDate}`}</span><span>{item.type}</span><span>{((item.type==="Férié"?1:days(item.startDate,item.endDate))*item.hoursPerDay).toFixed(1)} h</span><span className={`badge ${item.status==="Approuvé"?"ok":item.status==="Refusé"?"danger":"warn"}`}>{item.status}</span><div className="row-actions">{manager&&item.status==="En attente"&&<><button className="button small" onClick={()=>reviewEmployeeLeave(item.id,"Approuvé",user!.uid,profile!.name)}>Approuver</button><button className="button danger small" onClick={()=>reviewEmployeeLeave(item.id,"Refusé",user!.uid,profile!.name)}>Refuser</button></>}{(manager||item.status==="En attente")&&<button className="button secondary small" onClick={()=>deleteEmployeeLeave(item.id)}>Supprimer</button>}</div></div>)}{!ordered.length&&<p>Aucun congé enregistré.</p>}</section>
 </section>;
}

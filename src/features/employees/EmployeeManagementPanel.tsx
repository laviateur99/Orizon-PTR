"use client";
import{useEffect,useMemo,useState}from"react";
import{useAuth}from"@/features/auth/AuthProvider";
import{subscribeInstructors}from"@/features/instructors/firestore";
import type{Instructor}from"@/features/instructors/types";
import{DEFAULT_PAYROLL_CLASS_RATES,savePayrollClassRate,savePayrollProfile,subscribeEmployeeLeaves,subscribePayrollClassRates,subscribePayrollProfiles}from"./firestore";
import type{EmployeeLeave,EmployeePayrollProfile,PayrollClass,PayrollClassRate}from"./types";

const year=new Date().getFullYear();
const today=()=>new Date().toISOString().slice(0,10);
const payrollClasses:PayrollClass[]=["Classe 1","Classe 2","Classe 3","Classe 4","ADM"];
const emptyProfile=(person:Instructor):EmployeePayrollProfile=>({id:person.id,employeeId:person.id,employeeName:`${person.firstName} ${person.lastName}`,payrollEmployeeId:person.employeeNumber,payrollClass:person.classLevel,isSupervisor:false,flightRate:0,groundRate:0,theoryRate:0,simulatorRate:0,leaveRate:0,vacationDays:0,holidayDays:0,sickDays:0,standardDayHours:8,effectiveDate:today()});
const emptyRate=(payrollClass:PayrollClass):PayrollClassRate=>DEFAULT_PAYROLL_CLASS_RATES.find(item=>item.payrollClass===payrollClass)||{id:payrollClass,payrollClass,flightRate:0,groundRate:0,theoryRate:0,simulatorRate:0,leaveRate:0,developmentRate:0};
const daysInYear=(leave:EmployeeLeave)=>{const start=new Date(`${leave.startDate}T12:00:00`),end=new Date(`${leave.endDate}T12:00:00`);let count=0;while(start<=end){if(start.getFullYear()===year)count+=1;start.setDate(start.getDate()+1)}return count};

export function EmployeeManagementPanel({initialEmployeeId=""}:{initialEmployeeId?:string}){
 const{user}=useAuth();
 const[instructors,setInstructors]=useState<Instructor[]>([]),[profiles,setProfiles]=useState<EmployeePayrollProfile[]>([]),[rates,setRates]=useState<PayrollClassRate[]>([]),[leaves,setLeaves]=useState<EmployeeLeave[]>([]);
 const[rateClass,setRateClass]=useState<PayrollClass>("Classe 4"),[rateDraft,setRateDraft]=useState<PayrollClassRate>(emptyRate("Classe 4"));
 const[selected,setSelected]=useState(""),[draft,setDraft]=useState<EmployeePayrollProfile|null>(null),[message,setMessage]=useState(""),[error,setError]=useState("");
 useEffect(()=>subscribeInstructors({next:setInstructors,error:value=>setError(value.message)}),[]);
 useEffect(()=>subscribePayrollProfiles(undefined,true,setProfiles,value=>setError(value.message)),[]);
 useEffect(()=>subscribePayrollClassRates(setRates,value=>setError(value.message)),[]);
 useEffect(()=>subscribeEmployeeLeaves(undefined,true,setLeaves,value=>setError(value.message)),[]);
 useEffect(()=>{if(initialEmployeeId)setSelected(initialEmployeeId)},[initialEmployeeId]);
 const person=instructors.find(item=>item.id===selected);
 useEffect(()=>{if(!person){setDraft(null);return;}const existing=profiles.find(item=>item.employeeId===person.id);setDraft(existing?{...existing,payrollClass:person.classLevel,isSupervisor:person.classLevel==="Classe 4"?false:existing.isSupervisor}:emptyProfile(person))},[person,profiles]);
 useEffect(()=>setRateDraft(rates.find(item=>item.payrollClass===rateClass)||emptyRate(rateClass)),[rateClass,rates]);
 const used=useMemo(()=>{
  if(!selected)return{Vacances:0,Férié:0,Maladie:0};
  const approved=leaves.filter(item=>item.employeeId===selected&&item.status==="Approuvé"&&new Date(`${item.startDate}T12:00:00`).getFullYear()<=year&&new Date(`${item.endDate}T12:00:00`).getFullYear()>=year);
  return{
   Vacances:approved.filter(item=>item.type==="Vacances").reduce((sum,item)=>sum+daysInYear(item),0),
   Férié:approved.filter(item=>item.type==="Férié").length,
   Maladie:approved.filter(item=>item.type==="Maladie").reduce((sum,item)=>sum+daysInYear(item),0)
  };
 },[selected,leaves]);
 async function save(){if(!draft||!person||!user)return;try{await savePayrollProfile({...draft,payrollClass:person.classLevel,employeeName:`${person.firstName} ${person.lastName}`},user.uid);setMessage("Paramètres de paie enregistrés.")}catch(value){setError(value instanceof Error?value.message:"Enregistrement impossible.")}}
 async function saveRate(){if(!user)return;try{await savePayrollClassRate(rateDraft,user.uid);setMessage(`Taux de ${rateDraft.payrollClass} enregistrés.`)}catch(value){setError(value instanceof Error?value.message:"Enregistrement impossible.")}}
 return <section className="employee-workspace">
  <section className="card employee-section-head"><div><h2>Gestion des employés</h2><p>Les taux suivent automatiquement la classe inscrite dans le dossier instructeur. Banques de congés pour {year}.</p></div></section>
  {message&&<div className="notice">{message}</div>}{error&&<div className="notice error">{error}</div>}
  <section className="card payroll-management"><h2>Grille des taux salariaux</h2><p>Un seul taux s’applique au vol, au sol, à la théorie, au simulateur et aux congés payés. La classe de l’instructeur sélectionnée dans son dossier détermine automatiquement ce taux.</p><div className="payroll-management-grid"><label>Classe<select value={rateClass} onChange={event=>setRateClass(event.target.value as PayrollClass)}>{payrollClasses.map(item=><option key={item}>{item}</option>)}</select></label><label>{rateClass==="ADM"?"ADM courant ($/h)":"Taux horaire ($/h)"}<input type="number" min="0" step="0.01" value={rateDraft.flightRate} onChange={event=>{const rate=Number(event.target.value);setRateDraft({...rateDraft,flightRate:rate,groundRate:rate,theoryRate:rate,simulatorRate:rate,leaveRate:rate})}}/><small>Taux officiel actuellement appliqué à cette classe.</small></label>{rateClass==="ADM"&&<label>ADM développement ($/h)<input type="number" min="0" step="0.01" value={rateDraft.developmentRate} onChange={event=>setRateDraft({...rateDraft,developmentRate:Number(event.target.value)})}/><small>Tâches de développement assignées par la direction.</small></label>}</div><div className="management-actions"><button className="button" onClick={saveRate}>Enregistrer le taux de la classe</button></div></section>
  <section className="card payroll-management">
   <label>Employé<select value={selected} onChange={event=>{setSelected(event.target.value);setMessage("")}}><option value="">Choisir un instructeur…</option>{instructors.filter(item=>item.status!=="Inactif").sort((a,b)=>a.lastName.localeCompare(b.lastName)).map(item=><option value={item.id} key={item.id}>{item.firstName} {item.lastName}</option>)}</select></label>
   {draft&&person&&<>
    <div className="payroll-management-grid">
     <label>Classe d’instructeur<input value={person.classLevel} readOnly/><small>Pour la modifier, ouvrez le dossier de l’instructeur.</small></label>
     <label>Identifiant de paie<input value={draft.payrollEmployeeId||""} onChange={event=>setDraft({...draft,payrollEmployeeId:event.target.value})}/><small>Obligatoire avant l’export comptable.</small></label>
     <label className="active-check"><input type="checkbox" checked={draft.isSupervisor} disabled={person.classLevel==="Classe 4"} onChange={event=>setDraft({...draft,isSupervisor:event.target.checked})}/>Superviseur — prime de 5 $/h<small>{person.classLevel==="Classe 4"?"Non admissible pour un instructeur de classe 4.":"Ajoutée aux heures travaillées, excluant les congés."}</small></label>
     <label>Date d’entrée en vigueur<input type="date" value={draft.effectiveDate} onChange={event=>setDraft({...draft,effectiveDate:event.target.value})}/></label>
     <label>Heures par journée<input type="number" min="0" max="24" step="0.1" value={draft.standardDayHours} onChange={event=>setDraft({...draft,standardDayHours:Number(event.target.value)})}/></label>
    </div>
    <h3>Banques annuelles</h3><div className="leave-bank-grid">
     <label>Vacances — accordées<input type="number" min="0" step="0.5" value={draft.vacationDays} onChange={event=>setDraft({...draft,vacationDays:Number(event.target.value)})}/><small>{used.Vacances} utilisée(s) · {Math.max(0,draft.vacationDays-used.Vacances)} restante(s)</small></label>
     <label>Fériés — accordés<input type="number" min="0" step="1" value={draft.holidayDays} onChange={event=>setDraft({...draft,holidayDays:Number(event.target.value)})}/><small>{used.Férié} utilisé(s) · {Math.max(0,draft.holidayDays-used.Férié)} restant(s)</small></label>
     <label>Maladie — accordée<input type="number" min="0" step="0.5" value={draft.sickDays} onChange={event=>setDraft({...draft,sickDays:Number(event.target.value)})}/><small>{used.Maladie} utilisée(s) · {Math.max(0,draft.sickDays-used.Maladie)} restante(s)</small></label>
    </div>
    <div className="management-actions"><button className="button" onClick={save}>Enregistrer les paramètres</button></div>
   </>}
  </section>
 </section>;
}

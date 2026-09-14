"use client";
import {useEffect,useMemo,useState} from "react";
import {subscribeReservations} from "@/features/scheduler/firestore";
import type{SchedulerEvent}from"@/features/scheduler/types";
import{subscribeInstructors}from"@/features/instructors/firestore";
import type{Instructor}from"@/features/instructors/types";
import{useAuth}from"@/features/auth/AuthProvider";
import{subscribeEmployeeLeaves,subscribePayrollClassRates,subscribePayrollProfiles}from"./firestore";
import type{EmployeeLeave,EmployeePayrollProfile,PayrollClassRate}from"./types";

type Row={id:string;date:string;description:string;category:"Vol"|"Débriefing"|"Sol préparatoire"|"Théorie"|"Simulateur"|"Vacances"|"Férié"|"Maladie"|"Sans solde";hours:number};
const localDate=(value:Date)=>`${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,"0")}-${String(value.getDate()).padStart(2,"0")}`;
const currentPayPeriod=()=>{const start=new Date();start.setHours(12,0,0,0);start.setDate(start.getDate()-start.getDay()-7);const end=new Date(start);end.setDate(start.getDate()+13);return{start:localDate(start),end:localDate(end)}};
const rounded=(value:number)=>Math.round(value*10)/10;
const duration=(event:SchedulerEvent)=>rounded(Math.max(0,event.endMinutes-event.startMinutes)/60);
const flightHours=(event:SchedulerEvent)=>{
 const dayNight=(event.dayHours||0)+(event.nightHours||0);
 if(dayNight>0)return rounded(dayNight);
 if((event.airtimeMinutes||0)>0)return rounded((event.airtimeMinutes||0)/60);
 if(event.hobbsStart!==undefined&&event.hobbsEnd!==undefined&&event.hobbsEnd>=event.hobbsStart)return rounded(event.hobbsEnd-event.hobbsStart);
 return duration(event);
};
const instructorClassOnDate=(instructor:Instructor|undefined,date:string)=>{
 if(!instructor)return undefined;
 const history=[...(instructor.classHistory||[])].sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate)||a.recordedAt.localeCompare(b.recordedAt));
 if(!history.length)return instructor.classLevel;
 let classLevel=history[0].from;
 for(const change of history){if(change.effectiveDate<=date)classLevel=change.to;}
 return classLevel;
};

export function TimesheetPanel(){
 const{profile}=useAuth(),manager=profile?.role==="Administrateur"||profile?.role==="Chef instructeur";
 const[events,setEvents]=useState<SchedulerEvent[]>([]),[instructors,setInstructors]=useState<Instructor[]>([]);
 const[leaves,setLeaves]=useState<EmployeeLeave[]>([]);
 const[payrollProfiles,setPayrollProfiles]=useState<EmployeePayrollProfile[]>([]);
 const[payrollClassRates,setPayrollClassRates]=useState<PayrollClassRate[]>([]);
 const[printWait,setPrintWait]=useState(0);
 const initialPeriod=useMemo(currentPayPeriod,[]);
 const[from,setFrom]=useState(initialPeriod.start),[to,setTo]=useState(initialPeriod.end),[selected,setSelected]=useState(profile?.linkedInstructorId||""),[error,setError]=useState("");
 useEffect(()=>subscribeReservations({next:setEvents,error:value=>setError(value.message)}),[]);
 useEffect(()=>subscribeInstructors({next:setInstructors,error:value=>setError(value.message)}),[]);
 useEffect(()=>{if(!selected&&profile?.linkedInstructorId)setSelected(profile.linkedInstructorId)},[profile?.linkedInstructorId,selected]);
 const instructorId=manager?selected:profile?.linkedInstructorId||"";
 useEffect(()=>subscribeEmployeeLeaves(manager?undefined:instructorId,manager,setLeaves,value=>setError(value.message)),[manager,instructorId]);
 useEffect(()=>subscribePayrollProfiles(manager?undefined:instructorId,manager,setPayrollProfiles,value=>setError(value.message)),[manager,instructorId]);
 useEffect(()=>subscribePayrollClassRates(setPayrollClassRates,value=>setError(value.message)),[]);
 useEffect(()=>{if(printWait<=0)return;const timer=window.setTimeout(()=>setPrintWait(value=>Math.max(0,value-1)),1000);return()=>window.clearTimeout(timer)},[printWait]);
 const rows=useMemo(()=>{
  if(!instructorId)return[];
  const activityRows=events.filter(event=>event.instructorId===instructorId&&event.date>=from&&event.date<=to&&event.status==="Complété").flatMap<Row>(event=>{
   const description=[event.title,event.studentName].filter(Boolean).join(" — ");
   if(event.type==="Double commande"||event.type==="Solo"){
    const hours=flightHours(event);
    return hours>0?[{id:event.id,date:event.date,description,category:"Vol",hours},{id:`${event.id}-debrief`,date:event.date,description:`Débriefing — ${event.title}`,category:"Débriefing",hours:0.2}]:[];
   }
   if(event.type==="Simulateur")return[{id:event.id,date:event.date,description,category:"Simulateur",hours:event.groundTimeHours||duration(event)}];
   if(event.type==="Sol"){
    return[{id:event.id,date:event.date,description,category:event.theoreticalSessionId?"Théorie":"Sol préparatoire",hours:event.groundTimeHours||duration(event)}];
   }
   return[];
  });
  const leaveRows=leaves.filter(item=>item.employeeId===instructorId&&item.status==="Approuvé"&&item.startDate<=to&&item.endDate>=from).flatMap<Row>(item=>{
   const rows:Row[]=[];
   const effectiveEnd=item.type==="Férié"?item.startDate:item.endDate;
   const cursor=new Date(`${item.startDate>from?item.startDate:from}T12:00:00`),end=new Date(`${effectiveEnd<to?effectiveEnd:to}T12:00:00`);
   while(cursor<=end){
    const date=cursor.toISOString().slice(0,10);
    rows.push({id:`${item.id}-${date}`,date,description:item.notes||item.type,category:item.type,hours:item.hoursPerDay});
    cursor.setDate(cursor.getDate()+1);
   }
   return rows;
  });
  return[...activityRows,...leaveRows].sort((a,b)=>a.date.localeCompare(b.date)||a.category.localeCompare(b.category));
 },[events,leaves,instructorId,from,to]);
 const categories:Row["category"][]=["Vol","Débriefing","Sol préparatoire","Théorie","Simulateur","Vacances","Férié","Maladie","Sans solde"];
 const totals=useMemo(()=>Object.fromEntries(categories.map(category=>[category,rounded(rows.filter(row=>row.category===category).reduce((sum,row)=>sum+row.hours,0))])),[rows]);
 const grand=rounded(rows.filter(row=>row.category!=="Sans solde").reduce((sum,row)=>sum+row.hours,0));
 const payrollProfile=payrollProfiles.find(item=>item.employeeId===instructorId);
 const instructor=instructors.find(item=>item.id===instructorId);
 const rateFor=(category:Row["category"],date:string)=>{
  const payrollClass=instructorClassOnDate(instructor,date);
  const classRate=payrollClassRates.find(item=>item.payrollClass===payrollClass);
  const base=category==="Vol"||category==="Débriefing"?classRate?.flightRate||0:category==="Sol préparatoire"?classRate?.groundRate||0:category==="Théorie"?classRate?.theoryRate||0:category==="Simulateur"?classRate?.simulatorRate||0:category==="Sans solde"?0:classRate?.leaveRate||0;
  const supervisorBonus=payrollProfile?.isSupervisor&&payrollClass!=="Classe 4"&&["Vol","Débriefing","Sol préparatoire","Théorie","Simulateur"].includes(category)?5:0;
  return base+supervisorBonus;
 };
 const missingRate=rows.some(row=>!payrollClassRates.some(item=>item.payrollClass===instructorClassOnDate(instructor,row.date)));
 const gross=Math.round(rows.reduce((sum,row)=>sum+row.hours*rateFor(row.category,row.date),0)*100)/100;
 const shiftPeriod=(periods:number)=>{const start=new Date(`${from}T12:00:00`);start.setDate(start.getDate()+periods*14);const end=new Date(start);end.setDate(start.getDate()+13);setFrom(localDate(start));setTo(localDate(end));};
 const printTimesheet=async()=>{
  if(printWait>0||!rows.length)return;
  setPrintWait(30);
  await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
  if(document.fonts?.ready)await document.fonts.ready;
  window.print();
 };
 return <section className="employee-workspace">
  <div className="card employee-section-head"><div><h2>Feuille de temps — instructeurs</h2><p>Calculée à partir des activités complétées dans l’horaire. Chaque vol ajoute automatiquement 0,2 h de débriefing.</p></div></div>
  {error&&<div className="notice error">{error}</div>}
  <div className="card timesheet-filters">
   {manager?<label>Instructeur<select value={selected} onChange={event=>setSelected(event.target.value)}><option value="">Choisir…</option>{instructors.filter(item=>item.status==="Actif").map(item=><option value={item.id} key={item.id}>{item.firstName} {item.lastName}</option>)}</select></label>:<strong>{profile?.name}</strong>}
   <button className="button secondary" onClick={()=>shiftPeriod(-1)}>← Période précédente</button>
   <label>Dimanche — début<input type="date" value={from} readOnly/></label>
   <label>Samedi — fin<input type="date" value={to} readOnly/></label>
   <button className="button secondary" onClick={()=>shiftPeriod(1)}>Période suivante →</button>
   <button className={`button secondary timesheet-print-action ${printWait>0?"sent":""}`} onClick={printTimesheet} disabled={!rows.length||printWait>0} aria-busy={printWait>0}>
    {printWait>0?`Envoyé pour impression — en attente (${printWait} s)`:"Imprimer"}
   </button>
  </div>
  {!instructorId?<div className="notice">Choisissez un instructeur pour afficher sa feuille de temps.</div>:<>
   {(!payrollProfile||!instructor||missingRate)&&<div className="notice warn">Aucune classe salariale ou aucun taux de classe n’est configuré pour cet instructeur. Les heures sont exactes, mais certains montants peuvent demeurer à 0 $.</div>}
   {payrollProfile?.isSupervisor&&<div className="notice">Prime de supervision appliquée : +5,00 $/h sur les heures travaillées admissibles (classes 1 à 3).</div>}
   <div className="timesheet-summary">{Object.entries(totals).map(([label,value])=><article className="card" key={label}><span>{label}</span><strong>{Number(value).toFixed(1)} h</strong></article>)}<article className="card total"><span>Total rémunéré</span><strong>{grand.toFixed(1)} h</strong><small>{gross.toLocaleString("fr-CA",{style:"currency",currency:"CAD"})}</small></article></div>
   <section className="card timesheet-table"><div className="timesheet-row head"><span>Date</span><span>Activité</span><span>Catégorie</span><span>Heures</span><span>Taux</span><span>Montant</span></div>{rows.map(row=>{const rate=rateFor(row.category,row.date),amount=row.hours*rate;return <div className="timesheet-row" key={row.id}><span>{new Date(`${row.date}T12:00:00`).toLocaleDateString("fr-CA")}</span><span>{row.description}</span><span><span className="badge">{row.category}</span></span><strong>{row.hours.toFixed(1)}</strong><span>{rate.toLocaleString("fr-CA",{style:"currency",currency:"CAD"})}</span><strong>{amount.toLocaleString("fr-CA",{style:"currency",currency:"CAD"})}</strong></div>})}{!rows.length&&<p>Aucune activité complétée pendant cette période.</p>}</section>
  </>}
 </section>;
}

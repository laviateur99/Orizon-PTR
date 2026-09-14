"use client";
import{useEffect,useMemo,useState}from"react";
import{useAuth}from"@/features/auth/AuthProvider";
import{deleteTimeClockEntry,saveTimeClockEntry,subscribeTimeClockEntries}from"./firestore";
import type{TimeClockEntry}from"./types";
const nowTime=()=>new Date().toTimeString().slice(0,5),today=()=>new Date().toISOString().slice(0,10);
const elapsed=(item:TimeClockEntry)=>{if(!item.clockOut)return 0;const[a,b]=[item.clockIn,item.clockOut].map(value=>{const[h,m]=value.split(":").map(Number);return h*60+m});return Math.max(0,(b-a-item.breakMinutes)/60)};
export function TimeClockPanel(){
 const{user,profile}=useAuth(),manager=profile?.role==="Administrateur"||profile?.role==="Directeur de maintenance";
 const employeeId=user?.uid||"",maintenance=profile?.role==="Maintenance"||profile?.role==="Directeur de maintenance"||profile?.role==="Administrateur";
 const[items,setItems]=useState<TimeClockEntry[]>([]),[error,setError]=useState("");
 useEffect(()=>maintenance?subscribeTimeClockEntries(manager?undefined:employeeId,manager,setItems,value=>setError(value.message)):undefined,[maintenance,manager,employeeId]);
 const open=items.find(item=>item.employeeId===employeeId&&item.status==="Ouvert");
 const total=useMemo(()=>items.filter(item=>item.employeeId===employeeId&&item.date===today()).reduce((sum,item)=>sum+elapsed(item),0),[items,employeeId]);
 if(!maintenance)return <div className="notice">Le pointage est réservé aux mécaniciens et au service de maintenance.</div>;
 async function clockIn(){if(!user||!profile)return;await saveTimeClockEntry({id:`clock-${user.uid}-${Date.now()}`,employeeId:user.uid,employeeName:profile.name,date:today(),clockIn:nowTime(),clockOut:"",breakMinutes:0,notes:"",status:"Ouvert",createdBy:user.uid})}
 async function clockOut(){if(!open)return;await saveTimeClockEntry({...open,clockOut:nowTime(),status:"Complété"})}
 return <section className="employee-workspace"><section className="card clock-card"><div><h2>Pointage — maintenance</h2><p>{open?`Entrée enregistrée à ${open.clockIn}`:"Aucun quart de travail en cours."}</p></div><div><strong>{total.toFixed(2)} h aujourd’hui</strong>{open?<button className="button danger" onClick={clockOut}>Pointer le départ</button>:<button className="button" onClick={clockIn}>Pointer l’arrivée</button>}</div></section>{error&&<div className="notice error">{error}</div>}<section className="card timesheet-table"><div className="clock-row head"><span>Date</span><span>Employé</span><span>Entrée</span><span>Sortie</span><span>Pause</span><span>Total</span><span/></div>{items.map(item=><div className="clock-row" key={item.id}><span>{item.date}</span><strong>{item.employeeName}</strong><span>{item.clockIn}</span><span>{item.clockOut||"En cours"}</span><span>{item.breakMinutes} min</span><span>{elapsed(item).toFixed(2)} h</span><button className="button secondary small" onClick={()=>deleteTimeClockEntry(item.id)}>Supprimer</button></div>)}</section></section>;
}

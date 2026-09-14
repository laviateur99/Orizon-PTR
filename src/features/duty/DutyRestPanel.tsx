"use client";

import { useEffect, useMemo, useState } from "react";
import { subscribeReservations } from "@/features/scheduler/firestore";
import { confirmedStudentBreak } from "./breaks";
import type { SchedulerEvent } from "@/features/scheduler/types";

type Role="student"|"instructor";
type DutyItem={event:SchedulerEvent;start:Date;end:Date;durationHours:number;flightHours:number};
const at=(date:string,minutes:number)=>new Date(`${date}T00:00:00`).getTime()+minutes*60_000;
const daysAgo=(count:number)=>{const date=new Date();date.setHours(0,0,0,0);date.setDate(date.getDate()-count);return date;};
const flightDuration=(event:SchedulerEvent,role:Role)=>{
  if(role==="instructor"&&event.type!=="Double commande")return 0;
  if(role==="student"&&!['Double commande','Solo'].includes(event.type))return 0;
  if(event.hobbsStart!==undefined&&event.hobbsEnd!==undefined)return Math.max(0,event.hobbsEnd-event.hobbsStart);
  if(event.airtimeMinutes!==undefined)return event.airtimeMinutes/60;
  return Math.max(0,event.endMinutes-event.startMinutes)/60;
};
const displayHour=(minutes:number)=>`${String(Math.floor(minutes/60)).padStart(2,"0")}:${String(minutes%60).padStart(2,"0")}`;
const maxDutyPeriod=(values:DutyItem[])=>{
  if(!values.length)return 0;
  let start=values[0].start.getTime(),end=values[0].end.getTime(),maximum=0;
  values.slice(1).forEach(item=>{
    const rest=(item.start.getTime()-end)/3_600_000;
    if(rest>=8){maximum=Math.max(maximum,(end-start)/3_600_000);start=item.start.getTime();}
    end=Math.max(end,item.end.getTime());
  });
  return Math.max(maximum,(end-start)/3_600_000);
};

export function DutyRestPanel({personId,role}:{personId:string;role:Role}){
  const[events,setEvents]=useState<SchedulerEvent[]>([]),[error,setError]=useState("");
  useEffect(()=>subscribeReservations({next:setEvents,error:value=>setError(value.message)}),[]);
  const items=useMemo<DutyItem[]>(()=>events.filter(event=>{
    if(event.status==="Annulé")return false;
    if(role==="instructor")return event.instructorId===personId;
    const direct=event.studentId===personId;
    const participant=event.participantStudentIds?.includes(personId);
    if(!direct&&!participant)return false;
    return !event.theoreticalSessionId||event.theoryAttendance?.[personId]!=="Absent";
  }).map(event=>{
    const start=new Date(at(event.date,event.startMinutes)),end=new Date(at(event.date,event.endMinutes));
    return{event,start,end,durationHours:(end.getTime()-start.getTime())/3_600_000,flightHours:flightDuration(event,role)};
  }).sort((a,b)=>a.start.getTime()-b.start.getTime()),[events,personId,role]);
  const today=useMemo(()=>{const value=new Date();value.setHours(23,59,59,999);return value;},[]);
  const flightTotal=(days:number)=>items.filter(item=>item.start>=daysAgo(days-1)&&item.start<=today).reduce((sum,item)=>sum+item.flightHours,0);
  const rolling=useMemo(()=>items.reduce((peak,item,index)=>{
    const from=item.end.getTime()-86_400_000;
    const window=items.slice(0,index+1).filter(value=>value.end.getTime()>from&&value.start<=item.end);
    const flight=window.reduce((sum,value)=>sum+value.flightHours,0);
    return Math.max(peak,flight);
  },0),[items]);
  const maximumService=useMemo(()=>maxDutyPeriod(items),[items]);
  const daily=useMemo(()=>{
    const groups=new Map<string,DutyItem[]>();items.forEach(item=>groups.set(item.event.date,[...(groups.get(item.event.date)||[]),item]));
    return Array.from(groups.entries()).map(([date,values])=>{
      const ordered=values.sort((a,b)=>a.start.getTime()-b.start.getTime());
      const pauses=ordered.slice(1).map((item,index)=>{
        const previous=ordered[index],actual=(item.start.getTime()-previous.end.getTime())/60_000,required=previous.durationHours*60*.15;
        const confirmation=confirmedStudentBreak(previous.event,item.event,personId);
        return{actual,required,confirmation,overlap:actual<0,ok:actual>=required||Boolean(confirmation)};
      });
      const span=maxDutyPeriod(ordered);
      const flight=ordered.reduce((sum,item)=>sum+item.flightHours,0);
      const previous=items.filter(item=>item.end<ordered[0].start).slice(-1)[0];
      const overnight=previous?(ordered[0].start.getTime()-previous.end.getTime())/3_600_000:undefined;
      return{date,items:ordered,span,flight,pauses,overnight};
    }).sort((a,b)=>b.date.localeCompare(a.date));
  },[items,personId]);
  const freeDays=(window:number)=>{const active=new Set(items.filter(item=>item.start>=daysAgo(window-1)&&item.start<=today).map(item=>item.event.date));return window-active.size;};
  const dailyFlightLimit=role==="instructor"?12:8;
  const totals=[{label:"Vol / 24 h",value:rolling,limit:dailyFlightLimit},{label:"Service maximal",value:maximumService,limit:13},{label:"Vol / 28 jours",value:flightTotal(28),limit:112},{label:"Vol / 90 jours",value:flightTotal(90),limit:300},{label:"Vol / 365 jours",value:flightTotal(365),limit:1000}];
  return <section className="card duty-rest-panel">
    <header><div><span>GESTION DE LA FATIGUE</span><h2>Temps de service et de repos</h2><p>Calcul selon la politique du manuel de formation Orizon.</p></div><div className="duty-free-days"><b className={freeDays(7)>=1?"ok":"bad"}>{freeDays(7)}/7</b><span>jours sans service</span><b className={freeDays(28)>=4?"ok":"bad"}>{freeDays(28)}/28</b><span>jours sans service</span></div></header>
    {error&&<div className="notice error">{error}</div>}
    <div className="duty-limit-grid">{totals.map(item=>{const percent=Math.min(100,Math.round(item.value/item.limit*100)),state=item.value>item.limit?"bad":percent>=80?"warn":"ok";return <article className={state} key={item.label}><span>{item.label}</span><strong>{item.value.toFixed(1)} h</strong><small>Limite : {item.limit} h</small><div><i style={{width:`${percent}%`}}/></div></article>})}</div>
    <div className="duty-table-wrap"><table className="duty-table"><thead><tr><th>Date</th><th>Période de service</th><th>Activités</th><th>Service</th><th>Vol</th><th>Pauses</th><th>Repos précédent</th><th>État</th></tr></thead><tbody>{daily.slice(0,28).map(day=>{
      const overlap=day.pauses.some(item=>item.overlap);
      const pauseOk=role==="instructor"||day.pauses.filter(item=>!item.overlap).every(item=>item.ok),overnightOk=day.overnight===undefined||day.overnight>=8;
      const exceeded=day.span>13||day.flight>dailyFlightLimit;
      const label=exceeded?"Dépassement":overlap?"Chevauchement d’activités":!pauseOk?"Pause insuffisante":!overnightOk?"Repos à confirmer":"Conforme";
      const badge=exceeded||overlap?"danger":!pauseOk||!overnightOk?"warn":"ok";
      return <tr key={day.date}><td>{day.date}</td><td>{displayHour(day.items[0].event.startMinutes)}–{displayHour(day.items[day.items.length-1].event.endMinutes)}</td><td>{day.items.map(item=>item.event.title).join(" · ")}</td><td>{day.span.toFixed(1)} h</td><td>{day.flight.toFixed(1)} h</td><td title={day.pauses.flatMap(item=>item.confirmation?[`${item.confirmation.confirmedByName} · ${item.confirmation.confirmedAt}`]:[]).join("; ")} className={pauseOk?"ok":"warn"}>{role==="instructor"?"Non applicable":day.pauses.length?pauseOk?(day.pauses.some(item=>item.confirmation)?"Confirmées par l’instructeur":"Conformes"):"Insuffisante":"—"}</td><td className={overnightOk?"ok":"warn"}>{day.overnight===undefined?"—":`${day.overnight.toFixed(1)} h${overnightOk?"":" · sommeil à confirmer"}`}</td><td><span className={`badge ${badge}`}>{label}</span></td></tr>;
    })}{!daily.length&&<tr><td colSpan={8}>Aucune activité assignée.</td></tr>}</tbody></table></div>
    <p className="duty-disclaimer">Le repos de 8 heures est une indication basée sur l’intervalle disponible entre deux périodes. Flight Director ne peut pas confirmer le sommeil réellement obtenu. Le déplacement entre les activités n’est pas comptabilisé.</p>
  </section>;
}

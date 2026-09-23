"use client";
import{useEffect,useMemo,useState}from"react";
import{subscribeTheorySessions,subscribeTheorySessionsForStudent}from"./firestore";
import type{TheorySession}from"./types";

const minutes=(value:string)=>{const match=value.match(/^(\d{1,2}):(\d{2})$/);return match?Number(match[1])*60+Number(match[2]):0;};
const duration=(session:TheorySession)=>Math.max(0,Math.round((minutes(session.endTime)-minutes(session.startTime))/6)/10);
export function StudentTheoryRecordPanel({studentId,selfService}:{studentId:string;selfService?:boolean}){
  const[sessions,setSessions]=useState<TheorySession[]>([]),[error,setError]=useState("");
  useEffect(()=>selfService
    ?subscribeTheorySessionsForStudent(studentId,setSessions,value=>setError(value.message))
    :subscribeTheorySessions(values=>setSessions(values.filter(item=>item.studentIds.includes(studentId))),value=>setError(value.message))
  ,[studentId,selfService]);
  const ordered=useMemo(()=>sessions.slice().sort((a,b)=>`${b.date}${b.startTime}`.localeCompare(`${a.date}${a.startTime}`)),[sessions]);
  const completed=ordered.filter(item=>item.status==="Complétée");
  const present=completed.filter(item=>item.attendance[studentId]==="Présent");
  const absent=completed.filter(item=>item.attendance[studentId]==="Absent");
  const hours=present.reduce((total,item)=>total+duration(item),0);
  return <section className="card student-theory-record">
    <header><div><span>Registre individuel</span><h3>Formation théorique</h3></div><div className="theory-record-metrics"><strong>{hours.toFixed(1)} h</strong><small>{present.length} présence(s) · {absent.length} absence(s)</small></div></header>
    {error&&<div className="notice error">{error}</div>}
    <div className="student-theory-list">{ordered.map(item=>{const status=item.status==="Complétée"?(item.attendance[studentId]||"Non consignée"):item.status;return <article className={status==="Présent"?"present":status==="Absent"?"absent":""} key={item.id}><div><strong>{item.date} · {item.startTime}–{item.endTime} — {item.title}</strong><span>{item.instructorName} · {item.roomName||"Local non précisé"}{item.topic?` · ${item.topic}`:""}</span></div><div><b>{status}</b><small>{status==="Présent"?`${duration(item).toFixed(1)} h créditée(s)`:status==="Absent"?"0 h créditée":"—"}</small></div></article>})}{!ordered.length&&<p>Aucune session de formation théorique n’est encore liée à cet étudiant.</p>}</div>
  </section>;
}

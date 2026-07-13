"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { subscribeStudents } from "./firestore";
import { initials } from "./utils";
import type { Student, StudentStatus } from "./types";

export function StudentsPage(){
  const router=useRouter(); const [students,setStudents]=useState<Student[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState("");
  const [search,setSearch]=useState(""); const [status,setStatus]=useState<"Tous"|StudentStatus>("Tous");
  useEffect(()=>subscribeStudents({next:x=>{setStudents(x);setLoading(false)},error:e=>{setError(e.message);setLoading(false)}}),[]);
  const filtered=useMemo(()=>students.filter(s=>{
    const hay=`${s.firstName} ${s.lastName} ${s.email} ${s.program}`.toLowerCase();
    return (!search||hay.includes(search.toLowerCase()))&&(status==="Tous"||s.status===status);
  }).sort((a,b)=>a.lastName.localeCompare(b.lastName)),[students,search,status]);
  return <>
    <PageHeader title="Étudiants" subtitle="Dossiers, documents, progression, réservations et historique" />
    <div className="student-toolbar"><input placeholder="Rechercher un étudiant…" value={search} onChange={e=>setSearch(e.target.value)}/><select value={status} onChange={e=>setStatus(e.target.value as typeof status)}><option>Tous</option><option>Actif</option><option>En pause</option><option>Diplômé</option><option>Retiré</option></select><button className="button" onClick={()=>router.push('/students/new')}>+ Ajouter un étudiant</button></div>
    {error&&<div className="notice error">{error}</div>}
    {loading?<section className="card">Chargement des étudiants…</section>:<div className="student-grid">{filtered.map(s=><button className="student-card" key={s.id} onClick={()=>router.push(`/students/${s.id}`)}><div className="student-avatar">{initials(s.firstName,s.lastName)}</div><div className="student-card-main"><strong>{s.firstName} {s.lastName}</strong><span>{s.program} · {s.programType}</span><span>{s.email||"Aucun courriel"}</span></div><div><span className={`status-badge ${s.status.toLowerCase().replace(' ','-')}`}>{s.status}</span><small>{s.flightHours.toFixed(1)} h vol</small></div></button>)}{!filtered.length&&<section className="card">Aucun étudiant trouvé.</section>}</div>}
  </>;
}

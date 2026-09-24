"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { subscribeStudent, subscribeStudents } from "./firestore";
import { initials } from "./utils";
import type { Student, StudentStatus } from "./types";
import { useAuth } from "@/features/auth/AuthProvider";

export function StudentsPage(){
  const{profile}=useAuth();
  const restricted=profile?.role==="Étudiant";
  const router=useRouter(); const [students,setStudents]=useState<Student[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState("");
  const [search,setSearch]=useState(""); const [status,setStatus]=useState<"Tous"|StudentStatus>("Tous");
  const [sortBy,setSortBy]=useState<"name"|"nameDesc"|"program"|"status"|"hours">("name");
  useEffect(()=>{
    setStudents([]);
    if(restricted){
      if(!profile?.linkedStudentId){setLoading(false);return;}
      return subscribeStudent(profile.linkedStudentId,value=>{setStudents(value?[value]:[]);setLoading(false)},e=>{setError(e.message);setLoading(false)});
    }
    return subscribeStudents({next:x=>{setStudents(x);setLoading(false)},error:e=>{setError(e.message);setLoading(false)}});
  },[restricted,profile?.linkedStudentId]);
  const filtered=useMemo(()=>students.filter(s=>{
    const hay=`${s.firstName} ${s.lastName} ${s.email} ${s.program}`.toLowerCase();
    return (!search||hay.includes(search.toLowerCase()))&&(status==="Tous"||s.status===status);
  }).sort((a,b)=>{
    if(sortBy==="nameDesc")return b.lastName.localeCompare(a.lastName)||b.firstName.localeCompare(a.firstName);
    if(sortBy==="program")return a.program.localeCompare(b.program)||a.lastName.localeCompare(b.lastName);
    if(sortBy==="status")return a.status.localeCompare(b.status)||a.lastName.localeCompare(b.lastName);
    if(sortBy==="hours")return b.flightHours-a.flightHours;
    return a.lastName.localeCompare(b.lastName)||a.firstName.localeCompare(b.firstName);
  }),[students,search,status,sortBy]);
  return <>
    <PageHeader title={restricted?"Mon dossier étudiant":"Étudiants"} subtitle={restricted?"Informations, documents, progression, réservations et notes":"Dossiers, documents, progression, réservations et historique"} />
    {!restricted&&<div className="student-toolbar"><input placeholder="Rechercher un étudiant…" value={search} onChange={e=>setSearch(e.target.value)}/><select value={status} onChange={e=>setStatus(e.target.value as typeof status)}><option>Tous</option><option>Actif</option><option>En pause</option><option>Diplômé</option><option>Retiré</option></select><select value={sortBy} onChange={e=>setSortBy(e.target.value as typeof sortBy)}><option value="name">Nom (A-Z)</option><option value="nameDesc">Nom (Z-A)</option><option value="program">Programme</option><option value="status">Statut</option><option value="hours">Heures de vol</option></select><button className="button" onClick={()=>router.push('/students/new')}>+ Ajouter un étudiant</button></div>}
    {restricted&&!profile?.linkedStudentId&&<div className="notice error">Votre compte doit être lié à votre fiche étudiant par un administrateur.</div>}
    {error&&<div className="notice error">{error}</div>}
    {loading?<section className="card">Chargement des étudiants…</section>:<div className="student-grid">{filtered.map(s=><button className="student-card" key={s.id} onClick={()=>router.push(`/students/${s.id}`)}><div className="student-avatar">{initials(s.firstName,s.lastName)}</div><div className="student-card-main"><strong>{s.firstName} {s.lastName}</strong><span>{s.program} · {s.programType}</span><span>{s.email||"Aucun courriel"}</span></div><div><span className={`status-badge ${s.status.toLowerCase().replace(' ','-')}`}>{s.status}</span><small>{s.flightHours.toFixed(1)} h vol</small></div></button>)}{!filtered.length&&<section className="card">Aucun étudiant trouvé.</section>}</div>}
  </>;
}

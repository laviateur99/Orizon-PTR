"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { subscribeStudent, subscribeStudents } from "@/features/students/firestore";
import type { Student } from "@/features/students/types";
import { useAuth } from "@/features/auth/AuthProvider";
import Link from "next/link";

export function PtrPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [error, setError] = useState("");
  const { profile }=useAuth();
  const [scope, setScope] = useState<"all"|"mine">("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name"|"nameDesc"|"program">("name");
  const filteredStudents = students.filter(student => (scope === "all" || Boolean(profile?.linkedInstructorId && student.primaryInstructorId === profile.linkedInstructorId)) && `${student.firstName} ${student.lastName}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().includes(search.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase()))
    .sort((a, b) => {
      const nameA=`${a.firstName} ${a.lastName}`,nameB=`${b.firstName} ${b.lastName}`;
      return sortBy==="nameDesc" ? nameB.localeCompare(nameA) : sortBy==="program" ? (a.program.localeCompare(b.program)||nameA.localeCompare(nameB)) : nameA.localeCompare(nameB);
    });

  useEffect(() => {
    setStudents([]);
    if(!profile)return;
    if(profile?.role==="Étudiant"){
      if(!profile.linkedStudentId)return;
      return subscribeStudent(profile.linkedStudentId,value=>setStudents(value?[value]:[]),value=>setError(value.message));
    }
    return subscribeStudents({next:setStudents,error:value=>setError(value.message)});
  }, [profile]);

  return (
    <>
      <PageHeader title="PTR électronique" subtitle="Leçons, évaluations Transports Canada, commentaires et signatures" />
      {error && <div className="notice error">{error}</div>}
      {profile?.role !== "Étudiant" && <div className="form-grid" style={{marginBottom:16}}>
        <label>Afficher<select value={scope} onChange={e=>setScope(e.target.value as "all"|"mine")}><option value="all">Tous les PTR accessibles</option><option value="mine">Mes PTR — PTR de mes étudiants</option></select></label>
        <label>Rechercher un étudiant<input type="search" value={search} onChange={e=>setSearch(e.target.value)} /></label>
        <label>Trier par<select value={sortBy} onChange={e=>setSortBy(e.target.value as typeof sortBy)}><option value="name">Nom (A-Z)</option><option value="nameDesc">Nom (Z-A)</option><option value="program">Programme</option></select></label>
      </div>}
      {scope === "mine" && !profile?.linkedInstructorId && <div className="notice">Votre compte doit être lié à une fiche instructeur par un administrateur pour afficher vos PTR.</div>}
      <div className="ptr-student-grid">
        {filteredStudents.map(student => (
          <Card key={student.id}>
            <h3>{student.firstName} {student.lastName}</h3>
            <p className="muted">{student.program} · {student.programType}</p>
            <Link className="button" href={`/ptr/${student.id}`}>Ouvrir le PTR</Link>
          </Card>
        ))}
        {!filteredStudents.length && <Card><p>{profile?.role==="Étudiant"&&!profile.linkedStudentId?"Votre compte n’est pas encore lié à un dossier étudiant. Communiquez avec un administrateur.":scope==="mine"?"Aucun étudiant assigné ne correspond à ce filtre.":"Aucun étudiant disponible."}</p></Card>}
      </div>
    </>
  );
}

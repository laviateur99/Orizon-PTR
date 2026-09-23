"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAuth } from "@/features/auth/AuthProvider";
import { canAccessPtr } from "@/features/auth/ptrAccess";
import { subscribeStudent } from "@/features/students/firestore";
import type { Student } from "@/features/students/types";
import { subscribeLessons } from "./firestore";

const FullPTRStudentPage = dynamic(
  () => import("./PTRStudentPage").then(module => module.PTRStudentPage),
  { ssr: false, loading: () => <section className="card">Chargement du PTR…</section> },
);

export function PTRStudentEntryPage({ studentId }: { studentId: string }) {
  const { profile } = useAuth();
  const allowed = canAccessPtr(profile, studentId);
  const canInstallProgram = Boolean(profile && ["Administrateur", "Chef instructeur", "Instructeur"].includes(profile.role));
  const [student, setStudent] = useState<Student | null>(null);
  const [lessonCount, setLessonCount] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    const offStudent = subscribeStudent(studentId, setStudent, value => setError(value.message));
    const offLessons = subscribeLessons(studentId, {
      next: lessons => setLessonCount(lessons.length),
      error: value => setError(value.message),
    });
    return () => { offStudent(); offLessons(); };
  }, [allowed, studentId]);

  async function installProgram() {
    if (!student) return;
    setInstalling(true);
    setError("");
    try {
      const { initializeTrainingProgramForStudent } = await import("@/features/programs/firestore");
      await initializeTrainingProgramForStudent(studentId, student.program, student.trainingProgramId || "");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Impossible d’installer le programme.");
    } finally {
      setInstalling(false);
    }
  }

  if (!allowed) return <><PageHeader title="Accès refusé" subtitle="Dossier PTR protégé"/><section className="card"><p>Vous n’êtes pas autorisé à consulter ce dossier PTR.</p><a className="button secondary" href="/ptr">Retour</a></section></>;
  if (error) return <><PageHeader title="PTR électronique" subtitle="Dossier indisponible"/><section className="card"><div className="notice error">{error}</div><a className="button secondary" href="/ptr">Retour</a></section></>;
  if (!student || lessonCount === null) return <><PageHeader title="PTR électronique" subtitle="Chargement du dossier…"/><section className="card">Chargement…</section></>;
  if (lessonCount > 0) return <FullPTRStudentPage studentId={studentId}/>;

  return <>
    <PageHeader title={`${student.firstName} ${student.lastName}`} subtitle={`PTR · ${student.program} · ${student.programType}`}/>
    <section className="card program-install-banner">
      <div>
        <span className="badge ok">Nouveau dossier PTR</span>
        <h2>{student.trainingProgramName || student.program}</h2>
        <p>Ce dossier ne contient encore aucune leçon.{canInstallProgram?" Installez son programme pour créer le PTR de test.":" Un instructeur, un chef instructeur ou un administrateur doit installer le programme avant que le PTR soit disponible."}</p>
      </div>
      {canInstallProgram && <button className="button" onClick={installProgram} disabled={installing}>
        {installing ? "Importation…" : "Installer le programme sélectionné"}
      </button>}
    </section>
    <a className="button secondary" href="/ptr">Retour à la liste des PTR</a>
  </>;
}

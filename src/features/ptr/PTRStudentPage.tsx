"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SignaturePad } from "@/components/ui/SignaturePad";
import { subscribeStudent } from "@/features/students/firestore";
import type { Student } from "@/features/students/types";
import { addEvaluation, saveLesson, subscribeEvaluations, subscribeInstructors, subscribeLessons, subscribeReservations } from "./firestore";
import { finalScore, TC_CRITERIA, TC_SCALE } from "./evaluation";
import { initializeAtpaForStudent } from "@/features/programs/firestore";
import type { InstructorOption, PTREvaluation, PTRLesson, PTRLessonStatus, ReservationOption, TCScore } from "./types";

type ScoreKey = "pilotage" | "technical" | "situationalAwareness" | "flightManagement" | "safetyMargins";

const emptyEvaluation = () => ({
  date: new Date().toISOString().slice(0, 10),
  reservationId: "",
  instructorId: "",
  pilotage: undefined as TCScore | undefined,
  technical: undefined as TCScore | undefined,
  situationalAwareness: undefined as TCScore | undefined,
  flightManagement: undefined as TCScore | undefined,
  safetyMargins: undefined as TCScore | undefined,
  strengths: "",
  improvements: "",
  comments: "",
  actions: [] as string[],
  lessonStatus: "En cours" as PTRLessonStatus,
  instructorSignature: "",
  studentSignature: ""
});

export function PTRStudentPage({ studentId }: { studentId: string }) {
  const [student, setStudent] = useState<Student | null>(null);
  const [lessons, setLessons] = useState<PTRLesson[]>([]);
  const [evaluations, setEvaluations] = useState<PTREvaluation[]>([]);
  const [reservations, setReservations] = useState<ReservationOption[]>([]);
  const [instructors, setInstructors] = useState<InstructorOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");
  const [initializingProgram, setInitializingProgram] = useState(false);
  const [error, setError] = useState("");
  const [lessonForm, setLessonForm] = useState({
    phase: "Phase 1", lessonNumber: "", title: "", objective: "", exercises: ""
  });
  const [form, setForm] = useState(emptyEvaluation());

  useEffect(() => {
    const requested =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("lesson")
        : null;
    if (requested) {
      const matching = lessons.find(
        item =>
          item.id.endsWith(requested) ||
          (item as PTRLesson & { lessonPlanId?: string }).lessonPlanId === requested
      );
      if (matching) setSelectedId(matching.id);
    }
  }, [lessons]);

  useEffect(() => {
    const offStudent = subscribeStudent(studentId, setStudent, value => setError(value.message));
    const offLessons = subscribeLessons(studentId, { next: setLessons, error: value => setError(value.message) });
    const offEvaluations = subscribeEvaluations(studentId, { next: setEvaluations, error: value => setError(value.message) });
    const offReservations = subscribeReservations(studentId, { next: setReservations, error: value => setError(value.message) });
    const offInstructors = subscribeInstructors({ next: setInstructors, error: value => setError(value.message) });
    return () => { offStudent(); offLessons(); offEvaluations(); offReservations(); offInstructors(); };
  }, [studentId]);

  const orderedLessons = useMemo(() => [...lessons].sort((a,b) =>
    a.lessonNumber.localeCompare(b.lessonNumber, undefined, { numeric: true })), [lessons]);
  const selected = orderedLessons.find(item => item.id === selectedId) || orderedLessons[0];
  const history = evaluations.filter(item => item.lessonId === selected?.id).sort((a,b) => b.date.localeCompare(a.date));
  const score = finalScore([form.pilotage, form.technical, form.situationalAwareness, form.flightManagement, form.safetyMargins]);
  const progress = orderedLessons.length ? Math.round(orderedLessons.filter(item => item.status === "Réussi").length / orderedLessons.length * 100) : 0;

  async function installAtpaProgram() {
    if (lessons.length > 0 && !window.confirm("Le PTR contient déjà des leçons. Voulez-vous importer ou mettre à jour les 102 leçons ATP(A)?")) return;
    setInitializingProgram(true);
    try {
      await initializeAtpaForStudent(studentId);
      setMessage("Programme ATP(A) importé : 102 leçons créées à partir du manuel officiel.");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Impossible d’importer le programme.");
    } finally {
      setInitializingProgram(false);
    }
  }

  async function addLesson(event: React.FormEvent) {
    event.preventDefault();
    const id = `lesson-${studentId}-${Date.now()}`;
    await saveLesson({
      id, studentId, phase: lessonForm.phase, lessonNumber: lessonForm.lessonNumber,
      title: lessonForm.title, objective: lessonForm.objective,
      exercises: lessonForm.exercises.split(",").map(item => item.trim()).filter(Boolean),
      status: "Non commencé", linkedReservationId: ""
    }, false);
    setLessonForm({ phase: "Phase 1", lessonNumber: "", title: "", objective: "", exercises: "" });
    setSelectedId(id);
    setMessage("Leçon ajoutée.");
  }

  function setCriterion(key: ScoreKey, value: TCScore) {
    setForm(current => ({ ...current, [key]: value }));
  }

  function toggleAction(action: string) {
    setForm(current => ({
      ...current,
      actions: current.actions.includes(action)
        ? current.actions.filter(item => item !== action)
        : [...current.actions, action]
    }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !score) {
      setMessage("Sélectionne une leçon et au moins un critère d’évaluation.");
      return;
    }
    const instructor = instructors.find(item => item.id === form.instructorId);
    await addEvaluation({
      studentId, lessonId: selected.id, reservationId: form.reservationId,
      instructorId: form.instructorId, instructorName: instructor?.name || "",
      date: form.date, pilotage: form.pilotage, technical: form.technical,
      situationalAwareness: form.situationalAwareness, flightManagement: form.flightManagement,
      safetyMargins: form.safetyMargins, finalScore: score, strengths: form.strengths,
      improvements: form.improvements, comments: form.comments, actions: form.actions,
      lessonStatus: form.lessonStatus, instructorSignature: form.instructorSignature,
      studentSignature: form.studentSignature, signedAt: new Date().toISOString()
    });
    await saveLesson({
      ...selected, status: form.lessonStatus, linkedReservationId: form.reservationId
    }, true);
    setForm(emptyEvaluation());
    setMessage("Évaluation PTR enregistrée.");
  }

  if (!student) return <><PageHeader title="PTR électronique" subtitle="Chargement du dossier…" /><section className="card">Chargement…</section></>;

  return (
    <>
      <PageHeader title={`${student.firstName} ${student.lastName}`} subtitle={`PTR · ${student.program} · ${student.programType}`} />
      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice">{message}</div>}

      <section className="card program-install-banner">
        <div>
          <span className="badge ok">Manuel officiel Orizon Aviation</span>
          <h3>Programme intégré ATP(A) — Modification no 6</h3>
          <p>Importe automatiquement les 10 phases, 102 leçons et 146 composantes du manuel de formation en vigueur le 1er juin 2025.</p>
        </div>
        <button className="button" onClick={installAtpaProgram} disabled={initializingProgram}>
          {initializingProgram ? "Importation…" : lessons.length ? "Mettre à jour le programme" : "Installer le programme ATP(A)"}
        </button>
      </section>

      <section className="card ptr-summary">
        <div><strong>Progression</strong><p>{orderedLessons.filter(item => item.status === "Réussi").length} leçon(s) réussie(s) sur {orderedLessons.length}</p></div>
        <strong className="progress-number">{progress}%</strong>
        <div className="progress-bar"><span style={{ width: `${progress}%` }} /></div>
      </section>

      <div className="ptr-layout">
        <aside className="card ptr-sidebar">
          <h3>Plan de formation</h3>
          {orderedLessons.map(lesson => (
            <button className={`ptr-lesson ${selected?.id === lesson.id ? "active" : ""}`} onClick={() => setSelectedId(lesson.id)} key={lesson.id}>
              <strong>Leçon {lesson.lessonNumber} · {lesson.title}</strong>
              <span>{lesson.phase} · {lesson.status}</span>
            </button>
          ))}
          <h3>Ajouter une leçon</h3>
          <form className="form" onSubmit={addLesson}>
            <input required placeholder="Phase" value={lessonForm.phase} onChange={event => setLessonForm({...lessonForm, phase:event.target.value})}/>
            <input required placeholder="Numéro" value={lessonForm.lessonNumber} onChange={event => setLessonForm({...lessonForm, lessonNumber:event.target.value})}/>
            <input required placeholder="Titre" value={lessonForm.title} onChange={event => setLessonForm({...lessonForm, title:event.target.value})}/>
            <textarea required placeholder="Objectif" value={lessonForm.objective} onChange={event => setLessonForm({...lessonForm, objective:event.target.value})}/>
            <input placeholder="Exercices séparés par des virgules" value={lessonForm.exercises} onChange={event => setLessonForm({...lessonForm, exercises:event.target.value})}/>
            <button className="button">Ajouter</button>
          </form>
        </aside>

        <main className="ptr-main">
          {selected ? <>
            <section className="card">
              <div className="lesson-title-row">
                <div>
                  <span className="badge">{selected.phase}</span>
                  <h2>Leçon {selected.lessonNumber} — {selected.title}</h2>
                </div>
                {selected.programRevision && <span className="badge ok">{selected.programRevision}</span>}
              </div>
              {selected.sourceManual && <p className="muted">{selected.sourceManual}</p>}
              <h4>Objectif</h4>
              <p className="lesson-objective">{selected.objective}</p>

              {selected.components && selected.components.length > 0 && (
                <div className="manual-components">
                  {selected.components.map((component, index) => (
                    <section className="manual-component" key={`${component.modality}-${index}`}>
                      <header>
                        <strong>{component.modality}</strong>
                        <span>Page {component.manualPage}</span>
                      </header>
                      <p><b>{component.category}</b> · {component.title}</p>
                      <div className="hours">
                        {component.hours.sol > 0 && <span>Sol {component.hours.sol} h</span>}
                        {component.hours.dev > 0 && <span>DEV {component.hours.dev} h</span>}
                        {component.hours.doubleCommande > 0 && <span>DC {component.hours.doubleCommande} h</span>}
                        {component.hours.solo > 0 && <span>Solo {component.hours.solo} h</span>}
                      </div>
                      {component.objective && <p>{component.objective}</p>}
                      {component.exercises.length > 0 && (
                        <details>
                          <summary>Exercices ({component.exercises.length})</summary>
                          <ul>{component.exercises.map((item, exerciseIndex) => <li key={exerciseIndex}>{item}</li>)}</ul>
                        </details>
                      )}
                      {component.successCriteria && <p className="success-criteria"><b>Norme de réussite :</b> {component.successCriteria}</p>}
                      {component.nextLesson && <p className="muted"><b>Leçon suivante :</b> {component.nextLesson}</p>}
                    </section>
                  ))}
                </div>
              )}

              {(!selected.components || selected.components.length === 0) && (
                <div className="lesson-exercises">{selected.exercises.map(item => <span key={item}>{item}</span>)}</div>
              )}
            </section>

            <section className="card">
              <h3>Échelle d’évaluation Transports Canada</h3>
              <p className="muted">La note finale correspond au critère applicable le plus faible.</p>
              <div className="tc-scale">{TC_SCALE.map(item => <div key={item.score}><strong>{item.score}</strong><b>{item.title}</b><p>{item.summary}</p></div>)}</div>

              <form className="form" onSubmit={submit}>
                <div className="form-grid">
                  <label>Instructeur<select value={form.instructorId} onChange={event => setForm({...form, instructorId:event.target.value})}><option value="">Sélectionner</option>{instructors.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
                  <label>Date<input type="date" value={form.date} onChange={event => setForm({...form, date:event.target.value})}/></label>
                </div>
                <label>Vol lié<select value={form.reservationId} onChange={event => setForm({...form, reservationId:event.target.value})}><option value="">Aucun vol lié</option>{reservations.map(item => <option value={item.id} key={item.id}>{item.date} · {item.startTime}-{item.endTime} · {item.title}</option>)}</select></label>

                <div className="score-table">
                  {TC_CRITERIA.map(criterion => {
                    const key = criterion.key as ScoreKey;
                    return <div className="score-row" key={criterion.key}>
                      <strong>{criterion.label}</strong>
                      {[1,2,3,4].map(value => <button type="button" className={form[key] === value ? "selected" : ""} onClick={() => setCriterion(key, value as TCScore)} key={value}>{value}</button>)}
                    </div>;
                  })}
                </div>

                <div className="final-score"><span>Note finale calculée</span><strong>{score || "—"}</strong></div>
                <div className="form-grid">
                  <textarea placeholder="Points forts" value={form.strengths} onChange={event => setForm({...form, strengths:event.target.value})}/>
                  <textarea placeholder="Points à améliorer" value={form.improvements} onChange={event => setForm({...form, improvements:event.target.value})}/>
                </div>
                <textarea placeholder="Commentaires de l’instructeur" value={form.comments} onChange={event => setForm({...form, comments:event.target.value})}/>
                <div className="action-list">{["Révision au sol","Refaire l’exercice","Poursuivre","Vol supplémentaire","Évaluation finale"].map(action => <button type="button" className={form.actions.includes(action) ? "active" : ""} onClick={() => toggleAction(action)} key={action}>{action}</button>)}</div>
                <label>Statut de la leçon<select value={form.lessonStatus} onChange={event => setForm({...form, lessonStatus:event.target.value as PTRLessonStatus})}><option>Non commencé</option><option>En cours</option><option>Réussi</option><option>À reprendre</option></select></label>
                <div className="form-grid">
                  <SignaturePad label="Signature de l’instructeur" value={form.instructorSignature} onChange={value => setForm({...form, instructorSignature:value})}/>
                  <SignaturePad label="Signature de l’élève" value={form.studentSignature} onChange={value => setForm({...form, studentSignature:value})}/>
                </div>
                <button className="button">Enregistrer l’évaluation</button>
              </form>
            </section>

            <section className="card">
              <h3>Historique de la leçon</h3>
              <div className="ptr-history">{history.map(item => <div key={item.id}><strong>{item.date} · Note {item.finalScore || "—"}</strong><span>{item.instructorName || "Instructeur"} · {item.lessonStatus}</span>{item.comments && <p>{item.comments}</p>}</div>)}{!history.length && <p>Aucune évaluation.</p>}</div>
            </section>
          </> : <section className="card">Ajoute une première leçon pour commencer.</section>}
        </main>
      </div>
    </>
  );
}

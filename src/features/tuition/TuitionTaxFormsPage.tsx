"use client";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import { subscribeReservations, subscribeStudents } from "@/features/students/firestore";
import type { Student, StudentReservation } from "@/features/students/types";
import { subscribeTheorySessions } from "@/features/theory/firestore";
import type { TheorySession } from "@/features/theory/types";
import { saveTuitionTaxForm, subscribeTuitionTaxForm, tuitionFormId } from "./firestore";
import { calculateTuitionHours, calculateTuitionPeriod } from "./hoursCalculation";
import { trainingTypesDeclared, type TuitionTaxForm } from "./types";

const currentYear = () => new Date().getFullYear();
const hoursLabel = (value: number) => `${value.toFixed(1)} h`;

function AccessDenied() {
  return <section className="card access-denied"><h1>Accès refusé</h1><p>Ce module est réservé aux administrateurs.</p></section>;
}

export function TuitionTaxFormsPage() {
  const { user, profile } = useAuth();
  const [taxYear, setTaxYear] = useState(currentYear());
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [reservations, setReservations] = useState<StudentReservation[]>([]);
  const [theorySessions, setTheorySessions] = useState<TheorySession[]>([]);
  const [reservationsLoaded, setReservationsLoaded] = useState(false);
  const [theoryLoaded, setTheoryLoaded] = useState(false);
  const [savedForm, setSavedForm] = useState<TuitionTaxForm | null | undefined>(undefined);
  const [form, setForm] = useState<TuitionTaxForm | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile?.role !== "Administrateur") return;
    return subscribeStudents({ next: setStudents, error: e => setError(e.message) });
  }, [profile?.role]);

  // Réinitialise tout au changement d'étudiant ou d'année — chaque combinaison a son propre dossier.
  useEffect(() => {
    setReservations([]); setTheorySessions([]); setReservationsLoaded(false); setTheoryLoaded(false);
    setSavedForm(undefined); setForm(null);
    if (!selectedId) return;
    const offs = [
      subscribeReservations(selectedId, { next: value => { setReservations(value); setReservationsLoaded(true); }, error: e => setError(e.message) }),
      subscribeTheorySessions(value => { setTheorySessions(value); setTheoryLoaded(true); }, e => setError(e.message)),
      subscribeTuitionTaxForm(selectedId, taxYear, setSavedForm, e => setError(e.message))
    ];
    return () => offs.forEach(off => off());
  }, [selectedId, taxYear]);

  const selectedStudent = students.find(s => s.id === selectedId) || null;
  // Seule source de vérité pour l'admissibilité fiscale : la décision explicite dans le
  // dossier étudiant. true = admissible ; false = exclu ; undefined = à confirmer (jamais présumé true).
  const eligible = selectedStudent?.generateTuitionTaxForms === true;
  const sourceDataReady = reservationsLoaded && theoryLoaded;

  // Toujours recalculées en direct depuis les PTR/théorie — jamais figées dans l'état local.
  const calculatedHours = useMemo(
    () => selectedId && sourceDataReady ? calculateTuitionHours(selectedId, taxYear, reservations, theorySessions) : null,
    [selectedId, taxYear, reservations, theorySessions, sourceDataReady]
  );
  const calculatedPeriod = useMemo(
    () => selectedId && sourceDataReady ? calculateTuitionPeriod(selectedId, taxYear, reservations, theorySessions) : null,
    [selectedId, taxYear, reservations, theorySessions, sourceDataReady]
  );

  // Charge un dossier existant tel quel (jamais écrasé par un recalcul).
  useEffect(() => { if (savedForm) setForm(savedForm); }, [savedForm]);

  // Crée un brouillon vierge UNE SEULE fois par étudiant/année, seulement une fois les
  // données sources chargées (évite d'initialiser declaredHours à 0 avant que les
  // réservations/théorie n'aient fini de charger).
  useEffect(() => {
    if (savedForm !== null || !selectedStudent || !sourceDataReady || !calculatedHours) return;
    setForm({
      id: tuitionFormId(selectedStudent.id, taxYear),
      studentId: selectedStudent.id,
      taxYear,
      status: "Brouillon",
      studentSnapshot: {
        firstName: selectedStudent.firstName, lastName: selectedStudent.lastName, address: selectedStudent.address,
        city: "", province: "", postalCode: "", studentNumber: "", phone: selectedStudent.phone, email: selectedStudent.email
      },
      calculatedHours,
      declaredHours: { ground: calculatedHours.groundTotal, dualFlight: calculatedHours.dualFlight, soloFlight: calculatedHours.soloFlight, simulator: calculatedHours.simulator },
      periodCalculated: calculatedPeriod,
      periodDeclared: calculatedPeriod || { start: "", end: "" },
      trainingTypeDeclared: "Autre",
      programId: selectedStudent.trainingProgramId || undefined,
      programName: selectedStudent.trainingProgramName || undefined,
      amountPaid: 0,
      preparedBy: { uid: user?.uid || "", name: profile?.name || profile?.email || "" }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedForm, selectedStudent, sourceDataReady, taxYear]);

  if (profile?.role !== "Administrateur") return <AccessDenied />;

  const filteredStudents = students
    .filter(s => s.generateTuitionTaxForms !== false)
    .filter(s => `${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.lastName.localeCompare(b.lastName));

  async function save() {
    if (!form || !eligible) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await saveTuitionTaxForm(form, Boolean(savedForm));
      setMessage("Brouillon enregistré.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="training-quotes tuition-tax-forms">
    <div className="quote-toolbar">
      <div><h2>Frais de scolarité</h2><p>Préparer les données des formulaires fiscaux (T2202 / TP-752.0.18.10) à partir des PTR. Aucun NAS n'est demandé ni conservé ici.</p></div>
      <label className="tuition-year">Année fiscale<input type="number" value={taxYear} onChange={e => setTaxYear(Number(e.target.value) || currentYear())} /></label>
    </div>
    {error && <div className="notice error">{error}</div>}
    {message && <div className="notice">{message}</div>}
    <div className="tuition-layout">
      <section className="card template-manager tuition-student-list">
        <div><h3>Étudiants</h3></div>
        <input placeholder="Rechercher un étudiant…" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="template-list">
          {filteredStudents.map(s => <button key={s.id} className={selectedId === s.id ? "active" : ""} onClick={() => setSelectedId(s.id)}>
            <span><strong>{s.firstName} {s.lastName}</strong><small>{s.email || "—"}</small></span>
            {s.generateTuitionTaxForms !== true && <span className="status-badge">À confirmer</span>}
          </button>)}
          {!filteredStudents.length && <p>Aucun étudiant trouvé.</p>}
        </div>
      </section>

      {!selectedStudent && <section className="card"><p>Sélectionnez un étudiant pour préparer son dossier fiscal {taxYear}.</p></section>}

      {selectedStudent && (!form || !calculatedHours) && <section className="card"><p>Chargement des données de {selectedStudent.firstName} {selectedStudent.lastName}…</p></section>}

      {selectedStudent && form && calculatedHours && <section className="card quote-modal tuition-form">
        <header><div><h2>{selectedStudent.firstName} {selectedStudent.lastName} — {taxYear}</h2><p>Dossier fiscal</p></div><span className="status-badge">{form.status}</span></header>
        <div className="modal-body">

          {!eligible && <div className="notice error">Formulaires fiscaux à confirmer — activez « Produire les formulaires de frais de scolarité » dans la fiche de cet étudiant (onglet Information) avant d'enregistrer un dossier fiscal.</div>}

          <div className="notice tuition-calculated">
            <h3>Heures calculées depuis les PTR</h3>
            <div className="tuition-hours-grid">
              <div><span>Théorie</span><strong>{hoursLabel(calculatedHours.theory)}</strong></div>
              <div><span>Préparation au sol</span><strong>{hoursLabel(calculatedHours.groundPreparation)}</strong></div>
              <div><span>Total instruction au sol</span><strong>{hoursLabel(calculatedHours.groundTotal)}</strong></div>
              <div><span>Double commande</span><strong>{hoursLabel(calculatedHours.dualFlight)}</strong></div>
              <div><span>Solo</span><strong>{hoursLabel(calculatedHours.soloFlight)}</strong></div>
              <div><span>Simulateur</span><strong>{hoursLabel(calculatedHours.simulator)}</strong></div>
            </div>
            <p>Période calculée : {calculatedPeriod ? `${calculatedPeriod.start} → ${calculatedPeriod.end}` : "aucune activité trouvée pour cette année."}</p>
          </div>

          <div className="form-grid">
            <h3 className="wide">Valeurs déclarées</h3>
            <label>Instruction au sol (h)<input type="number" step="0.1" min="0" value={form.declaredHours.ground} onChange={e => setForm({ ...form, declaredHours: { ...form.declaredHours, ground: Number(e.target.value) } })} /></label>
            <label>Double commande (h)<input type="number" step="0.1" min="0" value={form.declaredHours.dualFlight} onChange={e => setForm({ ...form, declaredHours: { ...form.declaredHours, dualFlight: Number(e.target.value) } })} /></label>
            <label>Solo (h)<input type="number" step="0.1" min="0" value={form.declaredHours.soloFlight} onChange={e => setForm({ ...form, declaredHours: { ...form.declaredHours, soloFlight: Number(e.target.value) } })} /></label>
            <label>Simulateur (h)<input type="number" step="0.1" min="0" value={form.declaredHours.simulator} onChange={e => setForm({ ...form, declaredHours: { ...form.declaredHours, simulator: Number(e.target.value) } })} /></label>
            <label>Type de formation<select value={form.trainingTypeDeclared} onChange={e => setForm({ ...form, trainingTypeDeclared: e.target.value as TuitionTaxForm["trainingTypeDeclared"] })}>{trainingTypesDeclared.map(t => <option key={t}>{t}</option>)}</select></label>
            <label>Début de période<input type="date" value={form.periodDeclared.start} onChange={e => setForm({ ...form, periodDeclared: { ...form.periodDeclared, start: e.target.value } })} /></label>
            <label>Fin de période<input type="date" value={form.periodDeclared.end} onChange={e => setForm({ ...form, periodDeclared: { ...form.periodDeclared, end: e.target.value } })} /></label>
            <label>Montant payé ($)<input type="number" step="0.01" min="0" value={form.amountPaid} onChange={e => setForm({ ...form, amountPaid: Number(e.target.value) })} /></label>

            <h3 className="wide">Coordonnées pour le formulaire</h3>
            <label className="wide">Adresse<input value={form.studentSnapshot.address} onChange={e => setForm({ ...form, studentSnapshot: { ...form.studentSnapshot, address: e.target.value } })} /></label>
            <label>Ville<input value={form.studentSnapshot.city} onChange={e => setForm({ ...form, studentSnapshot: { ...form.studentSnapshot, city: e.target.value } })} /></label>
            <label>Province<input value={form.studentSnapshot.province} onChange={e => setForm({ ...form, studentSnapshot: { ...form.studentSnapshot, province: e.target.value } })} /></label>
            <label>Code postal<input value={form.studentSnapshot.postalCode} onChange={e => setForm({ ...form, studentSnapshot: { ...form.studentSnapshot, postalCode: e.target.value } })} /></label>
            <label>Numéro étudiant<input value={form.studentSnapshot.studentNumber} onChange={e => setForm({ ...form, studentSnapshot: { ...form.studentSnapshot, studentNumber: e.target.value } })} /></label>
            <label>Téléphone<input value={form.studentSnapshot.phone} onChange={e => setForm({ ...form, studentSnapshot: { ...form.studentSnapshot, phone: e.target.value } })} /></label>
            <label>Courriel<input type="email" value={form.studentSnapshot.email} onChange={e => setForm({ ...form, studentSnapshot: { ...form.studentSnapshot, email: e.target.value } })} /></label>
          </div>
        </div>
        <footer><span />
          <button className="button" disabled={busy || !eligible} onClick={save}>Enregistrer le brouillon</button>
        </footer>
      </section>}
    </div>
  </div>;
}

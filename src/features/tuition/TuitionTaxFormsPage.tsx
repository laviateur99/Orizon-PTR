"use client";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import { subscribeAircraft } from "@/features/fleet/firestore";
import type { Aircraft } from "@/features/fleet/types";
import { subscribeReservations, subscribeStudents } from "@/features/students/firestore";
import type { Student, StudentReservation } from "@/features/students/types";
import { subscribeTheoryCohorts, subscribeTheorySessions } from "@/features/theory/firestore";
import type { TheoryCohort, TheorySession } from "@/features/theory/types";
import { subscribeTrainingRates } from "@/features/training-quotes/firestore";
import type { TrainingRate } from "@/features/training-quotes/types";
import { finalizeTuitionTaxForm, saveTuitionTaxForm, saveTuitionTaxSettings, subscribeTuitionTaxForm, subscribeTuitionTaxSettings, tuitionFormId } from "./firestore";
import { calculateTuitionHours, calculateTuitionPeriod } from "./hoursCalculation";
import { calculateTuitionPricing } from "./pricingEngine";
import { t2202CourseTypes, trainingTypesDeclared, type CalculatedPricing, type PricingLine, type TuitionInstitutionSnapshot, type TuitionTaxForm, type TuitionTaxSettings } from "./types";

const currentYear = () => new Date().getFullYear();
const hoursLabel = (value: number) => `${value.toFixed(1)} h`;
const wholeNumber = (value: string) => Math.max(0, Math.round(Number(value) || 0));
const money = (value: number) => value.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
const statusLabel: Record<PricingLine["status"], string> = { calculated: "Calculé", rate_missing: "Tarif manquant", rate_ambiguous: "Tarif ambigu", source_unconfirmed: "À confirmer" };
const pricingCategories = ["theory", "ground", "dualFlight", "soloFlight", "simulator"] as const;
const pricingCategoryLabel: Record<typeof pricingCategories[number], string> = { theory: "Théorie", ground: "Sol individuel", dualFlight: "Double commande", soloFlight: "Solo", simulator: "Simulateur" };

const formatTimestamp = (value: unknown) => {
  const withToDate = value as { toDate?: () => Date } | null | undefined;
  if (withToDate && typeof withToDate.toDate === "function") return withToDate.toDate().toLocaleDateString("fr-CA");
  return "";
};

function AccessDenied() {
  return <section className="card access-denied"><h1>Accès refusé</h1><p>Ce module est réservé aux administrateurs.</p></section>;
}

function validationErrors(form: TuitionTaxForm, settings: TuitionTaxSettings | undefined): string[] {
  const errors: string[] = [];
  const s = form.studentSnapshot;
  if (!s.firstName.trim()) errors.push("Prénom de l'étudiant manquant");
  if (!s.lastName.trim()) errors.push("Nom de l'étudiant manquant");
  if (!s.address.trim()) errors.push("Adresse de l'étudiant manquante");
  if (!s.city.trim()) errors.push("Ville de l'étudiant manquante");
  if (!s.province.trim()) errors.push("Province de l'étudiant manquante");
  if (!s.postalCode.trim()) errors.push("Code postal de l'étudiant manquant");
  if (!form.periodDeclared.start || !form.periodDeclared.end) errors.push("Période déclarée incomplète");
  if (!(form.amountPaid >= 0)) errors.push("Montant payé invalide");
  if (!form.t2202.courseType) errors.push("Type de cours T2202 manquant");
  if (!form.t2202.programName.trim()) errors.push("Nom du programme T2202 manquant");
  if (!form.t2202.sessionStart || !form.t2202.sessionEnd) errors.push("Session T2202 (début/fin) incomplète");
  if (!(form.t2202.eligibleTuitionFees >= 0)) errors.push("Frais de scolarité admissibles (T2202) invalides");
  if (!settings) {
    errors.push("Paramètres institutionnels non chargés");
  } else {
    if (!settings.institutionName.trim()) errors.push("Nom de l'établissement manquant (Paramètres)");
    if (!settings.institutionAddress.trim()) errors.push("Adresse de l'établissement manquante (Paramètres)");
    if (!settings.institutionCity.trim()) errors.push("Ville de l'établissement manquante (Paramètres)");
    if (!settings.institutionProvince.trim()) errors.push("Province de l'établissement manquante (Paramètres)");
    if (!settings.institutionPostalCode.trim()) errors.push("Code postal de l'établissement manquant (Paramètres)");
    if (!settings.quebecIdentificationNumber.trim()) errors.push("Numéro d'identification Québec manquant (Paramètres)");
  }
  return errors;
}

export function TuitionTaxFormsPage() {
  const { user, profile } = useAuth();
  const [taxYear, setTaxYear] = useState(currentYear());
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [reservations, setReservations] = useState<StudentReservation[]>([]);
  const [theorySessions, setTheorySessions] = useState<TheorySession[]>([]);
  const [theoryCohorts, setTheoryCohorts] = useState<TheoryCohort[]>([]);
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [rates, setRates] = useState<TrainingRate[]>([]);
  const [reservationsLoaded, setReservationsLoaded] = useState(false);
  const [theoryLoaded, setTheoryLoaded] = useState(false);
  const [theoryCohortsLoaded, setTheoryCohortsLoaded] = useState(false);
  const [aircraftLoaded, setAircraftLoaded] = useState(false);
  const [ratesLoaded, setRatesLoaded] = useState(false);
  const [savedForm, setSavedForm] = useState<TuitionTaxForm | null | undefined>(undefined);
  const [form, setForm] = useState<TuitionTaxForm | null>(null);
  const [settings, setSettings] = useState<TuitionTaxSettings | undefined>(undefined);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<TuitionTaxSettings | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile?.role !== "Administrateur") return;
    return subscribeStudents({ next: setStudents, error: e => setError(e.message) });
  }, [profile?.role]);

  useEffect(() => {
    if (profile?.role !== "Administrateur") return;
    return subscribeTuitionTaxSettings(setSettings, e => setError(e.message));
  }, [profile?.role]);

  // Listes globales nécessaires au moteur de calcul tarifaire (cohortes pour le type de cours
  // théorique, avions pour résoudre le type d'appareil) — indépendantes de l'étudiant sélectionné.
  useEffect(() => {
    if (profile?.role !== "Administrateur") return;
    return subscribeTheoryCohorts(value => { setTheoryCohorts(value); setTheoryCohortsLoaded(true); }, e => setError(e.message));
  }, [profile?.role]);
  useEffect(() => {
    if (profile?.role !== "Administrateur") return;
    return subscribeAircraft({ next: value => { setAircraft(value); setAircraftLoaded(true); }, error: e => setError(e.message) });
  }, [profile?.role]);
  useEffect(() => {
    if (profile?.role !== "Administrateur") return;
    return subscribeTrainingRates({ next: value => { setRates(value); setRatesLoaded(true); }, error: e => setError(e.message) });
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
  const sourceDataReady = reservationsLoaded && theoryLoaded && theoryCohortsLoaded && aircraftLoaded && ratesLoaded;
  const locked = form?.status === "Finalisé";

  // Toujours recalculées en direct depuis les PTR/théorie — jamais figées dans l'état local.
  const calculatedHours = useMemo(
    () => selectedId && sourceDataReady ? calculateTuitionHours(selectedId, taxYear, reservations, theorySessions) : null,
    [selectedId, taxYear, reservations, theorySessions, sourceDataReady]
  );
  const calculatedPeriod = useMemo(
    () => selectedId && sourceDataReady ? calculateTuitionPeriod(selectedId, taxYear, reservations, theorySessions) : null,
    [selectedId, taxYear, reservations, theorySessions, sourceDataReady]
  );
  // Moteur fiscal : jamais recalculé une fois le dossier Finalisé (aucun nouveau priceAt()) —
  // dans ce cas, l'affichage utilise calculatedPricing figé dans le dossier chargé.
  const livePricing: CalculatedPricing | null = useMemo(
    () => selectedId && sourceDataReady && !locked ? calculateTuitionPricing(selectedId, taxYear, reservations, theorySessions, theoryCohorts, rates, aircraft) : null,
    [selectedId, taxYear, reservations, theorySessions, theoryCohorts, rates, aircraft, sourceDataReady, locked]
  );
  const displayPricing = locked ? form?.calculatedPricing : livePricing || undefined;

  // Charge un dossier existant tel quel (jamais écrasé par un recalcul — surtout une fois finalisé).
  useEffect(() => { if (savedForm) setForm(savedForm); }, [savedForm]);

  // Crée un brouillon vierge UNE SEULE fois par étudiant/année, seulement une fois les
  // données sources chargées (évite d'initialiser declaredHours à 0 avant que les
  // réservations/théorie n'aient fini de charger).
  useEffect(() => {
    if (savedForm !== null || !selectedStudent || !sourceDataReady || !calculatedHours) return;
    const periodDeclared = calculatedPeriod || { start: "", end: "" };
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
      periodDeclared,
      trainingTypeDeclared: "Autre",
      programId: selectedStudent.trainingProgramId || undefined,
      programName: selectedStudent.trainingProgramName || undefined,
      amountPaid: 0,
      calculatedPricing: livePricing || undefined,
      t2202: {
        courseType: "",
        programName: selectedStudent.trainingProgramName || "",
        sessionStart: periodDeclared.start,
        sessionEnd: periodDeclared.end,
        partTimeMonths: 0,
        fullTimeMonths: 0,
        eligibleTuitionFees: 0
      },
      preparedBy: { uid: user?.uid || "", name: profile?.name || profile?.email || "" }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedForm, selectedStudent, sourceDataReady, taxYear]);

  if (profile?.role !== "Administrateur") return <AccessDenied />;

  const filteredStudents = students
    .filter(s => s.generateTuitionTaxForms !== false)
    .filter(s => `${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.lastName.localeCompare(b.lastName));

  const errors = form ? validationErrors(form, settings) : [];

  async function save() {
    if (!form || !eligible || locked) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await saveTuitionTaxForm({ ...form, calculatedPricing: livePricing || form.calculatedPricing }, Boolean(savedForm));
      setMessage("Brouillon enregistré.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function finalize() {
    if (!form || !settings || !eligible || locked || errors.length) return;
    // amountPaid reste une saisie administrative manuelle — 0 $ peut être légitime (dossier de
    // test, cas particulier), donc on avertit sans jamais bloquer une valeur explicitement confirmée.
    if (form.amountPaid === 0 && !window.confirm("Le montant payé est actuellement à 0,00 $. Les formulaires fiscaux afficheront ce montant tel quel. Continuer la finalisation ?")) return;
    if (!window.confirm(`Finaliser le dossier fiscal ${taxYear} de ${form.studentSnapshot.firstName} ${form.studentSnapshot.lastName} ? Le dossier ne pourra plus être modifié après cette étape.`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const institutionSnapshot: TuitionInstitutionSnapshot = {
        name: settings.institutionName, address: settings.institutionAddress, city: settings.institutionCity,
        province: settings.institutionProvince, postalCode: settings.institutionPostalCode, phone: settings.institutionPhone,
        quebecIdentificationNumber: settings.quebecIdentificationNumber,
        responsibleName: settings.institutionResponsibleName, responsibleTitle: settings.institutionResponsibleTitle,
        craT2202FilerAccountNumber: settings.craT2202FilerAccountNumber
      };
      await finalizeTuitionTaxForm({ ...form, calculatedPricing: livePricing || form.calculatedPricing }, Boolean(savedForm), institutionSnapshot, { uid: user?.uid || "", name: profile?.name || profile?.email || "" });
      setMessage("Dossier fiscal finalisé.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Finalisation impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
    if (!settingsDraft) return;
    setSettingsBusy(true); setError(""); setMessage("");
    try {
      await saveTuitionTaxSettings(settingsDraft);
      setSettingsOpen(false);
      setMessage("Paramètres institutionnels enregistrés.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement des paramètres impossible.");
    } finally {
      setSettingsBusy(false);
    }
  }

  return <div className="training-quotes tuition-tax-forms">
    <div className="quote-toolbar">
      <div><h2>Frais de scolarité</h2><p>Préparer les données des formulaires fiscaux (T2202 / TP-752.0.18.10) à partir des PTR. Aucun NAS n'est demandé ni conservé ici.</p></div>
      <div className="quote-actions">
        <label className="tuition-year">Année fiscale<input type="number" value={taxYear} onChange={e => setTaxYear(Number(e.target.value) || currentYear())} /></label>
        <button type="button" className="button secondary" onClick={() => { setSettingsDraft(settings || null); setSettingsOpen(true); }}>Paramètres</button>
      </div>
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

          {locked && <div className="notice tuition-finalized"><h3>DOSSIER FINALISÉ</h3><p>Finalisé le {formatTimestamp(form.finalizedAt) || "—"}{form.finalizedBy?.name ? ` par ${form.finalizedBy.name}` : ""}. Ce dossier n'est plus modifiable.</p><div className="quote-actions"><a className="button secondary" href={`/admin/tuition-tax-forms/print/t2202/${form.id}`} target="_blank" rel="noopener noreferrer">T2202 — Fédéral</a><a className="button secondary" href={`/admin/tuition-tax-forms/print/quebec/${form.id}`} target="_blank" rel="noopener noreferrer">TP-752 — Québec</a></div></div>}

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

          <div className="notice tuition-calculated">
            <h3>Calcul tarifaire automatique</h3>
            {!displayPricing && <p>Calcul en cours…</p>}
            {displayPricing && pricingCategories.map(key => <div key={key} className="tuition-pricing-category">
              <h4>{pricingCategoryLabel[key]} — {money(displayPricing.totals[key])}</h4>
              {displayPricing[key].length
                ? <table className="tuition-pricing-table"><thead><tr><th>Activité</th><th>Date</th><th>Quantité</th><th>Tarif</th><th>Montant</th><th>Statut</th></tr></thead>
                  <tbody>{displayPricing[key].map((line, i) => <tr key={i}>
                    <td>{line.description}{line.note ? <small> — {line.note}</small> : null}</td>
                    <td>{line.sourceDate}</td>
                    <td>{line.quantity} {line.unit}</td>
                    <td>{line.rateName || "—"}{line.unitPrice !== undefined ? ` (${money(line.unitPrice)})` : ""}</td>
                    <td>{line.status === "calculated" ? money(line.amount) : "—"}</td>
                    <td><span className={`status-badge ${line.status === "calculated" ? "actif" : "retiré"}`}>{statusLabel[line.status]}</span></td>
                  </tr>)}</tbody>
                </table>
                : <p>Aucune activité.</p>}
            </div>)}
            {displayPricing && <p className="tuition-pricing-grand-total">Total automatique (activités calculées uniquement) : <strong>{money(displayPricing.totals.grandTotal)}</strong></p>}
            {displayPricing && displayPricing.issues.length > 0 && <div className="notice error">{displayPricing.issues.length} ligne(s) « à confirmer » exclue(s) du total ci-dessus — voir le statut de chaque activité dans les tableaux.</div>}
          </div>

          <div className="form-grid">
            <h3 className="wide">Valeurs déclarées</h3>
            <label>Instruction au sol (h)<input disabled={locked} type="number" step="0.1" min="0" value={form.declaredHours.ground} onChange={e => setForm({ ...form, declaredHours: { ...form.declaredHours, ground: Number(e.target.value) } })} /></label>
            <label>Double commande (h)<input disabled={locked} type="number" step="0.1" min="0" value={form.declaredHours.dualFlight} onChange={e => setForm({ ...form, declaredHours: { ...form.declaredHours, dualFlight: Number(e.target.value) } })} /></label>
            <label>Solo (h)<input disabled={locked} type="number" step="0.1" min="0" value={form.declaredHours.soloFlight} onChange={e => setForm({ ...form, declaredHours: { ...form.declaredHours, soloFlight: Number(e.target.value) } })} /></label>
            <label>Simulateur (h)<input disabled={locked} type="number" step="0.1" min="0" value={form.declaredHours.simulator} onChange={e => setForm({ ...form, declaredHours: { ...form.declaredHours, simulator: Number(e.target.value) } })} /></label>
            <label>Type de formation<select disabled={locked} value={form.trainingTypeDeclared} onChange={e => setForm({ ...form, trainingTypeDeclared: e.target.value as TuitionTaxForm["trainingTypeDeclared"] })}>{trainingTypesDeclared.map(t => <option key={t}>{t}</option>)}</select></label>
            <label>Début de période<input disabled={locked} type="date" value={form.periodDeclared.start} onChange={e => setForm({ ...form, periodDeclared: { ...form.periodDeclared, start: e.target.value } })} /></label>
            <label>Fin de période<input disabled={locked} type="date" value={form.periodDeclared.end} onChange={e => setForm({ ...form, periodDeclared: { ...form.periodDeclared, end: e.target.value } })} /></label>
            <label>Montant payé ($)<input disabled={locked} type="number" step="0.01" min="0" value={form.amountPaid} onChange={e => setForm({ ...form, amountPaid: Number(e.target.value) })} /></label>

            <h3 className="wide">Coordonnées pour le formulaire</h3>
            <label className="wide">Adresse<input disabled={locked} value={form.studentSnapshot.address} onChange={e => setForm({ ...form, studentSnapshot: { ...form.studentSnapshot, address: e.target.value } })} /></label>
            <label>Ville<input disabled={locked} value={form.studentSnapshot.city} onChange={e => setForm({ ...form, studentSnapshot: { ...form.studentSnapshot, city: e.target.value } })} /></label>
            <label>Province<input disabled={locked} value={form.studentSnapshot.province} onChange={e => setForm({ ...form, studentSnapshot: { ...form.studentSnapshot, province: e.target.value } })} /></label>
            <label>Code postal<input disabled={locked} value={form.studentSnapshot.postalCode} onChange={e => setForm({ ...form, studentSnapshot: { ...form.studentSnapshot, postalCode: e.target.value } })} /></label>
            <label>Numéro étudiant<input disabled={locked} value={form.studentSnapshot.studentNumber} onChange={e => setForm({ ...form, studentSnapshot: { ...form.studentSnapshot, studentNumber: e.target.value } })} /></label>
            <label>Téléphone<input disabled={locked} value={form.studentSnapshot.phone} onChange={e => setForm({ ...form, studentSnapshot: { ...form.studentSnapshot, phone: e.target.value } })} /></label>
            <label>Courriel<input disabled={locked} type="email" value={form.studentSnapshot.email} onChange={e => setForm({ ...form, studentSnapshot: { ...form.studentSnapshot, email: e.target.value } })} /></label>

            <h3 className="wide">T2202 — Informations d'inscription</h3>
            <label>Type de cours<select disabled={locked} value={form.t2202.courseType} onChange={e => setForm({ ...form, t2202: { ...form.t2202, courseType: e.target.value as TuitionTaxForm["t2202"]["courseType"] } })}><option value="">Sélectionner…</option>{t2202CourseTypes.map(t => <option key={t}>{t}</option>)}</select></label>
            <label>Nom du programme<input disabled={locked} value={form.t2202.programName} onChange={e => setForm({ ...form, t2202: { ...form.t2202, programName: e.target.value } })} /></label>
            <label>Session — début<input disabled={locked} type="date" value={form.t2202.sessionStart} onChange={e => setForm({ ...form, t2202: { ...form.t2202, sessionStart: e.target.value } })} /></label>
            <label>Session — fin<input disabled={locked} type="date" value={form.t2202.sessionEnd} onChange={e => setForm({ ...form, t2202: { ...form.t2202, sessionEnd: e.target.value } })} /></label>
            <label>Mois temps partiel<input disabled={locked} type="number" step="1" min="0" value={form.t2202.partTimeMonths} onChange={e => setForm({ ...form, t2202: { ...form.t2202, partTimeMonths: wholeNumber(e.target.value) } })} /></label>
            <label>Mois temps plein<input disabled={locked} type="number" step="1" min="0" value={form.t2202.fullTimeMonths} onChange={e => setForm({ ...form, t2202: { ...form.t2202, fullTimeMonths: wholeNumber(e.target.value) } })} /></label>
            <label>Frais de scolarité admissibles ($)<input disabled={locked} type="number" step="0.01" min="0" value={form.t2202.eligibleTuitionFees} onChange={e => setForm({ ...form, t2202: { ...form.t2202, eligibleTuitionFees: Number(e.target.value) } })} /><small>À confirmer — les frais admissibles T2202 peuvent différer du montant payé.</small></label>
          </div>

          {!locked && eligible && errors.length > 0 && <div className="notice">Avant de finaliser, complétez : {errors.join(" · ")}.</div>}
        </div>
        {!locked && <footer><span />
          <button className="button secondary" disabled={busy || !eligible} onClick={save}>Enregistrer le brouillon</button>
          <button className="button" disabled={busy || !eligible || errors.length > 0} onClick={finalize}>Finaliser le dossier fiscal</button>
        </footer>}
      </section>}
    </div>

    {settingsOpen && settingsDraft && <div className="modal-backdrop"><section className="modal">
      <header><div><h2>Paramètres — Frais de scolarité</h2><p>Informations institutionnelles utilisées sur les formulaires fiscaux.</p></div><button type="button" className="icon-button" onClick={() => setSettingsOpen(false)}>×</button></header>
      <div className="modal-body form-grid">
        <label>Nom légal de l'établissement<input value={settingsDraft.institutionName} onChange={e => setSettingsDraft({ ...settingsDraft, institutionName: e.target.value })} /></label>
        <label className="wide">Adresse<input value={settingsDraft.institutionAddress} onChange={e => setSettingsDraft({ ...settingsDraft, institutionAddress: e.target.value })} /></label>
        <label>Ville<input value={settingsDraft.institutionCity} onChange={e => setSettingsDraft({ ...settingsDraft, institutionCity: e.target.value })} /></label>
        <label>Province<input value={settingsDraft.institutionProvince} onChange={e => setSettingsDraft({ ...settingsDraft, institutionProvince: e.target.value })} /></label>
        <label>Code postal<input value={settingsDraft.institutionPostalCode} onChange={e => setSettingsDraft({ ...settingsDraft, institutionPostalCode: e.target.value })} /></label>
        <label>Téléphone<input value={settingsDraft.institutionPhone} onChange={e => setSettingsDraft({ ...settingsDraft, institutionPhone: e.target.value })} /></label>
        <label>Numéro d'identification Québec<input value={settingsDraft.quebecIdentificationNumber} onChange={e => setSettingsDraft({ ...settingsDraft, quebecIdentificationNumber: e.target.value })} /></label>
        <label>Responsable<input value={settingsDraft.institutionResponsibleName} onChange={e => setSettingsDraft({ ...settingsDraft, institutionResponsibleName: e.target.value })} /></label>
        <label>Fonction du responsable<input value={settingsDraft.institutionResponsibleTitle} onChange={e => setSettingsDraft({ ...settingsDraft, institutionResponsibleTitle: e.target.value })} /></label>
        <label className="wide">Compte de déclarant T2202 (RZ)<input value={settingsDraft.craT2202FilerAccountNumber} onChange={e => setSettingsDraft({ ...settingsDraft, craT2202FilerAccountNumber: e.target.value })} placeholder="Non configuré pour l'instant" /></label>
      </div>
      <footer><span />
        <button type="button" className="button secondary" onClick={() => setSettingsOpen(false)}>Annuler</button>
        <button type="button" className="button" disabled={settingsBusy} onClick={saveSettings}>Enregistrer</button>
      </footer>
    </section></div>}
  </div>;
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  closeSnag,
  createSnag,
  replaceFleet,
  saveAircraft,
  subscribeAircraft,
  subscribeSnags,
  updateSnag,
} from "./firestore";
import type {
  Aircraft,
  AircraftStatus,
  NotificationRole,
  Snag,
  SnagReporterRole,
  SnagSeverity,
  SnagStatus,
} from "./types";

const CATEGORIES = [
  "Moteur", "Cellule", "Avionique", "Radio", "GPS", "Autopilote",
  "Freins", "Train d’atterrissage", "Éclairage", "Instrument", "Carburant", "Divers",
];
const ROLES: NotificationRole[] = [
  "Maintenance", "Directeur de maintenance", "Chef instructeur", "Dispatch", "Administrateur",
];
const STATUSES: SnagStatus[] = [
  "Ouvert", "Pris en charge", "Pièces commandées", "En réparation", "Essai en vol", "Fermé",
];
const REPORTER_ROLES: SnagReporterRole[] = ["Dispatch", "Instructeur", "Admin", "Autre"];
const statusClass = (status: AircraftStatus) =>
  status === "Disponible" ? "ok" : status === "Maintenance" || status === "Inspection" ? "warn" : "danger";

export function FleetPage() {
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [snags, setSnags] = useState<Snag[]>([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Aircraft | null>(null);
  const [snagAircraft, setSnagAircraft] = useState<Aircraft | null>(null);
  const [form, setForm] = useState({
    reportedBy: "",
    reportedByRole: "Dispatch" as SnagReporterRole,
    category: "Divers",
    severity: "Avant prochain vol" as SnagSeverity,
    defectTitle: "",
    description: "",
    tach: "",
    hobbs: "",
    estimatedReturnDate: "",
    notifyRoles: ["Maintenance", "Directeur de maintenance"] as NotificationRole[],
  });

  useEffect(() => {
    const offAircraft = subscribeAircraft({ next: setAircraft, error: value => setError(value.message) });
    const offSnags = subscribeSnags({ next: setSnags, error: value => setError(value.message) });
    return () => { offAircraft(); offSnags(); };
  }, []);

  const filtered = useMemo(() => aircraft
    .filter(item => item.active)
    .filter(item => !query || `${item.registration} ${item.typeLabel} ${item.status}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.typeLabel.localeCompare(b.typeLabel) || a.registration.localeCompare(b.registration)), [aircraft, query]);

  const groups = ["Cessna 152", "Cessna 172", "Piper Navajo PA-31"]
    .map(type => ({ type, items: filtered.filter(item => item.typeLabel === type) }))
    .filter(group => group.items.length);

  function toggleRole(role: NotificationRole) {
    setForm(current => ({
      ...current,
      notifyRoles: current.notifyRoles.includes(role)
        ? current.notifyRoles.filter(item => item !== role)
        : [...current.notifyRoles, role],
    }));
  }

  async function submitSnag(event: React.FormEvent) {
    event.preventDefault();
    if (!snagAircraft) return;
    if (!form.reportedBy.trim() || !form.defectTitle.trim() || !form.description.trim()) {
      setMessage("Signalé par, défectuosité et description sont obligatoires.");
      return;
    }
    try {
      await createSnag({
        aircraftId: snagAircraft.id,
        aircraftRegistration: snagAircraft.registration,
        reportedBy: form.reportedBy.trim(),
        reportedByRole: form.reportedByRole,
        category: form.category,
        severity: form.severity,
        defectTitle: form.defectTitle.trim(),
        description: form.description.trim(),
        tach: form.tach ? Number(form.tach) : undefined,
        hobbs: form.hobbs ? Number(form.hobbs) : undefined,
        estimatedReturnDate: form.estimatedReturnDate || undefined,
        maintenanceNotes: "",
        notifyRoles: form.notifyRoles,
      });
      setSnagAircraft(null);
      setForm({
        reportedBy: "", reportedByRole: "Dispatch", category: "Divers",
        severity: "Avant prochain vol", defectTitle: "", description: "",
        tach: "", hobbs: "", estimatedReturnDate: "",
        notifyRoles: ["Maintenance", "Directeur de maintenance"],
      });
      setMessage(`SNAG signalé pour ${snagAircraft.registration}. Il apparaît maintenant dans l’horaire.`);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Impossible d’enregistrer le SNAG.");
    }
  }

  return (
    <>
      <PageHeader title="Flotte" subtitle="Avions, maintenance, SNAG et urgences" />
      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice">{message}</div>}

      <div className="fleet-toolbar">
        <input placeholder="Rechercher…" value={query} onChange={event => setQuery(event.target.value)} />
        <button className="button" onClick={async () => { await replaceFleet(); setMessage("Flotte officielle Orizon installée."); }}>
          Remplacer par la flotte officielle Orizon
        </button>
      </div>

      <div className="fleet-kpis">
        <div className="card"><strong>{aircraft.length}</strong><span>Avions</span></div>
        <div className="card"><strong>{aircraft.filter(item => item.status === "Disponible").length}</strong><span>Disponibles</span></div>
        <div className="card"><strong>{aircraft.filter(item => item.status !== "Disponible").length}</strong><span>Indisponibles</span></div>
        <div className="card"><strong>{snags.filter(item => item.status !== "Fermé").length}</strong><span>SNAG ouverts</span></div>
      </div>

      {groups.map(group => (
        <section className="card fleet-group" key={group.type}>
          <h2>{group.type}</h2>
          <div className="fleet-grid">
            {group.items.map(item => (
              <article className="aircraft-card" key={item.id}>
                <header>
                  <div><strong>{item.registration}</strong><span>{item.typeLabel}</span></div>
                  <span className={`badge ${statusClass(item.status)}`}>{item.status}</span>
                </header>
                {item.statusReason && <div className="aircraft-alert">{item.statusReason}</div>}
                <div className="aircraft-meta">
                  <span>Début : {item.maintenanceStart || "—"}</span>
                  <span>Retour prévu : {item.maintenanceEnd || "—"}</span>
                </div>
                <div className="aircraft-actions">
                  <button className="button secondary" onClick={() => setEditing(item)}>Modifier</button>
                  <button className="button danger" onClick={() => setSnagAircraft(item)}>Signaler un SNAG</button>
                  <a className="button emergency" href={`/emergency?aircraft=${item.id}`}>Urgence</a>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      <section className="card">
        <h2>SNAG et défectuosités</h2>
        <div className="snag-list">
          {snags.map(snag => (
            <article className="snag-row" key={snag.id}>
              <div>
                <strong>{snag.aircraftRegistration} — {snag.defectTitle}</strong>
                <span>{snag.category} · {snag.severity}</span>
                <p>{snag.description}</p>
                <small>Signalé par {snag.reportedBy} ({snag.reportedByRole})</small>
              </div>
              <div className="snag-status">
                <select value={snag.status} onChange={event => updateSnag(snag.id, { status: event.target.value as SnagStatus })}>
                  {STATUSES.map(status => <option key={status}>{status}</option>)}
                </select>
                {snag.status !== "Fermé" && <button className="button secondary" onClick={() => closeSnag(snag)}>Remettre en service</button>}
              </div>
            </article>
          ))}
          {!snags.length && <p>Aucun SNAG.</p>}
        </div>
      </section>

      {editing && (
        <div className="modal-backdrop"><section className="modal compact">
          <header><div><h2>{editing.registration}</h2><p>Maintenance et disponibilité</p></div><button className="icon-button" onClick={() => setEditing(null)}>×</button></header>
          <div className="modal-body">
            <label>Statut<select value={editing.status} onChange={event => setEditing({ ...editing, status: event.target.value as AircraftStatus })}><option>Disponible</option><option>Maintenance</option><option>Hors service</option><option>Inspection</option><option>SNAG</option></select></label>
            <div className="form-grid">
              <label>Date de début<input type="date" value={editing.maintenanceStart || ""} onChange={event => setEditing({ ...editing, maintenanceStart: event.target.value })} /></label>
              <label>Date de fin prévue<input type="date" value={editing.maintenanceEnd || ""} onChange={event => setEditing({ ...editing, maintenanceEnd: event.target.value })} /></label>
            </div>
            <label>Motif / description<textarea value={editing.statusReason || ""} onChange={event => setEditing({ ...editing, statusReason: event.target.value })} /></label>
          </div>
          <footer><span /><button className="button secondary" onClick={() => setEditing(null)}>Annuler</button><button className="button" onClick={async () => { await saveAircraft(editing); setEditing(null); }}>Enregistrer</button></footer>
        </section></div>
      )}

      {snagAircraft && (
        <div className="modal-backdrop"><section className="modal">
          <header><div><h2>Signaler une défectuosité</h2><p>{snagAircraft.registration}</p></div><button className="icon-button" onClick={() => setSnagAircraft(null)}>×</button></header>
          <form onSubmit={submitSnag}>
            <div className="modal-body">
              <div className="form-grid">
                <label>Signalé par<input value={form.reportedBy} onChange={event => setForm({ ...form, reportedBy: event.target.value })} placeholder="Nom de la personne" required /></label>
                <label>Rôle<select value={form.reportedByRole} onChange={event => setForm({ ...form, reportedByRole: event.target.value as SnagReporterRole })}>{REPORTER_ROLES.map(role => <option key={role}>{role}</option>)}</select></label>
                <label>Catégorie<select value={form.category} onChange={event => setForm({ ...form, category: event.target.value })}>{CATEGORIES.map(item => <option key={item}>{item}</option>)}</select></label>
                <label>Gravité<select value={form.severity} onChange={event => setForm({ ...form, severity: event.target.value as SnagSeverity })}><option>Critique (AOG)</option><option>Avant prochain vol</option><option>À surveiller</option><option>Cosmétique</option></select></label>
                <label>Tach<input type="number" step="0.1" value={form.tach} onChange={event => setForm({ ...form, tach: event.target.value })} /></label>
                <label>Hobbs<input type="number" step="0.1" value={form.hobbs} onChange={event => setForm({ ...form, hobbs: event.target.value })} /></label>
              </div>
              <label>Défectuosité<input required value={form.defectTitle} onChange={event => setForm({ ...form, defectTitle: event.target.value })} /></label>
              <label>Description détaillée<textarea required value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
              <label>Date estimée de remise en service<input type="date" value={form.estimatedReturnDate} onChange={event => setForm({ ...form, estimatedReturnDate: event.target.value })} /></label>
              <div><strong>Notifier les rôles</strong><div className="role-pills">{ROLES.map(role => <button type="button" className={form.notifyRoles.includes(role) ? "active" : ""} onClick={() => toggleRole(role)} key={role}>{role}</button>)}</div></div>
            </div>
            <footer><span /><button type="button" className="button secondary" onClick={() => setSnagAircraft(null)}>Annuler</button><button className="button danger">Signaler le SNAG</button></footer>
          </form>
        </section></div>
      )}
    </>
  );
}

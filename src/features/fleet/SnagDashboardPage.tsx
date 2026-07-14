"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  saveSnagDashboardAccess,
  subscribeSnagDashboardAccess,
  subscribeSnags,
  updateSnag
} from "./firestore";
import type { NotificationRole, Snag, SnagSeverity, SnagStatus } from "./types";

const ROLES: NotificationRole[] = [
  "Administrateur",
  "Dispatch",
  "Instructeur",
  "Chef instructeur",
  "Maintenance",
  "Directeur de maintenance"
];

const STATUSES: SnagStatus[] = [
  "Ouvert",
  "Pris en charge",
  "Pièces commandées",
  "En réparation",
  "Essai en vol",
  "Fermé"
];

const SEVERITIES: Array<SnagSeverity | "Toutes"> = [
  "Toutes",
  "Critique (AOG)",
  "Avant prochain vol",
  "À surveiller",
  "Cosmétique"
];

export function SnagDashboardPage() {
  const [snags, setSnags] = useState<Snag[]>([]);
  const [allowedRoles, setAllowedRoles] = useState<string[]>([
    "Maintenance",
    "Directeur de maintenance",
    "Administrateur"
  ]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SnagStatus | "Tous">("Tous");
  const [severity, setSeverity] = useState<SnagSeverity | "Toutes">("Toutes");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const offSnags = subscribeSnags({ next: setSnags, error: value => setError(value.message) });
    const offAccess = subscribeSnagDashboardAccess(
      value => setAllowedRoles(value.allowedRoles),
      value => setError(value.message)
    );
    return () => { offSnags(); offAccess(); };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...snags]
      .filter(item => status === "Tous" || item.status === status)
      .filter(item => severity === "Toutes" || item.severity === severity)
      .filter(item => !needle || [
        item.aircraftRegistration,
        item.defectTitle,
        item.description,
        item.reportedBy,
        item.category
      ].some(value => value.toLowerCase().includes(needle)))
      .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt));
  }, [snags, query, status, severity]);

  async function toggleRole(role: NotificationRole) {
    const next = allowedRoles.includes(role)
      ? allowedRoles.filter(item => item !== role)
      : [...allowedRoles, role];
    setAllowedRoles(next);
    await saveSnagDashboardAccess(next);
    setMessage("Accès au tableau des SNAG mis à jour.");
  }

  const openCount = snags.filter(item => item.status !== "Fermé").length;
  const aogCount = snags.filter(item => item.status !== "Fermé" && item.severity === "Critique (AOG)").length;

  return (
    <>
      <PageHeader title="Tableau des SNAG" subtitle="Suivi maintenance, priorités et accès par rôle" />
      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice">{message}</div>}

      <div className="fleet-kpis snag-kpis">
        <div className="card"><strong>{openCount}</strong><span>SNAG ouverts</span></div>
        <div className="card"><strong>{aogCount}</strong><span>AOG critiques</span></div>
        <div className="card"><strong>{snags.filter(item => item.status === "En réparation").length}</strong><span>En réparation</span></div>
        <div className="card"><strong>{snags.filter(item => item.status === "Fermé").length}</strong><span>Fermés</span></div>
      </div>

      <section className="card snag-access-card">
        <h2>Accès au tableau</h2>
        <p className="muted">L’administrateur choisit les rôles autorisés. Les rôles Maintenance, Directeur de maintenance et Administrateur sont activés par défaut.</p>
        <div className="role-pills">
          {ROLES.map(role => (
            <button
              type="button"
              className={allowedRoles.includes(role) ? "active" : ""}
              onClick={() => toggleRole(role)}
              key={role}
            >
              {role}
            </button>
          ))}
        </div>
      </section>

      <div className="snag-dashboard-toolbar">
        <input placeholder="Rechercher avion, défectuosité, personne…" value={query} onChange={event => setQuery(event.target.value)} />
        <select value={status} onChange={event => setStatus(event.target.value as SnagStatus | "Tous")}>
          <option>Tous</option>
          {STATUSES.map(item => <option key={item}>{item}</option>)}
        </select>
        <select value={severity} onChange={event => setSeverity(event.target.value as SnagSeverity | "Toutes")}>
          {SEVERITIES.map(item => <option key={item}>{item}</option>)}
        </select>
      </div>

      <section className="card snag-table-card">
        <div className="snag-table-head">
          <span>Avion / défectuosité</span><span>Priorité</span><span>Signalé par</span><span>Statut</span><span>Retour prévu</span>
        </div>
        {filtered.map(item => (
          <article className="snag-table-row" key={item.id}>
            <div><strong>{item.aircraftRegistration} — {item.defectTitle}</strong><p>{item.description}</p><small>{item.category} · {item.reportedAt.slice(0, 16).replace("T", " ")}</small></div>
            <span className={`snag-severity ${item.severity.includes("Critique") ? "critical" : item.severity.includes("prochain") ? "before-flight" : "normal"}`}>{item.severity}</span>
            <div><strong>{item.reportedBy}</strong><small>{item.reportedByRole}</small></div>
            <select value={item.status} onChange={event => updateSnag(item.id, { status: event.target.value as SnagStatus })}>{STATUSES.map(value => <option key={value}>{value}</option>)}</select>
            <span>{item.estimatedReturnDate || "—"}</span>
          </article>
        ))}
        {!filtered.length && <p>Aucun SNAG ne correspond aux filtres.</p>}
      </section>
    </>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  subscribeAllMaintenanceHistory,
  subscribeSnagHistory,
  subscribeSnags,
  type SnagHistoryItem,
} from "@/features/fleet/firestore";
import type {
  Aircraft,
  MaintenanceHistory,
  MaintenanceTask,
  MaintenanceWorkOrder,
  Snag,
} from "@/features/fleet/types";
import { formatQuebecDateTime, quebecToday } from "@/lib/quebecDateTime";

const CLOSED = new Set(["Fermée", "Annulée"]);
const DAY = 86_400_000;
const dateValue = (value?: string) => (value ? new Date(value).getTime() : 0);
const daysRemaining = (value?: string) =>
  value ? Math.ceil((new Date(`${value}T23:59:59`).getTime() - Date.now()) / DAY) : undefined;
const workOwner = (item: MaintenanceWorkOrder) =>
  item.prm?.name || item.dom?.name || item.technician?.name || "Non assigné";
const priorityRank = (value: MaintenanceWorkOrder["priority"]) =>
  value === "Critique" || value === "Urgente"
    ? 0
    : value === "Haute" || value === "Surveillance"
      ? 1
      : value === "Normale"
        ? 2
        : 3;

type AuditRow = {
  id: string;
  eventAt: string;
  aircraftRegistration: string;
  action: string;
  actorName: string;
  actorRole: string;
  reason: string;
  source: "Maintenance" | "SNAG";
};

export function MaintenanceDashboard({
  aircraft,
  tasks,
  workOrders,
}: {
  aircraft: Aircraft[];
  tasks: MaintenanceTask[];
  workOrders: MaintenanceWorkOrder[];
}) {
  const [snags, setSnags] = useState<Snag[]>([]);
  const [history, setHistory] = useState<MaintenanceHistory[]>([]);
  const [snagHistory, setSnagHistory] = useState<SnagHistoryItem[]>([]);
  const [error, setError] = useState("");
  const [aircraftFilter, setAircraftFilter] = useState("Tous");
  const [userFilter, setUserFilter] = useState("Tous");
  const [periodFilter, setPeriodFilter] = useState("30 jours");
  const [actionFilter, setActionFilter] = useState("Toutes");
  const [reportOpen, setReportOpen] = useState(false);
  const [auditTarget, setAuditTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const a = subscribeSnags({ next: setSnags, error: (value) => setError(value.message) });
    const b = subscribeAllMaintenanceHistory({ next: setHistory, error: (value) => setError(value.message) });
    const c = subscribeSnagHistory(setSnagHistory, (value) => setError(value.message));
    return () => { a(); b(); c(); };
  }, []);
  useEffect(() => {
    setAuditTarget(document.getElementById("maintenance-audit-bottom"));
  }, []);

  const activeAircraft = useMemo(() => aircraft.filter((item) => item.active), [aircraft]);
  const aircraftById = useMemo(() => new Map(aircraft.map((item) => [item.id, item])), [aircraft]);
  const openWork = useMemo(
    () => workOrders.filter((item) => !CLOSED.has(item.workStatus)),
    [workOrders],
  );
  const openSnags = useMemo(() => snags.filter((item) => item.status !== "Fermé"), [snags]);
  const now = Date.now();
  const delayedAircraft = activeAircraft.filter(
    (item) => item.expectedReturnAt && dateValue(item.expectedReturnAt) < now && item.status !== "Disponible",
  );
  const plannedAircraft = activeAircraft.filter(
    (item) => item.status === "Maintenance planifiée" && !item.blockedForScheduling,
  );
  const groundedAircraft = activeAircraft.filter(
    (item) => item.blockedForScheduling,
  );
  const overdueWork = openWork.filter(
    (item) => item.plannedEndAt && dateValue(item.plannedEndAt) < now,
  );
  const dueSoonHours = tasks.filter((task) => {
    const plane = aircraftById.get(task.aircraftId);
    if (!plane || task.completed || task.notApplicable || task.dueAirTime === undefined) return false;
    const remaining = task.dueAirTime - (plane.airTimeTotal || 0);
    return remaining > 0 && remaining <= 15;
  });
  const overdueTasks = tasks.filter((task) => {
    const plane = aircraftById.get(task.aircraftId);
    if (!plane || task.completed || task.notApplicable) return false;
    return (task.dueAirTime !== undefined && task.dueAirTime - (plane.airTimeTotal || 0) <= 0) ||
      (task.dueDate !== undefined && (daysRemaining(task.dueDate) || 0) < 0);
  });
  const plannedSevenDays = openWork.filter((item) => {
    const start = dateValue(item.plannedStartAt);
    return start >= now && start <= now + 7 * DAY;
  });
  const today = quebecToday();
  const plannedToday = openWork.filter(
    (item) => item.plannedStartAt?.slice(0, 10) === today,
  );
  const returnsToday = openWork.filter(
    (item) => item.plannedEndAt?.slice(0, 10) === today,
  );
  const importantSnags = openSnags.filter((item) =>
    ["Critique (AOG)", "Avant prochain vol"].includes(item.severity),
  );
  const criticalWork = [...openWork]
    .filter(
      (item) =>
        priorityRank(item.priority) <= 1 ||
        Boolean(item.plannedEndAt && dateValue(item.plannedEndAt) < now),
    )
    .sort(
      (a, b) =>
        Number(Boolean(b.plannedEndAt && dateValue(b.plannedEndAt) < now)) -
          Number(Boolean(a.plannedEndAt && dateValue(a.plannedEndAt) < now)) ||
        priorityRank(a.priority) - priorityRank(b.priority),
    );

  const activeRows = [...openWork].sort(
    (a, b) => dateValue(a.plannedEndAt) - dateValue(b.plannedEndAt),
  );
  const returnRows = activeRows.filter((item) => item.plannedEndAt);
  const upcomingTasks = useMemo(() => {
    const rows = tasks
      .filter((item) => !item.completed && !item.notApplicable)
      .map((item) => {
        const plane = aircraftById.get(item.aircraftId);
        const hours = plane && item.dueAirTime !== undefined
          ? item.dueAirTime - (plane.airTimeTotal || 0)
          : undefined;
        const days = daysRemaining(item.dueDate);
        const rank = (hours !== undefined && hours <= 0) || (days !== undefined && days < 0)
          ? 0
          : hours !== undefined && hours <= 15
            ? 1
            : days !== undefined && days <= 30
              ? 2
              : 3;
        return { task: item, plane, hours, days, rank };
      })
      .sort((a, b) => a.rank - b.rank || (a.hours ?? 999999) - (b.hours ?? 999999) || (a.days ?? 999999) - (b.days ?? 999999));
    return rows.slice(0, 40);
  }, [tasks, aircraftById]);
  const cutoff30Days = now - 30 * DAY;
  const fleetMetrics = useMemo(
    () =>
      activeAircraft
        .map((plane) => {
          const planeWork = workOrders.filter((item) => item.aircraftId === plane.id);
          const immobilizations = planeWork.filter((item) => {
            const start = dateValue(item.actualStartAt || item.plannedStartAt);
            const end = dateValue(item.returnedToServiceAt) || now;
            return start > 0 && end >= cutoff30Days && start <= now;
          });
          const totalMs = immobilizations.reduce((sum, item) => {
            const start = Math.max(
              dateValue(item.actualStartAt || item.plannedStartAt),
              cutoff30Days,
            );
            const end = Math.min(dateValue(item.returnedToServiceAt) || now, now);
            return sum + Math.max(0, end - start);
          }, 0);
          const completedDurations = planeWork
            .map((item) => {
              const start = dateValue(item.actualStartAt || item.plannedStartAt);
              const end = dateValue(item.returnedToServiceAt);
              return start && end > start ? end - start : 0;
            })
            .filter((value) => value > 0);
          return {
            plane,
            immobilizations: immobilizations.length,
            totalHours: totalMs / 3_600_000,
            workOrders: planeWork.length,
            snags: snags.filter((item) => item.aircraftId === plane.id).length,
            averageHours: completedDurations.length
              ? completedDurations.reduce((sum, value) => sum + value, 0) /
                completedDurations.length /
                3_600_000
              : 0,
          };
        })
        .sort((a, b) => b.totalHours - a.totalHours),
    [activeAircraft, workOrders, snags, cutoff30Days, now],
  );
  const delayRows = workOrders
    .filter((item) => item.plannedEndAt)
    .map((item) => {
      const planned = dateValue(item.plannedEndAt);
      const actual = dateValue(item.returnedToServiceAt) ||
        (!CLOSED.has(item.workStatus) ? now : 0);
      return { item, delayHours: actual > planned ? (actual - planned) / 3_600_000 : 0 };
    })
    .filter((item) => item.delayHours > 0)
    .sort((a, b) => b.delayHours - a.delayHours);

  const auditRows = useMemo<AuditRow[]>(() => {
    const maintenanceRows = history.map((item) => ({
      id: `maintenance-${item.id}`,
      eventAt: item.eventAt,
      aircraftRegistration: item.aircraftRegistration,
      action: item.action,
      actorName: item.actorName,
      actorRole: item.actorRole,
      reason: item.reason || "—",
      source: "Maintenance" as const,
    }));
    const snagRows = snagHistory.map((item) => ({
      id: `snag-${item.id}`,
      eventAt: item.eventAt,
      aircraftRegistration: item.aircraftRegistration,
      action: item.action,
      actorName: item.actor || "Système",
      actorRole: "SNAG",
      reason: item.details || item.reason || "—",
      source: "SNAG" as const,
    }));
    return [...maintenanceRows, ...snagRows].sort((a, b) => b.eventAt.localeCompare(a.eventAt));
  }, [history, snagHistory]);
  const auditUsers = [...new Set(auditRows.map((item) => item.actorName).filter(Boolean))].sort();
  const auditActions = [...new Set(auditRows.map((item) => item.action).filter(Boolean))].sort();
  const periodDays = periodFilter === "24 heures" ? 1 : periodFilter === "7 jours" ? 7 : periodFilter === "30 jours" ? 30 : undefined;
  const filteredAudit = auditRows.filter((item) => {
    if (aircraftFilter !== "Tous" && item.aircraftRegistration !== aircraftFilter) return false;
    if (userFilter !== "Tous" && item.actorName !== userFilter) return false;
    if (actionFilter !== "Toutes" && item.action !== actionFilter) return false;
    return !periodDays || dateValue(item.eventAt) >= now - periodDays * DAY;
  });
  const recentChanges = auditRows.filter((item) => dateValue(item.eventAt) >= now - DAY);

  const printReport = () => {
    document.body.classList.add("maintenance-report-print");
    const cleanup = () => document.body.classList.remove("maintenance-report-print");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 1200);
  };

  const kpis = [
    ["Avions actifs", activeAircraft.length, "ok"],
    ["Disponibles", activeAircraft.filter((item) => item.status === "Disponible" && !item.blockedForScheduling).length, "ok"],
    ["En maintenance", activeAircraft.filter((item) => item.status === "En maintenance").length, "warn"],
    ["Bloqués Scheduler", activeAircraft.filter((item) => item.blockedForScheduling).length, "danger"],
    ["RTS retardés", delayedAircraft.length, delayedAircraft.length ? "danger" : "ok"],
    ["Travaux ouverts", openWork.length, "neutral"],
    ["En cours", openWork.filter((item) => item.workStatus === "En cours").length, "warn"],
    ["Attente inspection", openWork.filter((item) => ["Travail terminé", "Inspection requise"].includes(item.workStatus)).length, "warn"],
    ["Attente RTS", openWork.filter((item) => item.workStatus === "Inspection complétée").length, "warn"],
    ["Travaux en retard", overdueWork.length, overdueWork.length ? "danger" : "ok"],
    ["Échéances ≤15 h", dueSoonHours.length, dueSoonHours.length ? "warn" : "ok"],
    ["Échéances dépassées", overdueTasks.length, overdueTasks.length ? "danger" : "ok"],
    ["SNAG ouverts", openSnags.length, openSnags.length ? "danger" : "ok"],
    ["Maintenance ≤7 jours", plannedSevenDays.length, "neutral"],
  ] as const;
  const auditView = <section className="maintenance-audit card">
    <header><div><h3>Journal Maintenance</h3><p>Historique d’audit MCM en lecture seule</p></div></header>
    <div className="maintenance-audit-filters">
      <label>Avion<select value={aircraftFilter} onChange={(event) => setAircraftFilter(event.target.value)}><option>Tous</option>{[...new Set(auditRows.map((item) => item.aircraftRegistration).filter(Boolean))].sort().map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Utilisateur<select value={userFilter} onChange={(event) => setUserFilter(event.target.value)}><option>Tous</option>{auditUsers.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Période<select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)}><option>24 heures</option><option>7 jours</option><option>30 jours</option><option>Toutes</option></select></label>
      <label>Action<select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}><option>Toutes</option>{auditActions.map((value) => <option key={value}>{value}</option>)}</select></label>
    </div>
    <div className="maintenance-audit-list">{filteredAudit.slice(0, 150).map((item) => <article key={item.id}><time>{formatQuebecDateTime(item.eventAt)}</time><b>{item.aircraftRegistration || "—"}</b><span><strong>{item.action}</strong><small>{item.reason}</small></span><span><strong>{item.actorName || "Système"}</strong><small>{item.actorRole || item.source}</small></span></article>)}{!filteredAudit.length && <p>Aucune action correspondant aux filtres.</p>}</div>
  </section>;

  return <section className="maintenance-dashboard card">
    <header className="maintenance-dashboard-heading">
      <div><h2>Maintenance Dashboard</h2><p>Supervision quotidienne PRM / DOM · vue de contrôle en lecture seule</p></div>
      <button className="button" onClick={() => setReportOpen(true)}>Générer rapport maintenance du jour</button>
    </header>
    {error && <div className="notice error">{error}</div>}
    <div className="maintenance-dashboard-kpis">
      {kpis.map(([label, value, tone]) => <article className={`maintenance-dashboard-kpi ${tone}`} key={label}><strong>{value}</strong><span>{label}</span></article>)}
    </div>

    <section className="maintenance-health" aria-labelledby="maintenance-health-title">
      <header><h3 id="maintenance-health-title">État maintenance flotte</h3><p>Résumé de gestion opérationnelle</p></header>
      <div>
        <article><strong>{activeAircraft.length}</strong><span>Avions actifs</span></article>
        <article className="ok"><strong>{activeAircraft.filter((item) => item.status === "Disponible" && !item.blockedForScheduling).length}</strong><span>Disponibles</span></article>
        <article className="warning"><strong>{groundedAircraft.length}</strong><span>Maintenance</span></article>
        <article className="danger"><strong>{delayedAircraft.length}</strong><span>Retard RTS</span></article>
        <article><strong>{openWork.length}</strong><span>Travaux ouverts</span></article>
        <article className="danger"><strong>{criticalWork.length}</strong><span>Travaux critiques</span></article>
        <article className="ok"><strong>{returnsToday.length}</strong><span>RTS prévus aujourd’hui</span></article>
      </div>
    </section>

    <section className="maintenance-today">
      <header><div><h3>Situation maintenance aujourd’hui</h3><p>{today} · contrôle opérationnel DOM</p></div></header>
      <div className="maintenance-today-fleet">
        <article className="ok"><strong>{activeAircraft.filter((item) => item.status === "Disponible" && !item.blockedForScheduling).length}</strong><span>🟢 Disponibles</span></article>
        <article className="warning"><strong>{plannedAircraft.length}</strong><span>🟠 Maintenance planifiée</span></article>
        <article className="danger"><strong>{groundedAircraft.length}</strong><span>🔴 Immobilisés</span></article>
        <article className="late"><strong>{delayedAircraft.length}</strong><span>⚠ Retour en service retardé</span></article>
      </div>
      <div className="maintenance-critical-grid">
        <div><h4>Travaux critiques ou retardés</h4>{criticalWork.slice(0, 10).map((item) => <a href={`/maintenance?workOrderId=${encodeURIComponent(item.id)}`} key={item.id}><b>{item.aircraftRegistration}</b><span>{item.title} · {item.priority} · {item.workStatus}</span></a>)}{!criticalWork.length && <p>Aucun travail critique.</p>}</div>
        <div><h4>SNAG importants</h4>{importantSnags.slice(0, 10).map((item) => <a href={item.workOrderId ? `/maintenance?workOrderId=${encodeURIComponent(item.workOrderId)}` : `/maintenance?snagId=${encodeURIComponent(item.id)}`} key={item.id}><b>{item.aircraftRegistration}</b><span>{item.defectTitle} · {item.severity}</span></a>)}{!importantSnags.length && <p>Aucun SNAG important.</p>}</div>
        <div><h4>Maintenance prévue aujourd’hui</h4>{plannedToday.slice(0, 10).map((item) => <a href={`/maintenance?workOrderId=${encodeURIComponent(item.id)}`} key={item.id}><b>{item.aircraftRegistration}</b><span>{item.title} · {formatQuebecDateTime(item.plannedStartAt)}</span></a>)}{!plannedToday.length && <p>Aucune maintenance prévue.</p>}</div>
      </div>
    </section>

    <DashboardTable title="Travaux en cours" empty="Aucun travail actif." showEmpty={!activeRows.length}>
      <table><thead><tr><th>Avion</th><th>Type</th><th>Travail</th><th>Priorité</th><th>SNAG lié</th><th>PRM</th><th>DOM</th><th>Technicien</th><th>Contrôle</th><th>RTS autorisé par</th><th>Statut</th><th>Début prévu</th><th>Retour prévu</th></tr></thead>
        <tbody>{activeRows.map((item) => <tr className="clickable" onClick={() => { window.location.href = `/maintenance?workOrderId=${encodeURIComponent(item.id)}`; }} key={item.id}><td><b>{item.aircraftRegistration}</b></td><td>{item.aircraftType}</td><td>{item.title}</td><td><Priority value={item.priority} /></td><td>{item.snagId ? "Oui" : "—"}</td><td>{item.prm?.name || "—"}</td><td>{item.dom?.name || "—"}</td><td>{item.technician?.name || "—"}</td><td>{item.inspectionPerformedBy?.name || "—"}</td><td>{item.rtsAuthorizedBy?.name || "—"}</td><td><Status value={item.workStatus} danger={Boolean(item.plannedEndAt && dateValue(item.plannedEndAt) < now)} /></td><td>{formatQuebecDateTime(item.plannedStartAt)}</td><td>{formatQuebecDateTime(item.plannedEndAt)}</td></tr>)}</tbody>
      </table>
    </DashboardTable>

    <div className="maintenance-dashboard-columns">
      <DashboardTable title="Temps hors service — 30 derniers jours" empty="Aucune immobilisation." showEmpty={!fleetMetrics.some((item) => item.immobilizations)}>
        <table><thead><tr><th>Avion</th><th>Immobilisations</th><th>Temps total</th><th>Work Orders</th><th>SNAG</th><th>Moyenne maintenance</th></tr></thead><tbody>{fleetMetrics.map((item) => <tr key={item.plane.id}><td><b>{item.plane.registration}</b></td><td>{item.immobilizations}</td><td>{item.totalHours.toFixed(1)} h</td><td>{item.workOrders}</td><td>{item.snags}</td><td>{item.averageHours.toFixed(1)} h</td></tr>)}</tbody></table>
      </DashboardTable>
      <DashboardTable title="Retards maintenance" empty="Aucun retour retardé." showEmpty={!delayRows.length}>
        <table><thead><tr><th>Avion</th><th>Travail</th><th>Prévu</th><th>Retour réel / actuel</th><th>Retard</th></tr></thead><tbody>{delayRows.slice(0, 40).map(({ item, delayHours }) => <tr key={item.id}><td><b>{item.aircraftRegistration}</b></td><td>{item.title}</td><td>{formatQuebecDateTime(item.plannedEndAt)}</td><td>{item.returnedToServiceAt ? formatQuebecDateTime(item.returnedToServiceAt) : "Toujours immobilisé"}</td><td><Status value={`${delayHours.toFixed(1)} h`} danger /></td></tr>)}</tbody></table>
      </DashboardTable>
    </div>

    <div className="maintenance-dashboard-columns">
      <DashboardTable title="Retour en service prévu" empty="Aucun retour planifié." showEmpty={!returnRows.length}>
        <table><thead><tr><th>Avion</th><th>Travail</th><th>Retour prévu</th><th>Responsable</th><th>État</th></tr></thead><tbody>
          {returnRows.map((item) => { const late = dateValue(item.plannedEndAt) < now; return <tr key={item.id}><td><b>{item.aircraftRegistration}</b></td><td>{item.title}</td><td>{formatQuebecDateTime(item.plannedEndAt)}</td><td>{workOwner(item)}</td><td><Status value={late ? "⚠ Retard RTS" : item.workStatus} danger={late} /></td></tr>; })}
        </tbody></table>
      </DashboardTable>
      <DashboardTable title="Travaux à venir" empty="Aucune échéance." showEmpty={!upcomingTasks.length}>
        <table><thead><tr><th>Avion</th><th>Tâche</th><th>Air Time restant</th><th>Jours restants</th><th>Priorité</th></tr></thead><tbody>
          {upcomingTasks.map(({ task, plane, hours, days, rank }) => <tr key={task.id}><td><b>{plane?.registration || task.aircraftId}</b></td><td>{task.title}</td><td>{hours === undefined ? "—" : `${hours.toFixed(1)} h`}</td><td>{days === undefined ? "—" : `${days} j`}</td><td><Status value={rank === 0 ? "Retardé" : rank === 1 ? "≤15 h" : rank === 2 ? "≤30 jours" : "Normal"} danger={rank === 0} warning={rank === 1 || rank === 2} /></td></tr>)}
        </tbody></table>
      </DashboardTable>
    </div>

    {auditTarget && createPortal(auditView, auditTarget)}

    {reportOpen && <div className="modal-backdrop maintenance-report-backdrop"><section className="modal maintenance-report-modal"><header><div><h2>Rapport maintenance du jour</h2><p>{new Intl.DateTimeFormat("fr-CA", { dateStyle: "long", timeStyle: "short" }).format(new Date())}</p></div><button className="icon-button" onClick={() => setReportOpen(false)}>×</button></header><div className="modal-body maintenance-daily-report">
      <h1>Rapport quotidien PRM / DOM</h1><p className="report-generated">Généré le {new Intl.DateTimeFormat("fr-CA", { dateStyle: "full", timeStyle: "short" }).format(new Date())}</p>
      <ReportSection title="Situation flotte"><p><b>{activeAircraft.filter((item) => item.status === "Disponible" && !item.blockedForScheduling).length}</b> disponibles · <b>{activeAircraft.filter((item) => item.blockedForScheduling).length}</b> immobilisés · <b>{activeAircraft.filter((item) => item.status === "Hors service").length}</b> hors service</p></ReportSection>
      <ReportSection title="Travaux ouverts"><ul>{activeRows.map((item) => <li key={item.id}><b>{item.aircraftRegistration}</b> — {item.title} · {item.workStatus} · Responsable : {workOwner(item)}</li>)}</ul>{!activeRows.length && <p>Aucun travail ouvert.</p>}</ReportSection>
      <ReportSection title="Échéances et alertes"><p>{dueSoonHours.length} échéance(s) ≤15 h · {overdueTasks.length} dépassée(s) · {openSnags.length} SNAG ouvert(s) · {overdueWork.length} travail(aux) en retard</p></ReportSection>
      <ReportSection title="Changements des dernières 24 heures"><ul>{recentChanges.map((item) => <li key={item.id}>{formatQuebecDateTime(item.eventAt)} · <b>{item.aircraftRegistration || "—"}</b> · {item.action} · {item.actorName || "Système"}</li>)}</ul>{!recentChanges.length && <p>Aucun changement enregistré.</p>}</ReportSection>
    </div><footer><span /><button className="button secondary" onClick={() => setReportOpen(false)}>Fermer</button><button className="button" onClick={printReport}>Imprimer / Enregistrer PDF</button></footer></section></div>}
  </section>;
}

function DashboardTable({ title, empty, showEmpty, children }: { title: string; empty: string; showEmpty: boolean; children: React.ReactNode }) {
  return <section className="maintenance-dashboard-table"><h3>{title}</h3><div className="maintenance-dashboard-table-scroll">{children}</div>{showEmpty && <span className="maintenance-dashboard-empty">{empty}</span>}</section>;
}
function Status({ value, danger = false, warning = false }: { value: string; danger?: boolean; warning?: boolean }) {
  return <span className={`maintenance-dashboard-status ${danger ? "danger" : warning ? "warning" : "ok"}`}>{value}</span>;
}
function Priority({ value }: { value: MaintenanceWorkOrder["priority"] }) {
  const normalized = value === "Urgente" ? "Critique" : value === "Surveillance" ? "Haute" : value;
  return <span className={`maintenance-priority priority-${normalized.toLocaleLowerCase("fr-CA")}`}>{normalized}</span>;
}
function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="maintenance-report-section"><h2>{title}</h2>{children}</section>;
}

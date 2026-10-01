"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAuth } from "@/features/auth/AuthProvider";
import { subscribeAircraft, subscribeMaintenanceTasks, subscribeSnags } from "@/features/fleet/firestore";
import type { Aircraft, MaintenanceTask, Snag } from "@/features/fleet/types";
import { subscribeOrganizations } from "@/features/organizations/firestore";
import type { Organization } from "@/features/organizations/types";
import {
  cancelWorkOrder, closeWorkOrderAndReturnToService, createWorkOrder, startPrmControl, subscribeCards, subscribeIssuedWorkOrders, subscribeProject, transmitWorkOrder,
} from "./firestore";
import { OmaMro } from "./OmaMro";
import { cardProgress, describeSchoolStep } from "./statusText";
import { WORK_ORDER_STATUS_LABELS, type Project, type WorkCard, type WorkOrder, type WorkOrderSource } from "./types";

const CANCELLABLE_STATUSES = ["brouillon", "transmis", "pris_en_charge", "rapport_depose"] as const;

const errorText = (value: unknown, fallback: string) => {
  const raw = value instanceof Error ? value.message : fallback;
  return /permission/i.test(raw) ? "Refusé par les règles de sécurité : rôle PRM requis, ou séparation des tâches (vous avez signé une carte de ce projet), ou cartes encore ouvertes." : raw;
};

function SchoolOrderPanel({ order, schoolOrgId }: { order: WorkOrder; schoolOrgId: string }) {
  const { profile, user } = useAuth();
  const actor = { uid: user?.uid || "", name: profile?.name || profile?.email || "" };
  const [project, setProject] = useState<Project | null>(null);
  const [cards, setCards] = useState<WorkCard[]>([]);
  const [comments, setComments] = useState("");
  const [airTimeAtReturn, setAirTimeAtReturn] = useState("");
  const [cancelComments, setCancelComments] = useState("");
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState(false);
  const [busy, setBusy] = useState(false);
  const started = order.status !== "brouillon" && order.status !== "transmis";

  useEffect(() => started ? subscribeProject(order.id, setProject, () => setProject(null)) : undefined, [order.id, started]);
  useEffect(() => started ? subscribeCards("school", schoolOrgId, order.id, setCards, () => setCards([])) : undefined, [order.id, schoolOrgId, started]);

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true); setMessage(""); setMessageError(false);
    try { await action(); if (done) setMessage(done); } catch (error) { setMessage(errorText(error, "Action impossible.")); setMessageError(true); } finally { setBusy(false); }
  }

  const allClosed = Boolean(project) && project!.openCardCount === 0 && cards.every(card => card.status === "ferme");
  const step = describeSchoolStep(order, project, cards);
  const progress = cardProgress(cards);
  const canCancel = (CANCELLABLE_STATUSES as readonly string[]).includes(order.status) && (!project || project.signerUids.length === 0);
  return <div className="oma-project">
    <div className="notice oma-step"><strong>Vous en êtes ici : {step.here}</strong><span>{step.next}</span></div>
    {message && <div className={`notice ${messageError ? "error" : ""}`}>{message}</div>}
    {order.status === "brouillon" && <button className="button" disabled={busy} onClick={() => run(() => transmitWorkOrder(order.id), "Bon transmis à l’OMA.")}>Transmettre à l’OMA</button>}
    {started && project && <p className="muted">Projet OMA : {progress.total} carte(s){progress.total ? ` — ${progress.closed} fermée(s)${progress.cancelled ? `, ${progress.cancelled} annulée(s)` : ""}` : ""}.</p>}
    {cards.map(card => <p key={card.id}>{card.status === "ferme" ? "✓" : card.status === "annulee" ? "✗" : "○"} ATA {card.ata} — {card.subject} <small>({card.assignedUserName}{card.signedAt ? ` · signée ${new Date(card.signedAt).toLocaleString("fr-CA")}` : card.status === "annulee" ? " · annulée" : ""})</small></p>)}
    {order.report && <div className="notice">Rapport {order.report.reference} : {order.report.summary}</div>}
    {canCancel && <div className="oma-cancel">
      <label>Motif d’annulation (optionnel)<input value={cancelComments} onChange={e => setCancelComments(e.target.value)} /></label>
      <button type="button" className="button secondary" disabled={busy} onClick={() => { if (window.confirm("Annuler ce bon de travail ? Cette action reste visible ensuite, elle ne supprime rien.")) run(() => cancelWorkOrder(order.id, actor, cancelComments), "Bon annulé."); }}>Annuler ce bon</button>
    </div>}
    {order.cancelled && <div className="notice">Annulé par {order.cancelled.by.name} le {new Date(order.cancelled.at).toLocaleString("fr-CA")}{order.cancelled.comments ? ` — ${order.cancelled.comments}` : ""}.</div>}
    {order.status === "rapport_depose" && <>
      <label>Commentaires du contrôle<textarea rows={2} value={comments} onChange={e => setComments(e.target.value)} /></label>
      <button className="button" disabled={busy} onClick={() => run(() => startPrmControl(order.id, actor, comments), "Contrôle PRM démarré.")}>Démarrer le contrôle PRM</button>
      <p className="muted">Refusé si vous avez signé une carte de ce projet en tant que technicien (séparation des tâches).</p>
    </>}
    {order.status === "controle_prm" && <>
      {!allClosed && <div className="notice warning">⚠ Toutes les cartes du projet doivent être fermées avant la remise en service.</div>}
      <label>Commentaires de remise en service<textarea rows={2} value={comments} onChange={e => setComments(e.target.value)} /></label>
      <label>Heures cellule au retour<input type="number" step="0.1" value={airTimeAtReturn} onChange={e => setAirTimeAtReturn(e.target.value)} /></label>
      <button className="button" disabled={busy || !allClosed} onClick={() => run(async () => {
        const result = await closeWorkOrderAndReturnToService(order, cards, actor, comments, airTimeAtReturn ? Number(airTimeAtReturn) : undefined);
        setMessage(result.aircraftReleased ? "Clôturé : avion remis en service et échéances mises à jour." : `Clôturé; l’avion reste immobilisé (${result.openSnagCount} SNAG encore ouvert(s)). Échéances mises à jour.`);
      }, "")}>Clôturer et remettre en service</button>
    </>}
    {order.rts && <div className="notice">Remis en service par {order.rts.by.name} le {new Date(order.rts.at).toLocaleString("fr-CA")}.</div>}
  </div>;
}

function SchoolSide({ schoolOrgId }: { schoolOrgId: string }) {
  const { profile, user } = useAuth();
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [snags, setSnags] = useState<Snag[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState({ aircraftId: "", title: "", description: "", source: "status_board" as WorkOrderSource, snagId: "", taskIds: [] as string[], sharedWithOrgId: "" });

  useEffect(() => subscribeIssuedWorkOrders(schoolOrgId, setOrders, caught => setError(errorText(caught, "Lecture des bons de travail impossible."))), [schoolOrgId]);
  // Ouvre automatiquement le bon désigné par ?openOrderId= (ex. juste après une création TEA
  // depuis MaintenanceWorkOrdersPanel, D14 étape 2) dès qu'il apparaît dans la liste.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get("openOrderId");
    if (id && orders.some(order => order.id === id)) setOpen(id);
  }, [orders]);
  useEffect(() => subscribeOrganizations(setOrgs, () => setOrgs([])), []);
  useEffect(() => subscribeAircraft({ next: setAircraft, error: () => setAircraft([]) }), []);
  useEffect(() => subscribeMaintenanceTasks({ next: setTasks, error: () => setTasks([]) }), []);
  useEffect(() => subscribeSnags({ next: setSnags, error: () => setSnags([]) }), []);

  const mroOrgs = orgs.filter(org => org.type === "mro");
  const selectedAircraft = aircraft.find(item => item.id === form.aircraftId);
  const aircraftTasks = tasks.filter(task => task.aircraftId === form.aircraftId && !task.notApplicable);
  const aircraftSnags = snags.filter(snag => snag.aircraftId === form.aircraftId && snag.status !== "Fermé");

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedAircraft) return;
    const sharedWithOrgId = form.sharedWithOrgId || mroOrgs[0]?.id || "";
    if (!sharedWithOrgId) { setError("Aucune organisation OMA n’existe encore."); return; }
    setError("");
    try {
      await createWorkOrder({
        orgId: schoolOrgId, sharedWithOrgId, source: form.source, aircraftId: selectedAircraft.id, aircraftRegistration: selectedAircraft.registration,
        title: form.title.trim(), description: form.description.trim(), snagId: form.snagId || undefined, airTimeAtIssue: selectedAircraft.airTimeTotal,
        tasks: aircraftTasks.filter(task => form.taskIds.includes(task.id)).map(task => ({ taskId: task.id, title: task.title, dueBasis: task.dueBasis, dueAirTime: task.dueAirTime, dueDate: task.dueDate, intervalHours: task.intervalHours, intervalDays: task.intervalDays, intervalMonths: task.intervalMonths })),
      }, { uid: user?.uid || "", name: profile?.name || profile?.email || "" });
      setForm({ ...form, title: "", description: "", snagId: "", taskIds: [] });
    } catch (caught) { setError(errorText(caught, "Création impossible.")); }
  }

  return <section className="card oma-side">
    <header><span className="badge ok">École</span><h2>Bons de travail émis à l’OMA</h2><p>Le PRM de l’école émet, contrôle et remet l’avion en service.</p></header>
    {error && <div className="notice error">{error}</div>}
    <form className="form-grid" onSubmit={create}>
      <label>Avion<select required value={form.aircraftId} onChange={e => setForm({ ...form, aircraftId: e.target.value, taskIds: [], snagId: "" })}><option value="">Sélectionner…</option>{aircraft.map(item => <option value={item.id} key={item.id}>{item.registration}</option>)}</select></label>
      <label>Origine<select value={form.source} onChange={e => setForm({ ...form, source: e.target.value as WorkOrderSource })}><option value="status_board">Status Board (planifié)</option><option value="snag">SNAG</option><option value="manuel">Manuel</option></select></label>
      <label>Titre<input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></label>
      {mroOrgs.length > 1 && <label>OMA destinataire<select value={form.sharedWithOrgId} onChange={e => setForm({ ...form, sharedWithOrgId: e.target.value })}>{mroOrgs.map(org => <option value={org.id} key={org.id}>{org.name}</option>)}</select></label>}
      <label className="wide">Description<textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
      {form.source === "snag" && <label>SNAG lié<select value={form.snagId} onChange={e => setForm({ ...form, snagId: e.target.value })}><option value="">Aucun</option>{aircraftSnags.map(snag => <option value={snag.id} key={snag.id}>{snag.snagNumber} — {snag.defectTitle}</option>)}</select></label>}
      {aircraftTasks.length > 0 && <div className="wide"><strong>Échéances visées</strong><div className="oma-task-pick">{aircraftTasks.map(task => <label className="check" key={task.id}><input type="checkbox" checked={form.taskIds.includes(task.id)} onChange={e => setForm({ ...form, taskIds: e.target.checked ? [...form.taskIds, task.id] : form.taskIds.filter(id => id !== task.id) })} />{task.title}</label>)}</div></div>}
      <button className="button">Créer le bon (brouillon)</button>
    </form>
    {orders.map(order => <div className="oma-order" key={order.id}>
      <div className="oma-order-head"><div><strong>{order.aircraftRegistration} — {order.title}</strong><small>{order.tasks.length} échéance(s) · {order.source}</small></div>
        <span className="badge">{WORK_ORDER_STATUS_LABELS[order.status]}</span>
        <button className="button secondary" onClick={() => setOpen(open === order.id ? null : order.id)}>{open === order.id ? "Masquer" : "Ouvrir"}</button></div>
      {open === order.id && <SchoolOrderPanel order={order} schoolOrgId={schoolOrgId} />}
    </div>)}
    {!orders.length && <p>Aucun bon de travail émis.</p>}
  </section>;
}

export function OmaPage() {
  const { profile } = useAuth();
  const schoolPrm = Boolean(profile && ["Administrateur", "Maintenance", "Directeur de maintenance"].includes(profile.role));
  return <>
    <PageHeader title="OMA — bons de travail" subtitle="Bon de travail → projet → cartes de travail → certification par NIP → contrôle et remise en service" />
    {!profile?.schoolOrgId && !profile?.mroOrgId && <div className="notice warning">Ce compte n’est rattaché à aucune organisation. Un administrateur doit exécuter la migration des organisations (Administration → Paramètres) et vous ajouter à votre organisation.</div>}
    {profile?.schoolOrgId && schoolPrm && <SchoolSide schoolOrgId={profile.schoolOrgId} />}
    {profile?.mroOrgId && <OmaMro mroOrgId={profile.mroOrgId} />}
  </>;
}

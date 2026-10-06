"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import { subscribeOrgMembers } from "@/features/organizations/firestore";
import { TechnicianPinPanel } from "@/features/organizations/TechnicianPinPanel";
import { LICENSE_CLASSES, type LicenseClass, type OrgMember } from "@/features/organizations/types";
import {
  acceptWorkOrder, addCardEntry, addWorkCard, cancelWorkCard, depositReport, signWorkCard, subscribeCards, subscribeEntries, subscribeInventory, subscribeProject,
  subscribeReceivedWorkOrders, subscribeSignatures, updateWorkCardContent,
} from "./firestore";
import { cardProgress, describeOmaStep } from "./statusText";
import { WORK_ORDER_STATUS_LABELS, type CardEntry, type CardPart, type CardSignature, type InventoryItem, type Project, type WorkCard, type WorkOrder } from "./types";

const CLASS_MATCH_LABEL = { match: "correspond à la classe requise", mismatch: "ne correspond PAS à la classe requise", unspecified: "classe requise non précisée" } as const;
const errorText = (value: unknown, fallback: string) => {
  const raw = value instanceof Error ? value.message : fallback;
  return /permission/i.test(raw) ? "Refusé par les règles de sécurité (rôle, organisation ou séparation des tâches)." : raw;
};

function CardView({ card, project, mroOrgId, viewerUid, isPrm, members, stock }: { card: WorkCard; project: Project | null; mroOrgId: string; viewerUid: string; isPrm: boolean; members: OrgMember[]; stock: InventoryItem[] }) {
  const { profile } = useAuth();
  const actor = { uid: viewerUid, name: profile?.name || profile?.email || "" };
  const [draft, setDraft] = useState({ rectification: card.rectification, parts: card.parts, completedAirTime: card.completedAirTime?.toString() || "", completedDate: card.completedDate || "" });
  const [signatures, setSignatures] = useState<CardSignature[]>([]);
  const [entries, setEntries] = useState<CardEntry[]>([]);
  const [pin, setPin] = useState("");
  const [entryText, setEntryText] = useState("");
  const [cancelComments, setCancelComments] = useState("");
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState(false);
  const [busy, setBusy] = useState(false);
  const open = card.status === "ouvert";
  const cancelled = card.status === "annulee";
  const canEdit = open && (card.assignedUserId === viewerUid || isPrm);

  useEffect(() => { setDraft({ rectification: card.rectification, parts: card.parts, completedAirTime: card.completedAirTime?.toString() || "", completedDate: card.completedDate || "" }); }, [card.rectification, card.parts, card.completedAirTime, card.completedDate]);
  useEffect(() => subscribeSignatures("mro", mroOrgId, card.id, setSignatures, () => setSignatures([])), [card.id, mroOrgId]);
  useEffect(() => subscribeEntries("mro", mroOrgId, card.id, setEntries, () => setEntries([])), [card.id, mroOrgId]);

  const setPart = (index: number, patch: Partial<CardPart>) => setDraft(current => ({ ...current, parts: current.parts.map((part, i) => i === index ? { ...part, ...patch } : part) }));
  // Pièce prise de l'inventaire partagé : numéro et S/N viennent de la fiche; la déduction se fait à la certification.
  const pickStock = (index: number, id: string) => {
    const item = stock.find(entry => entry.id === id);
    setPart(index, item ? { inventoryItemId: item.id, partNumber: item.partNumber, installedSerial: item.serialNumber, quantity: 1 } : { inventoryItemId: undefined });
  };

  async function save() {
    setBusy(true); setMessage(""); setMessageError(false);
    try {
      await updateWorkCardContent(card.id, { rectification: draft.rectification, parts: draft.parts, completedAirTime: draft.completedAirTime ? Number(draft.completedAirTime) : undefined, completedDate: draft.completedDate || undefined });
      setMessage("Carte enregistrée.");
    } catch (error) { setMessage(errorText(error, "Enregistrement impossible.")); setMessageError(true); } finally { setBusy(false); }
  }

  async function sign() {
    setBusy(true); setMessage(""); setMessageError(false);
    try {
      const result = await signWorkCard(card.id, pin);
      setPin("");
      setMessage(`Carte certifiée — classe du technicien : ${CLASS_MATCH_LABEL[result.classMatch]}.`);
    } catch (error) { setMessage(errorText(error, "Certification impossible.")); setMessageError(true); setPin(""); } finally { setBusy(false); }
  }

  async function addEntry(kind: CardEntry["kind"]) {
    if (!entryText.trim()) return;
    setBusy(true); setMessage(""); setMessageError(false);
    try {
      await addCardEntry(card, { kind, text: entryText.trim(), supersedesSignatureId: kind === "correction" ? signatures[0]?.id : undefined }, actor);
      setEntryText("");
    } catch (error) { setMessage(errorText(error, "Ajout impossible.")); setMessageError(true); } finally { setBusy(false); }
  }

  async function cancel() {
    if (!project) return;
    if (!window.confirm("Annuler cette carte ? Cette action reste visible ensuite, elle ne supprime rien.")) return;
    setBusy(true); setMessage(""); setMessageError(false);
    try { await cancelWorkCard(project, card, actor, cancelComments); }
    catch (error) { setMessage(errorText(error, "Annulation impossible.")); setMessageError(true); }
    finally { setBusy(false); }
  }

  const assignee = members.find(member => member.userId === card.assignedUserId);
  return <article className={`oma-card ${open ? "open" : cancelled ? "cancelled" : "closed"}`}>
    <header><strong>ATA {card.ata || "—"} · {card.subject}</strong><span className={`badge ${open ? "warn" : cancelled ? "" : "ok"}`}>{open ? "Ouverte" : cancelled ? "Annulée" : "Fermée — lecture seule"}</span></header>
    <small>{card.type === "snag" ? "SNAG" : "Routine"} · Technicien : {assignee?.displayName || card.assignedUserName}{card.requiredClass ? ` · Classe requise : ${card.requiredClass}` : ""}{card.taskSnapshot ? ` · Échéance : ${card.taskSnapshot.title}` : ""}</small>
    <label>Rectification<textarea rows={3} disabled={!canEdit} value={draft.rectification} onChange={e => setDraft({ ...draft, rectification: e.target.value })} /></label>
    <div className="oma-parts">{draft.parts.map((part, index) => {
      const item = part.inventoryItemId ? stock.find(entry => entry.id === part.inventoryItemId) : undefined;
      const stockLimited = Boolean(part.inventoryItemId);
      return <div className="form-grid" key={index}>
      <label>Pièce de l’inventaire<select disabled={!canEdit} value={part.inventoryItemId || ""} onChange={e => pickStock(index, e.target.value)}><option value="">Hors inventaire (saisie libre)</option>{stock.filter(entry => entry.quantity > 0 || entry.id === part.inventoryItemId).map(entry => <option value={entry.id} key={entry.id}>{entry.partNumber} — {entry.description || "sans description"}{entry.serialNumber ? ` · S/N ${entry.serialNumber}` : ""} ({entry.quantity} dispo.)</option>)}</select></label>
      <label>N° de pièce<input disabled={!canEdit || stockLimited} value={part.partNumber} onChange={e => setPart(index, { partNumber: e.target.value })} /></label>
      <label>S/N retiré<input disabled={!canEdit} value={part.removedSerial} onChange={e => setPart(index, { removedSerial: e.target.value })} /></label>
      <label>S/N installé<input disabled={!canEdit || Boolean(item?.serialNumber)} value={part.installedSerial} onChange={e => setPart(index, { installedSerial: e.target.value })} /></label>
      <label>Quantité<input type="number" min={1} max={stockLimited ? item?.quantity ?? 0 : undefined} disabled={!canEdit || Boolean(item?.serialNumber)} value={part.quantity} onChange={e => setPart(index, { quantity: Number(e.target.value) || 1 })} /></label>
      {item && part.quantity > item.quantity && <p className="notice error">Stock insuffisant : {item.quantity} disponible(s) dans l’inventaire.</p>}
    </div>; })}
      {canEdit && <p className="muted">Une pièce prise de l’inventaire est déduite du stock et ajoutée aux composantes de l’avion à la certification de la carte.</p>}
      {canEdit && <button type="button" className="button secondary small" onClick={() => setDraft({ ...draft, parts: [...draft.parts, { partNumber: "", removedSerial: "", installedSerial: "", quantity: 1 }] })}>+ Pièce</button>}</div>
    <div className="form-grid">
      <label>Heures cellule à l’accomplissement<input type="number" step="0.1" disabled={!canEdit} value={draft.completedAirTime} onChange={e => setDraft({ ...draft, completedAirTime: e.target.value })} /></label>
      <label>Date d’accomplissement<input type="date" disabled={!canEdit} value={draft.completedDate} onChange={e => setDraft({ ...draft, completedDate: e.target.value })} /></label>
    </div>
    {canEdit && <button type="button" className="button secondary" disabled={busy} onClick={save}>Enregistrer la carte</button>}

    {open && <div className="oma-sign">
      <strong>Certification du technicien assigné</strong>
      <p className="muted">Enregistrez la carte avant de signer : le hash est calculé sur la version enregistrée. Le NIP est vérifié côté serveur.</p>
      <input type="password" inputMode="numeric" maxLength={4} placeholder="NIP" className="pin-input" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} />
      <button type="button" className="button" disabled={busy || pin.length !== 4} onClick={sign}>Certifier avec le NIP</button>
    </div>}
    {canEdit && <div className="oma-cancel">
      <label>Motif d’annulation (optionnel)<input value={cancelComments} onChange={e => setCancelComments(e.target.value)} /></label>
      <button type="button" className="button secondary small" disabled={busy} onClick={cancel}>Annuler cette carte (créée par erreur)</button>
    </div>}
    {cancelled && card.cancelled && <div className="notice">Annulée par {card.cancelled.by.name} le {new Date(card.cancelled.at).toLocaleString("fr-CA")}{card.cancelled.comments ? ` — ${card.cancelled.comments}` : ""}.</div>}
    {message && <div className={`notice ${messageError ? "error" : ""}`}>{message}</div>}

    {signatures.length > 0 && <div className="oma-history"><strong>Historique des signatures</strong>{signatures.map(signature => <p key={signature.id}>
      ✓ {signature.signerName} — {signature.licenseType} {signature.licenseNumber}{signature.licenseClass ? ` (${signature.licenseClass})` : ""} · {signature.signedAt ? new Date(signature.signedAt).toLocaleString("fr-CA") : ""}<br />
      <small>Empreinte SHA-256 {signature.contentHash.slice(0, 16)}… · <span className={`badge ${signature.classMatch === "match" ? "ok" : signature.classMatch === "mismatch" ? "danger" : ""}`}>{CLASS_MATCH_LABEL[signature.classMatch]}</span></small></p>)}</div>}
    {card.nextDue && <p className="muted">Prochaine échéance calculée : {card.nextDue.dueAirTime !== undefined ? `${card.nextDue.dueAirTime} h` : ""} {card.nextDue.dueDate || ""} {card.nextDue.basis === "aucun_intervalle" ? "(aucun intervalle : à définir par l’école)" : ""} — appliquée par le PRM de l’école à la remise en service.</p>}

    {entries.length > 0 && <div className="oma-history"><strong>Inscriptions ajoutées après signature</strong>{entries.map(entry => <p key={entry.id}>{entry.kind === "correction" ? "Correction" : "Note"} — {entry.createdBy.name} · {entry.createdAt ? new Date(entry.createdAt).toLocaleString("fr-CA") : ""}<br />{entry.text}</p>)}</div>}
    {!open && !cancelled && <div className="oma-entry"><textarea rows={2} placeholder="Correction ou note (la carte et sa signature restent inchangées)…" value={entryText} onChange={e => setEntryText(e.target.value)} />
      <button type="button" className="button secondary small" disabled={busy || !entryText.trim()} onClick={() => addEntry("correction")}>Ajouter une correction</button>
      <button type="button" className="button secondary small" disabled={busy || !entryText.trim()} onClick={() => addEntry("note")}>Ajouter une note</button></div>}
  </article>;
}

function ProjectPanel({ workOrder, mroOrgId, viewerUid, isPrm, members, stock }: { workOrder: WorkOrder; mroOrgId: string; viewerUid: string; isPrm: boolean; members: OrgMember[]; stock: InventoryItem[] }) {
  const { profile } = useAuth();
  const actor = { uid: viewerUid, name: profile?.name || profile?.email || "" };
  const [project, setProject] = useState<Project | null>(null);
  const [cards, setCards] = useState<WorkCard[]>([]);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ cardNumber: "", ata: "", subject: "", type: "routine" as WorkCard["type"], assignedUserId: "", requiredClass: "" as LicenseClass | "", taskId: "" });
  const [report, setReport] = useState({ reference: "", summary: "" });
  const technicians = members.filter(member => member.role === "technician" && member.active);

  useEffect(() => subscribeProject(workOrder.id, setProject, () => setProject(null)), [workOrder.id]);
  useEffect(() => subscribeCards("mro", mroOrgId, workOrder.id, setCards, () => setCards([])), [mroOrgId, workOrder.id]);

  async function addCard(event: React.FormEvent) {
    event.preventDefault();
    if (!project) return;
    const tech = technicians.find(item => item.userId === form.assignedUserId);
    if (!tech) { setMessage("Sélectionnez un technicien."); return; }
    try {
      await addWorkCard(project, { cardNumber: form.cardNumber.trim(), ata: form.ata.trim(), subject: form.subject.trim(), type: form.type, assignedUserId: tech.userId, assignedUserName: tech.displayName, requiredClass: form.requiredClass || undefined, taskSnapshot: workOrder.tasks.find(task => task.taskId === form.taskId) }, actor);
      setForm({ ...form, cardNumber: "", ata: "", subject: "", taskId: "" }); setMessage("");
    } catch (error) { setMessage(errorText(error, "Ajout de la carte impossible.")); }
  }

  async function deposit(event: React.FormEvent) {
    event.preventDefault();
    try { await depositReport(workOrder.id, report, actor); setMessage(""); }
    catch (error) { setMessage(errorText(error, "Dépôt du rapport impossible.")); }
  }

  const step = describeOmaStep(workOrder, project, cards, isPrm);
  const progress = cardProgress(cards);
  return <div className="oma-project">
    <div className="notice oma-step"><strong>Vous en êtes ici : {step.here}</strong><span>{step.next}</span></div>
    {message && <div className="notice error">{message}</div>}
    {project && <p className="muted">{progress.total} carte(s){progress.total ? ` — ${progress.closed} fermée(s)${progress.cancelled ? `, ${progress.cancelled} annulée(s)` : ""}` : ""}.</p>}
    {project && project.openCardCount === 0 && progress.closed > 0 && <p><a className="button secondary" href={`/oma/dossier-vol/${project.id}`} target="_blank" rel="noreferrer">Ouvrir le dossier de vol (impression)</a></p>}
    {cards.map(card => <CardView key={card.id} card={card} project={project} mroOrgId={mroOrgId} viewerUid={viewerUid} isPrm={isPrm} members={members} stock={stock} />)}
    {isPrm && workOrder.status === "pris_en_charge" && project && <form className="form-grid oma-add-card" onSubmit={addCard}>
      <label>N° de carte (imprimé)<input value={form.cardNumber} onChange={e => setForm({ ...form, cardNumber: e.target.value })} placeholder="ex. 8271" /></label>
      <label>ATA<input required value={form.ata} onChange={e => setForm({ ...form, ata: e.target.value })} /></label>
      <label>Sujet<input required value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} /></label>
      <label>Type<select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as WorkCard["type"] })}><option value="routine">Routine</option><option value="snag">SNAG</option></select></label>
      <label>Technicien<select required value={form.assignedUserId} onChange={e => setForm({ ...form, assignedUserId: e.target.value })}><option value="">Sélectionner…</option>{technicians.map(item => <option value={item.userId} key={item.userId}>{item.displayName}{item.licenseClass ? ` — ${item.licenseClass}` : ""}</option>)}</select></label>
      <label>Classe requise (optionnel)<select value={form.requiredClass} onChange={e => setForm({ ...form, requiredClass: e.target.value as LicenseClass | "" })}><option value="">Non précisée</option>{LICENSE_CLASSES.map(item => <option key={item}>{item}</option>)}</select></label>
      <label>Échéance visée<select value={form.taskId} onChange={e => setForm({ ...form, taskId: e.target.value })}><option value="">Aucune</option>{workOrder.tasks.map(task => <option value={task.taskId} key={task.taskId}>{task.title}</option>)}</select></label>
      <button className="button">Ajouter la carte</button>
    </form>}
    {isPrm && workOrder.status === "pris_en_charge" && <form className="oma-report" onSubmit={deposit}>
      <h4>Dépôt du rapport</h4>
      {project && project.openCardCount > 0 && <div className="notice warning">⚠ {project.openCardCount} carte(s) encore ouverte(s) : le PRM de l’école ne pourra pas remettre l’avion en service tant qu’elles ne sont pas fermées.</div>}
      <label>N° de rapport<input required value={report.reference} onChange={e => setReport({ ...report, reference: e.target.value })} /></label>
      <label>Résumé<textarea required rows={3} value={report.summary} onChange={e => setReport({ ...report, summary: e.target.value })} /></label>
      <button className="button">Déposer le rapport</button>
    </form>}
    {workOrder.report && <div className="notice">Rapport {workOrder.report.reference} déposé par {workOrder.report.depositedBy.name}.</div>}
  </div>;
}

export function OmaMro({ mroOrgId }: { mroOrgId: string }) {
  const { profile, user } = useAuth();
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [stock, setStock] = useState<InventoryItem[]>([]);
  const uid = user?.uid || "";
  const me = members.find(member => member.userId === uid);
  const isPrm = me?.role === "prm" || me?.role === "admin";
  const actor = { uid, name: profile?.name || profile?.email || "" };

  useEffect(() => subscribeReceivedWorkOrders(mroOrgId, setOrders, caught => setError(errorText(caught, "Lecture des bons de travail impossible."))), [mroOrgId]);
  useEffect(() => subscribeOrgMembers(mroOrgId, setMembers, caught => setError(errorText(caught, "Lecture des membres de l’OMA impossible."))), [mroOrgId]);
  // Inventaire partagé par l'école avec cette OMA (lecture seule ici; la déduction passe par la certification).
  useEffect(() => subscribeInventory("mro", mroOrgId, setStock, () => setStock([])), [mroOrgId]);

  async function accept(order: WorkOrder) {
    setError("");
    try { await acceptWorkOrder(order, actor); setOpen(order.id); }
    catch (caught) { setError(errorText(caught, "Prise en charge impossible.")); }
  }

  return <section className="card oma-side">
    <header><span className="badge ok">OMA</span><h2>Bons de travail reçus</h2>
      <p>{me ? `${me.displayName} — ${me.role}${me.licenseNumber ? ` · ${me.licenseType} ${me.licenseNumber} (${me.licenseClass})` : " · licence non renseignée"}` : "Vous n’êtes pas membre de cette organisation."}</p></header>
    {error && <div className="notice error">{error}</div>}
    <details><summary>Mon NIP de certification</summary><TechnicianPinPanel userId={uid} userName={profile?.name || ""} /></details>
    {orders.length === 0 && <p>Aucun bon de travail transmis.</p>}
    {orders.map(order => <div className="oma-order" key={order.id}>
      <div className="oma-order-head"><div><strong>{order.aircraftRegistration} — {order.title}</strong><small>{order.description}</small></div>
        <span className="badge">{WORK_ORDER_STATUS_LABELS[order.status]}</span>
        {order.status === "transmis" && isPrm && <button className="button" onClick={() => accept(order)}>Prendre en charge</button>}
        {order.status !== "transmis" && <button className="button secondary" onClick={() => setOpen(open === order.id ? null : order.id)}>{open === order.id ? "Masquer" : "Ouvrir le projet"}</button>}</div>
      {open === order.id && order.status !== "transmis" && <ProjectPanel workOrder={order} mroOrgId={mroOrgId} viewerUid={uid} isPrm={isPrm} members={members} stock={stock} />}
    </div>)}
  </section>;
}

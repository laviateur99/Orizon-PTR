"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import { subscribeCards, subscribeIssuedWorkOrders, subscribeProject, subscribeReceivedWorkOrders, subscribeSignatures } from "./firestore";
import type { CardSignature, Project, WorkCard, WorkOrder } from "./types";
import type { DossierVolFixture } from "./dossierVolFixture";

// Rapport de projet imprimable : sommaire + bon de commande, rapport de tâche sommaire, chaque carte de
// travail en détail, puis un formulaire d'inspection à cocher. Reprend la structure du dossier papier
// (sommaire, MCM 07, rapport de tâche, cartes, formulaire d'inspection). Lecture seule : rien n'est modifié
// ni enregistré ici, à part le formulaire d'inspection qui reste un brouillon local avant impression.

type Side = "school" | "mro";

const INSPECTION_ITEMS = [
  "Hélice/pales/moyeu", "Compartiment moteur — fuites d’huile et de carburant", "Filtre à huile et à air",
  "Durites et conduites", "Harnais d’allumage et bougies", "Compression des cylindres",
  "Reniflard carter et système de vide", "Câblage électrique", "Pompe à vide",
  "Commandes et liaisons moteur", "Supports moteur", "Train d’atterrissage et freins",
  "Pneus et roulements de roue", "Commandes de vol et liaisons", "Instruments et avionique",
  "Dossier de l’aéronef (certificats, licences)", "Essai au sol / essai en vol",
];

function originalInspectionDraft() {
  return Object.fromEntries(INSPECTION_ITEMS.map(item => [item, false])) as Record<string, boolean>;
}

export function OmaProjectPrintPage({ workOrderId, fixture }: { workOrderId: string; fixture?: DossierVolFixture }) {
  const { profile } = useAuth();
  const side: Side | "" = profile?.schoolOrgId ? "school" : profile?.mroOrgId ? "mro" : "";
  const orgId = side === "school" ? profile?.schoolOrgId || "" : profile?.mroOrgId || "";
  const [order, setOrder] = useState<WorkOrder | null>(fixture?.order ?? null);
  const [project, setProject] = useState<Project | null>(fixture?.project ?? null);
  const [cards, setCards] = useState<WorkCard[]>(fixture?.cards ?? []);
  const [signatures, setSignatures] = useState<Record<string, CardSignature[]>>(fixture?.signatures ?? {});
  const [inspection, setInspection] = useState(originalInspectionDraft());
  const [inspector, setInspector] = useState("");
  const [inspectionNote, setInspectionNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (fixture || !side) return;
    const onError = () => setError("Lecture du bon de travail impossible.");
    const onOrders = (items: WorkOrder[]) => setOrder(items.find(item => item.id === workOrderId) || null);
    return side === "school" ? subscribeIssuedWorkOrders(orgId, onOrders, onError) : subscribeReceivedWorkOrders(orgId, onOrders, onError);
  }, [fixture, side, orgId, workOrderId]);

  useEffect(() => fixture ? undefined : subscribeProject(workOrderId, setProject, () => setProject(null)), [fixture, workOrderId]);

  useEffect(() => {
    if (fixture || !side) return;
    return subscribeCards(side, orgId, workOrderId, setCards, () => setError("Lecture des cartes impossible."));
  }, [fixture, side, orgId, workOrderId]);

  useEffect(() => {
    if (fixture || !side) return;
    const offs = cards.map(card => subscribeSignatures(side, orgId, card.id, items => setSignatures(prev => ({ ...prev, [card.id]: items })), () => undefined));
    return () => offs.forEach(off => off());
  }, [fixture, cards, side, orgId]);

  const sortedCards = useMemo(() => [...cards].sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || "")), [cards]);
  const closed = cards.filter(c => c.status === "ferme").length;
  const cancelled = cards.filter(c => c.status === "annulee").length;
  const cardRef = (card: WorkCard) => card.cardNumber || card.id.slice(-6).toUpperCase();
  const fmtDate = (value?: string) => {
    if (!value) return "—";
    const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("fr-CA");
  };
  const fmtDateTime = (value?: string) => value ? new Date(value).toLocaleString("fr-CA") : "—";

  if (error) return <div className="notice error">{error}</div>;
  if (!side && !fixture) return <div className="notice warning">Ce compte n’est rattaché à aucune organisation.</div>;
  if (!order) return <p className="muted">Chargement du rapport de projet…</p>;

  return <div className="pr-page">
    <style>{`
      .pr-page{font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff;max-width:230mm;margin:0 auto;padding:12px;font-size:11px}
      .pr-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap}
      .pr-watermark{border:2px solid #b00000;color:#b00000;font-weight:bold;text-align:center;padding:6px;margin-bottom:10px}
      .pr-sheet{border:1.5px solid #111;padding:10px;margin-bottom:18px;break-inside:avoid}
      .pr-band{background:#111;color:#fff;font-weight:bold;font-size:13px;padding:4px 8px;display:flex;justify-content:space-between;margin:-10px -10px 8px}
      .pr-grid{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #111}
      .pr-grid>div{padding:4px 6px;border-right:1px solid #111;border-bottom:1px solid #111}
      .pr-grid>div:nth-child(4n){border-right:0}
      .pr-wide{grid-column:1/-1}
      .pr-grid span,.pr-field span{display:block;font-size:9px;color:#444}
      .pr-grid b{font-size:11px}
      .pr-table{width:100%;border-collapse:collapse;font-size:10px;margin-top:6px}
      .pr-table th,.pr-table td{border:1px solid #111;padding:3px 5px;text-align:left;vertical-align:top}
      .pr-table th{background:#eee}
      .pr-cert{border-top:1px solid #111;margin-top:10px;padding:8px 10px;font-size:11px;font-style:italic;text-align:center}
      .pr-signs{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:10px;padding:14px 4px 4px;align-items:end}
      .pr-line{border-top:1px solid #111;padding-top:3px;font-size:10px;text-align:center}
      .pr-check-list{list-style:none;margin:6px 0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:5px 20px}
      .pr-check-list li{break-inside:avoid;display:flex;align-items:center;gap:8px;margin:0}
      .pr-check-list li input{flex:0 0 auto;width:14px;height:14px}
      .pr-check-list li span{text-align:left}
      .pr-edit{border:1px dashed #bbb;background:#fafafa;font:inherit;padding:2px 4px}
      @media print{
        .sidebar,.pr-toolbar,.pr-editor-only,.app-shell .topbar{display:none!important}
        .app-shell{display:block!important}
        .main{padding:0!important;width:100%!important;max-width:none!important}
        .pr-page{padding:0;max-width:none}
        .pr-sheet{break-after:page;page-break-after:always;margin-bottom:0;border-width:1px}
        .pr-sheet:last-child{break-after:auto;page-break-after:auto}
        .pr-edit{border:0!important;background:transparent!important;padding:0!important}
        @page{size:letter;margin:10mm}
      }
    `}</style>

    <div className="pr-toolbar pr-editor-only">
      <div>
        <strong>Rapport de projet — {order.aircraftRegistration}</strong>
        <div className="muted">Sommaire, bon de commande, rapport de tâche, cartes de travail et formulaire d’inspection, prêts à imprimer.</div>
      </div>
      <button type="button" className="button" onClick={() => window.print()}>Imprimer</button>
    </div>
    {fixture && <div className="pr-watermark">EXEMPLE FICTIF — NON VALIDE — NE PAS UTILISER COMME RAPPORT</div>}

    {/* Sommaire du projet */}
    <section className="pr-sheet">
      <div className="pr-band"><span>Projet</span><span>Sommaire</span></div>
      <div className="pr-grid">
        <div><span>Projet</span><b>{project?.projectNumber ?? "—"}</b></div>
        <div><span>Statut</span><b>{order.status}</b></div>
        <div><span>Immatriculation</span><b>{order.aircraftRegistration}</b></div>
        <div><span>Cartes</span><b>{closed}/{cards.length} fermée(s){cancelled ? ` · ${cancelled} annulée(s)` : ""}</b></div>
        <div className="pr-wide"><span>Sujet</span><b>{order.title || "—"}</b></div>
        <div className="pr-wide"><span>Travail demandé</span><b>{order.description || "—"}</b></div>
        <div><span>Émis le</span><b>{fmtDateTime(order.createdAt)}</b></div>
        <div><span>Heures avion à l’émission</span><b>{order.airTimeAtIssue ?? "—"}</b></div>
        <div><span>Remis en service le</span><b>{order.rts ? fmtDateTime(order.rts.at) : "—"}</b></div>
        <div><span>Heures avion au retour</span><b>{order.rts?.airTimeAtReturn ?? "—"}</b></div>
      </div>
      <div className="pr-cert">Les travaux décrits dans ce projet ont été réalisés conformément aux normes de navigabilité applicables.</div>
      <div className="pr-signs">
        <div><div style={{height:"36px"}} /><div className="pr-line">Signature</div></div>
        <div><div style={{height:"36px"}} /><div className="pr-line">ACA / identification</div></div>
        <div><div style={{height:"36px"}} /><div className="pr-line">Date</div></div>
      </div>
    </section>

    {/* Bon de commande (tâches demandées par le PRM) */}
    <section className="pr-sheet">
      <div className="pr-band"><span>Bon de commande</span><span>Travail demandé</span></div>
      <div className="pr-grid">
        <div><span>Immatriculation</span><b>{order.aircraftRegistration}</b></div>
        <div><span>Réquisition remise par</span><b>{order.createdBy.name}</b></div>
        <div><span>Remise le</span><b>{fmtDateTime(order.createdAt)}</b></div>
        <div><span>Objet</span><b>{order.title || "—"}</b></div>
        <div className="pr-wide"><span>Travail demandé</span><b style={{fontWeight:"normal"}}>{order.description || "Aucune description fournie."}</b></div>
      </div>
      {order.tasks.length > 0 && <table className="pr-table" style={{marginTop:"8px"}}>
        <thead><tr><th>Échéance</th><th>Description de la tâche</th><th>Intervalle</th><th>Carte</th></tr></thead>
        <tbody>
          {order.tasks.map(task => {
            const card = cards.find(c => c.taskSnapshot?.taskId === task.taskId);
            return <tr key={task.taskId}>
              <td>{task.dueAirTime !== undefined ? `${task.dueAirTime} h` : ""}{task.dueDate ? ` ${fmtDate(task.dueDate)}` : ""}</td>
              <td>{task.title}</td>
              <td>{task.intervalHours ? `${task.intervalHours} h` : task.intervalMonths ? `${task.intervalMonths} mois` : task.intervalDays ? `${task.intervalDays} j` : "—"}</td>
              <td>{card ? cardRef(card) : "à déterminer"}</td>
            </tr>;
          })}
        </tbody>
      </table>}
      {order.tasks.length === 0 && <p className="muted" style={{marginTop:"8px"}}>Travail demandé décrit en texte libre ci-dessus : aucune échéance de la flotte n’a été cochée à la création du bon.</p>}
    </section>

    {/* Rapport de tâche sommaire */}
    <section className="pr-sheet">
      <div className="pr-band"><span>Rapport de tâche</span><span>Sommaire</span></div>
      <table className="pr-table">
        <thead><tr><th>Carte</th><th>Date</th><th>ATA</th><th>Anomalie</th><th>Ressource</th><th>Statut</th></tr></thead>
        <tbody>
          {sortedCards.map(card => <tr key={card.id}>
            <td>{cardRef(card)}</td><td>{fmtDate(card.completedDate || card.createdAt?.slice(0, 10))}</td><td>{card.ata}</td>
            <td>{card.subject}</td><td>{card.assignedUserName}</td>
            <td>{card.status === "ferme" ? "Fermée" : card.status === "annulee" ? "Annulée" : "Ouverte"}</td>
          </tr>)}
          {sortedCards.length === 0 && <tr><td colSpan={6}>Aucune carte sur ce projet.</td></tr>}
        </tbody>
      </table>
    </section>

    {/* Une page par carte de travail */}
    {sortedCards.map(card => {
      const sigs = signatures[card.id] || [];
      return <section className="pr-sheet" key={card.id}>
        <div className="pr-band"><span>Carte de travail</span><span>{cardRef(card)}</span></div>
        <div className="pr-grid">
          <div><span>Carte</span><b>{cardRef(card)}</b></div>
          <div><span>Date ouverte</span><b>{fmtDate(card.createdAt?.slice(0, 10))}</b></div>
          <div><span>ATA</span><b>{card.ata}</b></div>
          <div><span>Type</span><b>{card.type === "routine" ? "Routine" : "SNAG"}</b></div>
          <div><span>Immatriculation</span><b>{order.aircraftRegistration}</b></div>
          <div><span>Projet</span><b>{project?.projectNumber ?? "—"}</b></div>
          <div><span>Assignée à</span><b>{card.assignedUserName}</b></div>
          <div><span>Classe requise</span><b>{card.requiredClass || "Non précisée"}</b></div>
          <div className="pr-wide"><span>Anomalie</span><b>{card.subject}</b></div>
          <div className="pr-wide"><span>Correction</span><b style={{fontWeight:"normal"}}>{card.rectification || "—"}</b></div>
        </div>
        {card.parts.filter(p => p.partNumber).length > 0 && <table className="pr-table">
          <thead><tr><th># Pièce</th><th>Qté</th><th>S/N enlevé</th><th>S/N installé</th></tr></thead>
          <tbody>{card.parts.filter(p => p.partNumber).map((part, index) => <tr key={index}>
            <td>{part.partNumber}</td><td>{part.quantity}</td><td>{part.removedSerial || "—"}</td><td>{part.installedSerial || "—"}</td>
          </tr>)}</tbody>
        </table>}
        <div className="pr-grid" style={{marginTop:"8px"}}>
          <div><span>Prochaine échéance (heures)</span><b>{card.nextDue?.dueAirTime ?? "—"}</b></div>
          <div><span>Prochaine échéance (date)</span><b>{card.nextDue ? fmtDate(card.nextDue.dueDate) : "—"}</b></div>
          <div><span>Date de fermeture</span><b>{fmtDate(card.completedDate)}</b></div>
          <div><span>Statut</span><b>{card.status === "ferme" ? "Fermée" : card.status === "annulee" ? "Annulée" : "Ouverte"}</b></div>
        </div>
        <div className="pr-cert">Les travaux de maintenance indiqués ont été exécutés conformément aux exigences de navigabilité applicables.</div>
        <div className="pr-signs">
          <div><div style={{height:"30px"}}>{sigs[0] ? <span style={{fontSize:"10px"}}>{sigs[0].signerName}</span> : ""}</div><div className="pr-line">Signature</div></div>
          <div><div style={{height:"30px"}}>{sigs[0] ? <span style={{fontSize:"10px"}}>{sigs[0].licenseType} {sigs[0].licenseNumber}</span> : ""}</div><div className="pr-line">ACA / identification</div></div>
          <div><div style={{height:"30px"}}>{sigs[0] ? <span style={{fontSize:"10px"}}>{fmtDateTime(sigs[0].signedAt)}</span> : ""}</div><div className="pr-line">Date</div></div>
        </div>
      </section>;
    })}

    {/* Formulaire d'inspection — à cocher à l'écran ou imprimé puis complété à la main */}
    <section className="pr-sheet">
      <div className="pr-band"><span>Formulaire d’inspection</span><span>À compléter</span></div>
      <p className="muted">Liste générique, à ajuster selon le manuel de service applicable à l’aéronef. Cochez à l’écran avant impression, ou imprimez puis complétez à la main.</p>
      <ul className="pr-check-list">
        {INSPECTION_ITEMS.map(item => <li key={item}>
          <input type="checkbox" checked={inspection[item]} onChange={e => setInspection(prev => ({ ...prev, [item]: e.target.checked }))} />
          <span>{item}</span>
        </li>)}
      </ul>
      <label style={{display:"block",marginTop:"8px"}}><span className="pr-field"><span>Notes</span></span>
        <textarea className="pr-edit" style={{width:"100%"}} rows={3} value={inspectionNote} onChange={e => setInspectionNote(e.target.value)} />
      </label>
      <div className="pr-grid" style={{marginTop:"8px"}}>
        <div className="pr-wide"><span>Complété par (TEA)</span><input className="pr-edit" style={{width:"100%"}} value={inspector} onChange={e => setInspector(e.target.value)} /></div>
      </div>
      <div className="pr-signs">
        <div><div style={{height:"36px"}} /><div className="pr-line">Signature</div></div>
        <div><div style={{height:"36px"}} /><div className="pr-line">ACA / identification</div></div>
        <div><div style={{height:"36px"}} /><div className="pr-line">Date</div></div>
      </div>
    </section>
  </div>;
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import { subscribeCards, subscribeIssuedWorkOrders, subscribeProject, subscribeReceivedWorkOrders, subscribeSignatures } from "./firestore";
import type { CardSignature, Project, WorkCard, WorkOrder } from "./types";

// Collant « Dossier de vol » : le texte est généré à partir des cartes fermées, puis modifiable à l'écran
// (responsable de maintenance, PRM ou TEA) avant impression. Les modifications restent dans cette page :
// elles ne changent ni les cartes ni les signatures, qui sont figées à la certification.

type Side = "school" | "mro";
type CardDraft = { subject: string; rectification: string; parts: string; nextDue: string; signers: string; note: string };
type HeaderKey = "projet" | "immatriculation" | "entre" | "tt" | "reference" | "travaux";
type Draft = { header: Record<HeaderKey, string>; cards: Record<string, CardDraft>; footerNote: string };

const HEADER_LABELS: Record<HeaderKey, string> = {
  projet: "Projet", immatriculation: "Immatriculation", entre: "Entré ID", tt: "Aéronef TT", reference: "Référence client", travaux: "Travaux demandés",
};

const fmtDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" });
};
const fmtHours = (value?: number) => typeof value === "number" ? value.toLocaleString("fr-CA", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—";
const cardRef = (card: WorkCard) => card.id.slice(-6).toUpperCase();
const linesOf = (text: string) => text.split("\n").length;

function nextDueText(card: WorkCard) {
  const due = card.nextDue;
  if (!due) return "—";
  const parts: string[] = [];
  if (due.dueAirTime !== undefined) parts.push(`${fmtHours(due.dueAirTime)} hrs`);
  if (due.dueDate) parts.push(fmtDate(due.dueDate));
  return parts.join(" / ") || "—";
}

function originalCard(card: WorkCard, signatures: CardSignature[]): CardDraft {
  return {
    subject: card.subject,
    rectification: card.rectification || "",
    parts: card.parts.filter(part => part.partNumber).map(part => `Pièce : ${part.partNumber} · qté ${part.quantity} · S/N enlevé : ${part.removedSerial || "—"} · S/N installé : ${part.installedSerial || "—"}`).join("\n"),
    nextDue: nextDueText(card),
    signers: signatures.map(sig => `${sig.signerName} (${sig.licenseType} ${sig.licenseNumber})`).join(", "),
    note: "",
  };
}

export function DossierVolPage({ workOrderId }: { workOrderId: string }) {
  const { profile } = useAuth();
  const side: Side | "" = profile?.schoolOrgId ? "school" : profile?.mroOrgId ? "mro" : "";
  const orgId = side === "school" ? profile?.schoolOrgId || "" : profile?.mroOrgId || "";
  const [order, setOrder] = useState<WorkOrder | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [cards, setCards] = useState<WorkCard[]>([]);
  const [signatures, setSignatures] = useState<Record<string, CardSignature[]>>({});
  const [draft, setDraft] = useState<Draft>({ header: { projet: "", immatriculation: "", entre: "", tt: "", reference: "", travaux: "" }, cards: {}, footerNote: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    if (!side) return;
    const onError = () => setError("Lecture du bon de travail impossible.");
    const onOrders = (items: WorkOrder[]) => setOrder(items.find(item => item.id === workOrderId) || null);
    return side === "school" ? subscribeIssuedWorkOrders(orgId, onOrders, onError) : subscribeReceivedWorkOrders(orgId, onOrders, onError);
  }, [side, orgId, workOrderId]);

  useEffect(() => subscribeProject(workOrderId, setProject, () => setProject(null)), [workOrderId]);

  useEffect(() => {
    if (!side) return;
    return subscribeCards(side, orgId, workOrderId, setCards, () => setError("Lecture des cartes impossible."));
  }, [side, orgId, workOrderId]);

  useEffect(() => {
    if (!side) return;
    const offs = cards.map(card => subscribeSignatures(side, orgId, card.id, items => setSignatures(prev => ({ ...prev, [card.id]: items })), () => undefined));
    return () => offs.forEach(off => off());
  }, [cards, side, orgId]);

  const printable = useMemo(() => cards
    .filter(card => card.status === "ferme")
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || "")), [cards]);
  const openCount = cards.filter(card => card.status === "ouvert").length;
  const airTime = order?.rts?.airTimeAtReturn ?? order?.airTimeAtIssue;

  // Valeurs d'origine, recalculées à chaque mise à jour des données. Le brouillon garde les modifications faites à l'écran.
  const originals = useMemo<Record<HeaderKey, string>>(() => ({
    projet: order ? order.id.slice(-6).toUpperCase() : "",
    immatriculation: order?.aircraftRegistration || "",
    entre: project ? project.id.slice(-6).toUpperCase() : "",
    tt: airTime !== undefined ? `${fmtHours(airTime)} hrs` : "",
    reference: order?.title || "",
    travaux: order?.description || "",
  }), [order, project, airTime]);

  useEffect(() => {
    setDraft(prev => {
      const header = { ...prev.header };
      (Object.keys(originals) as HeaderKey[]).forEach(key => { if (header[key] === "") header[key] = originals[key]; });
      const cardsDraft = { ...prev.cards };
      printable.forEach(card => { if (!cardsDraft[card.id]) cardsDraft[card.id] = originalCard(card, signatures[card.id] || []); });
      return { ...prev, header, cards: cardsDraft };
    });
  }, [originals, printable, signatures]);

  function setHeader(key: HeaderKey, value: string) {
    setDraft(prev => ({ ...prev, header: { ...prev.header, [key]: value } }));
  }
  function setCard(cardId: string, key: keyof CardDraft, value: string) {
    setDraft(prev => ({ ...prev, cards: { ...prev.cards, [cardId]: { ...prev.cards[cardId], [key]: value } } }));
  }
  function resetDraft() {
    if (!window.confirm("Rétablir tous les textes d’origine ? Vos modifications seront perdues.")) return;
    setDraft({ header: { projet: "", immatriculation: "", entre: "", tt: "", reference: "", travaux: "" }, cards: {}, footerNote: "" });
  }

  if (error) return <div className="notice error">{error}</div>;
  if (!side) return <div className="notice warning">Ce compte n’est rattaché à aucune organisation.</div>;
  if (!order) return <p className="muted">Chargement du dossier de vol…</p>;

  return <div className="dv-page">
    <style>{`
      .dv-page{font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff;max-width:215mm;margin:0 auto;padding:12px;font-size:11px}
      .dv-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap}
      .dv-sheet{border:1.5px solid #111;padding:10px}
      .dv-head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #111;padding-bottom:6px;margin-bottom:6px}
      .dv-head h1{font-size:16px;margin:0}
      .dv-fields{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #111}
      .dv-fields>div{padding:4px 6px;border-right:1px solid #111;border-bottom:1px solid #111}
      .dv-fields>div:nth-child(4n){border-right:0}
      .dv-fields span{display:block;font-size:9px;color:#444}
      .dv-wide{grid-column:1/-1}
      .dv-field{width:100%;border:0;background:transparent;font:inherit;font-weight:bold;color:inherit;padding:0;resize:none;outline:none}
      .dv-card{border-bottom:1px dashed #666;padding:6px 0;break-inside:avoid}
      .dv-card .dv-field{font-weight:normal}
      .dv-card label{display:block;margin:2px 0}
      .dv-card label>span{font-weight:bold;margin-right:4px}
      .dv-edit{width:100%;border:1px dashed #bbb;background:#fafafa;font:inherit;padding:3px;box-sizing:border-box;resize:vertical}
      .dv-sign{display:grid;grid-template-columns:1.4fr 1fr;gap:10px;margin-top:14px;align-items:end}
      .dv-line{border-top:1px solid #111;padding-top:3px;font-size:9px;text-align:center}
      @media print{
        body{background:#fff!important}
        .sidebar,.dv-toolbar,.dv-editor-only,.app-shell .topbar{display:none!important}
        .app-shell{display:block!important}
        .main{padding:0!important;width:100%!important;max-width:none!important}
        .dv-page{padding:0;max-width:none}
        .dv-sheet{border-width:1px}
        .dv-edit,.dv-field{border:0!important;background:transparent!important;padding:0!important}
        .dv-card label{display:block}
        @page{size:letter;margin:12mm}
      }
    `}</style>

    <div className="dv-toolbar dv-editor-only">
      <div>
        <strong>Dossier de vol — {order.aircraftRegistration}</strong>
        <div className="muted">Les textes sont modifiables avant impression. Vos changements ne modifient ni les cartes ni les signatures.</div>
        {openCount > 0 && <div className="notice warning">⚠ {openCount} carte(s) encore ouverte(s) : ne pas imprimer avant la fermeture.</div>}
      </div>
      <div style={{display:"flex",gap:"8px"}}>
        <button type="button" className="button secondary" onClick={resetDraft}>Rétablir les textes d’origine</button>
        <button type="button" className="button" onClick={() => window.print()}>Imprimer</button>
      </div>
    </div>

    <div className="dv-sheet">
      <div className="dv-head">
        <div>
          <h1>ORIZON AVIATION Maintenance</h1>
          <div>O.M.A. 22-20 — 820, 8e Avenue de l’Aéroport, Aéroport Intl Jean-Lesage, Québec (Québec) G2G 0M4</div>
        </div>
        <strong style={{fontSize:"14px"}}>DOSSIER DE VOL</strong>
      </div>

      <div className="dv-fields">
        {(["projet", "immatriculation", "entre", "tt"] as HeaderKey[]).map(key => <div key={key}>
          <span>{HEADER_LABELS[key]}</span>
          <input className="dv-field" value={draft.header[key]} onChange={e => setHeader(key, e.target.value)} />
        </div>)}
        {(["reference", "travaux"] as HeaderKey[]).map(key => <div key={key} className="dv-wide">
          <span>{HEADER_LABELS[key]}</span>
          <textarea className="dv-field" rows={linesOf(draft.header[key])} value={draft.header[key]} onChange={e => setHeader(key, e.target.value)} />
        </div>)}
      </div>

      <div style={{marginTop:"6px"}}>
        {printable.map(card => {
          const fields = draft.cards[card.id];
          if (!fields) return null;
          return <div className="dv-card" key={card.id}>
            <p style={{margin:"2px 0"}}><strong>[Carte {cardRef(card)}; ATA {card.ata}]</strong> {fmtDate(card.completedDate) !== "—" ? `fermée le ${fmtDate(card.completedDate)}` : ""}</p>
            <label><span>Constat :</span><textarea className="dv-edit" rows={linesOf(fields.subject)} value={fields.subject} onChange={e => setCard(card.id, "subject", e.target.value)} /></label>
            <label><span>Rectification :</span><textarea className="dv-edit" rows={Math.max(2, linesOf(fields.rectification))} value={fields.rectification} onChange={e => setCard(card.id, "rectification", e.target.value)} /></label>
            <label><span>Pièces :</span><textarea className="dv-edit" rows={Math.max(1, linesOf(fields.parts))} value={fields.parts} onChange={e => setCard(card.id, "parts", e.target.value)} /></label>
            <label><span>Prochaine échéance :</span><input className="dv-edit" value={fields.nextDue} onChange={e => setCard(card.id, "nextDue", e.target.value)} /></label>
            <label><span>Signataires :</span><input className="dv-edit" value={fields.signers} onChange={e => setCard(card.id, "signers", e.target.value)} /></label>
            <label className="dv-editor-only"><span>Note (facultatif) :</span><textarea className="dv-edit" rows={1} value={fields.note} onChange={e => setCard(card.id, "note", e.target.value)} /></label>
            {fields.note && <p style={{margin:"2px 0"}}><strong>Note :</strong> {fields.note}</p>}
          </div>;
        })}
        {printable.length === 0 && <p className="muted">Aucune carte fermée à imprimer.</p>}
      </div>

      <label style={{display:"block",marginTop:"8px"}} className="dv-editor-only"><span>Note finale (facultatif) :</span>
        <textarea className="dv-edit" rows={2} value={draft.footerNote} onChange={e => setDraft(prev => ({ ...prev, footerNote: e.target.value }))} />
      </label>
      {draft.footerNote && <p style={{margin:"6px 0 0"}}>{draft.footerNote}</p>}

      <div className="dv-sign">
        <div>
          <div style={{height:"40px"}} />
          <div className="dv-line">Signature du TEA</div>
        </div>
        <div>
          <div style={{height:"40px"}} />
          <div className="dv-line">AME/TEA identification (ACA)</div>
        </div>
      </div>
      <div className="dv-line" style={{marginTop:"8px"}}>Date : ______________________</div>
    </div>
  </div>;
}

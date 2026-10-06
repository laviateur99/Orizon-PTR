"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import { subscribeCards, subscribeIssuedWorkOrders, subscribeProject, subscribeReceivedWorkOrders, subscribeSignatures } from "./firestore";
import type { CardSignature, Project, WorkCard, WorkOrder } from "./types";
import type { DossierVolFixture } from "./dossierVolFixture";

// Collant « Dossier de vol », mis en page comme le modèle papier du dossier. Le texte est généré à partir des
// cartes fermées, puis modifiable à l'écran (responsable de maintenance, PRM ou TEA) avant impression.
// Les modifications restent dans cette page : elles ne changent ni les cartes ni les signatures.

type Side = "school" | "mro";
type CardDraft = { subject: string; rectification: string; parts: string; nextDue: string; signers: string; note: string };
type HeaderKey = "projet" | "immatriculation" | "entre" | "tt" | "reference" | "travaux";
type Draft = { header: Record<HeaderKey, string>; cards: Record<string, CardDraft>; footerNote: string };

const EMPTY_HEADER: Record<HeaderKey, string> = { projet: "", immatriculation: "", entre: "", tt: "", reference: "", travaux: "" };

const fmtDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" });
};
const fmtHours = (value?: number) => typeof value === "number" ? value.toLocaleString("fr-CA", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—";
const cardRef = (card: WorkCard) => card.id.slice(-6).toUpperCase();
const linesOf = (text: string) => Math.max(1, text.split("\n").length);

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

// `fixture` : jeu de données fictif (démonstration). Dans ce mode, rien n'est lu ni écrit dans Firestore.
export function DossierVolPage({ workOrderId, fixture }: { workOrderId: string; fixture?: DossierVolFixture }) {
  const { profile } = useAuth();
  const side: Side | "" = profile?.schoolOrgId ? "school" : profile?.mroOrgId ? "mro" : "";
  const orgId = side === "school" ? profile?.schoolOrgId || "" : profile?.mroOrgId || "";
  const [order, setOrder] = useState<WorkOrder | null>(fixture?.order ?? null);
  const [project, setProject] = useState<Project | null>(fixture?.project ?? null);
  const [cards, setCards] = useState<WorkCard[]>(fixture?.cards ?? []);
  const [signatures, setSignatures] = useState<Record<string, CardSignature[]>>(fixture?.signatures ?? {});
  const [draft, setDraft] = useState<Draft>({ header: EMPTY_HEADER, cards: {}, footerNote: "" });
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
    setDraft({ header: EMPTY_HEADER, cards: {}, footerNote: "" });
  }

  if (error) return <div className="notice error">{error}</div>;
  if (!side && !fixture) return <div className="notice warning">Ce compte n’est rattaché à aucune organisation.</div>;
  if (!order) return <p className="muted">Chargement du dossier de vol…</p>;

  return <div className="dv-page">
    <style>{`
      .dv-page{font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff;max-width:215mm;margin:0 auto;padding:12px;font-size:12px}
      .dv-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap}
      .dv-watermark{border:2px solid #b00000;color:#b00000;font-weight:bold;text-align:center;padding:6px;margin-bottom:8px}
      .dv-sheet{border:1.5px solid #111}
      .dv-band{background:#111;color:#fff;font-weight:bold;font-size:13px;padding:4px 8px;display:flex;justify-content:space-between}
      .dv-top{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #111}
      .dv-top>div{padding:8px}
      .dv-logo{height:58px;display:block;margin-bottom:4px}
      .dv-small{font-size:9px;color:#333;line-height:1.3}
      .dv-cell{display:grid;grid-template-columns:auto 1fr;gap:6px;align-items:center;padding:3px 0}
      .dv-cell b{white-space:nowrap}
      .dv-body{padding:8px 10px}
      .dv-line-item{margin:0 0 4px}
      .dv-card{border-top:1px solid #bbb;padding:6px 0;break-inside:avoid}
      .dv-edit{width:100%;border:1px dashed #bbb;background:#fafafa;font:inherit;padding:2px 4px;box-sizing:border-box;resize:vertical}
      .dv-plain{width:100%;border:0;background:transparent;font:inherit;padding:0;resize:none;outline:none;color:inherit}
      .dv-label{font-weight:bold}
      .dv-cert{border-top:1px solid #111;margin-top:10px;padding:8px 10px;font-size:11px;font-style:italic;text-align:center}
      .dv-signs{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:10px;padding:14px 10px 8px;align-items:end}
      .dv-line{border-top:1px solid #111;padding-top:3px;font-size:10px;text-align:center}
      .dv-footer{border-top:1px solid #111;padding:6px 10px;font-size:9px;text-align:center;color:#333}
      @media print{
        body{background:#fff!important}
        .sidebar,.dv-toolbar,.dv-editor-only,.app-shell .topbar{display:none!important}
        .app-shell{display:block!important}
        .main{padding:0!important;width:100%!important;max-width:none!important}
        .dv-page{padding:0;max-width:none;font-size:11px}
        .dv-edit{border:0!important;background:transparent!important;padding:0!important}
        .dv-card{break-inside:avoid}
        @page{size:letter;margin:10mm}
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

    {fixture && <div className="dv-watermark">EXEMPLE FICTIF — NON VALIDE — NE PAS UTILISER COMME DOSSIER DE VOL</div>}

    <div className="dv-sheet">
      <div className="dv-band"><span>Maintenance</span><span>Dossier de vol</span></div>

      <div className="dv-top">
        <div>
          <img className="dv-logo" src="/branding/orizon-aviation-logo.png" alt="Orizon Aviation" />
          <div className="dv-small">O.M.A. 22-20 · 820, 8e Avenue de l’Aéroport · Aéroport Intl Jean-Lesage · Québec (Québec) G2G 0M4</div>
        </div>
        <div>
          <div className="dv-cell"><b>Projet :</b><input className="dv-plain" value={draft.header.projet} onChange={e => setHeader("projet", e.target.value)} /></div>
          <div className="dv-cell"><b>Entré ID :</b><input className="dv-plain" value={draft.header.entre} onChange={e => setHeader("entre", e.target.value)} /></div>
          <div className="dv-cell"><b>Imm. :</b><input className="dv-plain" value={draft.header.immatriculation} onChange={e => setHeader("immatriculation", e.target.value)} /></div>
          <div className="dv-cell"><b>Aéronef TT :</b><input className="dv-plain" value={draft.header.tt} onChange={e => setHeader("tt", e.target.value)} /></div>
        </div>
      </div>

      <div className="dv-body">
        <div className="dv-line-item"><span className="dv-label">Customer references :</span>{" "}
          <textarea className="dv-plain" rows={linesOf(draft.header.reference)} value={draft.header.reference} onChange={e => setHeader("reference", e.target.value)} />
        </div>
        <div className="dv-line-item"><span className="dv-label">Work requested :</span>{" "}
          <textarea className="dv-plain" rows={linesOf(draft.header.travaux)} value={draft.header.travaux} onChange={e => setHeader("travaux", e.target.value)} />
        </div>
        <div className="dv-label" style={{marginTop:"8px"}}>Work performed :</div>

        {printable.map(card => {
          const fields = draft.cards[card.id];
          if (!fields) return null;
          return <div className="dv-card" key={card.id}>
            <p className="dv-line-item"><b>[Task: {cardRef(card)}; ATA: {card.ata}]</b> <span className="dv-label">Discrepancy :</span>
              <textarea className="dv-edit" rows={linesOf(fields.subject)} value={fields.subject} onChange={e => setCard(card.id, "subject", e.target.value)} />
            </p>
            <p className="dv-line-item"><span className="dv-label">Rectification :</span>
              <textarea className="dv-edit" rows={Math.max(2, linesOf(fields.rectification))} value={fields.rectification} onChange={e => setCard(card.id, "rectification", e.target.value)} />
            </p>
            {fields.parts && <p className="dv-line-item"><span className="dv-label">Pièces :</span>
              <textarea className="dv-edit" rows={linesOf(fields.parts)} value={fields.parts} onChange={e => setCard(card.id, "parts", e.target.value)} />
            </p>}
            <p className="dv-line-item"><span className="dv-label">Prochaine échéance :</span>
              <input className="dv-edit" value={fields.nextDue} onChange={e => setCard(card.id, "nextDue", e.target.value)} />
            </p>
            <p className="dv-line-item"><span className="dv-label">Signé par :</span>
              <input className="dv-edit" value={fields.signers} onChange={e => setCard(card.id, "signers", e.target.value)} />
            </p>
            <div className="dv-editor-only"><span className="dv-label">Note (facultatif) :</span>
              <textarea className="dv-edit" rows={1} value={fields.note} onChange={e => setCard(card.id, "note", e.target.value)} />
            </div>
            {fields.note && <p className="dv-line-item"><span className="dv-label">Note :</span> {fields.note}</p>}
          </div>;
        })}
        {printable.length === 0 && <p className="muted">Aucune carte fermée à imprimer.</p>}
      </div>

      <div className="dv-cert">The maintenance described above has been performed in accordance with the applicable standard of airworthiness.</div>

      <div className="dv-signs">
        <div><div style={{height:"36px"}} /><div className="dv-line">Signature</div></div>
        <div><div style={{height:"36px"}} /><div className="dv-line">ACA / AME-TEA identification</div></div>
        <div><div style={{height:"36px"}} /><div className="dv-line">Date</div></div>
      </div>

      <div className="dv-body dv-editor-only">
        <label style={{display:"block"}}><span className="dv-label">Prochaine maintenance planifiée / notes (facultatif) :</span>
          <textarea className="dv-edit" rows={2} value={draft.footerNote} onChange={e => setDraft(prev => ({ ...prev, footerNote: e.target.value }))} />
        </label>
      </div>
      {draft.footerNote && <div className="dv-body"><span className="dv-label">Prochaine maintenance planifiée :</span> {draft.footerNote}</div>}

      <div className="dv-footer">Orizon Maintenance Aviation inc. · AMO/OMA 22-20 · 820, 8e Avenue de l’Aéroport, Aéroport Intl Jean-Lesage, Québec (Québec) G2G 0M4</div>
    </div>
  </div>;
}

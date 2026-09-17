"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import { subscribeTuitionTaxFormById } from "./firestore";
import type { PricingLine, TuitionTaxForm } from "./types";

const money = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0).toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
const hours = (value: number) => `${value.toFixed(1)} h`;

function AccessDenied() {
  return <main className="quote-print-status">Accès non autorisé à ce dossier.</main>;
}

type RateSummary = { amount: number; distinctRates: { unitPrice: number; unit: string }[]; hasData: boolean };

// N'agrège JAMAIS un taux unique quand plusieurs taux historiques distincts contribuent à une
// catégorie (ex. C152 189$ puis 195$ dans la même année) — le montant additionne des dollars déjà
// calculés (toujours exact), mais un "taux horaire" unique ne peut être affiché que s'il n'y en a
// réellement qu'un seul, sous peine d'inventer une moyenne qui n'existe dans aucune donnée source.
function summarizeCalculated(lines: PricingLine[]): RateSummary {
  const calculated = lines.filter(l => l.status === "calculated");
  const amount = Math.round(calculated.reduce((sum, l) => sum + l.amount, 0) * 100) / 100;
  const distinctRates = Array.from(
    new Map(calculated.filter(l => l.unitPrice !== undefined).map(l => [`${l.unitPrice}|${l.unit}`, { unitPrice: l.unitPrice as number, unit: l.unit }])).values()
  );
  return { amount, distinctRates, hasData: calculated.length > 0 };
}

function RateCell({ summary }: { summary: RateSummary }) {
  if (!summary.hasData || !summary.distinctRates.length) return <span className="qc-empty">—</span>;
  if (summary.distinctRates.length === 1) return <span>{money(summary.distinctRates[0].unitPrice)} / {summary.distinctRates[0].unit}</span>;
  return <span className="qc-empty">Plusieurs taux — voir détail ci-dessous</span>;
}

function AmountCell({ summary }: { summary: RateSummary }) {
  return summary.hasData ? <strong>{money(summary.amount)}</strong> : <span className="qc-empty">—</span>;
}

// Détail ligne par ligne — affiché uniquement quand une catégorie combine plusieurs taux distincts,
// pour rester fidèle aux données sans jamais réduire l'information à un taux inventé.
function RateBreakdown({ lines }: { lines: PricingLine[] }) {
  const calculated = lines.filter(l => l.status === "calculated");
  return <tr className="qc-detail-row"><td colSpan={4}><div className="qc-detail">{calculated.map((line, i) => <div key={i}>{line.sourceDate} — {line.description} : {line.unitPrice !== undefined ? money(line.unitPrice) : "—"} / {line.unit} × {line.quantity} = {money(line.amount)}</div>)}</div></td></tr>;
}

export function TuitionQuebecPrintPage({ id }: { id: string }) {
  const { profile } = useAuth();
  const [form, setForm] = useState<TuitionTaxForm | null | undefined>(undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    if (profile?.role !== "Administrateur") return;
    return subscribeTuitionTaxFormById(id, setForm, e => setError(e.message));
  }, [id, profile?.role]);

  if (profile?.role !== "Administrateur") return <AccessDenied />;
  if (error) return <main className="quote-print-status">{error}</main>;
  if (form === undefined) return <main className="quote-print-status">Chargement du dossier…</main>;
  if (form === null) return <main className="quote-print-status">Dossier fiscal introuvable.</main>;
  if (form.status !== "Finalisé") return <main className="quote-print-status">Ce dossier fiscal doit être finalisé avant de pouvoir produire le formulaire.</main>;

  const institution = form.institutionSnapshot;
  const student = form.studentSnapshot;
  const pricing = form.calculatedPricing;
  // A) Instruction au sol = formation théorique admissible + préparation au sol individuelle +
  // simulateur — le formulaire officiel TP-752.0.18.10 le confirme explicitement
  // (« Instruction au sol (théorie, technique, simulation de vol) »).
  const groundLines = [...(pricing?.theory || []), ...(pricing?.ground || []), ...(pricing?.simulator || [])];
  const dualLines = pricing?.dualFlight || [];
  const soloLines = pricing?.soloFlight || [];
  const groundSummary = summarizeCalculated(groundLines);
  const dualSummary = summarizeCalculated(dualLines);
  const soloSummary = summarizeCalculated(soloLines);
  const categoryIssues = [...groundLines, ...dualLines, ...soloLines].filter(l => l.status !== "calculated").length;
  // Heures déclarées de la catégorie Instruction au sol = théorie + préparation au sol (déjà
  // combinées dans declaredHours.ground) + simulateur, jamais recalculées depuis les PTR.
  const groundDeclaredHours = form.declaredHours.ground + form.declaredHours.simulator;

  return <main className="quote-print-page">
    <style>{`
      @page{size:letter;margin:15mm}
      .qc-sheet{max-width:190mm;margin:0 auto;padding:12mm;background:#fff;color:#12233b;font:12px Arial,sans-serif}
      .qc-title{text-align:center;border-bottom:3px solid #12233b;padding-bottom:12px;margin-bottom:16px}
      .qc-title h1{margin:0;font-size:20px}
      .qc-title p{margin:4px 0 0;font-size:12px}
      .qc-title .year{margin-top:8px;font-size:16px;font-weight:bold}
      .qc-box{border:1px solid #12233b;padding:10px 12px;margin-bottom:12px;break-inside:avoid}
      .qc-box h2{margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #ccd4e0;padding-bottom:4px}
      .qc-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 20px}
      .qc-grid div{display:flex;justify-content:space-between;gap:10px;border-bottom:1px dotted #ccd4e0;padding:3px 0}
      .qc-grid span:first-child{color:#52677e}
      .qc-empty{color:#9aa7b4;font-style:italic}
      .qc-table{width:100%;border-collapse:collapse;margin-top:8px}
      .qc-table th,.qc-table td{border:1px solid #12233b;padding:6px 8px;text-align:center}
      .qc-table th{background:#eef2f7}
      .qc-table td:first-child,.qc-table th:first-child{text-align:left}
      .qc-detail-row td{text-align:left;background:#f8fafc;font-size:10px;color:#374a5e;break-inside:avoid}
      .qc-detail{display:grid;gap:2px}
      .qc-signatures{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:20px}
      .qc-signature-line{margin-top:34px;border-top:1px solid #12233b;padding-top:4px;font-size:10px;color:#52677e}
      .qc-footnote{font-size:10px;color:#52677e;margin-top:14px}
      .qc-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;max-width:190mm;margin:0 auto 16px}
      @media print{.no-print{display:none!important}}
    `}</style>
    <div className="qc-toolbar no-print">
      <a className="button secondary" href="/admin?tab=tuition">Retour</a>
      <button type="button" className="button" onClick={() => window.print()}>Imprimer / enregistrer en PDF</button>
    </div>
    <section className="qc-sheet">
      <header className="qc-title">
        <h1>TP-752.0.18.10</h1>
        <p>Droits de scolarité pour cours de pilotage aérien — Version 2015-10</p>
        <div className="year">Année d'imposition : {form.taxYear}</div>
      </header>

      <div className="qc-box">
        <h2>Section 1 — Établissement d'enseignement</h2>
        <div className="qc-grid">
          <div><span>Nom</span><span>{institution?.name || <span className="qc-empty">—</span>}</span></div>
          <div><span>Numéro d'identification Québec</span><span>{institution?.quebecIdentificationNumber || <span className="qc-empty">—</span>}</span></div>
          <div><span>Adresse</span><span>{institution?.address || <span className="qc-empty">—</span>}</span></div>
          <div><span>Responsable</span><span>{institution?.responsibleName || <span className="qc-empty">—</span>}</span></div>
          <div><span>Ville</span><span>{institution?.city || <span className="qc-empty">—</span>}</span></div>
          <div><span>Fonction du responsable</span><span>{institution?.responsibleTitle || <span className="qc-empty">—</span>}</span></div>
          <div><span>Province</span><span>{institution?.province || <span className="qc-empty">—</span>}</span></div>
          <div><span>Téléphone</span><span>{institution?.phone || <span className="qc-empty">—</span>}</span></div>
          <div><span>Code postal</span><span>{institution?.postalCode || <span className="qc-empty">—</span>}</span></div>
        </div>
      </div>

      <div className="qc-box">
        <h2>Section 2 — Étudiant</h2>
        <div className="qc-grid">
          <div><span>Nom</span><span>{student.lastName}</span></div>
          <div><span>Prénom</span><span>{student.firstName}</span></div>
          <div><span>Adresse</span><span>{student.address || <span className="qc-empty">—</span>}</span></div>
          <div><span>NAS</span><span className="qc-empty">(à compléter par l'étudiant)</span></div>
          <div><span>Ville</span><span>{student.city || <span className="qc-empty">—</span>}</span></div>
          <div><span>Téléphone</span><span>{student.phone || <span className="qc-empty">—</span>}</span></div>
          <div><span>Province</span><span>{student.province || <span className="qc-empty">—</span>}</span></div>
          <div><span>Code postal</span><span>{student.postalCode || <span className="qc-empty">—</span>}</span></div>
        </div>
      </div>

      <div className="qc-box">
        <h2>Section 3 — Cours de pilotage</h2>
        <div className="qc-grid" style={{ marginBottom: 8 }}>
          <div><span>Type de formation</span><span>{form.trainingTypeDeclared}</span></div>
          <div><span>Période d'études</span><span>{form.periodDeclared.start && form.periodDeclared.end ? `${form.periodDeclared.start} → ${form.periodDeclared.end}` : <span className="qc-empty">—</span>}</span></div>
        </div>
        {!pricing && <p className="qc-empty">Ce dossier a été finalisé avant l'implémentation du calcul tarifaire automatique — les taux et montants ne sont pas disponibles pour ce document. Les heures déclarées ci-dessous restent valides.</p>}
        <table className="qc-table">
          <thead><tr><th>Description</th><th>Heures déclarées</th><th>Taux horaire</th><th>Montant</th></tr></thead>
          <tbody>
            <tr><td>Instruction au sol</td><td>{hours(groundDeclaredHours)}</td><td><RateCell summary={groundSummary} /></td><td><AmountCell summary={groundSummary} /></td></tr>
            {groundSummary.distinctRates.length > 1 && <RateBreakdown lines={groundLines} />}
            <tr><td>Double commande</td><td>{hours(form.declaredHours.dualFlight)}</td><td><RateCell summary={dualSummary} /></td><td><AmountCell summary={dualSummary} /></td></tr>
            {dualSummary.distinctRates.length > 1 && <RateBreakdown lines={dualLines} />}
            <tr><td>Solo</td><td>{hours(form.declaredHours.soloFlight)}</td><td><RateCell summary={soloSummary} /></td><td><AmountCell summary={soloSummary} /></td></tr>
            {soloSummary.distinctRates.length > 1 && <RateBreakdown lines={soloLines} />}
          </tbody>
        </table>
        {categoryIssues > 0 && <p className="qc-empty">{categoryIssues} activité(s) « à confirmer » dans le dossier fiscal ne sont pas incluses dans les montants ci-dessus.</p>}
        <div className="qc-grid" style={{ marginTop: 10 }}>
          <div><span>Somme payée pour l'année</span><strong>{money(form.amountPaid)}</strong></div>
        </div>
      </div>

      <div className="qc-signatures">
        <div><span>{institution?.responsibleName || ""}</span><div className="qc-signature-line">Signature du responsable de l'établissement — Date</div></div>
        <div><span>&nbsp;</span><div className="qc-signature-line">Signature de l'étudiant — Date</div></div>
      </div>

      <p className="qc-footnote">Document préparé par Orizon Aviation à partir du dossier fiscal finalisé. Les taux et montants proviennent des tarifs historiques figés au moment de la finalisation — jamais recalculés depuis les tarifs courants.</p>
    </section>
  </main>;
}

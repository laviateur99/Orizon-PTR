"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import { subscribeTuitionTaxFormById } from "./firestore";
import type { TuitionTaxForm } from "./types";

const money = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0).toLocaleString("fr-CA", { style: "currency", currency: "CAD" });

// Format AA/MM attendu par le T2202, à partir d'une date "AAAA-MM-JJ" sauvegardée dans le dossier.
const yearMonth = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1].slice(2)}/${match[2]}` : "";
};

// Mapping confirmé (règle métier) — jamais le code 4 (hélicoptère), catégorie absente de notre interface.
const courseTypeCode: Record<string, string> = {
  "Pilote privé": "1",
  "Pilote professionnel": "2",
  "Instructeur de vol": "3",
  "Vol aux instruments": "5",
  "Autre": "6"
};

function AccessDenied() {
  return <main className="quote-print-status">Accès non autorisé à ce dossier.</main>;
}

export function TuitionT2202PrintPage({ id }: { id: string }) {
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
  // Structuré en tableau de sessions dès maintenant — une seule entrée pour l'instant (modèle
  // Firestore actuel ne supporte qu'une session), mais l'agrégat ci-dessous reste correct si
  // une évolution future ajoute plusieurs sessions sans changer cette page.
  const sessions = [{ from: form.t2202.sessionStart, to: form.t2202.sessionEnd, partTime: form.t2202.partTimeMonths, fullTime: form.t2202.fullTimeMonths, fees: form.t2202.eligibleTuitionFees }];
  const totalPartTime = sessions.reduce((sum, s) => sum + s.partTime, 0);
  const totalFullTime = sessions.reduce((sum, s) => sum + s.fullTime, 0);
  const totalFees = sessions.reduce((sum, s) => sum + s.fees, 0);

  return <main className="quote-print-page">
    <style>{`
      @page{size:letter;margin:15mm}
      .t2202-sheet{max-width:190mm;margin:0 auto;padding:12mm;background:#fff;color:#12233b;font:12px Arial,sans-serif}
      .t2202-title{text-align:center;border-bottom:3px solid #12233b;padding-bottom:12px;margin-bottom:16px}
      .t2202-title h1{margin:0;font-size:22px;letter-spacing:.05em}
      .t2202-title p{margin:4px 0 0;font-size:13px}
      .t2202-title .year{margin-top:8px;font-size:16px;font-weight:bold}
      .t2202-box{border:1px solid #12233b;padding:10px 12px;margin-bottom:12px;break-inside:avoid}
      .t2202-box h2{margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #ccd4e0;padding-bottom:4px}
      .t2202-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 20px}
      .t2202-grid div{display:flex;justify-content:space-between;gap:10px;border-bottom:1px dotted #ccd4e0;padding:3px 0}
      .t2202-grid span:first-child{color:#52677e}
      .t2202-table{width:100%;border-collapse:collapse;margin-top:8px}
      .t2202-table th,.t2202-table td{border:1px solid #12233b;padding:6px 8px;text-align:center}
      .t2202-table th{background:#eef2f7}
      .t2202-empty{color:#9aa7b4;font-style:italic}
      .t2202-footnote{font-size:10px;color:#52677e;margin-top:14px}
      .t2202-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;max-width:190mm;margin:0 auto 16px}
      @media print{.no-print{display:none!important}}
    `}</style>
    <div className="t2202-toolbar no-print">
      <a className="button secondary" href="/admin?tab=tuition">Retour</a>
      <button type="button" className="button" onClick={() => window.print()}>Imprimer / enregistrer en PDF</button>
    </div>
    <section className="t2202-sheet">
      <header className="t2202-title">
        <h1>T2202</h1>
        <p>Certificat pour frais de scolarité et d'inscription — Tuition and Enrolment Certificate</p>
        <div className="year">Année d'imposition / Tax year : {form.taxYear}</div>
      </header>

      <div className="t2202-box">
        <h2>Établissement d'enseignement / Educational institution</h2>
        <div className="t2202-grid">
          <div><span>Nom</span><span>{institution?.name || <span className="t2202-empty">—</span>}</span></div>
          <div><span>11 — Type d'établissement</span><span>5 — École ou club de pilotage</span></div>
          <div><span>Adresse</span><span>{institution?.address || <span className="t2202-empty">—</span>}</span></div>
          <div><span>12 — Flying school or club</span><span>{form.t2202.courseType ? `${courseTypeCode[form.t2202.courseType] || ""} — ${form.t2202.courseType}` : <span className="t2202-empty">—</span>}</span></div>
          <div><span>Ville</span><span>{institution?.city || <span className="t2202-empty">—</span>}</span></div>
          <div><span>Province</span><span>{institution?.province || <span className="t2202-empty">—</span>}</span></div>
          <div><span>Code postal</span><span>{institution?.postalCode || <span className="t2202-empty">—</span>}</span></div>
          <div><span>13 — Nom du programme ou cours</span><span>{form.t2202.programName || <span className="t2202-empty">—</span>}</span></div>
        </div>
      </div>

      <div className="t2202-box">
        <h2>Étudiant / Student</h2>
        <div className="t2202-grid">
          <div><span>Prénom</span><span>{student.firstName}</span></div>
          <div><span>Nom</span><span>{student.lastName}</span></div>
          <div><span>Adresse</span><span>{student.address || <span className="t2202-empty">—</span>}</span></div>
          <div><span>NAS / SIN</span><span className="t2202-empty">(à compléter par l'étudiant)</span></div>
          <div><span>Ville</span><span>{student.city || <span className="t2202-empty">—</span>}</span></div>
          <div><span>Province</span><span>{student.province || <span className="t2202-empty">—</span>}</span></div>
          <div><span>Code postal</span><span>{student.postalCode || <span className="t2202-empty">—</span>}</span></div>
          <div><span>Numéro étudiant</span><span>{student.studentNumber || <span className="t2202-empty">—</span>}</span></div>
        </div>
      </div>

      <div className="t2202-box">
        <h2>Session</h2>
        <table className="t2202-table">
          <thead><tr><th>19 — Du</th><th>20 — Au</th><th>21 — Mois temps partiel</th><th>22 — Mois temps plein</th><th>23 — Frais admissibles</th></tr></thead>
          <tbody>{sessions.map((s, i) => <tr key={i}><td>{yearMonth(s.from) || "—"}</td><td>{yearMonth(s.to) || "—"}</td><td>{s.partTime}</td><td>{s.fullTime}</td><td>{money(s.fees)}</td></tr>)}</tbody>
          <tfoot><tr><th colSpan={2}>Totaux</th><th>24 — {totalPartTime}</th><th>25 — {totalFullTime}</th><th>26 — {money(totalFees)}</th></tr></tfoot>
        </table>
      </div>

      <p className="t2202-footnote">Document préparé par Orizon Aviation à des fins de production du feuillet T2202. Le numéro de compte de déclarant (RZ) n'est pas affiché sur cette copie.</p>
    </section>
  </main>;
}

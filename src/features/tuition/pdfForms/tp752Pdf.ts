import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PricingLine, TrainingTypeDeclared, TuitionTaxForm } from "../types";
import { TP752_FORM_PATH } from "./versions";

const PAGE_HEIGHT = 792;
const money = (value: number) => value.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
const round2 = (value: number) => Math.round(value * 100) / 100;

// AAAA-MM-JJ -> {annee: "AA", mois: "MM"} pour les cases Année/Mois du formulaire officiel.
// Présentation uniquement — periodDeclared n'est jamais modifié.
function yearMonth(value: string): { annee: string; mois: string } {
  const match = value.match(/^(\d{4})-(\d{2})/);
  return match ? { annee: match[1].slice(2), mois: match[2] } : { annee: "", mois: "" };
}

// Coordonnées mesurées directement sur le PDF officiel TP-752.0.18.10 (2015-10), page Lettre
// 612x792pt — { x, yBottom } où yBottom est la position (depuis le HAUT de la page) du bas de la
// zone d'écriture, convertie en coordonnée PDF (origine en bas) au moment du dessin.
const COORD = {
  institutionName: { x: 30, yBottom: 234.1 },
  institutionId: { x: 470, yBottom: 228 },
  institutionAddress: { x: 30, yBottom: 260.1 },
  institutionPostalCode: { x: 517, yBottom: 254 },
  // Dernière ligne de la section : l'écart avant l'en-tête "2 Renseignements..." (299) est plus
  // grand que la hauteur réelle de la case (rythme de 26pt entre lignes, comme les lignes
  // précédentes) — utiliser ce rythme plutôt que l'écart jusqu'au prochain repère évite de
  // dessiner trop bas, dans l'espace mort entre la case et le titre de section suivant.
  institutionResponsible: { x: 30, yBottom: 284 },
  institutionPhone: { x: 466, yBottom: 284 },
  studentLastName: { x: 30, yBottom: 339.9 },
  studentFirstName: { x: 330, yBottom: 339.9 },
  // Même correction que ci-dessus pour la dernière ligne de la section étudiant.
  studentAddress: { x: 30, yBottom: 364 },
  studentPostalCode: { x: 517, yBottom: 364 }
} as const;

// Les 6 lignes officielles "Type de cours" (une seule est remplie par dossier, jamais toutes) —
// bas de ligne (depuis le haut) mesuré sur le PDF, 16pt d'écart régulier entre lignes.
const ROW_BOTTOM: Record<TrainingTypeDeclared | "Autre_fallback", number> = {
  PPL: 479.0,
  CPL: 495.0,
  "Vol de nuit": 511.0,
  IFR: 527.0,
  Instructeur: 543.0,
  Autre: 559.0,
  // "Multimoteur" n'a pas de ligne officielle dédiée sur le TP-752 — traité comme "Autre" avec
  // précision explicite (voir mapping dans buildTp752Pdf) ; conservé ici pour lisibilité du type.
  Multimoteur: 559.0,
  Autre_fallback: 559.0
};

const COLUMN_X = {
  solHeures: 172, solTarif: 205,
  doubleHeures: 252, doubleTarif: 287,
  soloHeures: 332, soloTarif: 367,
  periodeDeAnnee: 413, periodeDeMois: 438, periodeAAnnee: 458, periodeAMois: 483,
  sommePayee: 517
} as const;

type RateSummary = { montant: number; heures: number; tauxEffectif: number | null };

// Taux moyen pondéré = montant total finalisé / heures déclarées totales — jamais une moyenne
// simple des tarifs, conformément à la décision métier approuvée. Le montant utilisé reste
// toujours la somme exacte des PricingLine "calculated" ; le taux arrondi à 2 décimales n'est
// qu'une représentation d'affichage, jamais recalculé pour en dériver un nouveau montant.
function weightedRate(lines: PricingLine[], declaredHours: number): RateSummary {
  const montant = round2(lines.filter(l => l.status === "calculated").reduce((sum, l) => sum + l.amount, 0));
  const tauxEffectif = declaredHours > 0 ? Math.round((montant / declaredHours) * 100) / 100 : null;
  return { montant, heures: declaredHours, tauxEffectif };
}

/**
 * Remplit le vrai TP-752.0.18.10 officiel de Revenu Québec (gabarit statique sans AcroForm,
 * TP752_FORM_VERSION) à partir d'un dossier fiscal FINALISÉ uniquement, par overlay vectoriel —
 * le fond officiel n'est jamais redessiné ni rastérisé. Retourne les octets du PDF final.
 */
export async function buildTp752Pdf(taxForm: TuitionTaxForm): Promise<Uint8Array> {
  const templateBytes = await readFile(join(process.cwd(), "public", TP752_FORM_PATH));
  const pdf = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  const page = pdf.getPage(0);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const black = rgb(0, 0, 0);

  const draw = (value: string, x: number, yBottom: number, size = 8) => {
    if (!value) return;
    page.drawText(value, { x, y: PAGE_HEIGHT - yBottom, size, font, color: black });
  };

  const institution = taxForm.institutionSnapshot;
  const student = taxForm.studentSnapshot;

  // Section 1 — établissement. Numéro d'identification Québec : valeur déjà figée dans le
  // snapshot institutionnel finalisé (jamais une deuxième source de vérité recréée ici).
  draw(institution?.name || "", COORD.institutionName.x, COORD.institutionName.yBottom);
  draw(institution?.quebecIdentificationNumber || "", COORD.institutionId.x, COORD.institutionId.yBottom);
  draw(institution?.address || "", COORD.institutionAddress.x, COORD.institutionAddress.yBottom);
  draw(institution?.postalCode || "", COORD.institutionPostalCode.x, COORD.institutionPostalCode.yBottom);
  draw(institution?.responsibleName || "", COORD.institutionResponsible.x, COORD.institutionResponsible.yBottom);
  draw(institution?.phone || "", COORD.institutionPhone.x, COORD.institutionPhone.yBottom);

  // Section 2 — étudiant. NAS volontairement absent : jamais lu, jamais référencé, jamais dessiné.
  draw(student.lastName, COORD.studentLastName.x, COORD.studentLastName.yBottom);
  draw(student.firstName, COORD.studentFirstName.x, COORD.studentFirstName.yBottom);
  draw(student.address || "", COORD.studentAddress.x, COORD.studentAddress.yBottom);
  draw(student.postalCode || "", COORD.studentPostalCode.x, COORD.studentPostalCode.yBottom);

  // Section 3 — une seule ligne remplie, celle correspondant à trainingTypeDeclared ; jamais
  // toutes les lignes. "Multimoteur" n'a pas de case officielle dédiée : traité comme "Autre"
  // avec précision explicite (jugement métier signalé au rapport, à valider si nécessaire).
  const declared = taxForm.trainingTypeDeclared;
  const rowKey: keyof typeof ROW_BOTTOM = declared === "Multimoteur" ? "Autre" : declared;
  const rowBottom = ROW_BOTTOM[rowKey] ?? ROW_BOTTOM.Autre;
  if (rowKey === "Autre") {
    const precision = declared === "Multimoteur" ? "Multimoteur" : (taxForm.programName || taxForm.t2202.programName || "");
    draw(precision, 82, rowBottom, 7);
  }

  const pricing = taxForm.calculatedPricing;
  const sol = weightedRate([...(pricing?.theory || []), ...(pricing?.ground || []), ...(pricing?.simulator || [])], taxForm.declaredHours.ground + taxForm.declaredHours.simulator);
  const double = weightedRate(pricing?.dualFlight || [], taxForm.declaredHours.dualFlight);
  const solo = weightedRate(pricing?.soloFlight || [], taxForm.declaredHours.soloFlight);

  draw(sol.heures ? sol.heures.toFixed(1) : "", COLUMN_X.solHeures, rowBottom, 7);
  draw(sol.tauxEffectif !== null ? money(sol.tauxEffectif) : "", COLUMN_X.solTarif, rowBottom, 6.5);
  draw(double.heures ? double.heures.toFixed(1) : "", COLUMN_X.doubleHeures, rowBottom, 7);
  draw(double.tauxEffectif !== null ? money(double.tauxEffectif) : "", COLUMN_X.doubleTarif, rowBottom, 6.5);
  draw(solo.heures ? solo.heures.toFixed(1) : "", COLUMN_X.soloHeures, rowBottom, 7);
  draw(solo.tauxEffectif !== null ? money(solo.tauxEffectif) : "", COLUMN_X.soloTarif, rowBottom, 6.5);

  const from = yearMonth(taxForm.periodDeclared.start);
  const to = yearMonth(taxForm.periodDeclared.end);
  draw(from.annee, COLUMN_X.periodeDeAnnee, rowBottom, 7);
  draw(from.mois, COLUMN_X.periodeDeMois, rowBottom, 7);
  draw(to.annee, COLUMN_X.periodeAAnnee, rowBottom, 7);
  draw(to.mois, COLUMN_X.periodeAMois, rowBottom, 7);

  // Somme payée : amountPaid FINALISÉ tel quel, jamais calculatedPricing.grandTotal — une seule
  // ligne remplie dans notre workflow actuel (un dossier = un type de formation), donc placée ici
  // sans ventilation inventée entre plusieurs lignes.
  draw(money(taxForm.amountPaid), COLUMN_X.sommePayee, rowBottom, 7);

  // Signatures (parties 4 et 5) : le nom du responsable est déjà indiqué à la section 1 — les
  // lignes de signature elles-mêmes (responsable et étudiant) restent entièrement vierges sur le
  // fond officiel, jamais de signature fabriquée.

  return pdf.save();
}

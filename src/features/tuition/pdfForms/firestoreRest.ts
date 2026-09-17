import type { CalculatedPricing, PricingLine, PricingLineStatus, TuitionInstitutionSnapshot, TuitionT2202, TuitionTaxForm } from "../types";

/**
 * Lecture du dossier fiscal côté serveur (route API Node.js) via l'API REST Firestore, avec le
 * jeton d'authentification Firebase de l'admin déjà connecté — jamais via firebase-admin (aucun
 * compte de service/variable d'environnement supplémentaire n'est disponible pour ce projet).
 * Les Règles de sécurité Firestore (déjà en place, mêmes que pour le SDK client) s'appliquent
 * identiquement à ces requêtes REST : un jeton qui n'appartient pas à un Administrateur actif se
 * fait refuser par Firestore lui-même, avant même d'atteindre ce code. Le serveur ne fait donc
 * jamais confiance à des valeurs fiscales envoyées par le navigateur — seul l'identifiant du
 * dossier transite, et son contenu est systématiquement relu ici depuis Firestore.
 */

export class TuitionFormAccessError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type FirestoreValue = {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  nullValue?: null;
  timestampValue?: string;
  mapValue?: { fields?: Record<string, FirestoreValue> };
  arrayValue?: { values?: FirestoreValue[] };
};

function decodeValue(value: FirestoreValue | undefined): unknown {
  if (!value) return undefined;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.integerValue !== undefined) return Number(value.integerValue);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.timestampValue !== undefined) return value.timestampValue;
  if (value.nullValue !== undefined) return undefined;
  if (value.mapValue) return decodeFields(value.mapValue.fields || {});
  if (value.arrayValue) return (value.arrayValue.values || []).map(decodeValue);
  return undefined;
}

function decodeFields(fields: Record<string, FirestoreValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) out[key] = decodeValue(value);
  return out;
}

const text = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
const number = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

const pricingStatuses: PricingLineStatus[] = ["calculated", "rate_missing", "rate_ambiguous", "source_unconfirmed"];
function decodePricingLine(value: unknown): PricingLine | undefined {
  if (!value || typeof value !== "object") return undefined;
  const d = value as Record<string, unknown>;
  const status = pricingStatuses.includes(d.status as PricingLineStatus) ? (d.status as PricingLineStatus) : "source_unconfirmed";
  return {
    description: text(d.description), sourceDate: text(d.sourceDate),
    rateId: text(d.rateId) || undefined, rateName: text(d.rateName) || undefined,
    unitPrice: typeof d.unitPrice === "number" ? d.unitPrice : undefined,
    quantity: number(d.quantity), unit: text(d.unit), amount: number(d.amount), status,
    note: text(d.note) || undefined
  };
}
const decodePricingLines = (value: unknown): PricingLine[] => Array.isArray(value) ? value.map(decodePricingLine).filter((x): x is PricingLine => Boolean(x)) : [];

function decodeCalculatedPricing(value: unknown): CalculatedPricing | undefined {
  if (!value || typeof value !== "object") return undefined;
  const d = value as Record<string, unknown>;
  const totals = (d.totals as Record<string, unknown>) || {};
  return {
    theory: decodePricingLines(d.theory), ground: decodePricingLines(d.ground), dualFlight: decodePricingLines(d.dualFlight),
    soloFlight: decodePricingLines(d.soloFlight), simulator: decodePricingLines(d.simulator),
    totals: {
      theory: number(totals.theory), ground: number(totals.ground), dualFlight: number(totals.dualFlight),
      soloFlight: number(totals.soloFlight), simulator: number(totals.simulator), grandTotal: number(totals.grandTotal)
    },
    issues: decodePricingLines(d.issues)
  };
}

function decodeInstitutionSnapshot(value: unknown): TuitionInstitutionSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined;
  const d = value as Record<string, unknown>;
  return {
    name: text(d.name), address: text(d.address), city: text(d.city), province: text(d.province), postalCode: text(d.postalCode),
    phone: text(d.phone), quebecIdentificationNumber: text(d.quebecIdentificationNumber),
    responsibleName: text(d.responsibleName), responsibleTitle: text(d.responsibleTitle),
    craT2202FilerAccountNumber: text(d.craT2202FilerAccountNumber)
  };
}

function decodeT2202(value: unknown): TuitionT2202 {
  const d = (value as Record<string, unknown>) || {};
  const courseType = text(d.courseType);
  return {
    courseType: (["Pilote privé", "Pilote professionnel", "Instructeur de vol", "Vol aux instruments", "Autre"].includes(courseType) ? courseType : "") as TuitionT2202["courseType"],
    programName: text(d.programName), sessionStart: text(d.sessionStart), sessionEnd: text(d.sessionEnd),
    partTimeMonths: number(d.partTimeMonths), fullTimeMonths: number(d.fullTimeMonths), eligibleTuitionFees: number(d.eligibleTuitionFees)
  };
}

// Miroir de mapForm (features/tuition/firestore.ts) mais à partir des champs REST déjà décodés en
// valeurs JS natives — même forme de sortie, pour ne jamais diverger des règles déjà en place.
function decodeForm(id: string, fields: Record<string, unknown>): TuitionTaxForm {
  const snapshot = (fields.studentSnapshot as Record<string, unknown>) || {};
  const calculated = (fields.calculatedHours as Record<string, unknown>) || {};
  const declared = (fields.declaredHours as Record<string, unknown>) || {};
  const periodCalculated = fields.periodCalculated as Record<string, unknown> | undefined;
  const periodDeclared = (fields.periodDeclared as Record<string, unknown>) || {};
  const preparedBy = (fields.preparedBy as Record<string, unknown>) || {};
  const finalizedBy = fields.finalizedBy as Record<string, unknown> | undefined;
  return {
    id,
    studentId: text(fields.studentId),
    taxYear: typeof fields.taxYear === "number" ? fields.taxYear : Number(fields.taxYear) || new Date().getFullYear(),
    status: text(fields.status, "Brouillon") === "Finalisé" ? "Finalisé" : "Brouillon",
    studentSnapshot: {
      firstName: text(snapshot.firstName), lastName: text(snapshot.lastName), address: text(snapshot.address),
      city: text(snapshot.city), province: text(snapshot.province), postalCode: text(snapshot.postalCode),
      studentNumber: text(snapshot.studentNumber), phone: text(snapshot.phone), email: text(snapshot.email)
    },
    calculatedHours: {
      theory: number(calculated.theory), groundPreparation: number(calculated.groundPreparation), groundTotal: number(calculated.groundTotal),
      dualFlight: number(calculated.dualFlight), soloFlight: number(calculated.soloFlight), simulator: number(calculated.simulator)
    },
    declaredHours: {
      ground: number(declared.ground), dualFlight: number(declared.dualFlight), soloFlight: number(declared.soloFlight), simulator: number(declared.simulator)
    },
    periodCalculated: periodCalculated ? { start: text(periodCalculated.start), end: text(periodCalculated.end) } : null,
    periodDeclared: { start: text(periodDeclared.start), end: text(periodDeclared.end) },
    trainingTypeDeclared: (text(fields.trainingTypeDeclared, "Autre")) as TuitionTaxForm["trainingTypeDeclared"],
    programId: text(fields.programId) || undefined,
    programName: text(fields.programName) || undefined,
    amountPaid: number(fields.amountPaid),
    t2202: decodeT2202(fields.t2202),
    calculatedPricing: decodeCalculatedPricing(fields.calculatedPricing),
    institutionSnapshot: decodeInstitutionSnapshot(fields.institutionSnapshot),
    finalizedAt: fields.finalizedAt,
    finalizedBy: finalizedBy ? { uid: text(finalizedBy.uid), name: text(finalizedBy.name) } : undefined,
    preparedBy: { uid: text(preparedBy.uid), name: text(preparedBy.name) },
    createdAt: fields.createdAt,
    updatedAt: fields.updatedAt
  };
}

/**
 * Récupère un dossier fiscal FINALISÉ par id, en imposant le jeton Firebase de l'appelant.
 * Lève TuitionFormAccessError(403) si Firestore refuse (non-admin ou non authentifié),
 * (404) si le dossier n'existe pas, (409) si trouvé mais non finalisé.
 */
export async function fetchFinalizedTuitionForm(id: string, idToken: string): Promise<TuitionTaxForm> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) throw new TuitionFormAccessError(500, "Configuration Firebase manquante côté serveur.");
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/tuitionTaxForms/${encodeURIComponent(id)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` }, cache: "no-store" });
  if (response.status === 404) throw new TuitionFormAccessError(404, "Dossier fiscal introuvable.");
  if (response.status === 401 || response.status === 403) throw new TuitionFormAccessError(403, "Missing or insufficient permissions.");
  if (!response.ok) throw new TuitionFormAccessError(response.status, `Lecture du dossier fiscal impossible (${response.status}).`);
  const data = (await response.json()) as { fields?: Record<string, FirestoreValue> };
  const form = decodeForm(id, decodeFields(data.fields || {}));
  if (form.status !== "Finalisé") throw new TuitionFormAccessError(409, "Ce dossier fiscal doit être finalisé avant de pouvoir produire le formulaire.");
  return form;
}

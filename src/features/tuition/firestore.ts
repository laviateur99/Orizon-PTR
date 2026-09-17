import { doc, onSnapshot, serverTimestamp, setDoc, updateDoc, type DocumentData, type FirestoreError, type Unsubscribe } from "firebase/firestore";
import { db } from "@/services/firebase/client";
import type { CalculatedPricing, PricingLine, PricingLineStatus, TuitionInstitutionSnapshot, TuitionT2202, TuitionTaxForm, TuitionTaxSettings } from "./types";

const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
const withoutUndefined = (value: unknown): unknown =>
  Array.isArray(value) ? value.map(withoutUndefined)
  : value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype
    ? Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, withoutUndefined(item)]))
    : value;

// Un seul dossier fiscal par étudiant et par année : l'ID du document est déterministe
// (studentId_taxYear) plutôt qu'auto-généré, ce qui rend un doublon involontaire impossible.
export const tuitionFormId = (studentId: string, taxYear: number) => `${studentId}_${taxYear}`;

function mapT2202(value: unknown): TuitionT2202 {
  const data = (value as Record<string, unknown>) || {};
  const courseType = text(data.courseType);
  return {
    courseType: (courseType === "Pilote privé" || courseType === "Pilote professionnel" || courseType === "Instructeur de vol" || courseType === "Vol aux instruments" || courseType === "Autre" ? courseType : "") as TuitionT2202["courseType"],
    programName: text(data.programName),
    sessionStart: text(data.sessionStart),
    sessionEnd: text(data.sessionEnd),
    partTimeMonths: number(data.partTimeMonths),
    fullTimeMonths: number(data.fullTimeMonths),
    eligibleTuitionFees: number(data.eligibleTuitionFees)
  };
}

function mapInstitutionSnapshot(value: unknown): TuitionInstitutionSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined;
  const data = value as Record<string, unknown>;
  return {
    name: text(data.name), address: text(data.address), city: text(data.city), province: text(data.province), postalCode: text(data.postalCode),
    phone: text(data.phone), quebecIdentificationNumber: text(data.quebecIdentificationNumber),
    responsibleName: text(data.responsibleName), responsibleTitle: text(data.responsibleTitle),
    craT2202FilerAccountNumber: text(data.craT2202FilerAccountNumber)
  };
}

const pricingStatuses: PricingLineStatus[] = ["calculated", "rate_missing", "rate_ambiguous", "source_unconfirmed"];
function mapPricingLine(value: unknown): PricingLine | undefined {
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
function mapPricingLines(value: unknown): PricingLine[] {
  return Array.isArray(value) ? value.map(mapPricingLine).filter((item): item is PricingLine => Boolean(item)) : [];
}
function mapCalculatedPricing(value: unknown): CalculatedPricing | undefined {
  if (!value || typeof value !== "object") return undefined;
  const d = value as Record<string, unknown>;
  const totals = (d.totals as Record<string, unknown>) || {};
  return {
    theory: mapPricingLines(d.theory), ground: mapPricingLines(d.ground), dualFlight: mapPricingLines(d.dualFlight),
    soloFlight: mapPricingLines(d.soloFlight), simulator: mapPricingLines(d.simulator),
    totals: {
      theory: number(totals.theory), ground: number(totals.ground), dualFlight: number(totals.dualFlight),
      soloFlight: number(totals.soloFlight), simulator: number(totals.simulator), grandTotal: number(totals.grandTotal)
    },
    issues: mapPricingLines(d.issues)
  };
}

function mapForm(id: string, data: DocumentData): TuitionTaxForm {
  const snapshot = (data.studentSnapshot as Record<string, unknown>) || {};
  const calculated = (data.calculatedHours as Record<string, unknown>) || {};
  const declared = (data.declaredHours as Record<string, unknown>) || {};
  const periodCalculated = data.periodCalculated as Record<string, unknown> | null | undefined;
  const periodDeclared = (data.periodDeclared as Record<string, unknown>) || {};
  const preparedBy = (data.preparedBy as Record<string, unknown>) || {};
  const finalizedBy = data.finalizedBy as Record<string, unknown> | undefined;
  return {
    id,
    studentId: text(data.studentId),
    taxYear: typeof data.taxYear === "number" ? data.taxYear : Number(data.taxYear) || new Date().getFullYear(),
    status: text(data.status, "Brouillon") === "Finalisé" ? "Finalisé" : "Brouillon",
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
    trainingTypeDeclared: (text(data.trainingTypeDeclared, "Autre")) as TuitionTaxForm["trainingTypeDeclared"],
    programId: text(data.programId) || undefined,
    programName: text(data.programName) || undefined,
    amountPaid: number(data.amountPaid),
    t2202: mapT2202(data.t2202),
    calculatedPricing: mapCalculatedPricing(data.calculatedPricing),
    institutionSnapshot: mapInstitutionSnapshot(data.institutionSnapshot),
    finalizedAt: data.finalizedAt,
    finalizedBy: finalizedBy ? { uid: text(finalizedBy.uid), name: text(finalizedBy.name) } : undefined,
    preparedBy: { uid: text(preparedBy.uid), name: text(preparedBy.name) },
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  };
}

export function subscribeTuitionTaxForm(
  studentId: string,
  taxYear: number,
  next: (value: TuitionTaxForm | null) => void,
  error: (e: FirestoreError) => void
): Unsubscribe {
  return onSnapshot(doc(db, "tuitionTaxForms", tuitionFormId(studentId, taxYear)), snap => next(snap.exists() ? mapForm(snap.id, snap.data()) : null), error);
}

// Pour les routes d'impression, qui ne connaissent que l'ID du document (déjà = studentId_taxYear).
export function subscribeTuitionTaxFormById(id: string, next: (value: TuitionTaxForm | null) => void, error: (e: FirestoreError) => void): Unsubscribe {
  return onSnapshot(doc(db, "tuitionTaxForms", id), snap => next(snap.exists() ? mapForm(snap.id, snap.data()) : null), error);
}

export async function saveTuitionTaxForm(form: TuitionTaxForm, exists: boolean) {
  const id = tuitionFormId(form.studentId, form.taxYear);
  const { id: _omit, ...data } = form;
  void _omit;
  const payload = withoutUndefined(data) as Record<string, unknown>;
  const ref = doc(db, "tuitionTaxForms", id);
  if (exists) await updateDoc(ref, { ...payload, updatedAt: serverTimestamp() });
  else await setDoc(ref, { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return id;
}

/**
 * Finalise un dossier : fige un institutionSnapshot (les paramètres institutionnels actuels)
 * dans le document, marque le statut "Finalisé" avec finalizedAt/finalizedBy. Les valeurs
 * calculatedHours/declaredHours déjà présentes dans `form` sont écrites telles quelles —
 * aucun recalcul depuis les PTR n'a lieu ici.
 */
export async function finalizeTuitionTaxForm(form: TuitionTaxForm, exists: boolean, institutionSnapshot: TuitionInstitutionSnapshot, finalizedBy: { uid: string; name: string }) {
  const id = tuitionFormId(form.studentId, form.taxYear);
  const { id: _omit, ...data } = form;
  void _omit;
  const payload = withoutUndefined({ ...data, status: "Finalisé", institutionSnapshot, finalizedAt: serverTimestamp(), finalizedBy }) as Record<string, unknown>;
  const ref = doc(db, "tuitionTaxForms", id);
  if (exists) await updateDoc(ref, { ...payload, updatedAt: serverTimestamp() });
  else await setDoc(ref, { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return id;
}

// Paramètres institutionnels — document singleton, sur le même patron que trainingQuoteSettings/taxes.
export function subscribeTuitionTaxSettings(next: (value: TuitionTaxSettings) => void, error: (e: FirestoreError) => void): Unsubscribe {
  return onSnapshot(doc(db, "tuitionTaxSettings", "default"), snap => {
    const d = snap.data();
    next({
      institutionName: text(d?.institutionName),
      institutionAddress: text(d?.institutionAddress),
      institutionCity: text(d?.institutionCity),
      institutionProvince: text(d?.institutionProvince),
      institutionPostalCode: text(d?.institutionPostalCode),
      institutionPhone: text(d?.institutionPhone),
      // Valeur institutionnelle actuelle utilisée comme repli tant qu'aucun document n'a encore
      // été enregistré — modifiable ensuite dans les paramètres, jamais codée ailleurs dans l'UI.
      quebecIdentificationNumber: typeof d?.quebecIdentificationNumber === "string" && d.quebecIdentificationNumber ? d.quebecIdentificationNumber : "1762178024",
      // Jamais préempli : le numéro RZ sera saisi seulement lorsqu'il sera confirmé.
      craT2202FilerAccountNumber: text(d?.craT2202FilerAccountNumber),
      institutionResponsibleName: text(d?.institutionResponsibleName),
      institutionResponsibleTitle: text(d?.institutionResponsibleTitle),
      updatedAt: d?.updatedAt
    });
  }, error);
}

export async function saveTuitionTaxSettings(settings: TuitionTaxSettings) {
  await setDoc(doc(db, "tuitionTaxSettings", "default"), { ...withoutUndefined(settings) as Record<string, unknown>, updatedAt: serverTimestamp() }, { merge: true });
}

import { doc, onSnapshot, serverTimestamp, setDoc, updateDoc, type DocumentData, type FirestoreError, type Unsubscribe } from "firebase/firestore";
import { db } from "@/services/firebase/client";
import type { TuitionTaxForm } from "./types";

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

function mapForm(id: string, data: DocumentData): TuitionTaxForm {
  const snapshot = (data.studentSnapshot as Record<string, unknown>) || {};
  const calculated = (data.calculatedHours as Record<string, unknown>) || {};
  const declared = (data.declaredHours as Record<string, unknown>) || {};
  const periodCalculated = data.periodCalculated as Record<string, unknown> | null | undefined;
  const periodDeclared = (data.periodDeclared as Record<string, unknown>) || {};
  const preparedBy = (data.preparedBy as Record<string, unknown>) || {};
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

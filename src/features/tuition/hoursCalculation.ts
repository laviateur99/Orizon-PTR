import type { StudentReservation } from "@/features/students/types";
import type { TheorySession } from "@/features/theory/types";
import type { TuitionCalculatedHours, TuitionPeriod } from "./types";

// Reprend scheduledHours() de StudentDetailPage.tsx : durée planifiée HH:MM en heures décimales.
const scheduledHours = (start: string, end: string) => {
  const parse = (value: string) => {
    const match = value.match(/^(\d{1,2}):(\d{2})$/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : undefined;
  };
  const from = parse(start), to = parse(end);
  return from !== undefined && to !== undefined && to >= from ? (to - from) / 60 : 0;
};

// Reprend la logique de PTRPrintPage.tsx : Hobbs réel, repli sur airtimeMinutes/60.
const flightHours = (item: StudentReservation) =>
  item.hobbsStart !== undefined && item.hobbsEnd !== undefined
    ? Math.max(0, item.hobbsEnd - item.hobbsStart)
    : (item.airtimeMinutes || 0) / 60;

const round = (value: number) => Math.round(value * 10) / 10;
const inYear = (date: string, taxYear: number) => date.slice(0, 4) === String(taxYear);

// Classification confirmée (règle métier) : types de réservation comptant comme double
// commande / solo pour le calcul fiscal. "Supervision solo" reste volontairement exclu.
const dualFlightTypes = ["Double commande", "Vol de P/D double"];
const soloFlightTypes = ["Solo", "Vol de P/D solo", "Test en vol", "Vol de navigation AEC DEC"];

const isGroundPreparation = (item: StudentReservation) => item.type === "Sol" && item.attendanceStatus === undefined;

/**
 * Calcule les heures d'une année fiscale pour un étudiant, à partir des données
 * PTR/théorie réellement existantes (lecture seule — n'écrit jamais dans ces collections).
 *
 * Sources et règles confirmées :
 * - theory : theorySessions, status "Complétée", attendance[studentId] === "Présent".
 * - groundPreparation : reservations "Sol" complétées, attendanceStatus === undefined
 *   (distinction reprise de StudentDetailPage.tsx : "Sol" + attendanceStatus "Présent" est un
 *   suivi de présence différent du "Sol" de préparation individuelle utilisé ici).
 * - dualFlight : "Double commande", "Vol de P/D double".
 * - soloFlight : "Solo", "Vol de P/D solo", "Test en vol", "Vol de navigation AEC DEC".
 * - simulator : reservations "Simulateur" complétées, groundTimeHours avec repli sur la durée planifiée.
 *
 * NE PAS confondre avec l'admissibilité au module fiscal Orizon (étudiants AEC/DEC Mérici) :
 * cette fonction ne fait AUCUN filtrage par admissibilité — voir le rapport d'analyse associé.
 */
export function calculateTuitionHours(
  studentId: string,
  taxYear: number,
  reservations: StudentReservation[],
  theorySessions: TheorySession[]
): TuitionCalculatedHours {
  const completed = reservations.filter(item => item.status === "Complété" && inYear(item.date, taxYear));
  const theory = theorySessions
    .filter(item => item.status === "Complétée" && item.attendance[studentId] === "Présent" && inYear(item.date, taxYear))
    .reduce((sum, item) => sum + scheduledHours(item.startTime, item.endTime), 0);
  const groundPreparation = completed
    .filter(isGroundPreparation)
    .reduce((sum, item) => sum + (item.groundTimeHours ?? scheduledHours(item.startTime, item.endTime)), 0);
  const dualFlight = completed.filter(item => dualFlightTypes.includes(item.type)).reduce((sum, item) => sum + flightHours(item), 0);
  const soloFlight = completed.filter(item => soloFlightTypes.includes(item.type)).reduce((sum, item) => sum + flightHours(item), 0);
  const simulator = completed
    .filter(item => item.type === "Simulateur")
    .reduce((sum, item) => sum + (item.groundTimeHours ?? scheduledHours(item.startTime, item.endTime)), 0);
  return {
    theory: round(theory),
    groundPreparation: round(groundPreparation),
    groundTotal: round(theory + groundPreparation),
    dualFlight: round(dualFlight),
    soloFlight: round(soloFlight),
    simulator: round(simulator)
  };
}

/**
 * Première et dernière date d'activité réelle admissible dans l'année fiscale, parmi
 * uniquement les activités pertinentes au calcul fiscal (théorie présente, sol préparatoire,
 * double commande, solo — dans toutes leurs variantes reconnues ci-dessus — et simulateur).
 */
export function calculateTuitionPeriod(
  studentId: string,
  taxYear: number,
  reservations: StudentReservation[],
  theorySessions: TheorySession[]
): TuitionPeriod | null {
  const relevantTypes = [...dualFlightTypes, ...soloFlightTypes, "Simulateur"];
  const dates = [
    ...reservations
      .filter(item => item.status === "Complété" && inYear(item.date, taxYear) && (isGroundPreparation(item) || relevantTypes.includes(item.type)))
      .map(item => item.date),
    ...theorySessions.filter(item => item.status === "Complétée" && item.attendance[studentId] === "Présent" && inYear(item.date, taxYear)).map(item => item.date)
  ].sort();
  return dates.length ? { start: dates[0], end: dates[dates.length - 1] } : null;
}

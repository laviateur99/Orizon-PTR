import type { Aircraft } from "@/features/fleet/types";
import type { StudentReservation } from "@/features/students/types";
import type { TheoryCohort, TheorySession } from "@/features/theory/types";
import { priceAt } from "@/features/training-quotes/priceHistory";
import type { TrainingRate } from "@/features/training-quotes/types";
import { dualFlightTypes, flightHours, inYear, isGroundPreparation, round, scheduledHours, soloFlightTypes } from "./hoursCalculation";
import type { CalculatedPricing, PricingLine, PricingLineStatus } from "./types";

const round2 = (value: number) => Math.round(value * 100) / 100;

const issue = (description: string, sourceDate: string, quantity: number, unit: string, status: Exclude<PricingLineStatus, "calculated">, note: string): PricingLine =>
  ({ description, sourceDate, quantity: round(quantity), unit, amount: 0, status, note });

/**
 * Résout le(s) TrainingRate correspondant à un avion PAR IDENTITÉ STRUCTURELLE UNIQUEMENT
 * (aircraftId en priorité, sinon aircraftType) — sans filtrer sur `active`. Un tarif retiré
 * aujourd'hui (active:false) reste un candidat légitime pour une activité antérieure à son
 * retrait : c'est priceAt(rate, activityDate), pas le statut actif, qui détermine s'il
 * s'applique à cette date précise.
 */
function matchingAircraftRates(rates: TrainingRate[], aircraftId: string, aircraftTypeLabel: string | undefined): TrainingRate[] {
  const category = rates.filter(r => r.category === "Avion");
  const byId = aircraftId ? category.filter(r => r.aircraftId === aircraftId) : [];
  if (byId.length) return byId;
  if (!aircraftTypeLabel) return [];
  return category.filter(r => r.aircraftType === aircraftTypeLabel);
}

const matchingInstructorRates = (rates: TrainingRate[]): TrainingRate[] => rates.filter(r => r.category === "Instructeur");

const matchingSimulatorRates = (rates: TrainingRate[], resourceId: string): TrainingRate[] => rates.filter(r => r.category === "Simulateur" && r.resourceId === resourceId);

const matchingTheoryRates = (rates: TrainingRate[], courseType: "PPL" | "CPL"): TrainingRate[] => rates.filter(r => r.category === "Formation théorique" && r.theoryCourseType === courseType);

/** Parmi des tarifs structurellement candidats, ne retient que ceux ayant un prix connu à `date`. */
function resolveAtDate(candidates: TrainingRate[], date: string): Array<{ rate: TrainingRate; price: number }> {
  return candidates
    .map(rate => ({ rate, price: priceAt(rate, date) }))
    .filter((entry): entry is { rate: TrainingRate; price: number } => entry.price !== undefined);
}

/** Résout un seul tarif "avion" pour une réservation, avec ses trois issues possibles. */
function priceAircraft(reservation: StudentReservation, date: string, rates: TrainingRate[], aircraftList: Aircraft[]): { price: number; rate: TrainingRate } | { status: Exclude<PricingLineStatus, "calculated">; note: string } {
  if (!reservation.aircraftId) return { status: "source_unconfirmed", note: "Aucun avion identifié sur cette réservation." };
  const plane = aircraftList.find(a => a.id === reservation.aircraftId);
  const structural = matchingAircraftRates(rates, reservation.aircraftId, plane?.typeLabel);
  if (structural.length === 0) return { status: "rate_missing", note: `Aucun tarif « Avion » (actuel ou historique) pour ${plane?.typeLabel || reservation.aircraftId}.` };
  const resolved = resolveAtDate(structural, date);
  if (resolved.length === 0) return { status: "rate_missing", note: "Aucun tarif historique connu à cette date pour cet avion." };
  if (resolved.length > 1) return { status: "rate_ambiguous", note: `Plusieurs tarifs « Avion » ont un prix connu à cette date pour ${plane?.typeLabel || reservation.aircraftId}.` };
  return { price: resolved[0].price, rate: resolved[0].rate };
}

/** Résout le tarif instructeur applicable (uniforme, sans classe). */
function priceInstructor(date: string, rates: TrainingRate[]): { price: number; rate: TrainingRate } | { status: Exclude<PricingLineStatus, "calculated">; note: string } {
  const structural = matchingInstructorRates(rates);
  if (structural.length === 0) return { status: "rate_missing", note: "Aucun tarif « Instructeur » (actuel ou historique)." };
  const resolved = resolveAtDate(structural, date);
  if (resolved.length === 0) return { status: "rate_missing", note: "Aucun tarif historique « Instructeur » connu à cette date." };
  if (resolved.length > 1) return { status: "rate_ambiguous", note: "Plusieurs tarifs « Instructeur » ont un prix connu à cette date." };
  return { price: resolved[0].price, rate: resolved[0].rate };
}

function calculateGroundPricing(studentId: string, taxYear: number, reservations: StudentReservation[], rates: TrainingRate[]): PricingLine[] {
  return reservations
    .filter(item => item.status === "Complété" && inYear(item.date, taxYear) && isGroundPreparation(item))
    .map(item => {
      const duration = item.groundTimeHours ?? scheduledHours(item.startTime, item.endTime);
      const instructor = priceInstructor(item.date, rates);
      if ("status" in instructor) return issue("Préparation au sol individuelle", item.date, duration, "heure", instructor.status, instructor.note);
      return { description: "Préparation au sol individuelle", sourceDate: item.date, rateId: instructor.rate.rateId, rateName: instructor.rate.name, unitPrice: instructor.price, quantity: round(duration), unit: "heure", amount: round2(duration * instructor.price), status: "calculated" as const };
    });
}

function calculateFlightPricing(studentId: string, taxYear: number, reservations: StudentReservation[], rates: TrainingRate[], aircraftList: Aircraft[], types: string[], withInstructor: boolean, label: string): PricingLine[] {
  return reservations
    .filter(item => item.status === "Complété" && inYear(item.date, taxYear) && types.includes(item.type))
    .map(item => {
      const duration = flightHours(item);
      const aircraft = priceAircraft(item, item.date, rates, aircraftList);
      if ("status" in aircraft) return issue(`${label} — ${item.type}`, item.date, duration, "heure", aircraft.status, aircraft.note);
      if (!withInstructor) {
        return { description: `${label} — ${item.type}`, sourceDate: item.date, rateId: aircraft.rate.rateId, rateName: aircraft.rate.name, unitPrice: aircraft.price, quantity: round(duration), unit: "heure", amount: round2(duration * aircraft.price), status: "calculated" as const };
      }
      const instructor = priceInstructor(item.date, rates);
      if ("status" in instructor) return issue(`${label} — ${item.type}`, item.date, duration, "heure", instructor.status, instructor.note);
      const unitPrice = aircraft.price + instructor.price;
      return {
        description: `${label} — ${item.type}`, sourceDate: item.date,
        rateId: `${aircraft.rate.rateId}+${instructor.rate.rateId}`, rateName: `${aircraft.rate.name} + ${instructor.rate.name}`,
        unitPrice, quantity: round(duration), unit: "heure", amount: round2(duration * unitPrice), status: "calculated" as const
      };
    });
}

function calculateSimulatorPricing(studentId: string, taxYear: number, reservations: StudentReservation[], rates: TrainingRate[]): PricingLine[] {
  return reservations
    .filter(item => item.status === "Complété" && inYear(item.date, taxYear) && item.type === "Simulateur")
    .map(item => {
      const duration = item.groundTimeHours ?? scheduledHours(item.startTime, item.endTime);
      const resourceId = item.resourceId;
      if (resourceId !== "SIM-DCX" && resourceId !== "SIM-737MAX") return issue("Simulateur", item.date, duration, "heure", "source_unconfirmed", "Ressource simulateur absente ou non reconnue sur cette réservation (simulatorTcId n'est jamais utilisé pour le tarif).");
      const structural = matchingSimulatorRates(rates, resourceId);
      if (structural.length === 0) return issue(`Simulateur — ${resourceId}`, item.date, duration, "heure", "rate_missing", `Aucun tarif « Simulateur » (actuel ou historique) lié à ${resourceId}.`);
      const resolved = resolveAtDate(structural, item.date);
      if (resolved.length === 0) return issue(`Simulateur — ${resourceId}`, item.date, duration, "heure", "rate_missing", "Aucun tarif historique connu à cette date.");
      if (resolved.length > 1) return issue(`Simulateur — ${resourceId}`, item.date, duration, "heure", "rate_ambiguous", `Plusieurs tarifs « Simulateur » ont un prix connu à cette date pour ${resourceId}.`);
      return { description: `Simulateur — ${resourceId}`, sourceDate: item.date, rateId: resolved[0].rate.rateId, rateName: resolved[0].rate.name, unitPrice: resolved[0].price, quantity: round(duration), unit: "heure", amount: round2(duration * resolved[0].price), status: "calculated" as const };
    });
}

/**
 * Un seul forfait par type de cours théorique (PPL/CPL) et par année fiscale, peu importe le
 * nombre de séances. Regroupe les séances complétées où l'étudiant est présent par le
 * theoryCourseType de leur cohorte ; la date tarifaire retenue est celle de la première séance
 * admissible du groupe. Les séances sans cohorte, ou dont la cohorte n'a pas de type fiscal
 * défini, deviennent une ligne "à confirmer" distincte plutôt qu'une supposition textuelle.
 */
function calculateTheoryPricing(studentId: string, taxYear: number, theorySessions: TheorySession[], theoryCohorts: TheoryCohort[], rates: TrainingRate[]): PricingLine[] {
  const completed = theorySessions
    .filter(item => item.status === "Complétée" && item.attendance[studentId] === "Présent" && inYear(item.date, taxYear))
    .sort((a, b) => a.date.localeCompare(b.date));
  const cohortById = new Map(theoryCohorts.map(c => [c.id, c]));
  const groups = new Map<string, { label: string; courseType?: "PPL" | "CPL"; sessions: TheorySession[] }>();
  for (const session of completed) {
    const cohort = session.cohortId ? cohortById.get(session.cohortId) : undefined;
    // "OTHER" est une catégorisation confirmée (pas une valeur manquante) signifiant que cette
    // cohorte ne correspond à aucun forfait fiscal PPL/CPL — exclue silencieusement, pas "à confirmer".
    if (cohort?.theoryCourseType === "OTHER") continue;
    const courseType = cohort?.theoryCourseType === "PPL" || cohort?.theoryCourseType === "CPL" ? cohort.theoryCourseType : undefined;
    const key = courseType ? `type:${courseType}` : cohort ? `cohort:${cohort.id}` : "no-cohort";
    const existing = groups.get(key);
    if (existing) existing.sessions.push(session);
    else groups.set(key, {
      label: courseType ? courseType : cohort ? `Cohorte « ${cohort.name} » sans type fiscal` : "Séances théoriques sans cohorte",
      courseType,
      sessions: [session]
    });
  }
  const lines: PricingLine[] = [];
  for (const group of groups.values()) {
    const firstDate = group.sessions[0].date;
    if (!group.courseType) {
      lines.push(issue(`Théorie — ${group.label}`, firstDate, group.sessions.length, "séance(s)", "source_unconfirmed", "Type de cours théorique (PPL/CPL) non confirmé pour ces séances."));
      continue;
    }
    const structural = matchingTheoryRates(rates, group.courseType);
    if (structural.length === 0) { lines.push(issue(`Théorie — ${group.courseType}`, firstDate, 1, "forfait", "rate_missing", `Aucun tarif « Formation théorique » (actuel ou historique) pour ${group.courseType}.`)); continue; }
    const resolved = resolveAtDate(structural, firstDate);
    if (resolved.length === 0) { lines.push(issue(`Théorie — ${group.courseType}`, firstDate, 1, "forfait", "rate_missing", "Aucun tarif historique connu à la date de la première séance.")); continue; }
    if (resolved.length > 1) { lines.push(issue(`Théorie — ${group.courseType}`, firstDate, 1, "forfait", "rate_ambiguous", `Plusieurs tarifs « Formation théorique » ont un prix connu à cette date pour ${group.courseType}.`)); continue; }
    lines.push({ description: `Théorie — ${group.courseType}`, sourceDate: firstDate, rateId: resolved[0].rate.rateId, rateName: resolved[0].rate.name, unitPrice: resolved[0].price, quantity: 1, unit: "forfait", amount: round2(resolved[0].price), status: "calculated" });
  }
  return lines;
}

const sum = (lines: PricingLine[]) => round2(lines.filter(l => l.status === "calculated").reduce((total, l) => total + l.amount, 0));

/**
 * Moteur fiscal complet : calcule un montant en dollars pour chaque activité admissible, à
 * partir des tarifs historiques (TrainingRate + priceAt). Ne modifie jamais les PTR/réservations/
 * theorySessions, ne recalcule jamais calculatedHours, et ne s'appuie JAMAIS sur declaredHours —
 * les montants reflètent exclusivement les activités réellement effectuées.
 */
export function calculateTuitionPricing(
  studentId: string,
  taxYear: number,
  reservations: StudentReservation[],
  theorySessions: TheorySession[],
  theoryCohorts: TheoryCohort[],
  rates: TrainingRate[],
  aircraft: Aircraft[]
): CalculatedPricing {
  const theory = calculateTheoryPricing(studentId, taxYear, theorySessions, theoryCohorts, rates);
  const ground = calculateGroundPricing(studentId, taxYear, reservations, rates);
  const dualFlight = calculateFlightPricing(studentId, taxYear, reservations, rates, aircraft, dualFlightTypes, true, "Double commande");
  const soloFlight = calculateFlightPricing(studentId, taxYear, reservations, rates, aircraft, soloFlightTypes, false, "Solo");
  const simulator = calculateSimulatorPricing(studentId, taxYear, reservations, rates);
  const totals = {
    theory: sum(theory), ground: sum(ground), dualFlight: sum(dualFlight), soloFlight: sum(soloFlight), simulator: sum(simulator),
    grandTotal: round2(sum(theory) + sum(ground) + sum(dualFlight) + sum(soloFlight) + sum(simulator))
  };
  const issues = [...theory, ...ground, ...dualFlight, ...soloFlight, ...simulator].filter(l => l.status !== "calculated");
  return { theory, ground, dualFlight, soloFlight, simulator, totals, issues };
}

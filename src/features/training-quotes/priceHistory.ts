import type { TrainingRate } from "./types";

/**
 * Retourne le prix applicable à `date` (AAAA-MM-JJ) pour ce tarif, en tenant compte de
 * l'historique des changements de prix (priceHistory) et de la valeur courante (price/effectiveDate).
 *
 * S'inspire conceptuellement de instructorClassAt (src/features/employees/payrollRates.ts) —
 * même principe de "valeur applicable à une date", sans coupler les deux systèmes.
 *
 * Retourne `undefined` si la date demandée précède toute information tarifaire connue
 * (aucun tarif historique n'est inventé) — le futur module fiscal doit traiter ce cas comme
 * "tarif à confirmer", jamais comme un prix silencieusement approximé.
 */
export function priceAt(rate: TrainingRate, date: string): number | undefined {
  const known = [
    ...(rate.priceHistory || []).map(entry => ({ price: entry.price, effectiveDate: entry.effectiveDate })),
    { price: rate.price, effectiveDate: rate.effectiveDate }
  ].filter(entry => entry.effectiveDate).sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  if (!known.length) return undefined;
  if (date < known[0].effectiveDate) return undefined;
  let value = known[0].price;
  for (const entry of known) if (entry.effectiveDate <= date) value = entry.price;
  return value;
}

import type { TCScore } from "./types";

export const TC_CRITERIA = [
  { key: "pilotage", label: "Pilotage de l’aéronef" },
  { key: "technical", label: "Compétences techniques" },
  { key: "situationalAwareness", label: "Conscience de la situation" },
  { key: "flightManagement", label: "Gestion du vol et des menaces" },
  { key: "safetyMargins", label: "Marges de sécurité du vol" },
] as const;

export const TC_SCALE = [
  {
    score: 4,
    title: "Exécution bien accomplie",
    summary: "Pilotage souple et précis, connaissances approfondies, anticipation continue, gestion exemplaire et marges de sécurité assurées."
  },
  {
    score: 3,
    title: "Quelques erreurs mineures",
    summary: "Contrôle approprié avec quelques écarts mineurs, connaissances adéquates et erreurs reconnues puis corrigées."
  },
  {
    score: 2,
    title: "Quelques erreurs majeures",
    summary: "Écarts majeurs ou instabilité occasionnelle, lacunes de connaissance, signaux reconnus tardivement et risques mal gérés."
  },
  {
    score: 1,
    title: "Erreurs critiques ou objectif non atteint",
    summary: "Écarts critiques, connaissance insuffisante, gestion inefficace ou marges de sécurité compromises."
  }
] as const;

export function finalScore(scores: Array<TCScore | undefined>): TCScore | undefined {
  const values = scores.filter((value): value is TCScore => value !== undefined);
  return values.length ? Math.min(...values) as TCScore : undefined;
}

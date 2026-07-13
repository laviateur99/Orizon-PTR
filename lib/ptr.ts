import { PTREvaluation, PTRLesson } from "./types";

export const TC_EVALUATION_CRITERIA = [
  { key: "pilotage", label: "Pilotage de l’aéronef" },
  { key: "technical", label: "Compétences techniques" },
  { key: "situationalAwareness", label: "Conscience de la situation" },
  { key: "flightManagement", label: "Gestion du vol et des menaces" },
  { key: "safetyMargins", label: "Marges de sécurité" },
] as const;

export const TC_SCALE = [
  {
    score: 4,
    title: "Exécution bien accomplie",
    summary: "Pilotage souple et précis, connaissances approfondies, anticipation continue, gestion exemplaire et marges de sécurité assurées.",
  },
  {
    score: 3,
    title: "Quelques erreurs mineures",
    summary: "Contrôle approprié avec écarts mineurs, connaissances adéquates, bonne conscience de la situation et erreurs corrigées.",
  },
  {
    score: 2,
    title: "Quelques erreurs majeures",
    summary: "Écarts majeurs ou instabilité occasionnelle, lacunes de connaissance, signaux reconnus tardivement et risques mal gérés.",
  },
  {
    score: 1,
    title: "Erreurs critiques ou objectif non atteint",
    summary: "Écarts critiques, connaissance insuffisante, conscience de la situation inadéquate ou marges de sécurité compromises.",
  },
] as const;

export function calculateFinalScore(scores: Array<number | undefined>) {
  const applicable = scores.filter((score): score is number => typeof score === "number");
  if (!applicable.length) return undefined;
  return Math.min(...applicable) as 1 | 2 | 3 | 4;
}

export function studentProgress(lessons: PTRLesson[], evaluations: PTREvaluation[]) {
  if (!lessons.length) return 0;
  const successful = lessons.filter((lesson) => {
    if (lesson.status === "Réussi") return true;
    return evaluations.some((evaluation) => evaluation.lessonId === lesson.id && evaluation.lessonStatus === "Réussi");
  }).length;
  return Math.round((successful / lessons.length) * 100);
}

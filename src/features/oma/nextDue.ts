import type { NextDue, TaskSnapshot } from "./types";

const iso = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return iso(value);
}

function addMonths(date: string, months: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  const day = value.getUTCDate();
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).getUTCDate();
  value.setUTCDate(Math.min(day, lastDay));
  return iso(value);
}

/**
 * Prochaine échéance d'une tâche accomplie, d'après ses intervalles. Ne lit ni n'écrit rien :
 * le résultat est stocké sur la carte et appliqué par le PRM de l'école à la remise en service.
 */
export function computeNextDue(task: TaskSnapshot | undefined, completedAirTime: number | undefined, completedDate: string | undefined): NextDue | undefined {
  if (!task) return undefined;
  const result: NextDue = { basis: "aucun_intervalle" };
  const hasHours = typeof task.intervalHours === "number" && task.intervalHours > 0 && typeof completedAirTime === "number";
  const hasDays = typeof task.intervalDays === "number" && task.intervalDays > 0 && !!completedDate;
  const hasMonths = typeof task.intervalMonths === "number" && task.intervalMonths > 0 && !!completedDate;
  if (typeof completedAirTime === "number") result.lastCompletedAirTime = completedAirTime;
  if (completedDate) result.lastCompletedDate = completedDate;
  if (hasHours) result.dueAirTime = Math.round((completedAirTime! + task.intervalHours!) * 10) / 10;
  if (hasDays) result.dueDate = addDays(completedDate!, task.intervalDays!);
  else if (hasMonths) result.dueDate = addMonths(completedDate!, task.intervalMonths!);
  const calendar = hasDays || hasMonths;
  result.basis = hasHours && calendar ? "hours+calendar" : hasHours ? "intervalHours" : hasDays ? "intervalDays" : hasMonths ? "intervalMonths" : "aucun_intervalle";
  return result;
}

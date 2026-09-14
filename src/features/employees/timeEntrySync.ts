import type { SchedulerEvent } from "@/features/scheduler/types";
import type { PayrollCategory, TimeEntryComponent } from "./types";

export type SchedulerTimeEntryComponent = {
  category: PayrollCategory;
  durationHours: number;
  sourceComponent: Extract<TimeEntryComponent, "activity" | "briefing">;
};

const rounded = (value: number) => Math.round(value * 10) / 10;
const positive = (value: number | undefined) =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;

function elapsedFromOperation(event: SchedulerEvent) {
  if (!event.checkedInAt || !event.checkedOutAt) return undefined;
  const start = new Date(event.checkedInAt).getTime();
  const end = new Date(event.checkedOutAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return undefined;
  return (end - start) / 3_600_000;
}

export function completedActivityHours(event: SchedulerEvent) {
  if (event.status !== "Complété") return undefined;
  if (event.type === "Double commande" || event.type === "Solo") {
    const elapsedHobbs = positive(event.hobbsElapsed);
    if (elapsedHobbs) return rounded(elapsedHobbs);
    if (
      event.hobbsStart !== undefined &&
      event.hobbsEnd !== undefined &&
      event.hobbsEnd > event.hobbsStart
    )
      return rounded(event.hobbsEnd - event.hobbsStart);
    const recorded = positive(event.actualDurationHours) || elapsedFromOperation(event);
    return recorded ? rounded(recorded) : undefined;
  }

  if (event.type === "Sol" || event.type === "Simulateur") {
    const actual =
      positive(event.groundTimeHours) ||
      positive(event.actualDurationHours) ||
      elapsedFromOperation(event);
    if (actual) return rounded(actual);
    const planned = Math.max(0, event.endMinutes - event.startMinutes) / 60;
    return planned > 0 ? rounded(planned) : undefined;
  }
  return undefined;
}

export function schedulerTimeEntryComponents(
  event: SchedulerEvent,
): SchedulerTimeEntryComponent[] {
  const durationHours = completedActivityHours(event);
  if (!durationHours) return [];
  if (event.type === "Double commande" || event.type === "Solo")
    return [
      { category: "Vol", durationHours, sourceComponent: "activity" },
      {
        category: "Débriefing",
        durationHours: 0.2,
        sourceComponent: "briefing",
      },
    ];
  if (event.type === "Simulateur")
    return [
      { category: "Simulateur", durationHours, sourceComponent: "activity" },
    ];
  if (event.type === "Sol")
    return [
      {
        category: event.theoreticalSessionId ? "Théorie" : "Sol préparatoire",
        durationHours,
        sourceComponent: "activity",
      },
    ];
  return [];
}

export function requiredAdjustmentHours(
  targetHours: number,
  originalHours: number,
  existingAdjustmentHours: number,
) {
  return rounded(targetHours - originalHours - existingAdjustmentHours);
}

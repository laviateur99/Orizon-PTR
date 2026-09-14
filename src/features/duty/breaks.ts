import type { SchedulerEvent, StudentBreakConfirmation } from "@/features/scheduler/types";

// Bound to the two activities and their schedule; changing either invalidates the confirmation.
export function studentBreakKey(before: SchedulerEvent, after: SchedulerEvent, studentId: string) {
  const schedule = (event: SchedulerEvent) => [event.id, event.date, event.startMinutes, event.endMinutes, event.type, event.instructorId || ""];
  return JSON.stringify([studentId, schedule(before), schedule(after)]);
}
export function confirmedStudentBreak(before: SchedulerEvent, after: SchedulerEvent, studentId: string) {
  const key = studentBreakKey(before, after, studentId);
  return [...(before.studentBreakConfirmations || []), ...(after.studentBreakConfirmations || [])]
    .find(item => item.key === key && item.studentId === studentId && item.confirmedBy && item.confirmedAt);
}
export function readStudentBreakConfirmations(value: unknown): StudentBreakConfirmation[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is StudentBreakConfirmation => Boolean(item) &&
    ["key", "studentId", "confirmedBy", "confirmedByName", "confirmedAt"].every(field => typeof item[field] === "string"));
}

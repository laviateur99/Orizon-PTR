import type { StudentLesson } from "@/features/students/types";
type Status = StudentLesson["status"];
export type ProgressEvaluation = {
  lessonId: string; componentKey?: string; reservationId?: string;
  instructorSignature?: string; studentSignature?: string;
  signedAt: string; status: Status;
};
export function lessonProgress(lessonId: string, componentCount: number, evaluations: ProgressEvaluation[], activeReservationIds: Set<string>): Status {
  const valid = evaluations.filter(item => item.lessonId === lessonId && item.reservationId && activeReservationIds.has(item.reservationId) && item.instructorSignature && item.studentSignature)
    .sort((a,b) => b.signedAt.localeCompare(a.signedAt));
  const states = Array.from({length: Math.max(1, componentCount)}, (_,index) => {
    const latest = valid.find(item => componentCount <= 1 || item.componentKey === `${lessonId}::${index}` || (!item.componentKey && index === 0));
    return latest?.status || "Non commencé";
  });
  if (states.every(status => status === "Réussi")) return "Réussi";
  if (states.includes("À reprendre")) return "À reprendre";
  return states.some(status => status !== "Non commencé") ? "En cours" : "Non commencé";
}

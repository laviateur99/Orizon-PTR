import type { StudentDocument, StudentLesson } from "./types";
export function expiryStatus(expiryDate: string): StudentDocument["status"] {
  if (!expiryDate) return "Sans expiration";
  const days = Math.ceil((new Date(`${expiryDate}T12:00:00`).getTime()-Date.now())/86400000);
  if (days < 0) return "Expiré";
  if (days <= 90) return "À surveiller";
  return "Valide";
}
export function progressPercent(lessons: StudentLesson[]) {
  if (!lessons.length) return 0;
  return Math.round(lessons.filter(x=>x.status==="Réussi").length/lessons.length*100);
}
export function initials(firstName:string,lastName:string){ return `${firstName[0]||""}${lastName[0]||""}`.toUpperCase(); }

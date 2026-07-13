import { InstructorDocument } from "./types";

export const INSTRUCTOR_DOCUMENT_TYPES: InstructorDocument["type"][] = [
  "Licence CPL","Licence ATPL","Qualification instructeur","Médical Catégorie 1",
  "Passeport","ROC-A","ROC-M","RAIC","IFR","Multi","Autre",
];

export const INSTRUCTOR_QUALIFICATIONS = [
  "Classe 1","Classe 2","Classe 3","Classe 4","IFR","Multi","SEP","MEP","Examinateur",
];

export function daysUntil(date?: string) {
  if (!date) return null;
  const today = new Date();
  const target = new Date(`${date}T12:00:00`);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function documentStatus(expiryDate?: string) {
  const days = daysUntil(expiryDate);
  if (days === null) return { label: "Sans expiration", className: "ok", days };
  if (days < 0) return { label: "Expiré", className: "expired", days };
  if (days <= 30) return { label: "Expire bientôt", className: "danger", days };
  if (days <= 90) return { label: "À surveiller", className: "warn", days };
  return { label: "Valide", className: "ok", days };
}

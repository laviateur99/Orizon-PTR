export type StudentStatus = "Actif" | "En pause" | "Diplômé" | "Retiré";
export type ProgramType = "Intégré" | "Modulaire";
export type StudentDocumentType =
  | "Certificat médical"
  | "Passeport"
  | "Certificat de naissance"
  | "Permis d’élève-pilote"
  | "Licence"
  | "Certificat radio"
  | "Photo"
  | "Document immigration"
  | "Autre";

export type Student = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  emergencyContact: string;
  emergencyPhone: string;
  program: string;
  programType: ProgramType;
  language: "Français" | "Anglais";
  status: StudentStatus;
  primaryInstructorId: string;
  startDate: string;
  flightHours: number;
  groundHours: number;
  notes: string;
};

export type StudentDocument = {
  id: string;
  studentId: string;
  type: StudentDocumentType;
  number: string;
  issueDate: string;
  expiryDate: string;
  notes: string;
  status: "Valide" | "À surveiller" | "Expiré" | "Sans expiration";
};

export type StudentNote = {
  id: string;
  studentId: string;
  text: string;
  author: string;
  createdAt: string;
};

export type StudentHistoryItem = {
  id: string;
  studentId: string;
  type: "Création" | "Modification" | "Document" | "Note" | "Réservation" | "PTR";
  title: string;
  detail: string;
  createdAt: string;
};

export type StudentLesson = {
  id: string;
  studentId: string;
  phase: string;
  lessonNumber: string;
  title: string;
  status: "Non commencé" | "En cours" | "Réussi" | "À reprendre";
  score?: 1 | 2 | 3 | 4;
};

export type StudentReservation = {
  id: string;
  studentId: string;
  date: string;
  startTime: string;
  endTime: string;
  type: string;
  title: string;
  aircraftId: string;
  instructorId: string;
  status: string;
};

export type InstructorOption = { id: string; name: string };

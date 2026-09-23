export type StudentStatus = "Actif" | "En pause" | "Diplômé" | "Retiré" | "Locataire";
export type StudentProgram =
  | "Modulaire"
  | "ATP(A) intégré"
  | "ATP(A) modulaire — Phase 1 — Premier solo"
  | "ATP(A) modulaire — Phase 2 — Premier vol-voyage solo"
  | "ATP(A) modulaire — Phase 3 — Test en vol privé"
  | "ATP(A) modulaire — Phase 4 — Vol de nuit"
  | "ATP(A) modulaire — Phase 5 — Vols-voyages solo"
  | "ATP(A) modulaire — Phase 6 — Vol aux instruments monomoteur"
  | "ATP(A) modulaire — Phase 7 — Multimoteur et vol aux instruments multimoteur"
  | "ATP(A) modulaire — Phase 8 — CPL"
  | "ATP(A) modulaire — Phase 9 — Avion complexe"
  | "ATP(A) modulaire — Phase 10 — MCC et jet"
  | "CPL IR/ME intégré"
  | "CPL intégré";

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
  program: StudentProgram;
  programType: ProgramType;
  trainingProgramId: string;
  trainingProgramName: string;
  language: "Français" | "Anglais";
  status: StudentStatus;
  primaryInstructorId: string;
  theoryCohortId: string;
  startDate: string;
  flightHours: number;
  groundHours: number;
  notes: string;
  // Décision administrative explicite. true = Orizon produit les formulaires fiscaux de
  // frais de scolarité; false = exclu (ex. programme géré par un autre établissement);
  // absent/undefined = pas encore configuré (ne jamais présumer true automatiquement).
  generateTuitionTaxForms?: boolean;
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
  lessonPlanId?: string;
  lessonPdfPath?: string;
  linkedReservationId?: string;
  componentCount?:number;
  componentStatuses?:Record<string,"Non commencé"|"En cours"|"Réussi"|"À reprendre">;
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
  hobbsStart?:number;
  hobbsEnd?:number;
  airtimeMinutes?:number;
  groundTimeHours?:number;
  attendanceStatus?:"Présent"|"Absent";
  resourceId?:string;
  simulatorTcId?:string;
};

export type InstructorOption = { id: string; name: string; licenseNumber: string };

export type PreSoloExercise = {
  completed: boolean;
  instructorId: string;
  instructorName: string;
  instructorLicense: string;
  instructorSignature: string;
  studentSignature: string;
  signedAt: string;
};

export type PreSoloChecklist = {
  studentId: string;
  radioExaminerId: string;
  radioExaminerName: string;
  radioExaminerSignature: string;
  radioIssueDate: string;
  pstarMark: string;
  pstarDate: string;
  permitAuthorizedPersonId: string;
  permitAuthorizedPerson: string;
  permitSignature: string;
  permitIssueDate: string;
  permitExpiryDate: string;
  medicalAuthorizedPersonId: string;
  medicalAuthorizedPerson: string;
  medicalSignature: string;
  medicalIssueDate: string;
  medicalExpiryDate: string;
  exercises: Record<string, PreSoloExercise>;
  recommendingInstructorId: string;
  recommendingInstructorName: string;
  recommendingInstructorLicenseClass: string;
  recommendingInstructorSignature: string;
  recommendingDate: string;
  recommendingInstructorIsClass4: boolean;
  supervisingInstructorId: string;
  supervisingInstructorName: string;
  supervisingInstructorLicenseClass: string;
  supervisingInstructorSignature: string;
  supervisingDate: string;
  authorized: boolean;
  completedAt: string;
};

export type FlightTestRecommendation = {
  studentId: string;
  recommendingInstructorName: string;
  recommendingInstructorLicense: string;
  recommendingInstructorClass: string;
  recommendingInstructorSignature: string;
  recommendingDate: string;
  recommendingInstructorIsClass4: boolean;
  supervisingInstructorName: string;
  supervisingInstructorLicense: string;
  supervisingInstructorClass: string;
  supervisingInstructorSignature: string;
  supervisingDate: string;
  valid: boolean;
  completedAt: string;
};

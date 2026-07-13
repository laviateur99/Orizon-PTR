export type Instructor = { id:string; firstName:string; lastName:string; email?:string; phone?:string; classLevel:"Classe 1"|"Classe 2"|"Classe 3"|"Classe 4"|"Autre"; active:boolean };
export type Cohort = { id:string; name:string; program:string; startDate:string; status:"Active"|"Terminée"|"Planifiée"; leadInstructorId?:string };
export type Aircraft = { id:string; registration:string; type:string; status:"Disponible"|"Maintenance"|"Hors service"; location?:string; nextInspection?:string; notes?:string };
export type Reservation = {
  id:string; date:string; startTime:string; endTime:string; studentId:string; instructorId?:string; aircraftId:string; roomId?: string;
  type:"Double commande"|"Solo"|"Maintenance"|"Hors service"|"Inspection 50 h"|"Inspection 100 h"|"Inspection annuelle"|"Bris mécanique"|"Nettoyage"|"Réservé école"|"Sol"|"Simulateur"|"Examen"; lesson?:string; status:"Planifié"|"Confirmé"|"Complété"|"Annulé"; notes?:string;
};
export type Student = { id:string; firstName:string; lastName:string; email?:string; phone?:string; instructor:string; instructorId?:string; cohortId?:string; path:string; pathType:"integrated"|"modular"; phase:string; lesson:string; progress:number; total:number; dual:number; solo:number; instrument:number; lastFlight?:string; alert?:string; alertType?:"warn"|"ok"|"danger"; tcNumber?:string; medicalExpiry?:string };
export type Flight = { id:string; studentId:string; date:string; aircraft:string; registration:string; instructor:string; instructorId?:string; aircraftId?:string; duration:number; dual:number; solo:number; instrument:number; lesson:string; exercises:string; result:"Réussi"|"À revoir"|"À reprendre"; comments:string };
export type TrainingNote = { id:string; studentId:string; date:string; author:string; category:string; content:string };


export type ResourceUnavailability = {
  id: string;
  resourceType: "aircraft" | "instructor";
  resourceId: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  reason: "Maintenance" | "Hors service" | "Inspection 50 h" | "Inspection 100 h" | "Inspection annuelle" | "Bris mécanique" | "Vacances" | "Congé" | "Formation" | "Autre";
  notes?: string;
  status: "Active" | "Terminée" | "Annulée";
};


export type InstructorDocument = {
  id: string;
  instructorId: string;
  type: "Licence CPL" | "Licence ATPL" | "Qualification instructeur" | "Médical Catégorie 1" | "Passeport" | "ROC-A" | "ROC-M" | "RAIC" | "IFR" | "Multi" | "Autre";
  number?: string;
  issueDate?: string;
  expiryDate?: string;
  notes?: string;
  status?: "Valide" | "À surveiller" | "Expire bientôt" | "Expiré";
};

export type InstructorQualification = {
  id: string;
  instructorId: string;
  name: string;
  valid: boolean;
  expiryDate?: string;
  notes?: string;
};


export type PTRLessonStatus = "Non commencé" | "En cours" | "Réussi" | "À reprendre";

export type PTRLesson = {
  id: string;
  studentId: string;
  programType: "integrated" | "modular";
  phase: string;
  lessonNumber: string;
  title: string;
  objective: string;
  exercises: string[];
  prerequisites?: string[];
  status: PTRLessonStatus;
  linkedReservationId?: string;
  createdAt?: string;
};

export type PTREvaluation = {
  id: string;
  studentId: string;
  lessonId: string;
  reservationId?: string;
  instructorId?: string;
  instructorName?: string;
  date: string;
  pilotage?: 1 | 2 | 3 | 4;
  technical?: 1 | 2 | 3 | 4;
  situationalAwareness?: 1 | 2 | 3 | 4;
  flightManagement?: 1 | 2 | 3 | 4;
  safetyMargins?: 1 | 2 | 3 | 4;
  finalScore?: 1 | 2 | 3 | 4;
  strengths?: string;
  improvements?: string;
  instructorComments?: string;
  actions?: string[];
  lessonStatus: PTRLessonStatus;
  instructorSignature?: string;
  studentSignature?: string;
  signedAt?: string;
  createdAt?: string;
};

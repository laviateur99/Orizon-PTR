export type TaxFormStatus = "Brouillon" | "Finalisé";

export const trainingTypesDeclared = ["PPL", "CPL", "Vol de nuit", "IFR", "Multimoteur", "Instructeur", "Autre"] as const;
export type TrainingTypeDeclared = typeof trainingTypesDeclared[number];

export type TuitionCalculatedHours = {
  theory: number;
  groundPreparation: number;
  groundTotal: number;
  dualFlight: number;
  soloFlight: number;
  simulator: number;
};

export type TuitionDeclaredHours = {
  ground: number;
  dualFlight: number;
  soloFlight: number;
  simulator: number;
};

export type TuitionPeriod = { start: string; end: string };

export type TuitionStudentSnapshot = {
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  studentNumber: string;
  phone: string;
  email: string;
};

export const t2202CourseTypes = ["Pilote privé", "Pilote professionnel", "Instructeur de vol", "Vol aux instruments", "Autre"] as const;
export type T2202CourseType = typeof t2202CourseTypes[number];

// "" = pas encore choisi par Mélanie — jamais déduit automatiquement avec certitude.
export type TuitionT2202 = {
  courseType: T2202CourseType | "";
  programName: string;
  sessionStart: string;
  sessionEnd: string;
  partTimeMonths: number;
  fullTimeMonths: number;
  eligibleTuitionFees: number;
};

export type TuitionTaxSettings = {
  institutionName: string;
  institutionAddress: string;
  institutionCity: string;
  institutionProvince: string;
  institutionPostalCode: string;
  institutionPhone: string;
  quebecIdentificationNumber: string;
  // Compte de déclarant T2202 (RZ) — jamais préempli ni déduit d'un numéro RT (TPS/TVH).
  craT2202FilerAccountNumber: string;
  institutionResponsibleName: string;
  institutionResponsibleTitle: string;
  updatedAt?: unknown;
};

// Figé au moment de la finalisation — un changement ultérieur des paramètres institutionnels
// ne doit jamais modifier rétroactivement un dossier déjà finalisé.
export type TuitionInstitutionSnapshot = {
  name: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  phone: string;
  quebecIdentificationNumber: string;
  responsibleName: string;
  responsibleTitle: string;
  craT2202FilerAccountNumber: string;
};

export type TuitionTaxForm = {
  id: string;
  studentId: string;
  taxYear: number;
  status: TaxFormStatus;
  studentSnapshot: TuitionStudentSnapshot;
  calculatedHours: TuitionCalculatedHours;
  declaredHours: TuitionDeclaredHours;
  periodCalculated: TuitionPeriod | null;
  periodDeclared: TuitionPeriod;
  trainingTypeDeclared: TrainingTypeDeclared;
  programId?: string;
  programName?: string;
  amountPaid: number;
  t2202: TuitionT2202;
  // Présent uniquement une fois le dossier finalisé (voir point 12 de la demande).
  institutionSnapshot?: TuitionInstitutionSnapshot;
  finalizedAt?: unknown;
  finalizedBy?: { uid: string; name: string };
  preparedBy: { uid: string; name: string };
  createdAt?: unknown;
  updatedAt?: unknown;
};

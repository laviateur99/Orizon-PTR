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
  preparedBy: { uid: string; name: string };
  createdAt?: unknown;
  updatedAt?: unknown;
};

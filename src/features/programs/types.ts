export type ProgramHours = {
  sol: number;
  dev: number;
  doubleCommande: number;
  solo: number;
};

export type ProgramLessonComponent = {
  number: number;
  phase: number;
  modality: string;
  category: string;
  title: string;
  objective: string;
  hours: ProgramHours;
  exercises: string[];
  nextLesson: string;
  successCriteria: string;
  manualPage: number;
  pdfPath?: string;
  manualPdfPath?: string;
  manualPdfPage?: number;
};

export type ProgramLessonTemplate = {
  number: number;
  phase: number;
  phaseName: string;
  title: string;
  objectives: string[];
  exercises: string[];
  successCriteria: string[];
  components: ProgramLessonComponent[];
};

export type TrainingProgram = {
  id: string;
  name: string;
  organization: string;
  revision: string;
  effectiveDate: string;
  source: string;
  lessonCount: number;
  componentCount: number;
  phases: Array<{ number: number; name: string }>;
  manualPdfPath?: string;
  hoursVerifiedFromManual?: boolean;
  hoursVerifiedComponentCount?: number;
  lessons: ProgramLessonTemplate[];
};

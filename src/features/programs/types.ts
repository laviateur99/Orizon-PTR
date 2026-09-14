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
  evaluationItems?: string[];
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
  evaluationItems?: string[];
};

export type TrainingProgram = {
  id: string;
  name: string;
  organization: string;
  revision: string;
  effectiveDate: string;
  source: string;
  programType: "integrated" | "modular";
  displayOrder?: number;
  catalogKind?: "program" | "template" | "module";
  sourceTemplateId?: string;
  moduleIds?: string[];
  phaseIds?: Array<string | number>;
  lessonCount: number;
  componentCount: number;
  phases: Array<{ number: number; name: string }>;
  manualPdfPath?: string;
  hoursVerifiedFromManual?: boolean;
  hoursVerifiedComponentCount?: number;
  lessons: ProgramLessonTemplate[];
};

export function compareTrainingPrograms(a:Pick<TrainingProgram,"displayOrder"|"name">,b:Pick<TrainingProgram,"displayOrder"|"name">){
  const order=(a.displayOrder??Number.MAX_SAFE_INTEGER)-(b.displayOrder??Number.MAX_SAFE_INTEGER);
  return order||a.name.localeCompare(b.name,"fr");
}

export function programPhases(program:{phases?:TrainingProgram["phases"];phaseIds?:TrainingProgram["phaseIds"]}):Array<{number:number;name:string}>{
  if(Array.isArray(program.phases))return program.phases;
  if(!Array.isArray(program.phaseIds))return [];
  return program.phaseIds.map((id,index)=>{
    const parsed=typeof id==="number"?id:Number(String(id).match(/\d+/)?.[0]);
    const number=Number.isFinite(parsed)&&parsed>0?parsed:index+1;
    return{number,name:`Phase ${number}`};
  });
}

export const programTypeLabels:Record<TrainingProgram["programType"],string>={integrated:"Intégré",modular:"Modulaire"};

export const trainingMilestoneTypes=["Fin de phase","Examen","Évaluation","Remise de notes","Rencontre de progression","Autre jalon"] as const;
export type TrainingMilestoneType=typeof trainingMilestoneTypes[number];
export type TrainingProgressMilestone={
  id:string;
  scope:"cohort"|"student";
  programId:string;
  cohortId?:string;
  studentId?:string;
  phaseId?:string;
  title:string;
  milestoneType:TrainingMilestoneType;
  targetDate?:string;
  targetDaysAfterStart?:number;
  required:boolean;
  notes?:string;
  createdBy:string;
  createdAt:string;
  updatedBy:string;
  updatedAt:string;
};
export type TrainingProgressObjectiveHistory={id:string;objectiveId:string;programId:string;scope:TrainingProgressMilestone["scope"];cohortId?:string;studentId?:string;previousValue?:TrainingProgressMilestone;newValue?:TrainingProgressMilestone;author:string;changedAt:string;reason:string};

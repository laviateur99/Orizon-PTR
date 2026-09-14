import rawProgram from "./atpa-program.json";
import type { TrainingProgram } from "./types";

export const ATPA_PEDAGOGICAL_TEMPLATE={...rawProgram,id:"template-atpa-mod6-2025",name:"ATP(A) — Manuel de formation Modification no 6 — Juin 2025",programType:"integrated",catalogKind:"template",displayOrder:1}as TrainingProgram;
export const ATPA_PROGRAM = {...rawProgram,name:"Orizon Aviation — ATP(A) intégré",programType:"integrated",catalogKind:"program",sourceTemplateId:ATPA_PEDAGOGICAL_TEMPLATE.id,displayOrder:1} as TrainingProgram;

export function lessonTemplate(number: string | number) {
  return ATPA_PROGRAM.lessons.find(item => item.number === Number(number));
}

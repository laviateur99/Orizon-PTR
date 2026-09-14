import {ATPA_PEDAGOGICAL_TEMPLATE,ATPA_PROGRAM} from "./data";
import {programPhases,type TrainingProgram} from "./types";

export const ATPA_MODULAR_PROGRAM_ID_PREFIX = "orizon-atpa-phase-";

/** Ten immutable modular programs derived from the approved ATP(A) source. */
export const ATPA_MODULAR_PROGRAMS: TrainingProgram[] = programPhases(ATPA_PEDAGOGICAL_TEMPLATE).map(phase => {
  const lessons = ATPA_PEDAGOGICAL_TEMPLATE.lessons.filter(lesson => lesson.phase === phase.number);
  return {
    ...ATPA_PEDAGOGICAL_TEMPLATE,
    id: `${ATPA_MODULAR_PROGRAM_ID_PREFIX}${String(phase.number).padStart(2, "0")}-mod6-2025`,
    name: `ATP(A) modulaire — Phase ${phase.number} — ${phase.name}`,
    source: `${ATPA_PROGRAM.source} — Phase ${phase.number} extraite sans modification`,
    programType: "modular",
    catalogKind: "module",
    sourceTemplateId:ATPA_PEDAGOGICAL_TEMPLATE.id,
    lessonCount: lessons.length,
    componentCount: lessons.reduce((total, lesson) => total + lesson.components.length, 0),
    phases: [phase],
    lessons,
  };
});

export const OFFICIAL_PROGRAMS: TrainingProgram[] = [ATPA_PROGRAM,ATPA_PEDAGOGICAL_TEMPLATE,...ATPA_MODULAR_PROGRAMS];
export const VISIBLE_OFFICIAL_PROGRAMS:TrainingProgram[]=[ATPA_PROGRAM];
export const PEDAGOGICAL_LIBRARY:TrainingProgram[]=[ATPA_PEDAGOGICAL_TEMPLATE];
export const PROGRAM_MODULE_LIBRARY:TrainingProgram[]=PEDAGOGICAL_LIBRARY;
export const OFFICIAL_PROGRAM_IDS = new Set([ATPA_PEDAGOGICAL_TEMPLATE,...ATPA_MODULAR_PROGRAMS].map(program => program.id));

export function modularProgramForPhase(phase: number) {
  return ATPA_MODULAR_PROGRAMS.find(program => programPhases(program)[0]?.number === phase);
}

export function programForStudentSelection(selection: string) {
  if (selection === "ATP(A) intégré") return ATPA_PROGRAM;
  const phase = selection.match(/^ATP\(A\) modulaire — Phase (\d+)/)?.[1];
  return phase ? modularProgramForPhase(Number(phase)) : undefined;
}

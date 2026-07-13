import rawProgram from "./atpa-program.json";
import type { TrainingProgram } from "./types";

export const ATPA_PROGRAM = rawProgram as TrainingProgram;

export function lessonTemplate(number: string | number) {
  return ATPA_PROGRAM.lessons.find(item => item.number === Number(number));
}

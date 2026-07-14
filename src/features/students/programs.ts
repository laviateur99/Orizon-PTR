import type { ProgramType, StudentProgram } from "./types";

export const STUDENT_PROGRAMS: StudentProgram[] = [
  "Modulaire",
  "ATP(A) intégré",
  "CPL IR/ME intégré",
  "CPL intégré"
];

export function programTypeFor(program: StudentProgram): ProgramType {
  return program === "Modulaire" ? "Modulaire" : "Intégré";
}

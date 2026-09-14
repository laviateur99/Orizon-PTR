import {VISIBLE_OFFICIAL_PROGRAMS} from "@/features/programs/modularPrograms";
import type{ManagedTrainingProgram}from"@/features/programs/management";
import {compareTrainingPrograms,type TrainingProgram}from"@/features/programs/types";
import type { ProgramType } from "./types";

export function selectableTrainingPrograms(managed:ManagedTrainingProgram[]):TrainingProgram[]{
 const programs=[...VISIBLE_OFFICIAL_PROGRAMS,...managed.filter(item=>item.catalogKind==="program"&&item.status!=="inactive")];
 return[...new Map(programs.map(item=>[item.id,item])).values()].sort(compareTrainingPrograms);
}

export function studentProgramType(program:TrainingProgram):ProgramType{return program.programType==="modular"?"Modulaire":"Intégré"}

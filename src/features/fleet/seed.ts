import type { Aircraft } from "./types";
export const ORIZON_AIRCRAFT: Aircraft[] = [
  ...["C-FZSX","C-GBQK","C-GZWJ","C-FFMQ","C-GFPA","C-GFPE","C-GJBF","C-FFQO","C-GQVQ","C-GFOW","C-GZKE","C-GZKJ"].map(registration => ({id:registration,registration,manufacturer:"Cessna",model:"152",typeLabel:"Cessna 152",status:"Disponible" as const,active:true})),
  ...["C-FCCC","C-GOAQ","C-GQVZ"].map(registration => ({id:registration,registration,manufacturer:"Cessna",model:"172",typeLabel:"Cessna 172",status:"Disponible" as const,active:true})),
  ...["C-GAFF","C-FRKG","C-GUMQ"].map(registration => ({id:registration,registration,manufacturer:"Piper",model:"PA-31 Navajo",typeLabel:"Piper Navajo PA-31",status:"Disponible" as const,active:true}))
];


export const ORIZON_OPERATIONAL_RESOURCES = [
  { id:"SIM-DCX", name:"DCX", resourceKind:"simulator", typeLabel:"Simulateur", detail:"Simulateur DCX", active:true },
  { id:"SIM-737MAX", name:"737MAX", resourceKind:"simulator", typeLabel:"Simulateur", detail:"Simulateur Boeing 737 MAX", active:true },
  { id:"ROOM-CLASS", name:"Salle de classe", resourceKind:"room", typeLabel:"Local", detail:"Théorie / sol", active:true },
  { id:"ROOM-EXAM", name:"Salle examen", resourceKind:"room", typeLabel:"Local", detail:"Examens", active:true },
  { id:"ROOM-BRIEFING", name:"Salle de briefing", resourceKind:"room", typeLabel:"Local", detail:"Briefing / debriefing", active:true },
  { id:"ROOM-CONFERENCE", name:"Salle de conférence", resourceKind:"room", typeLabel:"Local", detail:"Réunion / formation", active:true },
  { id:"ROOM-MERICI", name:"Local Mérici", resourceKind:"room", typeLabel:"Local", detail:"Local externe", active:true }
];

import type { Aircraft } from "./types";
export const ORIZON_AIRCRAFT: Aircraft[] = [
  ...["C-FZSX","C-GBQK","C-GZWJ","C-FFMQ","C-GFPA","C-GFPE","C-GJBF","C-FFQO","C-GQVQ","C-GFOW","C-GZKE","C-GZKJ"].map(registration => ({id:registration,registration,manufacturer:"Cessna",model:"152",typeLabel:"Cessna 152",status:"Disponible" as const,active:true})),
  ...["C-FCCC","C-GOAQ","C-GQVZ"].map(registration => ({id:registration,registration,manufacturer:"Cessna",model:"172",typeLabel:"Cessna 172",status:"Disponible" as const,active:true})),
  ...["C-GAFF","C-FRKG","C-GUMQ"].map(registration => ({id:registration,registration,manufacturer:"Piper",model:"PA-31 Navajo",typeLabel:"Piper Navajo PA-31",status:"Disponible" as const,active:true}))
];

import { SchedulerEvent, SchedulerResource } from "./types";

export const DEFAULT_RESOURCES: SchedulerResource[] = [
  { id: "c-gabc", kind: "aircraft", name: "C-GABC", detail: "Cessna 172 · Disponible" },
  { id: "c-gxyz", kind: "aircraft", name: "C-GXYZ", detail: "Cessna 152 · Disponible" },
  { id: "c-gqwe", kind: "aircraft", name: "C-GQWE", detail: "Cessna 172 · Disponible" },
  { id: "roger", kind: "instructor", name: "Roger Samson", detail: "Classe 1" },
  { id: "jeffrey", kind: "instructor", name: "Jeffrey", detail: "Classe 2" },
  { id: "classe", kind: "room", name: "Salle de classe", detail: "Théorie / sol" },
  { id: "examen", kind: "room", name: "Salle examen", detail: "Examens" },
  { id: "briefing", kind: "room", name: "Salle de briefing", detail: "Briefing / debriefing" },
  { id: "conference", kind: "room", name: "Salle de conférence", detail: "Réunion / formation" },
  { id: "merici", kind: "room", name: "Local Mérici", detail: "Local externe" }
];

export const DEFAULT_EVENTS: SchedulerEvent[] = [
  {
    id: "demo-1",
    date: new Date().toISOString().slice(0, 10),
    resourceId: "c-gabc",
    aircraftId: "c-gabc",
    instructorId: "roger",
    studentName: "Jean Tremblay",
    type: "Double commande",
    startMinutes: 8 * 60,
    endMinutes: 9 * 60 + 30,
    title: "Leçon 12"
  },
  {
    id: "demo-2",
    date: new Date().toISOString().slice(0, 10),
    resourceId: "c-gxyz",
    aircraftId: "c-gxyz",
    studentName: "Sophie Gagnon",
    type: "Solo",
    startMinutes: 10 * 60,
    endMinutes: 11 * 60,
    title: "Circuits"
  },
  {
    id: "demo-3",
    date: new Date().toISOString().slice(0, 10),
    resourceId: "briefing",
    roomId: "briefing",
    instructorId: "jeffrey",
    studentName: "Marc Dubois",
    type: "Sol",
    startMinutes: 13 * 60,
    endMinutes: 14 * 60,
    title: "Briefing navigation"
  }
];

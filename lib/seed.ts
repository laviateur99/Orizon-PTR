import { Student, Flight, TrainingNote, Instructor, Cohort, Aircraft, Reservation } from "./types";

export const seedInstructors: Instructor[] = [
  { id:"richard-samson", firstName:"Richard", lastName:"Samson", email:"rsamson@orizonaviationqc.com", phone:"", classLevel:"Classe 1", active:true },
  { id:"marc-beaulieu", firstName:"Marc", lastName:"Beaulieu", email:"", phone:"", classLevel:"Classe 2", active:true },
  { id:"julie-caron", firstName:"Julie", lastName:"Caron", email:"", phone:"", classLevel:"Classe 3", active:true }
];

export const seedCohorts: Cohort[] = [
  { id:"cpl-integre-2026-a", name:"CPL intégré 2026-A", program:"CPL intégré", startDate:"2026-01-15", status:"Active", leadInstructorId:"richard-samson" },
  { id:"ppl-modulaire-ete-2026", name:"PPL modulaire été 2026", program:"PPL modulaire", startDate:"2026-06-01", status:"Active", leadInstructorId:"marc-beaulieu" }
];

export const seedAircraft: Aircraft[] = [
  { id:"c-gabc", registration:"C-GABC", type:"C172", status:"Disponible", location:"CYQB", nextInspection:"2026-08-15", notes:"Avion principal formation CPL" },
  { id:"c-gxyz", registration:"C-GXYZ", type:"C152", status:"Disponible", location:"CYQB", nextInspection:"2026-08-03", notes:"Formation PPL" },
  { id:"c-gdef", registration:"C-GDEF", type:"DA40", status:"Maintenance", location:"Hangar", nextInspection:"2026-07-20", notes:"Maintenance planifiée" }
];

export const seedStudents: Student[] = [
  { id:"jeffrey-samson", firstName:"Jeffrey", lastName:"Samson", instructor:"Richard Samson", instructorId:"richard-samson", cohortId:"cpl-integre-2026-a", path:"CPL intégré", pathType:"integrated", phase:"Phase 2", lesson:"Leçon 20", progress:46, total:97.4, dual:54.2, solo:43.2, instrument:7.3, lastFlight:"11 juillet", alert:"Ex. 18 à reprendre", alertType:"warn" },
  { id:"sophie-tremblay", firstName:"Sophie", lastName:"Tremblay", instructor:"Marc Beaulieu", instructorId:"marc-beaulieu", cohortId:"ppl-modulaire-ete-2026", path:"PPL modulaire", pathType:"modular", phase:"Phase 1", lesson:"Leçon 14", progress:72, total:22.8, dual:18.6, solo:4.2, instrument:0, lastFlight:"Hier", alert:"Prête solo", alertType:"ok" },
  { id:"martin-gagnon", firstName:"Martin", lastName:"Gagnon", instructor:"Richard Samson", instructorId:"richard-samson", cohortId:"cpl-integre-2026-a", path:"ATP intégré", pathType:"integrated", phase:"Phase 1", lesson:"Leçon 8", progress:28, total:14.6, dual:14.6, solo:0, instrument:0, lastFlight:"8 juillet", alert:"Médical expire", alertType:"danger" }
];

export const seedReservations: Reservation[] = [
  { id:"r1", date:new Date().toISOString().slice(0,10), startTime:"09:00", endTime:"10:30", studentId:"jeffrey-samson", instructorId:"richard-samson", aircraftId:"c-gabc", type:"Double commande", lesson:"Leçon 20", status:"Confirmé", notes:"Déroutement et virage serré" },
  { id:"r2", date:new Date().toISOString().slice(0,10), startTime:"11:00", endTime:"12:00", studentId:"sophie-tremblay", aircraftId:"c-gxyz", type:"Solo", lesson:"Leçon 14", status:"Planifié", notes:"Premier solo si conditions OK" }
];

export const seedFlights: Flight[] = [
  { id:"f1", studentId:"jeffrey-samson", date:"2026-07-11", aircraft:"C172", aircraftId:"c-gabc", registration:"C-GABC", instructor:"Richard Samson", instructorId:"richard-samson", duration:1.4, dual:1.4, solo:0, instrument:0, lesson:"Leçon 20", exercises:"Déroutement, virage serré", result:"À revoir", comments:"Bon vol général. Revoir l'exercice 18." }
];

export const seedNotes: TrainingNote[] = [
  { id:"n1", studentId:"jeffrey-samson", date:"2026-07-11", author:"Richard Samson", category:"Formation", content:"L'élève progresse bien. Exercice 18 à reprendre avant la prochaine étape." }
];

export const trainingPhases = ["Phase 1 — Premier solo","Phase 2 — Premier vol voyage solo","Phase 3 — Test en vol privé","Phase 4 — Vol de nuit","Phase 5 — Vols voyages solo","Phase 6 — Vol aux instruments monomoteur","Phase 7 — Multimoteur et IFR multimoteur","Phase 8 — CPL","Phase 9 — Avion complexe","Phase 10 — MCC et jet"];

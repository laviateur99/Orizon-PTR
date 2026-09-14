import { collection, doc, getDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "@/services/firebase/client";
import { ATPA_PROGRAM } from "./data";
import { OFFICIAL_PROGRAMS, programForStudentSelection } from "./modularPrograms";
import type { TrainingProgram } from "./types";

export async function initializeTrainingProgramForStudent(studentId: string, selection: string, trainingProgramId = "") {
  let program:TrainingProgram|undefined=OFFICIAL_PROGRAMS.find(item=>item.id===trainingProgramId)||programForStudentSelection(selection);
  if(!program&&trainingProgramId){const snapshot=await getDoc(doc(db,"trainingPrograms",trainingProgramId));if(snapshot.exists())program={id:snapshot.id,...snapshot.data()} as TrainingProgram}
  if(!program&&selection==="ATP(A) intégré")program=ATPA_PROGRAM;
  if(!program)throw new Error("Choisissez d’abord le programme d’entraînement exact dans le dossier étudiant.");
  const batch = writeBatch(db);
  const settings = await getDoc(doc(db, "trainingPrograms", program.id));
  const displayName = typeof settings.data()?.displayName === "string" ? settings.data()!.displayName : program.name;

  for (const template of program.lessons) {
    // Keep the historical ATP(A) document IDs intact; modular programs use a
    // separate namespace so they cannot collide with existing student records.
    const lessonId = program.id === ATPA_PROGRAM.id
      ? `atpa-${studentId}-${template.number}`
      : `${program.id}-${studentId}-${template.number}`;
    const ref = doc(collection(db, "ptrLessons"), lessonId);
    const componentSummary = template.components.map(component => ({
      modality: component.modality,
      category: component.category,
      title: component.title,
      objective: component.objective,
      hours: component.hours,
      exercises: component.exercises,
      nextLesson: component.nextLesson,
      successCriteria: component.successCriteria,
      manualPage: component.manualPage
    }));

    batch.set(ref, {
      studentId,
      programId: program.id,
      programName: displayName,
      programRevision: program.revision,
      programEffectiveDate: program.effectiveDate,
      sourceManual: program.source,
      phase: `Phase ${template.phase} — ${template.phaseName}`,
      phaseNumber: template.phase,
      lessonNumber: String(template.number),
      title: template.title,
      objective: template.objectives.join("\n\n"),
      exercises: template.exercises,
      successCriteria: template.successCriteria,
      components: componentSummary,
      status: "Non commencé",
      linkedReservationId: "",
      createdAt: serverTimestamp(),
      updatedAt: new Date().toISOString()
    }, { merge: true });
  }

  await batch.commit();
  return program;
}

export async function initializeAtpaForStudent(studentId: string) {
  return initializeTrainingProgramForStudent(studentId, "ATP(A) intégré");
}

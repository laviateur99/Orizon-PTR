import { collection, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "@/services/firebase/client";
import { ATPA_PROGRAM } from "./data";

export async function initializeAtpaForStudent(studentId: string) {
  const batch = writeBatch(db);

  for (const template of ATPA_PROGRAM.lessons) {
    const ref = doc(collection(db, "ptrLessons"), `atpa-${studentId}-${template.number}`);
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
      programId: ATPA_PROGRAM.id,
      programRevision: ATPA_PROGRAM.revision,
      programEffectiveDate: ATPA_PROGRAM.effectiveDate,
      sourceManual: ATPA_PROGRAM.source,
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
}

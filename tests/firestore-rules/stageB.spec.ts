// Tests spécifiques à firestore.rules.stage-b : l'isolation par organisation sur les 5 collections
// héritées (aircraft, snags, reservations, notifications, instructorPins) n'est enforced qu'à
// l'étape B (D2/D9 : l'étape A reste volontairement permissive le temps de la migration).
// Couvre aussi (f) : lecture étudiante refusée sur aircraft/snags/reservations d'autrui, et le
// correctif instructorPins (un tiers ne peut écrire le hash d'un autre instructeur).
import { afterAll, beforeAll, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { MRO_A, SCHOOL_A, SCHOOL_B, makeEnv, seedCommon, seedDoc } from "./helpers";

describe("Isolation et correctifs — firestore.rules.stage-b", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await makeEnv("B");
    await seedCommon(testEnv, [
      { uid: "prm-a", role: "Maintenance", permissions: ["dashboard", "schedule", "fleet", "maintenance", "snags"], schoolOrgId: SCHOOL_A },
      { uid: "prm-b", role: "Maintenance", permissions: ["dashboard", "schedule", "fleet", "maintenance", "snags"], schoolOrgId: SCHOOL_B },
      { uid: "instructor-a", role: "Instructeur", permissions: ["dashboard", "schedule", "ptr"], linkedInstructorId: "instr-a", schoolOrgId: SCHOOL_A },
      { uid: "chef-a", role: "Chef instructeur", permissions: ["dashboard", "schedule", "ptr", "students", "instructors"], schoolOrgId: SCHOOL_A },
      { uid: "student-a", role: "Étudiant", permissions: ["dashboard", "schedule", "students", "ptr"], linkedStudentId: "stu-a", schoolOrgId: SCHOOL_A },
    ], [
      { orgId: SCHOOL_A, userId: "prm-a", role: "prm" },
      { orgId: SCHOOL_B, userId: "prm-b", role: "prm" },
      { orgId: SCHOOL_A, userId: "instructor-a", role: "staff" },
      { orgId: SCHOOL_A, userId: "chef-a", role: "admin" },
      { orgId: SCHOOL_A, userId: "student-a", role: "student" },
    ]);
  });
  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("(a) aircraft : un membre de l'école B ne lit ni ne modifie un avion de l'école A", async () => {
    await seedDoc(testEnv, "aircraft/ac-a1", { orgId: SCHOOL_A, registration: "C-ABC", status: "Disponible" });
    const asPrmB = testEnv.authenticatedContext("prm-b").firestore();
    await assertFails(getDoc(doc(asPrmB, "aircraft", "ac-a1")));
    await assertFails(setDoc(doc(asPrmB, "aircraft", "ac-a1"), { orgId: SCHOOL_A, registration: "C-ABC", status: "Hors service" }, { merge: true }));
  });

  it("(a) aircraft : un document sans orgId est refusé à la création", async () => {
    const asPrmA = testEnv.authenticatedContext("prm-a").firestore();
    await assertFails(setDoc(doc(asPrmA, "aircraft", "ac-no-org"), { registration: "C-XYZ", status: "Disponible" }));
  });

  it("(a) snags : isolation par organisation, document sans orgId refusé", async () => {
    await seedDoc(testEnv, "snags/sn-a1", { orgId: SCHOOL_A, aircraftId: "ac-a1", status: "Ouvert" });
    const asPrmB = testEnv.authenticatedContext("prm-b").firestore();
    await assertFails(getDoc(doc(asPrmB, "snags", "sn-a1")));
    await assertFails(setDoc(doc(asPrmB, "snags", "sn-no-org"), { aircraftId: "ac-a1", status: "Ouvert" }));
  });

  it("(a) reservations : isolation par organisation, document sans orgId refusé", async () => {
    await seedDoc(testEnv, "reservations/res-a1", { orgId: SCHOOL_A, studentId: "stu-a", date: "2026-01-01", startMinutes: 0, endMinutes: 60, status: "Planifié" });
    const asPrmB = testEnv.authenticatedContext("prm-b").firestore();
    await assertFails(getDoc(doc(asPrmB, "reservations", "res-a1")));
    await assertFails(setDoc(doc(asPrmB, "reservations", "res-no-org"), { studentId: "x", date: "2026-01-01", startMinutes: 0, endMinutes: 60, status: "Planifié" }));
  });

  it("(a) notifications : isolation par organisation, document sans orgId refusé", async () => {
    await seedDoc(testEnv, "notifications/no-a1", { orgId: SCHOOL_A, type: "snag", snagId: "sn-a1", title: "Titre" });
    const asPrmB = testEnv.authenticatedContext("prm-b").firestore();
    await assertFails(getDoc(doc(asPrmB, "notifications", "no-a1")));
    await assertFails(setDoc(doc(asPrmB, "notifications", "no-no-org"), { type: "snag", snagId: "sn-a1", title: "Titre" }));
  });

  it("(a) instructorPins : isolation par organisation", async () => {
    await seedDoc(testEnv, "instructorPins/instr-a", { orgId: SCHOOL_A, hash: "h", salt: "s", failedAttempts: 0 });
    const asPrmB = testEnv.authenticatedContext("prm-b").firestore();
    await assertFails(getDoc(doc(asPrmB, "instructorPins", "instr-a")));
  });

  it("(f) un étudiant ne lit pas aircraft/snags d'autrui", async () => {
    await seedDoc(testEnv, "aircraft/ac-a2", { orgId: SCHOOL_A, registration: "C-DEF", status: "Disponible" });
    await seedDoc(testEnv, "snags/sn-a2", { orgId: SCHOOL_A, aircraftId: "ac-a2", status: "Ouvert" });
    const asStudent = testEnv.authenticatedContext("student-a").firestore();
    await assertFails(getDoc(doc(asStudent, "aircraft", "ac-a2")));
    await assertFails(getDoc(doc(asStudent, "snags", "sn-a2")));
  });

  it("(f) un étudiant lit sa propre réservation mais pas celle d'un autre étudiant", async () => {
    await seedDoc(testEnv, "reservations/res-own", { orgId: SCHOOL_A, studentId: "stu-a", date: "2026-01-01", startMinutes: 0, endMinutes: 60, status: "Planifié" });
    await seedDoc(testEnv, "reservations/res-other", { orgId: SCHOOL_A, studentId: "stu-other", date: "2026-01-01", startMinutes: 0, endMinutes: 60, status: "Planifié" });
    const asStudent = testEnv.authenticatedContext("student-a").firestore();
    await assertSucceeds(getDoc(doc(asStudent, "reservations", "res-own")));
    await assertFails(getDoc(doc(asStudent, "reservations", "res-other")));
  });

  it("(f) instructorPins : un chef instructeur ou un administrateur ne peut pas écrire le hash d'un autre instructeur", async () => {
    const asChefA = testEnv.authenticatedContext("chef-a").firestore(); // rôle Chef instructeur, admin() est faux pour ce rôle
    await assertFails(setDoc(doc(asChefA, "instructorPins", "instr-a"), { orgId: SCHOOL_A, hash: "h2", salt: "s2", failedAttempts: 0 }));
    // L'instructeur lié à sa propre fiche, lui, le peut.
    const asInstructorA = testEnv.authenticatedContext("instructor-a").firestore();
    await assertSucceeds(setDoc(doc(asInstructorA, "instructorPins", "instr-a"), { orgId: SCHOOL_A, hash: "h3", salt: "s3", failedAttempts: 0 }));
  });

  it("(a) technicianPins : appartenance à une organisation de type mro exigée à la création", async () => {
    await seedCommon(testEnv, [
      { uid: "tech-x", role: "OMA", permissions: ["oma"], mroOrgId: MRO_A },
      { uid: "tech-y", role: "OMA", permissions: ["oma"] },
    ], [
      { orgId: MRO_A, userId: "tech-x", role: "technician" },
      { orgId: SCHOOL_A, userId: "tech-y", role: "staff" },
    ]);
    const asTechX = testEnv.authenticatedContext("tech-x").firestore();
    await assertSucceeds(setDoc(doc(asTechX, "technicianPins", "tech-x"), { orgId: MRO_A, hash: "h", salt: "s", failedAttempts: 0 }));
    // tech-y est bien membre de SCHOOL_A, mais celle-ci est de type "school", pas "mro" : refusé.
    const asTechY = testEnv.authenticatedContext("tech-y").firestore();
    await assertFails(setDoc(doc(asTechY, "technicianPins", "tech-y"), { orgId: SCHOOL_A, hash: "h", salt: "s", failedAttempts: 0 }));
  });
});

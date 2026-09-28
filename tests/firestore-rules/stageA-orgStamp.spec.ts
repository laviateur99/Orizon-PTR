// (g) orgStamp — clause transitoire de firestore.rules (étape A seulement, retirée à l'étape B) :
// un administrateur peut poser orgId une seule fois sur un document qui n'en a pas, jamais le
// changer ensuite. Testé sur instructorPins (l'une des trois collections où cette clause s'applique,
// avec snags et notifications — voir D2/D9 de docs/audit-maintenance.md).
import { afterAll, beforeAll, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, updateDoc } from "firebase/firestore";
import { SCHOOL_A, SCHOOL_B, makeEnv, seedCommon, seedDoc } from "./helpers";

describe("orgStamp (transitoire) — firestore.rules étape A", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await makeEnv("A");
    await seedCommon(testEnv, [
      { uid: "admin-1", role: "Administrateur", permissions: [] },
    ], []);
  });
  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("un administrateur peut poser orgId une seule fois sur un document qui n'en a pas", async () => {
    await seedDoc(testEnv, "instructorPins/instr-stamp", { hash: "h", salt: "s", failedAttempts: 0 }); // pas d'orgId au départ
    const asAdmin = testEnv.authenticatedContext("admin-1").firestore();
    await assertSucceeds(updateDoc(doc(asAdmin, "instructorPins", "instr-stamp"), { orgId: SCHOOL_A }));
  });

  it("l'administrateur ne peut plus changer orgId une fois posé", async () => {
    await seedDoc(testEnv, "instructorPins/instr-stamp-2", { orgId: SCHOOL_A, hash: "h", salt: "s", failedAttempts: 0 }); // déjà étiqueté
    const asAdmin = testEnv.authenticatedContext("admin-1").firestore();
    await assertFails(updateDoc(doc(asAdmin, "instructorPins", "instr-stamp-2"), { orgId: SCHOOL_B }));
  });

  it("orgStamp ne permet pas de modifier un autre champ en même temps", async () => {
    await seedDoc(testEnv, "instructorPins/instr-stamp-3", { hash: "h", salt: "s", failedAttempts: 0 });
    const asAdmin = testEnv.authenticatedContext("admin-1").firestore();
    await assertFails(updateDoc(doc(asAdmin, "instructorPins", "instr-stamp-3"), { orgId: SCHOOL_A, hash: "nouveau-hash" }));
  });
});

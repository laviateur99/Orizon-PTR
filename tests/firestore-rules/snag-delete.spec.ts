import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, writeBatch } from "firebase/firestore";
import { SCHOOL_A, makeEnv, seedCommon, seedDoc, type Stage } from "./helpers";

describe.each(["A", "B"] as Stage[])("Suppression SNAG — règles %s", stage => {
  let env: RulesTestEnvironment;
  beforeAll(async () => {
    env = await makeEnv(stage);
    await seedCommon(env, [{ uid: "snag-admin", role: "Administrateur", schoolOrgId: SCHOOL_A }], [{ orgId: SCHOOL_A, userId: "snag-admin", role: "admin" }]);
  });
  afterAll(async () => { await env?.cleanup(); });

  it("supprime un SNAG neuf sans champ workOrderId, archive et libère l'avion atomiquement", async () => {
    await seedDoc(env, "snags/erreur", { orgId: SCHOOL_A, aircraftId: "avion", status: "Ouvert", defectTitle: "Erreur" });
    await seedDoc(env, "aircraft/avion", { orgId: SCHOOL_A, status: "SNAG", blockedForScheduling: true });
    const db = env.authenticatedContext("snag-admin").firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, "snagHistory/erreur"), { actor: "Administrateur", action: "Suppression administrative", snagId: "erreur" });
    batch.delete(doc(db, "snags/erreur"));
    batch.update(doc(db, "aircraft/avion"), { status: "Disponible", blockedForScheduling: false });
    await assertSucceeds(batch.commit());
    await env.withSecurityRulesDisabled(async ctx => {
      expect((await getDoc(doc(ctx.firestore(), "snags/erreur"))).exists()).toBe(false);
    });
    expect((await getDoc(doc(db, "aircraft/avion"))).data()?.blockedForScheduling).toBe(false);
    expect((await getDoc(doc(db, "snagHistory/erreur"))).exists()).toBe(true);
  });

  it("refuse la suppression si un travail est lié et ne change pas l'avion", async () => {
    await seedDoc(env, "snags/lie", { orgId: SCHOOL_A, aircraftId: "avion-lie", status: "Ouvert", workOrderId: "travail" });
    await seedDoc(env, "aircraft/avion-lie", { orgId: SCHOOL_A, status: "SNAG", blockedForScheduling: true });
    const db = env.authenticatedContext("snag-admin").firestore();
    const batch = writeBatch(db);
    batch.delete(doc(db, "snags/lie"));
    batch.update(doc(db, "aircraft/avion-lie"), { status: "Disponible", blockedForScheduling: false });
    await assertFails(batch.commit());
    expect((await getDoc(doc(db, "aircraft/avion-lie"))).data()?.blockedForScheduling).toBe(true);
  });
});

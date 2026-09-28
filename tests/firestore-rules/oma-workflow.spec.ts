// Tests communs aux deux fichiers de règles (le flux OMA — organizations/members, workOrders,
// projects, workCards, signatures, entries, technicianPins — exige orgId et l'appartenance à
// l'organisation dans firestore.rules ET firestore.rules.stage-b : ces règles sont identiques
// entre les deux fichiers, donc les tests sont exécutés une fois par étape via describe.each.
import { afterAll, beforeAll, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { MRO_A, MRO_B, SCHOOL_A, SCHOOL_B, makeEnv, seedCommon, seedDoc, type Stage } from "./helpers";

describe.each<Stage>(["A", "B"])("Flux OMA (organisations/workOrders/projects/workCards) — étape %s", stage => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await makeEnv(stage);
  });
  afterAll(async () => {
    await testEnv.cleanup();
  });

  async function seedScenario() {
    await seedCommon(testEnv, [
      { uid: "prm-a", role: "Maintenance", permissions: ["dashboard", "schedule", "fleet", "maintenance"], schoolOrgId: SCHOOL_A },
      { uid: "prm-a-2", role: "Maintenance", permissions: ["dashboard", "schedule", "fleet", "maintenance"], schoolOrgId: SCHOOL_A },
      { uid: "prm-b", role: "Maintenance", permissions: ["dashboard", "schedule", "fleet", "maintenance"], schoolOrgId: SCHOOL_B },
      { uid: "tech-a", role: "OMA", permissions: ["oma"], mroOrgId: MRO_A },
      { uid: "tech-a-2", role: "OMA", permissions: ["oma"], mroOrgId: MRO_A },
      { uid: "tech-b", role: "OMA", permissions: ["oma"], mroOrgId: MRO_B },
      // Rôle PRM/admin côté OMA : seul lui peut accepter un bon, déposer le rapport ou réassigner
      // une carte — un simple technicien (rôle org "technician") ne le peut pas.
      { uid: "oma-prm-a", role: "OMA", permissions: ["oma"], mroOrgId: MRO_A },
      { uid: "admin-both", role: "Administrateur", permissions: [], schoolOrgId: SCHOOL_A, mroOrgId: MRO_A },
    ], [
      { orgId: SCHOOL_A, userId: "prm-a", role: "prm" },
      { orgId: SCHOOL_A, userId: "prm-a-2", role: "prm" },
      { orgId: SCHOOL_B, userId: "prm-b", role: "prm" },
      { orgId: MRO_A, userId: "tech-a", role: "technician" },
      { orgId: MRO_A, userId: "tech-a-2", role: "technician" },
      { orgId: MRO_B, userId: "tech-b", role: "technician" },
      { orgId: MRO_A, userId: "oma-prm-a", role: "prm" },
      { orgId: SCHOOL_A, userId: "admin-both", role: "admin" },
      { orgId: MRO_A, userId: "admin-both", role: "admin" },
    ]);
  }

  /** Fait avancer un bon de travail jusqu'à `pris_en_charge`, avec un projet et une carte déjà
   * fermée et signée par `signerUid`. Retourne les identifiants utiles pour la suite du scénario. */
  async function seedWorkOrderWithSignedCard(woId: string, signerUid: string) {
    await seedDoc(testEnv, `workOrders/${woId}`, {
      orgId: SCHOOL_A, sharedWithOrgId: MRO_A, status: "pris_en_charge", aircraftId: "AC1", aircraftRegistration: "C-ABC",
      title: "Inspection 100h", description: "", tasks: [], createdBy: { uid: "prm-a", name: "prm-a" }, createdAt: serverTimestamp(),
      acceptedBy: { uid: "tech-a", name: "tech-a" }, acceptedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    await seedDoc(testEnv, `projects/${woId}`, {
      orgId: MRO_A, workOrderOrgId: SCHOOL_A, cardCount: 1, openCardCount: 0, signerUids: [signerUid],
      lastCardId: `${woId}-card1`, lastClosedCardId: `${woId}-card1`, lastSignatureId: "sig1",
      openedBy: { uid: "tech-a", name: "tech-a" }, openedAt: serverTimestamp(),
    });
    await seedDoc(testEnv, `workCards/${woId}-card1`, {
      orgId: MRO_A, workOrderOrgId: SCHOOL_A, projectId: woId, ata: "05", subject: "Inspection 100h", type: "routine",
      assignedUserId: signerUid, assignedUserName: signerUid, status: "ferme", rectification: "Fait", parts: [],
      createdBy: { uid: "tech-a", name: "tech-a" }, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      signedAt: serverTimestamp(), signedBy: signerUid, signedContentHash: "a".repeat(64), signatureId: "sig1",
    });
    await seedDoc(testEnv, `workCards/${woId}-card1/signatures/sig1`, {
      cardId: `${woId}-card1`, orgId: MRO_A, workOrderOrgId: SCHOOL_A, projectId: woId, signerUid,
      contentHash: "a".repeat(64), hashAlgo: "sha256", licenseNumber: "ACA-1", classMatch: "unspecified",
      signedAt: serverTimestamp(),
    });
  }

  it("(a) organizations/members : un membre de l'école B ne lit pas les membres de l'école A", async () => {
    await seedScenario();
    const asPrmB = testEnv.authenticatedContext("prm-b").firestore();
    await assertFails(getDoc(doc(asPrmB, "organizations", SCHOOL_A, "members", "prm-a")));
  });

  it("(a) workOrders : un membre d'une autre école ne lit ni ne modifie un bon qui ne le concerne pas", async () => {
    await seedScenario();
    await seedDoc(testEnv, "workOrders/wo-iso", {
      orgId: SCHOOL_A, sharedWithOrgId: MRO_A, status: "brouillon", aircraftId: "AC1", aircraftRegistration: "C-ABC",
      title: "Test", description: "", tasks: [], createdBy: { uid: "prm-a", name: "prm-a" }, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    const asPrmB = testEnv.authenticatedContext("prm-b").firestore();
    await assertFails(getDoc(doc(asPrmB, "workOrders", "wo-iso")));
    await assertFails(updateDoc(doc(asPrmB, "workOrders", "wo-iso"), { status: "transmis", transmittedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  });

  it("(a) projects/workCards : un technicien d'une autre OMA ne lit pas le projet ni ses cartes", async () => {
    await seedScenario();
    await seedWorkOrderWithSignedCard("wo-iso2", "tech-a");
    const asTechB = testEnv.authenticatedContext("tech-b").firestore();
    await assertFails(getDoc(doc(asTechB, "projects", "wo-iso2")));
    await assertFails(getDoc(doc(asTechB, "workCards", "wo-iso2-card1")));
  });

  it("(a) technicianPins : un membre d'une autre OMA ne lit pas le NIP", async () => {
    await seedScenario();
    await seedDoc(testEnv, "technicianPins/tech-a", { orgId: MRO_A, hash: "h", salt: "s", failedAttempts: 0 });
    const asTechB = testEnv.authenticatedContext("tech-b").firestore();
    await assertFails(getDoc(doc(asTechB, "technicianPins", "tech-a")));
  });

  it("(b) l'OMA destinataire ne peut modifier que le statut/rapport, pas les champs de l'école", async () => {
    await seedScenario();
    await seedDoc(testEnv, "workOrders/wo-b", {
      orgId: SCHOOL_A, sharedWithOrgId: MRO_A, status: "transmis", aircraftId: "AC1", aircraftRegistration: "C-ABC",
      title: "Titre école", description: "", tasks: [], createdBy: { uid: "prm-a", name: "prm-a" }, createdAt: serverTimestamp(),
      transmittedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    await seedDoc(testEnv, "projects/wo-b", {
      orgId: MRO_A, workOrderOrgId: SCHOOL_A, cardCount: 0, openCardCount: 0, signerUids: [],
      openedBy: { uid: "tech-a", name: "tech-a" }, openedAt: serverTimestamp(),
    });
    const asOmaPrmA = testEnv.authenticatedContext("oma-prm-a").firestore();
    // Acceptation légitime : seuls status/acceptedBy/acceptedAt/updatedAt changent.
    await assertSucceeds(updateDoc(doc(asOmaPrmA, "workOrders", "wo-b"), {
      status: "pris_en_charge", acceptedBy: { uid: "oma-prm-a", name: "oma-prm-a" }, acceptedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
    // Tentative de modifier en plus un champ de l'école dans la même écriture : refusée.
    await seedDoc(testEnv, "workOrders/wo-b2", {
      orgId: SCHOOL_A, sharedWithOrgId: MRO_A, status: "transmis", aircraftId: "AC1", aircraftRegistration: "C-ABC",
      title: "Titre école", description: "", tasks: [], createdBy: { uid: "prm-a", name: "prm-a" }, createdAt: serverTimestamp(),
      transmittedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    await seedDoc(testEnv, "projects/wo-b2", {
      orgId: MRO_A, workOrderOrgId: SCHOOL_A, cardCount: 0, openCardCount: 0, signerUids: [],
      openedBy: { uid: "oma-prm-a", name: "oma-prm-a" }, openedAt: serverTimestamp(),
    });
    await assertFails(updateDoc(doc(asOmaPrmA, "workOrders", "wo-b2"), {
      status: "pris_en_charge", acceptedBy: { uid: "oma-prm-a", name: "oma-prm-a" }, acceptedAt: serverTimestamp(), updatedAt: serverTimestamp(),
      title: "Modifié par l'OMA",
    }));
  });

  it("(b) l'OMA ne peut pas exécuter une transition réservée à l'école (contrôle PRM)", async () => {
    await seedScenario();
    await seedDoc(testEnv, "workOrders/wo-b3", {
      orgId: SCHOOL_A, sharedWithOrgId: MRO_A, status: "rapport_depose", aircraftId: "AC1", aircraftRegistration: "C-ABC",
      title: "Titre école", description: "", tasks: [], createdBy: { uid: "prm-a", name: "prm-a" }, createdAt: serverTimestamp(),
      report: { summary: "Fait", depositedBy: { uid: "oma-prm-a", name: "oma-prm-a" } }, updatedAt: serverTimestamp(),
    });
    await seedDoc(testEnv, "projects/wo-b3", { orgId: MRO_A, workOrderOrgId: SCHOOL_A, cardCount: 0, openCardCount: 0, signerUids: [], openedBy: { uid: "oma-prm-a", name: "oma-prm-a" }, openedAt: serverTimestamp() });
    const asOmaPrmA = testEnv.authenticatedContext("oma-prm-a").firestore();
    await assertFails(updateDoc(doc(asOmaPrmA, "workOrders", "wo-b3"), {
      status: "controle_prm", control: { by: { uid: "oma-prm-a", name: "oma-prm-a" } }, updatedAt: serverTimestamp(),
    }));
  });

  it("(c) séparation des tâches : le technicien signataire est refusé sur les deux transitions de contrôle", async () => {
    await seedScenario();
    // Première transition (rapport_depose -> controle_prm) : prm-a est le signataire de la carte.
    await seedWorkOrderWithSignedCard("wo-c1", "prm-a");
    await seedDoc(testEnv, "workOrders/wo-c1", {
      orgId: SCHOOL_A, sharedWithOrgId: MRO_A, status: "rapport_depose", aircraftId: "AC1", aircraftRegistration: "C-ABC",
      title: "T", description: "", tasks: [], createdBy: { uid: "prm-a", name: "prm-a" }, createdAt: serverTimestamp(),
      report: { summary: "Fait", depositedBy: { uid: "tech-a", name: "tech-a" } }, updatedAt: serverTimestamp(),
    });
    const asPrmA = testEnv.authenticatedContext("prm-a").firestore();
    await assertFails(updateDoc(doc(asPrmA, "workOrders", "wo-c1"), {
      status: "controle_prm", control: { by: { uid: "prm-a", name: "prm-a" } }, updatedAt: serverTimestamp(),
    }));
    // Un autre PRM, non signataire, est accepté.
    const asPrmA2 = testEnv.authenticatedContext("prm-a-2").firestore();
    await assertSucceeds(updateDoc(doc(asPrmA2, "workOrders", "wo-c1"), {
      status: "controle_prm", control: { by: { uid: "prm-a-2", name: "prm-a-2" } }, updatedAt: serverTimestamp(),
    }));

    // Deuxième transition (controle_prm -> cloture) : même garde, testée séparément.
    await seedWorkOrderWithSignedCard("wo-c2", "prm-a");
    await seedDoc(testEnv, "workOrders/wo-c2", {
      orgId: SCHOOL_A, sharedWithOrgId: MRO_A, status: "controle_prm", aircraftId: "AC1", aircraftRegistration: "C-ABC",
      title: "T", description: "", tasks: [], createdBy: { uid: "prm-a", name: "prm-a" }, createdAt: serverTimestamp(),
      control: { by: { uid: "prm-a-2", name: "prm-a-2" } }, updatedAt: serverTimestamp(),
    });
    await assertFails(updateDoc(doc(asPrmA, "workOrders", "wo-c2"), {
      status: "cloture", rts: { by: { uid: "prm-a", name: "prm-a" } }, updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(doc(asPrmA2, "workOrders", "wo-c2"), {
      status: "cloture", rts: { by: { uid: "prm-a-2", name: "prm-a-2" } }, updatedAt: serverTimestamp(),
    }));
  });

  it("(c) séparation des tâches : aucune exception administrateur", async () => {
    await seedScenario();
    // admin-both est admin à l'école ET à l'OMA, et a signé la carte comme technicien.
    await seedWorkOrderWithSignedCard("wo-c3", "admin-both");
    await seedDoc(testEnv, "workOrders/wo-c3", {
      orgId: SCHOOL_A, sharedWithOrgId: MRO_A, status: "rapport_depose", aircraftId: "AC1", aircraftRegistration: "C-ABC",
      title: "T", description: "", tasks: [], createdBy: { uid: "prm-a", name: "prm-a" }, createdAt: serverTimestamp(),
      report: { summary: "Fait", depositedBy: { uid: "admin-both", name: "admin-both" } }, updatedAt: serverTimestamp(),
    });
    const asAdmin = testEnv.authenticatedContext("admin-both").firestore();
    await assertFails(updateDoc(doc(asAdmin, "workOrders", "wo-c3"), {
      status: "controle_prm", control: { by: { uid: "admin-both", name: "admin-both" } }, updatedAt: serverTimestamp(),
    }));
  });

  it("(d) même personne, rôles différents : un non-signataire peut contrôler PUIS clôturer", async () => {
    await seedScenario();
    await seedWorkOrderWithSignedCard("wo-d1", "tech-a"); // signataire = technicien, distinct de prm-a
    await seedDoc(testEnv, "workOrders/wo-d1", {
      orgId: SCHOOL_A, sharedWithOrgId: MRO_A, status: "rapport_depose", aircraftId: "AC1", aircraftRegistration: "C-ABC",
      title: "T", description: "", tasks: [], createdBy: { uid: "prm-a", name: "prm-a" }, createdAt: serverTimestamp(),
      report: { summary: "Fait", depositedBy: { uid: "tech-a", name: "tech-a" } }, updatedAt: serverTimestamp(),
    });
    const asPrmA = testEnv.authenticatedContext("prm-a").firestore();
    await assertSucceeds(updateDoc(doc(asPrmA, "workOrders", "wo-d1"), {
      status: "controle_prm", control: { by: { uid: "prm-a", name: "prm-a" } }, updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(doc(asPrmA, "workOrders", "wo-d1"), {
      status: "cloture", rts: { by: { uid: "prm-a", name: "prm-a" } }, updatedAt: serverTimestamp(),
    }));
  });

  it("(e) une signature déjà créée est immuable (update/delete refusés)", async () => {
    await seedScenario();
    await seedWorkOrderWithSignedCard("wo-e1", "tech-a");
    const asTechA = testEnv.authenticatedContext("tech-a").firestore();
    await assertFails(updateDoc(doc(asTechA, "workCards", "wo-e1-card1", "signatures", "sig1"), { contentHash: "b".repeat(64) }));
    const asPrmA = testEnv.authenticatedContext("prm-a").firestore();
    await assertFails(updateDoc(doc(asPrmA, "workCards", "wo-e1-card1", "signatures", "sig1"), { hashAlgo: "sha1" }));
  });

  it("(e) une carte signée (fermée) n'est plus modifiable", async () => {
    await seedScenario();
    await seedWorkOrderWithSignedCard("wo-e2", "tech-a");
    const asTechA = testEnv.authenticatedContext("tech-a").firestore();
    await assertFails(updateDoc(doc(asTechA, "workCards", "wo-e2-card1"), { rectification: "Modifié après signature" }));
  });

  it("(e) une signature légitime peut être créée : carte + signature + projet dans le même commit", async () => {
    await seedScenario();
    const woId = "wo-e3", cardId = `${woId}-card1`, sigId = "sig1", hash = "c".repeat(64);
    await seedDoc(testEnv, `workOrders/${woId}`, {
      orgId: SCHOOL_A, sharedWithOrgId: MRO_A, status: "pris_en_charge", aircraftId: "AC1", aircraftRegistration: "C-ABC",
      title: "T", description: "", tasks: [], createdBy: { uid: "prm-a", name: "prm-a" }, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    await seedDoc(testEnv, `projects/${woId}`, {
      orgId: MRO_A, workOrderOrgId: SCHOOL_A, cardCount: 1, openCardCount: 1, signerUids: [],
      lastCardId: cardId, openedBy: { uid: "tech-a", name: "tech-a" }, openedAt: serverTimestamp(),
    });
    await seedDoc(testEnv, `workCards/${cardId}`, {
      orgId: MRO_A, workOrderOrgId: SCHOOL_A, projectId: woId, ata: "05", subject: "Inspection 100h", type: "routine",
      assignedUserId: "tech-a", assignedUserName: "tech-a", status: "ouvert", rectification: "Fait", parts: [],
      createdBy: { uid: "tech-a", name: "tech-a" }, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    const asTechA = testEnv.authenticatedContext("tech-a").firestore();
    const batch = writeBatch(asTechA);
    batch.update(doc(asTechA, "workCards", cardId), {
      status: "ferme", signedAt: serverTimestamp(), signedBy: "tech-a", signedContentHash: hash, signatureId: sigId, updatedAt: serverTimestamp(),
    });
    batch.set(doc(asTechA, "workCards", cardId, "signatures", sigId), {
      cardId, orgId: MRO_A, workOrderOrgId: SCHOOL_A, projectId: woId, signerUid: "tech-a",
      contentHash: hash, hashAlgo: "sha256", licenseNumber: "ACA-1", classMatch: "unspecified", signedAt: serverTimestamp(),
    });
    batch.update(doc(asTechA, "projects", woId), {
      openCardCount: 0, signerUids: ["tech-a"], lastClosedCardId: cardId, lastSignatureId: sigId,
    });
    await assertSucceeds(batch.commit());
  });
});

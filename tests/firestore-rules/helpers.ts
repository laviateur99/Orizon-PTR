// Harnais commun pour les tests d'émulateur des règles Firestore.
// Nécessite l'émulateur Firestore démarré (voir package.json, script "test:rules",
// qui l'encapsule avec `firebase emulators:exec`). Deux "projets" de test distincts
// hébergent chacun un jeu de règles (étape A = firestore.rules, étape B =
// firestore.rules.stage-b) dans la même instance d'émulateur.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  initializeTestEnvironment, type RulesTestEnvironment, type RulesTestContext,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

const here = dirname(fileURLToPath(import.meta.url));
export const RULES_A = readFileSync(resolve(here, "../../firestore.rules"), "utf8");
export const RULES_B = readFileSync(resolve(here, "../../firestore.rules.stage-b"), "utf8");

export type Stage = "A" | "B";

const EMULATOR_HOST = "127.0.0.1";
const EMULATOR_PORT = 8080;

export async function makeEnv(stage: Stage): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: `orizon-rules-test-${stage.toLowerCase()}`,
    firestore: { rules: stage === "A" ? RULES_A : RULES_B, host: EMULATOR_HOST, port: EMULATOR_PORT },
  });
}

// --- Identifiants d'organisations utilisés par les tests ---
export const SCHOOL_A = "school-a";
export const SCHOOL_B = "school-b";
export const MRO_A = "mro-a";
export const MRO_B = "mro-b";

export type SeedUser = {
  uid: string;
  role: string;
  permissions?: string[];
  linkedInstructorId?: string;
  linkedStudentId?: string;
  orgIds?: string[];
  schoolOrgId?: string;
  mroOrgId?: string;
};

export type SeedMember = { orgId: string; userId: string; role: "admin" | "prm" | "dom" | "technician" | "staff" | "student" };

/**
 * Écrit, en contournant les règles (SDK admin de test), le jeu de données minimal partagé par
 * la plupart des scénarios : organisations, fiches `users/{uid}` et `organizations/{orgId}/members/{uid}`.
 */
export async function seedCommon(testEnv: RulesTestEnvironment, users: SeedUser[], members: SeedMember[]) {
  await testEnv.withSecurityRulesDisabled(async (ctx: RulesTestContext) => {
    const db = ctx.firestore();
    await Promise.all([
      setDoc(doc(db, "organizations", SCHOOL_A), { name: "École A", type: "school" }),
      setDoc(doc(db, "organizations", SCHOOL_B), { name: "École B", type: "school" }),
      setDoc(doc(db, "organizations", MRO_A), { name: "OMA A", type: "mro" }),
      setDoc(doc(db, "organizations", MRO_B), { name: "OMA B", type: "mro" }),
    ]);
    await Promise.all(users.map(u => setDoc(doc(db, "users", u.uid), {
      name: u.uid, email: `${u.uid}@test.local`, role: u.role, permissions: u.permissions ?? [],
      active: true, linkedInstructorId: u.linkedInstructorId ?? "", linkedStudentId: u.linkedStudentId ?? "",
      orgIds: u.orgIds ?? [], ...(u.schoolOrgId ? { schoolOrgId: u.schoolOrgId } : {}), ...(u.mroOrgId ? { mroOrgId: u.mroOrgId } : {}),
    })));
    await Promise.all(members.map(m => setDoc(doc(db, "organizations", m.orgId, "members", m.userId), {
      userId: m.userId, orgId: m.orgId, role: m.role, active: true, displayName: m.userId,
    })));
  });
}

/** Écrit un document quelconque en contournant les règles (données de départ d'un scénario). Chemin séparé par "/". */
export async function seedDoc(testEnv: RulesTestEnvironment, path: string, data: Record<string, unknown>) {
  await testEnv.withSecurityRulesDisabled(async (ctx: RulesTestContext) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}

export const ts = () => serverTimestamp();

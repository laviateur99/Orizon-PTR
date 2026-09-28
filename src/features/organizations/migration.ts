import { arrayUnion, collection, doc, getDocs, setDoc, updateDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "@/services/firebase/client";
import { DEFAULT_ORGANIZATIONS, ORG_MRO_ID, ORG_SCHOOL_ID, orgRoleForUserRole, type OrgRole } from "./types";
import type { UserRole } from "@/features/auth/types";

/** Collections à étiqueter (périmètre de la phase 1). */
export const TAGGED_COLLECTIONS = ["aircraft", "snags", "reservations", "notifications", "instructorPins"] as const;
const BATCH_SIZE = 400;

export type CollectionReport = {
  collection: string;
  scanned: number;
  alreadyTagged: number;        // déjà un orgId (laissés tels quels)
  taggedAsOma: number;          // dont déjà identifiés comme appartenant à l'OMA
  toTag: number;
  tagged: number;
  errors: { id: string; message: string }[];
};

export type StaffingReport = {
  orgId: string;
  members: number;
  controllers: number;          // membres pouvant tenir le rôle de PRM (prm ou admin)
  warnings: string[];
};

export type MigrationReport = {
  dryRun: boolean;
  organizations: { toCreate: string[]; existing: string[] };
  members: { scanned: number; toCreate: number; created: number; errors: { id: string; message: string }[] };
  users: { toUpdate: number; updated: number; errors: { id: string; message: string }[] };
  collections: CollectionReport[];
  staffing: StaffingReport[];
  remainingToTag: number;
  startedAt: string;
  finishedAt: string;
};

const message = (error: unknown) => error instanceof Error ? error.message : String(error);

/**
 * Migration ponctuelle vers le modèle multi-organisation (administrateur seulement).
 *  - crée les organisations orizon-aviation (school) et orizon-maintenance (mro);
 *  - crée une fiche `members` par utilisateur existant dans orizon-aviation (rôle déduit du rôle actuel);
 *  - étiquette orgId = orizon-aviation sur les documents des collections du périmètre, sauf s'ils ont déjà
 *    un orgId (idempotent). Aucun document existant n'est identifiable comme appartenant à l'OMA aujourd'hui.
 * En simulation (dryRun) rien n'est écrit : le rapport indique ce qui SERAIT fait.
 */
export async function runOrganizationMigration({ dryRun }: { dryRun: boolean }): Promise<MigrationReport> {
  const startedAt = new Date().toISOString();

  // 1. Organisations
  const existingOrgs = new Set((await getDocs(collection(db, "organizations"))).docs.map(item => item.id));
  const orgReport = { toCreate: DEFAULT_ORGANIZATIONS.filter(org => !existingOrgs.has(org.id)).map(org => org.id), existing: DEFAULT_ORGANIZATIONS.filter(org => existingOrgs.has(org.id)).map(org => org.id) };
  if (!dryRun) {
    for (const org of DEFAULT_ORGANIZATIONS.filter(item => !existingOrgs.has(item.id))) {
      await setDoc(doc(db, "organizations", org.id), { name: org.name, type: org.type, orgId: org.id, createdAt: serverTimestamp() });
    }
  }

  // 2. Membres et champs de commodité des utilisateurs
  const users = (await getDocs(collection(db, "users"))).docs;
  const existingMembers = new Set((await getDocs(collection(db, "organizations", ORG_SCHOOL_ID, "members")).catch(() => ({ docs: [] as { id: string }[] }))).docs.map(item => item.id));
  const membersReport = { scanned: users.length, toCreate: 0, created: 0, errors: [] as { id: string; message: string }[] };
  const usersReport = { toUpdate: 0, updated: 0, errors: [] as { id: string; message: string }[] };
  for (const user of users) {
    const data = user.data();
    const needsMember = !existingMembers.has(user.id);
    const schoolOrgId = typeof data.schoolOrgId === "string" ? data.schoolOrgId : "";
    const needsUserFields = schoolOrgId !== ORG_SCHOOL_ID || !Array.isArray(data.orgIds) || !data.orgIds.includes(ORG_SCHOOL_ID);
    if (needsMember) membersReport.toCreate += 1;
    if (needsUserFields) usersReport.toUpdate += 1;
    if (dryRun) continue;
    if (needsMember) {
      try {
        const role: OrgRole = orgRoleForUserRole((typeof data.role === "string" ? data.role : "Étudiant") as UserRole);
        await setDoc(doc(db, "organizations", ORG_SCHOOL_ID, "members", user.id), { userId: user.id, orgId: ORG_SCHOOL_ID, role, active: data.active !== false, displayName: typeof data.name === "string" ? data.name : "", updatedAt: serverTimestamp() });
        membersReport.created += 1;
      } catch (error) { membersReport.errors.push({ id: user.id, message: message(error) }); }
    }
    if (needsUserFields) {
      try { await updateDoc(doc(db, "users", user.id), { orgIds: arrayUnion(ORG_SCHOOL_ID), schoolOrgId: ORG_SCHOOL_ID }); usersReport.updated += 1; }
      catch (error) { usersReport.errors.push({ id: user.id, message: message(error) }); }
    }
  }

  // 3. Étiquetage orgId
  const collections: CollectionReport[] = [];
  let remainingToTag = 0;
  for (const name of TAGGED_COLLECTIONS) {
    const report: CollectionReport = { collection: name, scanned: 0, alreadyTagged: 0, taggedAsOma: 0, toTag: 0, tagged: 0, errors: [] };
    try {
      const snapshot = await getDocs(collection(db, name));
      report.scanned = snapshot.size;
      const untagged = snapshot.docs.filter(item => {
        const orgId = item.data().orgId;
        if (typeof orgId === "string" && orgId) { report.alreadyTagged += 1; if (orgId === ORG_MRO_ID) report.taggedAsOma += 1; return false; }
        return true;
      });
      report.toTag = untagged.length;
      if (!dryRun) {
        for (let start = 0; start < untagged.length; start += BATCH_SIZE) {
          const chunk = untagged.slice(start, start + BATCH_SIZE);
          try {
            const batch = writeBatch(db);
            chunk.forEach(item => batch.update(item.ref, { orgId: ORG_SCHOOL_ID }));
            await batch.commit();
            report.tagged += chunk.length;
          } catch {
            // Un document refusé fait échouer tout le lot : on isole les documents en cause un par un.
            for (const item of chunk) {
              try { await updateDoc(item.ref, { orgId: ORG_SCHOOL_ID }); report.tagged += 1; }
              catch (error) { report.errors.push({ id: item.id, message: message(error) }); }
            }
          }
        }
      }
    } catch (error) { report.errors.push({ id: "(collection)", message: message(error) }); }
    remainingToTag += dryRun ? report.toTag : report.toTag - report.tagged;
    collections.push(report);
  }

  // 4. Diagnostic d'effectif (séparation des tâches technicien ≠ contrôleur PRM)
  const staffing: StaffingReport[] = [];
  for (const org of DEFAULT_ORGANIZATIONS) {
    const members = (await getDocs(collection(db, "organizations", org.id, "members")).catch(() => ({ docs: [] as { data: () => Record<string, unknown> }[] }))).docs
      .map(item => item.data()).filter(item => item.active !== false);
    const controllers = members.filter(item => item.role === "prm" || item.role === "admin").length;
    const warnings: string[] = [];
    if (org.type === "mro") {
      if (!members.length) warnings.push("Aucun membre enregistré dans l’OMA : ajoutez le PRM et les techniciens avant de mettre en production.");
      else if (controllers < 2) warnings.push("Moins de 2 personnes peuvent tenir le rôle de PRM. Avec la règle « technicien ≠ contrôleur », un projet où la seule personne qualifiée signe une carte sera bloqué sans issue.");
    }
    staffing.push({ orgId: org.id, members: members.length, controllers, warnings });
  }

  return { dryRun, organizations: orgReport, members: membersReport, users: usersReport, collections, staffing, remainingToTag, startedAt, finishedAt: new Date().toISOString() };
}

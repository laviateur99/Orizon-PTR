import { where, type QueryConstraint } from "firebase/firestore";
import { getSchoolOrgId } from "./orgContext";

/**
 * Contrainte orgId pour les requêtes de liste sur aircraft / snags / reservations / notifications.
 * Une règle Firestore ne filtre pas : une fois les règles strictes déployées, toute requête doit
 * porter cette contrainte pour être acceptée. Tant que le compte n'est pas rattaché à une école
 * (avant la migration), aucune contrainte n'est ajoutée et le comportement reste celui d'avant.
 */
export const schoolScope = (): QueryConstraint[] => {
  const orgId = getSchoolOrgId();
  return orgId ? [where("orgId", "==", orgId)] : [];
};

/** Ajoute orgId aux nouveaux documents (aircraft, snags, reservations, notifications). */
export function withSchoolOrg<T extends Record<string, unknown>>(payload: T): T & { orgId?: string } {
  const orgId = getSchoolOrgId();
  return orgId ? { ...payload, orgId } : payload;
}

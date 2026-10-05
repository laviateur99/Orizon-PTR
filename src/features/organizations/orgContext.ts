// Contexte d'organisation côté client, alimenté par AuthProvider dès que le profil est connu.
// Module simple (pas de React) pour que les fonctions Firestore hors composants puissent
// connaître l'organisation de l'utilisateur. Les règles Firestore ne s'y fient jamais :
// elles lisent organizations/{orgId}/members/{uid}.
export type OrgContext = { orgIds: string[]; schoolOrgId?: string; mroOrgId?: string };

let current: OrgContext = { orgIds: [] };

export const setOrgContext = (value: OrgContext) => { current = value; };
export const getOrgContext = () => current;
export const getSchoolOrgId = () => current.schoolOrgId;
export const getMroOrgId = () => current.mroOrgId;

export function requireSchoolOrgId(): string {
  if (!current.schoolOrgId) throw new Error("Aucune organisation (école) associée à ce compte. Exécutez la migration des organisations.");
  return current.schoolOrgId;
}
export function requireMroOrgId(): string {
  if (!current.mroOrgId) throw new Error("Ce compte n’est membre d’aucune organisation de maintenance (OMA).");
  return current.mroOrgId;
}

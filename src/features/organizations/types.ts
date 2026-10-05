import type { UserRole } from "@/features/auth/types";

export const ORG_SCHOOL_ID = "orizon-aviation";
export const ORG_MRO_ID = "orizon-maintenance";

export type OrgType = "school" | "mro";
export type OrgRole = "admin" | "prm" | "dom" | "technician" | "staff" | "student";
export type LicenseType = "ACA" | "SCA" | "AS";
export type LicenseClass = "Atelier" | "Avionique" | "IDC" | "Maintenance" | "Structure";

export const LICENSE_TYPES: LicenseType[] = ["ACA", "SCA", "AS"];
export const LICENSE_CLASSES: LicenseClass[] = ["Atelier", "Avionique", "IDC", "Maintenance", "Structure"];

export type Organization = { id: string; name: string; type: OrgType };

export type OrgMember = {
  userId: string;
  orgId: string;
  role: OrgRole;
  active: boolean;
  displayName: string;
  licenseType?: LicenseType;
  licenseNumber?: string;
  licenseClass?: LicenseClass;
};

export const DEFAULT_ORGANIZATIONS: Organization[] = [
  { id: ORG_SCHOOL_ID, name: "Orizon Aviation", type: "school" },
  { id: ORG_MRO_ID, name: "Orizon Maintenance Aviation", type: "mro" },
];

export function orgRoleForUserRole(role: UserRole): OrgRole {
  if (role === "Administrateur") return "admin";
  if (role === "Maintenance") return "prm";
  if (role === "Directeur de maintenance") return "dom";
  if (role === "Étudiant") return "student";
  if (role === "OMA") return "technician";
  return "staff";
}

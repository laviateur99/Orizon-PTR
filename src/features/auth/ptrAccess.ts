import type { UserProfile } from "./types";

export const canAccessPtr = (profile:UserProfile|null,studentId:string) =>
  Boolean(profile?.active && profile.permissions.includes("ptr") &&
    (profile.role !== "Étudiant" || profile.linkedStudentId === studentId));

export const canAccessStudent = (profile:UserProfile|null,studentId:string) =>
  Boolean(profile?.active && profile.permissions.includes("students") &&
    (profile.role !== "Étudiant" || profile.linkedStudentId === studentId));

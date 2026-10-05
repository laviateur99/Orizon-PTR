import { deleteApp, initializeApp } from "firebase/app";
import { createUserWithEmailAndPassword, getAuth, sendPasswordResetEmail } from "firebase/auth";
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { auth, db, firebaseConfig } from "@/services/firebase/client";
import { rolePermissions, type UserRole } from "./types";
import { addOrgMember } from "@/features/organizations/firestore";
import { orgRoleForUserRole } from "@/features/organizations/types";
import { getSchoolOrgId } from "@/features/organizations/orgContext";

const temporaryPassword = () => `${crypto.randomUUID()}-Aa1!`;

export type InviteUserInput = {
  name: string;
  email: string;
  role: UserRole;
  linkedStudentId?: string;
  linkedInstructorId?: string;
  // Seuls uid/email sont utilisés (détection d'un compte déjà existant avec ce courriel) —
  // volontairement plus étroit que UserProfile pour rester réutilisable sans dépendre d'un
  // mapping complet.
  existingUsers: { uid: string; email: string }[];
};

/**
 * Crée (ou réactive) un accès de connexion Firebase pour un utilisateur — logique factorisée
 * depuis le formulaire d'invitation de « Utilisateurs et rôles » (UserManagementPanel), pour être
 * réutilisable ailleurs (ex. directement depuis la fiche d'un étudiant, avec linkedStudentId déjà
 * connu, sans devoir chercher son nom dans une liste déroulante séparée).
 */
export async function inviteUser({ name, email, role, linkedStudentId = "", linkedInstructorId = "", existingUsers }: InviteUserInput): Promise<{ email: string; uid: string | null }> {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = existingUsers.find(item => item.email.toLowerCase() === normalizedEmail);
  let secondary: ReturnType<typeof initializeApp> | null = null;
  let uid: string | null = existing?.uid || null;
  const invitation = () => ({
    name: name.trim(), email: normalizedEmail, role, permissions: rolePermissions[role], active: true, mustSetPassword: false,
    linkedStudentId: role === "Étudiant" ? linkedStudentId : "",
    linkedInstructorId: role === "Instructeur" ? linkedInstructorId : "",
    invitedAt: new Date().toISOString(), invitedBy: auth.currentUser?.email || "", createdAtServer: serverTimestamp()
  });
  try {
    // Organisation de l'invitant : tout nouvel utilisateur de l'école en devient membre.
    // Le personnel de l'OMA n'est jamais membre de l'école (isolation) : son organisation est ajoutée à part.
    const schoolOrgId = role === "OMA" ? undefined : getSchoolOrgId();
    const orgRole = orgRoleForUserRole(role);
    if (existing) {
      await updateDoc(doc(db, "users", existing.uid), invitation());
      if (schoolOrgId) await addOrgMember(schoolOrgId, "school", existing.uid, { role: orgRole, displayName: name.trim() });
    } else {
      secondary = initializeApp(firebaseConfig, `activation-${Date.now()}`);
      try {
        const result = await createUserWithEmailAndPassword(getAuth(secondary), normalizedEmail, temporaryPassword());
        uid = result.user.uid;
        await setDoc(doc(db, "users", result.user.uid), invitation());
        if (schoolOrgId) await addOrgMember(schoolOrgId, "school", result.user.uid, { role: orgRole, displayName: name.trim() });
      } catch (error) {
        if ((error as { code?: string }).code !== "auth/email-already-in-use") throw error;
        // Compte Auth déjà existant : le membre sera créé à l'acceptation (AuthProvider), d'après ces champs.
        await setDoc(doc(db, "pendingInvitations", normalizedEmail), { ...invitation(), ...(schoolOrgId ? { orgId: schoolOrgId, orgType: "school", orgRole } : {}) });
      }
    }
    await sendPasswordResetEmail(auth, normalizedEmail);
    if (existing) await deleteDoc(doc(db, "pendingInvitations", normalizedEmail)).catch(() => undefined);
    return { email: normalizedEmail, uid };
  } finally {
    if (secondary) await deleteApp(secondary);
  }
}

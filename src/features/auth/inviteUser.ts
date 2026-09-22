import { deleteApp, initializeApp } from "firebase/app";
import { createUserWithEmailAndPassword, getAuth, sendPasswordResetEmail } from "firebase/auth";
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { auth, db, firebaseConfig } from "@/services/firebase/client";
import { rolePermissions, type UserRole } from "./types";

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
export async function inviteUser({ name, email, role, linkedStudentId = "", linkedInstructorId = "", existingUsers }: InviteUserInput): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = existingUsers.find(item => item.email.toLowerCase() === normalizedEmail);
  let secondary: ReturnType<typeof initializeApp> | null = null;
  const invitation = () => ({
    name: name.trim(), email: normalizedEmail, role, permissions: rolePermissions[role], active: true, mustSetPassword: false,
    linkedStudentId: role === "Étudiant" ? linkedStudentId : "",
    linkedInstructorId: role === "Instructeur" ? linkedInstructorId : "",
    invitedAt: new Date().toISOString(), invitedBy: auth.currentUser?.email || "", createdAtServer: serverTimestamp()
  });
  try {
    if (existing) {
      await updateDoc(doc(db, "users", existing.uid), invitation());
    } else {
      secondary = initializeApp(firebaseConfig, `activation-${Date.now()}`);
      try {
        const result = await createUserWithEmailAndPassword(getAuth(secondary), normalizedEmail, temporaryPassword());
        await setDoc(doc(db, "users", result.user.uid), invitation());
      } catch (error) {
        if ((error as { code?: string }).code !== "auth/email-already-in-use") throw error;
        await setDoc(doc(db, "pendingInvitations", normalizedEmail), invitation());
      }
    }
    await sendPasswordResetEmail(auth, normalizedEmail);
    if (existing) await deleteDoc(doc(db, "pendingInvitations", normalizedEmail)).catch(() => undefined);
    return normalizedEmail;
  } finally {
    if (secondary) await deleteApp(secondary);
  }
}

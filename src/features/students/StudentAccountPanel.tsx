"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth, db } from "@/services/firebase/client";
import { inviteUser } from "@/features/auth/inviteUser";

type LinkedAccount = { uid: string; email: string; active: boolean; lastLoginAt: string };

/**
 * Consolide, directement sur la fiche de l'étudiant, le lien avec son compte de connexion
 * Firebase (collection `users`, role "Étudiant", linkedStudentId === studentId) — évite de devoir
 * chercher l'étudiant dans une liste déroulante séparée sous « Utilisateurs et rôles ». Les
 * dossiers étudiants créés dans Flight Director n'ont PAS de compte de connexion par défaut ; il
 * faut explicitement en créer un ici pour que cet étudiant puisse se connecter (ex. pour définir
 * son NIP de signature électronique lui-même).
 */
export function StudentAccountPanel({ studentId, studentName, studentEmail }: { studentId: string; studentName: string; studentEmail: string }) {
  const [account, setAccount] = useState<LinkedAccount | null | undefined>(undefined);
  const [email, setEmail] = useState(studentEmail);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const q = query(collection(db, "users"), where("linkedStudentId", "==", studentId));
    return onSnapshot(q, snap => {
      const first = snap.docs[0];
      const data = first?.data();
      setAccount(first ? { uid: first.id, email: String(data?.email || ""), active: data?.active !== false, lastLoginAt: String(data?.lastLoginAt || "") } : null);
    }, () => setAccount(null));
  }, [studentId]);

  useEffect(() => { setEmail(studentEmail); }, [studentEmail]);

  async function create() {
    setError(""); setMessage("");
    if (!email.trim()) { setError("Une adresse courriel est requise pour créer l’accès."); return; }
    setBusy(true);
    try {
      const snapshot = await getDocs(collection(db, "users"));
      const existingUsers = snapshot.docs.map(item => ({ uid: item.id, email: String(item.data().email || "") }));
      const sentTo = await inviteUser({ name: studentName, email, role: "Étudiant", linkedStudentId: studentId, existingUsers });
      setMessage(`Accès créé. Courriel d’activation envoyé à ${sentTo.email}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Création de l’accès impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function resendReset() {
    if (!account) return;
    setError(""); setMessage("");
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, account.email);
      setMessage("Courriel de réinitialisation envoyé.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="student-pin-panel">
    <h3>Accès de connexion de l’étudiant</h3>
    {error && <div className="notice error">{error}</div>}
    {message && <div className="notice">{message}</div>}
    {account === undefined && <p className="muted">Chargement…</p>}
    {account === null && <>
      <p className="notice warn">Aucun compte de connexion — cet étudiant ne peut pas se connecter à Flight Director (et ne pourra donc pas définir son propre NIP) tant qu’un accès n’est pas créé ici.</p>
      <label>Courriel pour l’invitation<input type="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <button type="button" className="button secondary" disabled={busy} onClick={create}>Créer l’accès de connexion</button>
    </>}
    {account && <>
      <p className="muted">Compte lié : {account.email} · {account.active ? "Actif" : "Suspendu"} · {account.lastLoginAt ? `Dernière connexion : ${new Date(account.lastLoginAt).toLocaleString("fr-CA")}` : "Jamais connecté"}</p>
      <div className="signature-actions">
        <button type="button" className="button secondary small" disabled={busy} onClick={resendReset}>Envoyer un courriel de réinitialisation</button>
        <a className="text-button" href="/admin">Gérer dans Utilisateurs et rôles</a>
      </div>
    </>}
  </div>;
}

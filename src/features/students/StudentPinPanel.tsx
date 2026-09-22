"use client";

import { useEffect, useState } from "react";
import { deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/services/firebase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { hashPin, isValidPin, PIN_LENGTH, randomPinSalt } from "@/features/auth/pin";

type PinStatus = { exists: boolean; updatedAt?: string } | undefined;

/**
 * NIP de signature électronique d'un étudiant.
 *
 * IMPORTANT — qui peut faire quoi, et pourquoi : seul l'étudiant, connecté sur SON PROPRE compte
 * (profile.linkedStudentId === studentId), peut définir ou changer son NIP. Le personnel
 * (administrateur, instructeur) ne voit qu'un statut (configuré ou non) et peut seulement forcer
 * une réinitialisation (l'étudiant devra alors en redéfinir un) — jamais choisir ni voir les
 * chiffres. Si le personnel pouvait définir le NIP, il le connaîtrait et pourrait signer à la
 * place de l'étudiant, ce qui viderait la signature électronique de son sens.
 */
export function StudentPinPanel({ studentId }: { studentId: string }) {
  const { profile } = useAuth();
  const isSelf = profile?.role === "Étudiant" && profile.linkedStudentId === studentId;
  const [status, setStatus] = useState<PinStatus>(undefined);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => onSnapshot(doc(db, "studentPins", studentId), snap => {
    const data = snap.data();
    setStatus({ exists: snap.exists(), updatedAt: typeof data?.updatedAt?.toDate === "function" ? data.updatedAt.toDate().toLocaleString("fr-CA", { dateStyle: "long", timeStyle: "short" }) : undefined });
  }, () => setStatus(undefined)), [studentId]);

  async function save() {
    setError(""); setMessage("");
    if (!isValidPin(pin)) { setError(`Le NIP doit contenir exactement ${PIN_LENGTH} chiffres.`); return; }
    if (pin !== confirmPin) { setError("Les deux NIP saisis ne correspondent pas."); return; }
    setBusy(true);
    try {
      const salt = randomPinSalt();
      const hash = await hashPin(pin, salt);
      await setDoc(doc(db, "studentPins", studentId), { hash, salt, failedAttempts: 0, lockedUntil: new Date().toISOString(), updatedAt: serverTimestamp() });
      setMessage("NIP enregistré.");
      setPin(""); setConfirmPin("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!window.confirm("Réinitialiser le NIP de cet étudiant ? Il ne pourra plus signer électroniquement tant qu'il n'en aura pas redéfini un lui-même, depuis son propre compte.")) return;
    setError(""); setMessage("");
    setBusy(true);
    try {
      await deleteDoc(doc(db, "studentPins", studentId));
      setMessage("NIP réinitialisé. L'étudiant devra en définir un nouveau depuis son propre compte.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Réinitialisation impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (isSelf) {
    return <div className="student-pin-panel">
      <h3>Mon NIP de signature électronique</h3>
      <p>Ce NIP remplace votre signature manuscrite pour vos ententes — vous pourrez ensuite signer sur n’importe quel appareil de l’école sans avoir à vous reconnecter. Ne le partagez avec personne.</p>
      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice">{message}</div>}
      {status?.exists && <p className="muted">NIP actuellement configuré{status.updatedAt ? ` (dernière modification : ${status.updatedAt})` : ""}.</p>}
      <div className="form-grid">
        <label>{status?.exists ? "Nouveau NIP" : "NIP"} ({PIN_LENGTH} chiffres)<input type="password" inputMode="numeric" pattern="\d*" maxLength={PIN_LENGTH} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))} /></label>
        <label>Confirmer le NIP<input type="password" inputMode="numeric" pattern="\d*" maxLength={PIN_LENGTH} value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))} /></label>
      </div>
      <button type="button" className="button secondary" disabled={busy} onClick={save}>{status?.exists ? "Changer mon NIP" : "Définir mon NIP"}</button>
    </div>;
  }

  return <div className="student-pin-panel">
    <h3>NIP de signature électronique</h3>
    <p>Défini uniquement par l’étudiant, depuis son propre compte — le personnel ne peut ni le voir ni le choisir.</p>
    {error && <div className="notice error">{error}</div>}
    {message && <div className="notice">{message}</div>}
    <p className={status?.exists ? "muted" : "notice warn"}>{status === undefined ? "Chargement du statut…" : status.exists ? `NIP configuré par l’étudiant${status.updatedAt ? ` (${status.updatedAt})` : ""}.` : "Aucun NIP configuré — l’étudiant doit le définir depuis son propre compte avant de pouvoir signer électroniquement."}</p>
    {status?.exists && <button type="button" className="button secondary small" disabled={busy} onClick={reset}>Réinitialiser le NIP</button>}
  </div>;
}

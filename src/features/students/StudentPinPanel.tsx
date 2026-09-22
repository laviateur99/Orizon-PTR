"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/services/firebase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { hashPin, isValidPin, PIN_LENGTH, randomPinSalt } from "@/features/auth/pin";

type PinStatus = { exists: boolean; updatedAt?: string } | undefined;

/**
 * NIP de signature électronique d'un étudiant.
 *
 * Deux cas selon qui est connecté :
 * - L'étudiant est connecté sur SON PROPRE compte (profile.linkedStudentId === studentId) :
 *   garantie cryptographique réelle (sa propre session Firebase Auth) — aucune remise d'appareil
 *   nécessaire, il choisit directement son NIP.
 * - Le personnel opère le panneau pour un étudiant sans compte (ou non connecté) : aucun moyen
 *   technique de distinguer « l'étudiant a tapé » de « le personnel a tapé » — protection
 *   seulement PROCÉDURALE, comme un terminal de paiement : remettre l'appareil, champ masqué que
 *   le personnel ne lit pas.
 */
export function StudentPinPanel({ studentId, studentName }: { studentId: string; studentName: string }) {
  const { profile } = useAuth();
  const isSelf = profile?.role === "Étudiant" && profile.linkedStudentId === studentId;
  const [status, setStatus] = useState<PinStatus>(undefined);
  const [handedOver, setHandedOver] = useState(false);
  // L'étudiant connecté sur son propre compte n'a jamais besoin de l'accusé de remise —
  // recalculé à chaque rendu plutôt que figé une fois à l'initialisation de l'état (profile peut
  // se charger après le premier rendu).
  const readyToType = isSelf || handedOver;
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
      setPin(""); setConfirmPin(""); setHandedOver(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="student-pin-panel">
    <h3>NIP de signature électronique</h3>
    {error && <div className="notice error">{error}</div>}
    {message && <div className="notice">{message}</div>}
    <p className={status?.exists ? "muted" : "notice warn"}>{status === undefined ? "Chargement du statut…" : status.exists ? `NIP configuré${status.updatedAt ? ` (dernière modification : ${status.updatedAt})` : ""}.` : "Aucun NIP configuré — requis avant toute signature électronique."}</p>

    {!readyToType && <div className="notice pin-handoff-notice">
      <p><strong>Remettez l’appareil à {studentName}.</strong> C’est {studentName.split(" ")[0] || "l’étudiant"} qui doit taper le NIP ci-dessous, sans le dire à voix haute — le personnel ne doit ni le choisir ni le lire à l’écran.</p>
      <button type="button" className="button secondary small" onClick={() => setHandedOver(true)}>L’appareil a été remis à {studentName.split(" ")[0] || "l’étudiant"}</button>
    </div>}

    {readyToType && <>
      <div className="form-grid">
        <label>{status?.exists ? "Nouveau NIP" : "NIP"} ({PIN_LENGTH} chiffres)<input type="password" inputMode="numeric" pattern="\d*" maxLength={PIN_LENGTH} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))} autoFocus /></label>
        <label>Confirmer le NIP<input type="password" inputMode="numeric" pattern="\d*" maxLength={PIN_LENGTH} value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))} /></label>
      </div>
      <div className="signature-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={save}>{status?.exists ? "Changer le NIP" : "Définir le NIP"}</button>
        {!isSelf && <button type="button" className="text-button" onClick={() => { setHandedOver(false); setPin(""); setConfirmPin(""); }}>Annuler</button>}
      </div>
    </>}
  </div>;
}

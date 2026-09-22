"use client";

import { useState } from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/services/firebase/client";
import { hashPin, isValidPin, PIN_LENGTH, randomPinSalt } from "@/features/auth/pin";

/**
 * Définit/change le NIP de signature électronique d'un étudiant. Le hachage se fait ici, côté
 * client, avant l'écriture — c'est acceptable pour la DÉFINITION (l'appelant a déjà un accès
 * d'écriture légitime, ce n'est pas une tentative de devinage) ; seule la VÉRIFICATION ultérieure
 * doit passer par la route serveur (voir PinSignaturePad).
 */
export function StudentPinPanel({ studentId }: { studentId: string }) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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

  return <div className="student-pin-panel">
    <h3>NIP de signature électronique</h3>
    <p>Remplace la signature manuscrite pour les ententes signées par cet étudiant, indépendamment de la session connectée sur l’appareil.</p>
    {error && <div className="notice error">{error}</div>}
    {message && <div className="notice">{message}</div>}
    <div className="form-grid">
      <label>Nouveau NIP ({PIN_LENGTH} chiffres)<input type="password" inputMode="numeric" pattern="\d*" maxLength={PIN_LENGTH} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))} /></label>
      <label>Confirmer le NIP<input type="password" inputMode="numeric" pattern="\d*" maxLength={PIN_LENGTH} value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))} /></label>
    </div>
    <button type="button" className="button secondary" disabled={busy} onClick={save}>Définir / changer le NIP</button>
  </div>;
}

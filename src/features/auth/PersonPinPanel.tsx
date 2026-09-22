"use client";

import { useEffect, useState } from "react";
import { deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/services/firebase/client";
import { hashPin, isValidPin, PIN_LENGTH, randomPinSalt } from "./pin";

type PinStatus = { exists: boolean; updatedAt?: string } | undefined;

const COLLECTIONS = { student: "studentPins", instructor: "instructorPins" } as const;

/**
 * NIP de signature électronique — partagé entre étudiants et instructeurs (kind).
 *
 * IMPORTANT — le personnel ne choisit ni ne voit JAMAIS le NIP de quelqu'un d'autre, dans aucun
 * cas : seule la personne connectée sur SON PROPRE compte (isSelf, garanti par la session Firebase
 * Auth de l'appelant) peut définir ou changer son NIP. Le personnel peut uniquement consulter le
 * statut (configuré ou non) et le RÉINITIALISER (suppression, jamais un remplacement choisi par
 * lui) — la personne devra alors se connecter à son propre compte pour en redéfinir un.
 */
export function PersonPinPanel({ kind, personId, personName, isSelf }: { kind: "student" | "instructor"; personId: string; personName: string; isSelf: boolean }) {
  const [status, setStatus] = useState<PinStatus>(undefined);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => onSnapshot(doc(db, COLLECTIONS[kind], personId), snap => {
    const data = snap.data();
    setStatus({ exists: snap.exists(), updatedAt: typeof data?.updatedAt?.toDate === "function" ? data.updatedAt.toDate().toLocaleString("fr-CA", { dateStyle: "long", timeStyle: "short" }) : undefined });
  }, () => setStatus(undefined)), [kind, personId]);

  async function save() {
    setError(""); setMessage("");
    if (!isValidPin(pin)) { setError(`Le NIP doit contenir exactement ${PIN_LENGTH} chiffres.`); return; }
    if (pin !== confirmPin) { setError("Les deux NIP saisis ne correspondent pas."); return; }
    setBusy(true);
    try {
      const salt = randomPinSalt();
      const hash = await hashPin(pin, salt);
      await setDoc(doc(db, COLLECTIONS[kind], personId), { hash, salt, failedAttempts: 0, lockedUntil: new Date().toISOString(), updatedAt: serverTimestamp() });
      setMessage("NIP enregistré.");
      setPin(""); setConfirmPin("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!window.confirm(`Réinitialiser le NIP de ${personName} ? La personne devra se connecter à son propre compte pour en définir un nouveau.`)) return;
    setError(""); setMessage("");
    setBusy(true);
    try {
      await deleteDoc(doc(db, COLLECTIONS[kind], personId));
      setMessage("NIP réinitialisé.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Réinitialisation impossible.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="student-pin-panel">
    <h3>NIP de signature électronique</h3>
    {error && <div className="notice error">{error}</div>}
    {message && <div className="notice">{message}</div>}
    <p className={status?.exists ? "muted" : "notice warn"}>{status === undefined ? "Chargement du statut…" : status.exists ? `NIP configuré${status.updatedAt ? ` (dernière modification : ${status.updatedAt})` : ""}.` : "Aucun NIP configuré — la personne doit se connecter à son propre compte pour le définir."}</p>

    {isSelf && <>
      <div className="form-grid">
        <label>{status?.exists ? "Nouveau NIP" : "NIP"} ({PIN_LENGTH} chiffres)<input type="password" inputMode="numeric" pattern="\d*" maxLength={PIN_LENGTH} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))} autoFocus /></label>
        <label>Confirmer le NIP<input type="password" inputMode="numeric" pattern="\d*" maxLength={PIN_LENGTH} value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))} /></label>
      </div>
      <div className="signature-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={save}>{status?.exists ? "Changer mon NIP" : "Définir mon NIP"}</button>
      </div>
    </>}

    {!isSelf && status?.exists && <div className="signature-actions">
      <button type="button" className="button secondary small" disabled={busy} onClick={reset}>Réinitialiser le NIP</button>
    </div>}
  </div>;
}

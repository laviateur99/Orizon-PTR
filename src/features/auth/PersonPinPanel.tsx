"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/services/firebase/client";
import { hashPin, isValidPin, PIN_LENGTH, randomPinSalt } from "./pin";

type PinStatus = { exists: boolean; updatedAt?: string } | undefined;

const COLLECTIONS = { student: "studentPins", instructor: "instructorPins" } as const;

/**
 * NIP de signature électronique — partagé entre étudiants et instructeurs (kind).
 *
 * Deux cas selon qui est connecté (déterminé par l'appelant via `isSelf`) :
 * - La personne est connectée sur SON PROPRE compte : garantie cryptographique réelle (sa propre
 *   session Firebase Auth) — aucune remise d'appareil nécessaire, elle choisit directement son NIP.
 * - Le personnel opère le panneau pour quelqu'un d'autre (ex. étudiant sans compte, ou instructeur
 *   dont on configure le NIP en son absence) : aucun moyen technique de distinguer « la bonne
 *   personne a tapé » de « le personnel a tapé » — protection seulement PROCÉDURALE, comme un
 *   terminal de paiement : remettre l'appareil, champ masqué que le personnel ne lit pas.
 */
export function PersonPinPanel({ kind, personId, personName, isSelf }: { kind: "student" | "instructor"; personId: string; personName: string; isSelf: boolean }) {
  const [status, setStatus] = useState<PinStatus>(undefined);
  const [handedOver, setHandedOver] = useState(false);
  const readyToType = isSelf || handedOver;
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
      <p><strong>Remettez l’appareil à {personName}.</strong> C’est {personName.split(" ")[0] || "la personne concernée"} qui doit taper le NIP ci-dessous, sans le dire à voix haute — le personnel ne doit ni le choisir ni le lire à l’écran.</p>
      <button type="button" className="button secondary small" onClick={() => setHandedOver(true)}>L’appareil a été remis à {personName.split(" ")[0] || "la personne concernée"}</button>
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

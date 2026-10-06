"use client";

import { useEffect, useState } from "react";
import { setProjectCounter, subscribeProjectCounter } from "./firestore";

// Réglage administrateur : prochain numéro de projet. À fixer une fois, au moment de la migration
// (par exemple 1850 si 1849 est le dernier numéro du suivi actuel). Chaque projet accepté prend ensuite le numéro suivant.
export function ProjectNumberingPanel() {
  const [nextNumber, setNextNumber] = useState<number | null | undefined>(undefined);
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeProjectCounter(setNextNumber, () => setNextNumber(null)), []);

  async function save() {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1) { setMessage("Entrez un numéro entier positif."); setMessageError(true); return; }
    if (nextNumber && !window.confirm(`Changer le prochain numéro de projet de ${nextNumber} à ${number} ? Les projets déjà créés ne sont pas modifiés.`)) return;
    setBusy(true); setMessage(""); setMessageError(false);
    try { await setProjectCounter(number); setValue(""); setMessage(`Prochain numéro de projet : ${number}.`); }
    catch { setMessage("Enregistrement impossible. Vérifiez que vous êtes administrateur."); setMessageError(true); }
    finally { setBusy(false); }
  }

  return <section className="card oma-numbering">
    <h3>Numérotation des projets OMA</h3>
    <p className="muted">
      {nextNumber === undefined ? "Chargement…" : nextNumber === null ? "Non configurée : aucun projet ne peut être accepté tant que le prochain numéro n’est pas fixé." : `Prochain numéro attribué : ${nextNumber}`}
    </p>
    <div className="form-grid">
      <label>Prochain numéro<input inputMode="numeric" value={value} onChange={e => setValue(e.target.value.replace(/\D/g, ""))} placeholder={nextNumber ? String(nextNumber) : "ex. 1850"} /></label>
      <button type="button" className="button" disabled={busy || !value} onClick={save}>Enregistrer</button>
    </div>
    {message && <div className={`notice ${messageError ? "error" : ""}`}>{message}</div>}
  </section>;
}

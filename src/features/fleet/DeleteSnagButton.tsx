"use client";

import { useState } from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import { deleteSnagAsAdmin } from "./firestore";
import type { Snag } from "./types";

export function DeleteSnagButton({ snag, onDeleted }: { snag: Snag; onDeleted: () => void }) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (profile?.role !== "Administrateur" || snag.workOrderId || snag.status === "Fermé") return null;

  return <>
    <button type="button" className="button danger small" onClick={() => setOpen(true)}>Supprimer si erreur</button>
    {open && <div className="modal-backdrop"><form className="modal compact" onSubmit={async event => {
      event.preventDefault();
      if (busy || !reason.trim()) return;
      setBusy(true); setError("");
      try {
        await deleteSnagAsAdmin(snag, profile.name || profile.email, reason.trim());
        setOpen(false); setReason(""); onDeleted();
      } catch (value) {
        setError(value instanceof Error ? value.message : "Impossible de supprimer le SNAG.");
      } finally { setBusy(false); }
    }}>
      <header><div><h2>Supprimer un SNAG créé par erreur</h2><p>{snag.aircraftRegistration} — {snag.defectTitle}</p></div></header>
      <div className="modal-body">
        <p>Le SNAG sera retiré de la liste active sans créer de travail PRM ou OMA. Une copie complète et la raison seront conservées dans l’historique administratif.</p>
        <label>Raison de la suppression<textarea required value={reason} onChange={event => setReason(event.target.value)} disabled={busy} /></label>
        {error && <div className="notice error">{error}</div>}
      </div>
      <footer><span /><button type="button" className="button secondary" disabled={busy} onClick={() => { setOpen(false); setError(""); }}>Annuler</button><button className="button danger" disabled={busy || !reason.trim()}>{busy ? "Suppression…" : "Confirmer la suppression"}</button></footer>
    </form></div>}
  </>;
}

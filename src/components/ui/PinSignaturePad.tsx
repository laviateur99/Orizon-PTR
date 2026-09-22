"use client";

import { useState } from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import { PIN_LENGTH } from "@/features/auth/pin";

/**
 * Signature électronique par NIP — remplace SignaturePad (dessin à la main) pour un signataire
 * étudiant OU instructeur (kind). Le NIP n'est jamais comparé côté client : il est envoyé à la
 * route serveur /api/pin/verify/[kind]/[id], qui relit le hash depuis Firestore et compare
 * elle-même. En cas de succès, `onChange` reçoit une attestation textuelle horodatée (jamais une
 * image) — le champ cible reste un `string`, donc aucun changement de schéma n'est requis côté
 * appelant.
 */
export function PinSignaturePad({ label, kind, personId, signerName, value, onChange }: {
  label: string;
  kind: "student" | "instructor";
  personId: string;
  signerName: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { user } = useAuth();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!user || pin.length !== PIN_LENGTH) return;
    setBusy(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/pin/verify/${kind}/${personId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pin })
      });
      if (!response.ok) { setError(await response.text() || "NIP incorrect."); setPin(""); return; }
      const data = (await response.json()) as { verifiedAt: string };
      const when = new Date(data.verifiedAt).toLocaleString("fr-CA", { dateStyle: "long", timeStyle: "short" });
      onChange(`Signé électroniquement par ${signerName} — NIP vérifié le ${when}`);
      setPin("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Vérification impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (value) {
    return <div className="signature-pad pin-signature-pad">
      <strong>{label}</strong>
      <span className="signature-state saved">✓ {value}</span>
      <div className="signature-actions"><button type="button" className="button secondary small" onClick={() => onChange("")}>Effacer</button></div>
    </div>;
  }

  return <div className="signature-pad pin-signature-pad">
    <strong>{label}</strong>
    <p className="pin-signature-hint">{signerName} doit entrer son NIP à {PIN_LENGTH} chiffres pour signer électroniquement — indépendamment de la session actuellement connectée.</p>
    {error && <div className="notice error">{error}</div>}
    <input
      type="password" inputMode="numeric" pattern="\d*" maxLength={PIN_LENGTH} placeholder="••••"
      className="pin-input" value={pin}
      onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))}
      onKeyDown={e => { if (e.key === "Enter" && pin.length === PIN_LENGTH) submit(); }}
    />
    <div className="signature-actions">
      <button type="button" className="button small" disabled={busy || pin.length !== PIN_LENGTH} onClick={submit}>Confirmer avec le NIP</button>
    </div>
  </div>;
}

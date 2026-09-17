"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth/AuthProvider";

function AccessDenied() {
  return <main className="quote-print-status">Accès non autorisé à ce dossier.</main>;
}

const titles = { t2202: "T2202 — Fédéral", quebec: "TP-752.0.18.10 — Québec" } as const;

/**
 * Affiche le vrai PDF gouvernemental (T2202 ou TP-752.0.18.10) préempli, généré côté serveur
 * (route Node.js /api/tuition-tax-forms/pdf/{kind}/[id]) à partir du dossier fiscal FINALISÉ
 * relu directement depuis Firestore avec le jeton de l'admin connecté — jamais une reproduction
 * HTML, jamais de valeur fiscale transmise depuis ce composant.
 */
export function TuitionOfficialPdfPage({ id, kind }: { id: string; kind: "t2202" | "quebec" }) {
  const { user, profile } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.role !== "Administrateur" || !user) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const token = await user.getIdToken();
        const response = await fetch(`/api/tuition-tax-forms/pdf/${kind}/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error((await response.text()) || `La génération du formulaire a échoué (${response.status}).`);
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setUrl(objectUrl);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Génération du PDF impossible.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, kind, profile?.role, user]);

  if (profile?.role !== "Administrateur") return <AccessDenied />;
  const title = titles[kind];

  return <main className="quote-print-page">
    <div className="qc-toolbar no-print">
      <a className="button secondary" href="/admin?tab=tuition">Retour</a>
      <strong>{title}</strong>
      {url && <a className="button" href={url} download={`${title}.pdf`}>Télécharger</a>}
    </div>
    {loading && <p className="quote-print-status">Génération du formulaire officiel…</p>}
    {error && <div className="notice error">{error}</div>}
    {url && <iframe src={url} title={title} className="tuition-official-pdf-frame" />}
  </main>;
}

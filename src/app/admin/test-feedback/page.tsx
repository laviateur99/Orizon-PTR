"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "@/services/firebase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { canManageAdministration } from "@/features/auth/types";
import { PageHeader } from "@/components/ui/PageHeader";

type FeedbackStatus = "Nouveau" | "En cours" | "Résolu";
const STATUSES: FeedbackStatus[] = ["Nouveau", "En cours", "Résolu"];
const statusClass = (status?: FeedbackStatus) => status === "Résolu" ? "ok" : status === "En cours" ? "warn" : "danger";
type Feedback = { id: string; message: string; page: string; userName: string; userEmail: string; status?: FeedbackStatus; createdAt?: Timestamp };
type Reply = { id: string; text: string; authorName: string; createdAt?: Timestamp };

function FeedbackItem({ item, canManage, onDelete, deleting }: { item: Feedback; canManage: boolean; onDelete: (item: Feedback) => void; deleting: boolean }) {
  const { profile } = useAuth();
  const [replies, setReplies] = useState<Reply[]>([]);
  const [replyText, setReplyText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => onSnapshot(query(collection(db, "testFeedback", item.id, "replies"), orderBy("createdAt", "asc")), snap => setReplies(snap.docs.map(x => ({ id: x.id, ...x.data() } as Reply))), caught => setError(caught.message)), [item.id]);
  async function changeStatus(status: FeedbackStatus) {
    setError("");
    try { await updateDoc(doc(db, "testFeedback", item.id), { status, statusUpdatedAt: serverTimestamp(), statusUpdatedBy: profile?.name || profile?.email || "" }); }
    catch (value) { setError(value instanceof Error ? value.message : "Impossible de mettre à jour le statut."); }
  }
  async function addReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replyText.trim() || !profile) return;
    setBusy(true); setError("");
    try {
      await addDoc(collection(db, "testFeedback", item.id, "replies"), { text: replyText.trim(), authorId: profile.uid, authorName: profile.name || profile.email, createdAt: serverTimestamp() });
      setReplyText("");
    } catch (value) { setError(value instanceof Error ? value.message : "Impossible d’ajouter la réponse."); }
    finally { setBusy(false); }
  }
  return <article className="test-feedback-item">
    <header><strong>{item.userName || item.userEmail}</strong><span>{item.createdAt?.toDate().toLocaleString("fr-CA") || "Date en attente"}</span></header>
    <p>{item.message}</p><small>Page : {item.page || "Non précisée"} · {item.userEmail}</small>
    {error && <div className="notice error">{error}</div>}
    <div className="feedback-status-row">
      <label>Statut{canManage
        ? <select className={`status-select ${statusClass(item.status)}`} value={item.status || "Nouveau"} onChange={e => changeStatus(e.target.value as FeedbackStatus)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
        : <span className={`badge ${statusClass(item.status)}`}>{item.status || "Nouveau"}</span>}
      </label>
      {canManage && <button className="button danger small" disabled={deleting} onClick={() => onDelete(item)}>{deleting ? "Suppression…" : "Supprimer"}</button>}
    </div>
    {replies.length > 0 && <div className="feedback-replies">{replies.map(reply => <div className="feedback-reply" key={reply.id}><b>{reply.authorName}</b><span>{reply.createdAt?.toDate().toLocaleString("fr-CA") || ""}</span><p>{reply.text}</p></div>)}</div>}
    {canManage && <form className="feedback-reply-form" onSubmit={addReply}><textarea rows={2} placeholder="Ajouter une réponse…" value={replyText} onChange={e => setReplyText(e.target.value)} /><button className="button secondary small" disabled={busy || !replyText.trim()}>{busy ? "Envoi…" : "Répondre"}</button></form>}
  </article>;
}

export default function TestFeedbackPage() {
  const { profile } = useAuth();
  const [items, setItems] = useState<Feedback[]>([]), [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const canView = canManageAdministration(profile);
  const canManage = profile?.role === "Administrateur";
  useEffect(() => {
    if (!canView) { setItems([]); return; }
    return onSnapshot(query(collection(db, "testFeedback"), orderBy("createdAt", "desc")), snap => setItems(snap.docs.map(item => ({ id: item.id, ...item.data() } as Feedback))), caught => setError(caught.message));
  }, [canView]);
  async function remove(item: Feedback) {
    if (!canManage || deleting) return;
    if (!window.confirm(`Supprimer définitivement ce commentaire de ${item.userName || item.userEmail} ?\n\n${item.message}`)) return;
    setDeleting(item.id); setError("");
    try { await deleteDoc(doc(db, "testFeedback", item.id)); }
    catch (value) { setError(value instanceof Error ? value.message : "Impossible de supprimer le commentaire."); }
    finally { setDeleting(null); }
  }
  return <><PageHeader title="Commentaires de test" subtitle="Observations envoyées par les employés" /><section className="card">
    <Link className="button secondary" href="/admin">Retour à l’administration</Link>
    {error && <div className="notice error" role="alert">{error}</div>}
    {!canView ? <p>Accès réservé au personnel de direction (chef instructeur ou administrateur).</p> : <div className="test-feedback-list">
      {items.length === 0 ? <p>Aucun commentaire reçu pour le moment.</p> : items.map(item => <FeedbackItem item={item} canManage={canManage} onDelete={remove} deleting={deleting === item.id} key={item.id} />)}
    </div>}
  </section></>;
}

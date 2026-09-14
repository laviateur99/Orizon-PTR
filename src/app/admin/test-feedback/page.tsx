"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, Timestamp } from "firebase/firestore";
import { db } from "@/services/firebase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { PageHeader } from "@/components/ui/PageHeader";
type Feedback={id:string;message:string;page:string;userName:string;userEmail:string;createdAt?:Timestamp};
export default function TestFeedbackPage(){
  const {profile}=useAuth();
  const [items,setItems]=useState<Feedback[]>([]),[error,setError]=useState("");
  const [deleting,setDeleting]=useState<string|null>(null);
  const isAdmin=profile?.active && profile.role === "Administrateur";
  useEffect(()=>{
    if(!isAdmin){setItems([]);return;}
    return onSnapshot(query(collection(db,"testFeedback"),orderBy("createdAt","desc")),snap=>setItems(snap.docs.map(item=>({id:item.id,...item.data()} as Feedback))),caught=>setError(caught.message));
  },[isAdmin]);
  async function remove(item:Feedback){
    if(!isAdmin || deleting)return;
    if(!window.confirm(`Supprimer définitivement ce commentaire de ${item.userName||item.userEmail} ?\n\n${item.message}`))return;
    setDeleting(item.id);setError("");
    try{await deleteDoc(doc(db,"testFeedback",item.id));}
    catch(value){setError(value instanceof Error?value.message:"Impossible de supprimer le commentaire.");}
    finally{setDeleting(null);}
  }
  return <><PageHeader title="Commentaires de test" subtitle="Observations envoyées par les employés"/><section className="card">
    <Link className="button secondary" href="/admin">Retour à l’administration</Link>
    {error&&<div className="notice error" role="alert">{error}</div>}
    {!isAdmin?<p>Accès réservé aux administrateurs.</p>:<div className="test-feedback-list">
      {items.length===0?<p>Aucun commentaire reçu pour le moment.</p>:items.map(item=><article key={item.id}>
        <header><strong>{item.userName||item.userEmail}</strong><span>{item.createdAt?.toDate().toLocaleString("fr-CA")||"Date en attente"}</span></header>
        <p>{item.message}</p><small>Page : {item.page||"Non précisée"} · {item.userEmail}</small>
        <div style={{marginTop:12}}><button className="button danger small" disabled={deleting!==null} onClick={()=>void remove(item)}>{deleting===item.id?"Suppression…":"Supprimer le commentaire"}</button></div>
      </article>)}
    </div>}
  </section></>;
}

"use client";
import { useState } from "react";
import { addDoc,collection,serverTimestamp } from "firebase/firestore";
import { db } from "@/services/firebase/client";
import { useAuth } from "@/features/auth/AuthProvider";

export function FeedbackWidget(){
  const {user,profile}=useAuth();
  const [open,setOpen]=useState(false),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[sent,setSent]=useState(false);
  if(process.env.NEXT_PUBLIC_APP_ENV!=="test"||!user||!profile?.active)return null;
  async function submit(e:React.FormEvent){e.preventDefault();if(!message.trim())return;setBusy(true);try{await addDoc(collection(db,"testFeedback"),{message:message.trim(),page:window.location.pathname,userId:user!.uid,userName:profile!.name,userEmail:profile!.email,status:"Nouveau",createdAt:serverTimestamp()});setMessage("");setSent(true);setOpen(false);setTimeout(()=>setSent(false),3500);}finally{setBusy(false)}}
  return <><button className="feedback-launcher" onClick={()=>setOpen(true)}>{sent?"Commentaire envoyé ✓":"Donner mon commentaire"}</button>{open&&<div className="modal-backdrop"><section className="modal feedback-modal"><header><div><h2>Votre commentaire</h2><p>La page actuelle sera jointe automatiquement.</p></div><button className="icon-button" onClick={()=>setOpen(false)}>×</button></header><form className="modal-body" onSubmit={submit}><label>Qu’est-ce qui fonctionne bien ou devrait changer?<textarea rows={6} required value={message} onChange={e=>setMessage(e.target.value)} placeholder="Décrivez ce que vous avez essayé et ce qui s’est passé…"/></label><footer><button type="button" className="button secondary" onClick={()=>setOpen(false)}>Annuler</button><button className="button" disabled={busy}>{busy?"Envoi…":"Envoyer"}</button></footer></form></section></div>}</>;
}

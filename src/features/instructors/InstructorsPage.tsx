"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { deleteInstructor, saveInstructor, subscribeInstructor, subscribeInstructors } from "./firestore";
import type { Instructor, InstructorClass, InstructorStatus } from "./types";
import { DutyRestPanel } from "@/features/duty/DutyRestPanel";
import { useAuth } from "@/features/auth/AuthProvider";
import { InstructorPinPanel } from "./InstructorPinPanel";

const emptyInstructor = ():Instructor => ({
  id:`instructor-${Date.now()}`,
  firstName:"",
  lastName:"",
  email:"",
  phone:"",
  classLevel:"Classe 4",
  classHistory:[],
  status:"Actif",
  employeeNumber:"",
  hiredDate:"",
  birthDate:"",
  notes:""
});

export function InstructorsPage(){
  const{profile}=useAuth();
  const restricted=profile?.role==="Instructeur";
  const [items,setItems]=useState<Instructor[]>([]);
  const [query,setQuery]=useState("");
  const [status,setStatus]=useState<InstructorStatus|"Tous">("Tous");
  const [editing,setEditing]=useState<Instructor|null>(null);
  const [dutyInstructor,setDutyInstructor]=useState<Instructor|null>(null);
  const [pinInstructor,setPinInstructor]=useState<Instructor|null>(null);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [classEffectiveDate,setClassEffectiveDate]=useState(new Date().toISOString().slice(0,10));

  useEffect(()=>{
    setItems([]);
    if(restricted){
      if(!profile?.linkedInstructorId)return;
      return subscribeInstructor(profile.linkedInstructorId,value=>setItems(value?[value]:[]),value=>setError(value.message));
    }
    return subscribeInstructors({next:setItems,error:value=>setError(value.message)});
  },[restricted,profile?.linkedInstructorId]);

  const filtered=useMemo(()=>{
    const needle=query.trim().toLowerCase();
    return [...items]
      .filter(item=>status==="Tous"||item.status===status)
      .filter(item=>!needle||[
        item.firstName,item.lastName,item.email,item.classLevel,item.employeeNumber
      ].some(value=>value.toLowerCase().includes(needle)))
      .sort((a,b)=>a.lastName.localeCompare(b.lastName)||a.firstName.localeCompare(b.firstName));
  },[items,query,status]);

  async function save(){
    if(!editing)return;
    if(!editing.firstName.trim()||!editing.lastName.trim()){
      setMessage("Le prénom et le nom sont obligatoires.");
      return;
    }
    const previousClass=items.find(item=>item.id===editing.id)?.classLevel;
    if(previousClass&&previousClass!==editing.classLevel&&!classEffectiveDate){
      setMessage("La date d’entrée en vigueur de la nouvelle classe est obligatoire.");
      return;
    }
    await saveInstructor(editing,items.some(item=>item.id===editing.id),classEffectiveDate);
    setEditing(null);
    setMessage("Dossier instructeur enregistré.");
  }

  return <>
    <PageHeader title={restricted?"Mon dossier instructeur":"Instructeurs"} subtitle={restricted?"Coordonnées et temps de service et de repos":"Dossiers, classes, statut et coordonnées"} />
    {error&&<div className="notice error">{error}</div>}
    {message&&<div className="notice">{message}</div>}
    {!restricted&&<div className="instructor-toolbar">
      <input placeholder="Rechercher un instructeur…" value={query} onChange={event=>setQuery(event.target.value)} />
      <select value={status} onChange={event=>setStatus(event.target.value as InstructorStatus|"Tous")}>
        <option>Tous</option><option>Actif</option><option>Inactif</option><option>Congé</option>
      </select>
      <button className="button" onClick={()=>{setClassEffectiveDate(new Date().toISOString().slice(0,10));setEditing(emptyInstructor())}}>Ajouter un instructeur</button>
    </div>}
    {restricted&&!profile?.linkedInstructorId&&<div className="notice error">Votre compte doit être lié à votre fiche instructeur par un administrateur.</div>}
    <section className="card">
      <div className="instructor-list-head"><span>Nom</span><span>Classe</span><span>Statut</span><span>Contact</span><span>Actions</span></div>
      {filtered.map(item=><article className="instructor-list-row" key={item.id}>
        <div><strong>{item.firstName} {item.lastName}</strong><small>{item.employeeNumber||"Aucun numéro d’employé"}</small></div>
        <span>{item.classLevel}</span>
        <span className={`badge ${item.status==="Actif"?"ok":item.status==="Congé"?"warn":"danger"}`}>{item.status}</span>
        <div><span>{item.email||"—"}</span><small>{item.phone||"—"}</small></div>
        <div className="row-actions">
          <button className="button secondary small" onClick={()=>setDutyInstructor(item)}>Service/repos</button>
          <button className="button secondary small" onClick={()=>setPinInstructor(item)}>NIP</button>
          {!restricted&&<button className="button secondary small" onClick={()=>{setClassEffectiveDate(new Date().toISOString().slice(0,10));setEditing(item)}}>Modifier</button>}
          {!restricted&&<button className="button danger small" onClick={async()=>{if(confirm(`Supprimer ${item.firstName} ${item.lastName}?`)){await deleteInstructor(item.id);setMessage("Instructeur supprimé.");}}}>Supprimer</button>}
        </div>
      </article>)}
      {!filtered.length&&<p>Aucun instructeur ne correspond aux filtres.</p>}
    </section>

    {dutyInstructor&&<div className="modal-backdrop"><section className="modal duty-modal">
      <header><div><h2>{dutyInstructor.firstName} {dutyInstructor.lastName}</h2><p>Dossier instructeur · temps de service et de repos</p></div><button className="icon-button" onClick={()=>setDutyInstructor(null)}>×</button></header>
      <div className="modal-body"><DutyRestPanel personId={dutyInstructor.id} role="instructor"/></div>
      <footer><span/><button className="button" onClick={()=>setDutyInstructor(null)}>Fermer</button></footer>
    </section></div>}

    {pinInstructor&&<div className="modal-backdrop"><section className="modal">
      <header><div><h2>{pinInstructor.firstName} {pinInstructor.lastName}</h2><p>NIP de signature électronique</p></div><button className="icon-button" onClick={()=>setPinInstructor(null)}>×</button></header>
      <div className="modal-body"><InstructorPinPanel instructorId={pinInstructor.id} instructorName={`${pinInstructor.firstName} ${pinInstructor.lastName}`.trim()}/></div>
      <footer><span/><button className="button" onClick={()=>setPinInstructor(null)}>Fermer</button></footer>
    </section></div>}

    {editing&&<div className="modal-backdrop"><section className="modal">
      <header><div><h2>{items.some(item=>item.id===editing.id)?"Modifier l’instructeur":"Nouvel instructeur"}</h2><p>Dossier personnel et opérationnel</p></div><button className="icon-button" onClick={()=>setEditing(null)}>×</button></header>
      <div className="modal-body">
        <div className="form-grid">
          <label>Prénom<input value={editing.firstName} onChange={event=>setEditing({...editing,firstName:event.target.value})}/></label>
          <label>Nom<input value={editing.lastName} onChange={event=>setEditing({...editing,lastName:event.target.value})}/></label>
          <label>Courriel<input value={editing.email} onChange={event=>setEditing({...editing,email:event.target.value})}/></label>
          <label>Téléphone<input value={editing.phone} onChange={event=>setEditing({...editing,phone:event.target.value})}/></label>
          <label>Classe<select value={editing.classLevel} onChange={event=>setEditing({...editing,classLevel:event.target.value as InstructorClass})}><option>Classe 1</option><option>Classe 2</option><option>Classe 3</option><option>Classe 4</option></select></label>
          {items.find(item=>item.id===editing.id)?.classLevel!==editing.classLevel&&<label>Date d’entrée en vigueur<input type="date" required value={classEffectiveDate} onChange={event=>setClassEffectiveDate(event.target.value)}/><small>La nouvelle classe et son salaire s’appliqueront dès cette date.</small></label>}
          <label>Statut<select value={editing.status} onChange={event=>setEditing({...editing,status:event.target.value as InstructorStatus})}><option>Actif</option><option>Inactif</option><option>Congé</option></select></label>
          <label>Numéro d’employé<input value={editing.employeeNumber} onChange={event=>setEditing({...editing,employeeNumber:event.target.value})}/></label>
          <label>Date d’embauche<input type="date" value={editing.hiredDate} onChange={event=>setEditing({...editing,hiredDate:event.target.value})}/></label>
          <label>Date de naissance<input type="date" value={editing.birthDate} onChange={event=>setEditing({...editing,birthDate:event.target.value})}/><small>Requise pour calculer l’échéance médicale interne.</small></label>
        </div>
        <label>Notes<textarea value={editing.notes} onChange={event=>setEditing({...editing,notes:event.target.value})}/></label>
        {editing.classHistory.length>0&&<section className="instructor-class-history"><h3>Historique des classes</h3>{[...editing.classHistory].sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate)).map((change,index)=><div key={`${change.effectiveDate}-${index}`}><strong>{change.from} → {change.to}</strong><span>À compter du {new Date(`${change.effectiveDate}T12:00:00`).toLocaleDateString("fr-CA")}</span></div>)}</section>}
      </div>
      <footer><span/><button className="button secondary" onClick={()=>setEditing(null)}>Annuler</button><button className="button" onClick={save}>Enregistrer</button></footer>
    </section></div>}
  </>;
}

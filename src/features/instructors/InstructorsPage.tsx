"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { deleteInstructor, saveInstructor, subscribeInstructors } from "./firestore";
import type { Instructor, InstructorClass, InstructorStatus } from "./types";

const emptyInstructor = ():Instructor => ({
  id:`instructor-${Date.now()}`,
  firstName:"",
  lastName:"",
  email:"",
  phone:"",
  classLevel:"Classe 4",
  status:"Actif",
  employeeNumber:"",
  hiredDate:"",
  notes:""
});

export function InstructorsPage(){
  const [items,setItems]=useState<Instructor[]>([]);
  const [query,setQuery]=useState("");
  const [status,setStatus]=useState<InstructorStatus|"Tous">("Tous");
  const [editing,setEditing]=useState<Instructor|null>(null);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");

  useEffect(()=>subscribeInstructors({next:setItems,error:value=>setError(value.message)}),[]);

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
    await saveInstructor(editing,items.some(item=>item.id===editing.id));
    setEditing(null);
    setMessage("Dossier instructeur enregistré.");
  }

  return <>
    <PageHeader title="Instructeurs" subtitle="Dossiers, classes, statut et coordonnées" />
    {error&&<div className="notice error">{error}</div>}
    {message&&<div className="notice">{message}</div>}
    <div className="instructor-toolbar">
      <input placeholder="Rechercher un instructeur…" value={query} onChange={event=>setQuery(event.target.value)} />
      <select value={status} onChange={event=>setStatus(event.target.value as InstructorStatus|"Tous")}>
        <option>Tous</option><option>Actif</option><option>Inactif</option><option>Congé</option>
      </select>
      <button className="button" onClick={()=>setEditing(emptyInstructor())}>Ajouter un instructeur</button>
    </div>
    <section className="card">
      <div className="instructor-list-head"><span>Nom</span><span>Classe</span><span>Statut</span><span>Contact</span><span>Actions</span></div>
      {filtered.map(item=><article className="instructor-list-row" key={item.id}>
        <div><strong>{item.firstName} {item.lastName}</strong><small>{item.employeeNumber||"Aucun numéro d’employé"}</small></div>
        <span>{item.classLevel}</span>
        <span className={`badge ${item.status==="Actif"?"ok":item.status==="Congé"?"warn":"danger"}`}>{item.status}</span>
        <div><span>{item.email||"—"}</span><small>{item.phone||"—"}</small></div>
        <div className="row-actions">
          <button className="button secondary small" onClick={()=>setEditing(item)}>Modifier</button>
          <button className="button danger small" onClick={async()=>{if(confirm(`Supprimer ${item.firstName} ${item.lastName}?`)){await deleteInstructor(item.id);setMessage("Instructeur supprimé.");}}}>Supprimer</button>
        </div>
      </article>)}
      {!filtered.length&&<p>Aucun instructeur ne correspond aux filtres.</p>}
    </section>

    {editing&&<div className="modal-backdrop"><section className="modal">
      <header><div><h2>{items.some(item=>item.id===editing.id)?"Modifier l’instructeur":"Nouvel instructeur"}</h2><p>Dossier personnel et opérationnel</p></div><button className="icon-button" onClick={()=>setEditing(null)}>×</button></header>
      <div className="modal-body">
        <div className="form-grid">
          <label>Prénom<input value={editing.firstName} onChange={event=>setEditing({...editing,firstName:event.target.value})}/></label>
          <label>Nom<input value={editing.lastName} onChange={event=>setEditing({...editing,lastName:event.target.value})}/></label>
          <label>Courriel<input value={editing.email} onChange={event=>setEditing({...editing,email:event.target.value})}/></label>
          <label>Téléphone<input value={editing.phone} onChange={event=>setEditing({...editing,phone:event.target.value})}/></label>
          <label>Classe<select value={editing.classLevel} onChange={event=>setEditing({...editing,classLevel:event.target.value as InstructorClass})}><option>Classe 1</option><option>Classe 2</option><option>Classe 3</option><option>Classe 4</option></select></label>
          <label>Statut<select value={editing.status} onChange={event=>setEditing({...editing,status:event.target.value as InstructorStatus})}><option>Actif</option><option>Inactif</option><option>Congé</option></select></label>
          <label>Numéro d’employé<input value={editing.employeeNumber} onChange={event=>setEditing({...editing,employeeNumber:event.target.value})}/></label>
          <label>Date d’embauche<input type="date" value={editing.hiredDate} onChange={event=>setEditing({...editing,hiredDate:event.target.value})}/></label>
        </div>
        <label>Notes<textarea value={editing.notes} onChange={event=>setEditing({...editing,notes:event.target.value})}/></label>
      </div>
      <footer><span/><button className="button secondary" onClick={()=>setEditing(null)}>Annuler</button><button className="button" onClick={save}>Enregistrer</button></footer>
    </section></div>}
  </>;
}

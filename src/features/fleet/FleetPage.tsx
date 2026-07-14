"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  closeSnag,
  createSnag,
  replaceFleet,
  saveAircraft,
  subscribeAircraft,
  subscribeSnags,
  subscribeUsers,
  updateSnag
} from "./firestore";
import type {
  Aircraft,
  AircraftStatus,
  AppUserOption,
  NotificationRole,
  Snag,
  SnagReporterRole,
  SnagSeverity,
  SnagStatus
} from "./types";

const CATEGORIES=["Moteur","Cellule","Avionique","Radio","GPS","Autopilote","Freins","Train d’atterrissage","Éclairage","Instrument","Carburant","Divers"];
const ROLES:NotificationRole[]=["Maintenance","Directeur de maintenance","Chef instructeur","Dispatch","Administrateur"];
const STATUSES:SnagStatus[]=["Ouvert","Pris en charge","Pièces commandées","En réparation","Essai en vol","Fermé"];
const REPORTER_ROLES:SnagReporterRole[]=["Dispatch","Instructeur","Admin","Autre"];
const statusClass=(s:AircraftStatus)=>s==="Disponible"?"ok":s==="Maintenance"||s==="Inspection"?"warn":"danger";

export function FleetPage(){
  const [aircraft,setAircraft]=useState<Aircraft[]>([]);
  const [snags,setSnags]=useState<Snag[]>([]);
  const [users,setUsers]=useState<AppUserOption[]>([]);
  const [query,setQuery]=useState("");
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [editing,setEditing]=useState<Aircraft|null>(null);
  const [snagAircraft,setSnagAircraft]=useState<Aircraft|null>(null);
  const [selectedReporterId,setSelectedReporterId]=useState("");
  const [form,setForm]=useState({
    reportedBy:"",
    reportedByRole:"Dispatch" as SnagReporterRole,
    category:"Divers",
    severity:"Avant prochain vol" as SnagSeverity,
    defectTitle:"",
    description:"",
    tach:"",
    hobbs:"",
    estimatedReturnDate:"",
    notifyRoles:["Maintenance","Directeur de maintenance"] as NotificationRole[]
  });

  useEffect(()=>{
    const a=subscribeAircraft({next:setAircraft,error:e=>setError(e.message)});
    const s=subscribeSnags({next:setSnags,error:e=>setError(e.message)});
    const u=subscribeUsers({next:setUsers,error:e=>setError(e.message)});
    return()=>{a();s();u();};
  },[]);

  const filtered=useMemo(()=>aircraft.filter(a=>a.active).filter(a=>!query||`${a.registration} ${a.typeLabel} ${a.status}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>a.typeLabel.localeCompare(b.typeLabel)||a.registration.localeCompare(b.registration)),[aircraft,query]);
  const groups=["Cessna 152","Cessna 172","Piper Navajo PA-31"].map(type=>({type,items:filtered.filter(a=>a.typeLabel===type)})).filter(g=>g.items.length);
  const toggle=(role:NotificationRole)=>setForm(f=>({...f,notifyRoles:f.notifyRoles.includes(role)?f.notifyRoles.filter(r=>r!==role):[...f.notifyRoles,role]}));

  function chooseReporter(userId:string){
    setSelectedReporterId(userId);
    if(userId==="__other__"){
      setForm(current=>({...current,reportedBy:""}));
      return;
    }
    const user=users.find(item=>item.id===userId);
    if(!user)return;
    const suggestedRole:SnagReporterRole=user.roles.includes("Dispatch")?"Dispatch":user.roles.includes("Instructeur")?"Instructeur":user.roles.some(role=>role.toLowerCase().includes("admin"))?"Admin":form.reportedByRole;
    setForm(current=>({...current,reportedBy:user.name,reportedByRole:suggestedRole}));
  }

  async function submit(e:React.FormEvent){
    e.preventDefault();
    if(!snagAircraft)return;
    if(!form.reportedBy.trim()||!form.defectTitle.trim()||!form.description.trim()){
      setMessage("Signalé par, défectuosité et description sont obligatoires.");
      return;
    }
    try{
      await createSnag({
        aircraftId:snagAircraft.id,
        aircraftRegistration:snagAircraft.registration,
        reportedBy:form.reportedBy.trim(),
        reportedByUserId:selectedReporterId&&selectedReporterId!=="__other__"?selectedReporterId:undefined,
        reportedByRole:form.reportedByRole,
        category:form.category,
        severity:form.severity,
        defectTitle:form.defectTitle.trim(),
        description:form.description.trim(),
        tach:form.tach?Number(form.tach):undefined,
        hobbs:form.hobbs?Number(form.hobbs):undefined,
        estimatedReturnDate:form.estimatedReturnDate||undefined,
        maintenanceNotes:"",
        notifyRoles:form.notifyRoles
      });
      setSnagAircraft(null);
      setSelectedReporterId("");
      setForm({reportedBy:"",reportedByRole:"Dispatch",category:"Divers",severity:"Avant prochain vol",defectTitle:"",description:"",tach:"",hobbs:"",estimatedReturnDate:"",notifyRoles:["Maintenance","Directeur de maintenance"]});
      setMessage(`SNAG signalé pour ${snagAircraft.registration}.`);
    }catch(value){
      setError(value instanceof Error?value.message:"Impossible d’enregistrer le SNAG.");
    }
  }

  return <>
    <PageHeader title="Flotte" subtitle="Avions, maintenance, SNAG et notifications par rôle" />
    {error&&<div className="notice error">{error}</div>}{message&&<div className="notice">{message}</div>}
    <div className="fleet-toolbar"><input placeholder="Rechercher…" value={query} onChange={e=>setQuery(e.target.value)}/><button className="button" onClick={async()=>{await replaceFleet();setMessage("Flotte officielle Orizon installée.");}}>Remplacer par la flotte officielle Orizon</button></div>
    <div className="fleet-kpis"><div className="card"><strong>{aircraft.length}</strong><span>Avions</span></div><div className="card"><strong>{aircraft.filter(a=>a.status==="Disponible").length}</strong><span>Disponibles</span></div><div className="card"><strong>{aircraft.filter(a=>a.status!=="Disponible").length}</strong><span>Indisponibles</span></div><div className="card"><strong>{snags.filter(s=>s.status!=="Fermé").length}</strong><span>SNAG ouverts</span></div></div>
    {groups.map(g=><section className="card fleet-group" key={g.type}><h2>{g.type}</h2><div className="fleet-grid">{g.items.map(a=><article className="aircraft-card" key={a.id}><header><div><strong>{a.registration}</strong><span>{a.typeLabel}</span></div><span className={`badge ${statusClass(a.status)}`}>{a.status}</span></header>{a.statusReason&&<div className="aircraft-alert">{a.statusReason}</div>}<div className="aircraft-meta"><span>Début : {a.maintenanceStart||"—"}</span><span>Retour prévu : {a.maintenanceEnd||"—"}</span></div><div className="aircraft-actions"><button className="button secondary" onClick={()=>setEditing(a)}>Modifier</button><button className="button danger" onClick={()=>setSnagAircraft(a)}>Signaler un SNAG</button></div></article>)}</div></section>)}
    <section className="card"><h2>SNAG et défectuosités</h2><div className="snag-list">{snags.map(s=><article className="snag-row" key={s.id}><div><strong>{s.aircraftRegistration} — {s.defectTitle}</strong><span>{s.category} · {s.severity}</span><p>{s.description}</p><small>Signalé par {s.reportedBy} ({s.reportedByRole})</small></div><div className="snag-status"><select value={s.status} onChange={e=>updateSnag(s.id,{status:e.target.value as SnagStatus})}>{STATUSES.map(x=><option key={x}>{x}</option>)}</select>{s.status!=="Fermé"&&<button className="button secondary" onClick={()=>closeSnag(s)}>Remettre en service</button>}</div></article>)}{!snags.length&&<p>Aucun SNAG.</p>}</div></section>
    {editing&&<div className="modal-backdrop"><section className="modal compact"><header><div><h2>{editing.registration}</h2><p>Maintenance et disponibilité</p></div><button className="icon-button" onClick={()=>setEditing(null)}>×</button></header><div className="modal-body"><label>Statut<select value={editing.status} onChange={e=>setEditing({...editing,status:e.target.value as AircraftStatus})}><option>Disponible</option><option>Maintenance</option><option>Hors service</option><option>Inspection</option><option>SNAG</option></select></label><div className="form-grid"><label>Date de début<input type="date" value={editing.maintenanceStart||""} onChange={e=>setEditing({...editing,maintenanceStart:e.target.value})}/></label><label>Date de fin prévue<input type="date" value={editing.maintenanceEnd||""} onChange={e=>setEditing({...editing,maintenanceEnd:e.target.value})}/></label></div><label>Motif / description<textarea value={editing.statusReason||""} onChange={e=>setEditing({...editing,statusReason:e.target.value})}/></label></div><footer><span/><button className="button secondary" onClick={()=>setEditing(null)}>Annuler</button><button className="button" onClick={async()=>{await saveAircraft(editing);setEditing(null);}}>Enregistrer</button></footer></section></div>}
    {snagAircraft&&<div className="modal-backdrop"><section className="modal"><header><div><h2>Signaler une défectuosité</h2><p>{snagAircraft.registration}</p></div><button className="icon-button" onClick={()=>setSnagAircraft(null)}>×</button></header><form onSubmit={submit}><div className="modal-body"><div className="form-grid"><label>Signalé par<select required value={selectedReporterId} onChange={e=>chooseReporter(e.target.value)}><option value="">Sélectionner un utilisateur</option>{users.map(user=><option value={user.id} key={user.id}>{user.name}{user.email?` — ${user.email}`:""}</option>)}<option value="__other__">Autre personne…</option></select></label><label>Rôle<select value={form.reportedByRole} onChange={e=>setForm({...form,reportedByRole:e.target.value as SnagReporterRole})}>{REPORTER_ROLES.map(role=><option key={role}>{role}</option>)}</select></label>{selectedReporterId==="__other__"&&<label>Nom de la personne<input required value={form.reportedBy} onChange={e=>setForm({...form,reportedBy:e.target.value})} placeholder="Nom complet"/></label>}<label>Catégorie<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{CATEGORIES.map(x=><option key={x}>{x}</option>)}</select></label><label>Gravité<select value={form.severity} onChange={e=>setForm({...form,severity:e.target.value as SnagSeverity})}><option>Critique (AOG)</option><option>Avant prochain vol</option><option>À surveiller</option><option>Cosmétique</option></select></label><label>Tach<input type="number" step="0.1" value={form.tach} onChange={e=>setForm({...form,tach:e.target.value})}/></label><label>Hobbs<input type="number" step="0.1" value={form.hobbs} onChange={e=>setForm({...form,hobbs:e.target.value})}/></label></div><label>Défectuosité<input required value={form.defectTitle} onChange={e=>setForm({...form,defectTitle:e.target.value})}/></label><label>Description détaillée<textarea required value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label><label>Date estimée de remise en service<input type="date" value={form.estimatedReturnDate} onChange={e=>setForm({...form,estimatedReturnDate:e.target.value})}/></label><div><strong>Notifier les rôles</strong><div className="role-pills">{ROLES.map(r=><button type="button" className={form.notifyRoles.includes(r)?"active":""} onClick={()=>toggle(r)} key={r}>{r}</button>)}</div></div></div><footer><span/><button type="button" className="button secondary" onClick={()=>setSnagAircraft(null)}>Annuler</button><button className="button danger">Signaler le SNAG</button></footer></form></section></div>}
  </>;
}

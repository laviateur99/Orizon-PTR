"use client";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { DEFAULT_SCHEDULER_SETTINGS, type SchedulerSettings } from "@/features/scheduler/settings";
import { saveSchedulerSettings, subscribeSchedulerSettings } from "@/features/scheduler/firestore";
import { ResourceOrderPanel } from "./ResourceOrderPanel";

export function ScheduleSettingsPage(){
  const [settings,setSettings]=useState<SchedulerSettings>(DEFAULT_SCHEDULER_SETTINGS);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  useEffect(()=>subscribeSchedulerSettings({next:items=>setSettings(items[0]||DEFAULT_SCHEDULER_SETTINGS),error:e=>setError(e.message)}),[]);
  async function save(){
    if(settings.endHour<=settings.startHour){setError("L’heure de fin doit être après l’heure de début.");return;}
    if(settings.endHour-settings.startHour>24){setError("La plage horaire est invalide.");return;}
    await saveSchedulerSettings(settings);
    setError(""); setMessage("La plage horaire a été enregistrée.");
  }
  return <>
    <PageHeader title="Administration — Horaire" subtitle="Définir la plage visible et la précision des réservations"/>
    {error&&<div className="notice error">{error}</div>}{message&&<div className="notice">{message}</div>}
    <section className="card admin-schedule-card">
      <h2>Plage horaire par défaut</h2>
      <p className="muted">L’horaire s’élargit aussi automatiquement si une réservation existe avant ou après cette plage, afin qu’aucun vol ne soit caché.</p>
      <div className="form-grid">
        <label>Heure de début<select value={settings.startHour} onChange={e=>setSettings({...settings,startHour:Number(e.target.value)})}>{Array.from({length:24},(_,h)=><option value={h} key={h}>{String(h).padStart(2,"0")}:00</option>)}</select></label>
        <label>Heure de fin<select value={settings.endHour} onChange={e=>setSettings({...settings,endHour:Number(e.target.value)})}>{Array.from({length:24},(_,i)=>i+1).map(h=><option value={h} key={h}>{h===24?"24:00":`${String(h).padStart(2,"0")}:00`}</option>)}</select></label>
        <label>Précision des réservations<select value={settings.slotMinutes} onChange={e=>setSettings({...settings,slotMinutes:Number(e.target.value) as 15|30|60})}><option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={60}>60 minutes</option></select></label>
      </div>
      <div className="schedule-preview"><strong>Aperçu</strong><span>{String(settings.startHour).padStart(2,"0")}:00</span><div></div><span>{settings.endHour===24?"24:00":`${String(settings.endHour).padStart(2,"0")}:00`}</span></div>
      <button className="button" onClick={save}>Enregistrer les paramètres</button>
    </section>
    <ResourceOrderPanel />
  </>;
}

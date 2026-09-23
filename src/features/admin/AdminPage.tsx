"use client";

import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { createPayrollTestData, createTestData, resetStudentHours, resetStudentTrainingRecords, resetTestEnvironment } from "./firestore";
import { UserManagementPanel } from "@/features/auth/UserManagementPanel";
import { ResourceManagement } from "@/features/fleet/ResourceManagement";
import { subscribeAircraft } from "@/features/fleet/firestore";
import type { Aircraft } from "@/features/fleet/types";
import { useAuth } from "@/features/auth/AuthProvider";
import { canManageAdministration } from "@/features/auth/types";

type ActionName = "hours" | "records" | "test" | "create" | "payroll";
const ACTIONS: Record<ActionName, {title:string;description:string;confirmation:string;button:string;danger?:boolean}> = {
  hours: { title:"Remettre les heures à zéro", description:"Remet à 0 les heures de vol, de sol, de simulateur, double commande et solo de tous les étudiants.", confirmation:"HEURES", button:"Réinitialiser les heures", danger:true },
  records: { title:"Réinitialiser les dossiers étudiants", description:"Efface la progression PTR, les évaluations, l’historique, les notes et les documents. Les fiches d’identité des étudiants sont conservées.", confirmation:"DOSSIERS", button:"Réinitialiser les dossiers", danger:true },
  test: { title:"Repartir avec un environnement de test vide", description:"Efface l’horaire, les annulations, la progression PTR, les évaluations, l’historique et les notes, puis remet toutes les heures à zéro. Les étudiants, instructeurs, avions et réglages sont conservés.", confirmation:"RESET TEST", button:"Réinitialiser les données de test", danger:true },
  create: { title:"Créer des données de démonstration", description:"Ajoute trois étudiants et trois réservations identifiés comme données de test pour vérifier rapidement l’application.", confirmation:"DEMO", button:"Créer les données de démonstration" },
  payroll: { title:"Créer les essais de feuilles de temps", description:"Ajoute deux instructeurs, quatre étudiants fictifs et treize activités complétées réparties sur les deux dernières semaines.", confirmation:"PAIE TEST", button:"Créer les essais de paie" },
};

export function AdminPage() {
  const {profile}=useAuth();
  const payrollAutoRun=useRef(false);
  const [selected,setSelected]=useState<ActionName|null>(null);
  const [confirmation,setConfirmation]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [aircraft,setAircraft]=useState<Aircraft[]>([]);
  useEffect(()=>subscribeAircraft({next:setAircraft,error:value=>setError(value.message)}),[]);
  useEffect(()=>{
    if(payrollAutoRun.current||new URLSearchParams(window.location.search).get("createPayrollTest")!=="1")return;
    payrollAutoRun.current=true;setBusy(true);setError("");
    createPayrollTestData().then(result=>{
      setMessage(`${result.instructors} instructeurs, ${result.students} étudiants et ${result.reservations} activités de paie créés.`);
      window.history.replaceState({},"","/admin");
    }).catch(caught=>setError(caught instanceof Error?caught.message:"La création des essais de paie a échoué.")).finally(()=>setBusy(false));
  },[]);
  async function execute(){
    if(!selected||confirmation!==ACTIONS[selected].confirmation)return;
    setBusy(true);setMessage("");setError("");
    try{
      if(selected==="hours"){const count=await resetStudentHours();setMessage(`Heures remises à zéro pour ${count} étudiant(s).`);}
      else if(selected==="records"){const result=await resetStudentTrainingRecords();setMessage(`${result.deleted} élément(s) de dossier supprimé(s); ${result.students} étudiant(s) remis à zéro.`);}
      else if(selected==="test"){const result=await resetTestEnvironment();setMessage(`${result.deleted} donnée(s) supprimée(s); ${result.students} étudiant(s) remis à zéro.`);}
      else if(selected==="create"){const result=await createTestData();setMessage(`${result.students} étudiant(s) et ${result.reservations} réservation(s) de démonstration créés.`);}
      else{const result=await createPayrollTestData();setMessage(`${result.instructors} instructeurs, ${result.students} étudiants et ${result.reservations} activités de paie créés.`);}
      setSelected(null);setConfirmation("");
    }catch(caught){setError(caught instanceof Error?caught.message:"L’opération administrative a échoué.");}
    finally{setBusy(false);}
  }
  return <><PageHeader title="Administration" subtitle="Outils de développement et remise à zéro sécurisée"/>
    <UserManagementPanel/>
    <ResourceManagement aircraft={aircraft}/>
    <div className="admin-warning"><strong>Zone sensible</strong><span>Ces opérations modifient directement les données Firebase partagées par les deux Mac.</span></div>
    {message&&<div className="notice">{message}</div>}{error&&<div className="notice error">{error}</div>}
    <div className="admin-tools-grid">{(Object.keys(ACTIONS)as ActionName[]).map(key=>{const action=ACTIONS[key];return <section className={`card admin-tool-card ${action.danger?"danger-zone":""}`} key={key}><h2>{action.title}</h2><p>{action.description}</p><button className={`button ${action.danger?"danger":""}`} onClick={()=>{setSelected(key);setConfirmation("");}}>{action.button}</button></section>})}</div>
    <section className="card admin-settings-link"><div><h2>Réglages de l’horaire</h2><p>Modifier la plage horaire, la précision des réservations et l’ordre des ressources.</p></div><a className="button secondary" href="/admin/schedule">Ouvrir les réglages</a></section>
    {process.env.NEXT_PUBLIC_APP_ENV==="test"&&canManageAdministration(profile)&&<section className="card admin-settings-link"><div><h2>Commentaires de test</h2><p>Consulter les observations envoyées par les employés pendant la période d’essai.</p></div><a className="button secondary" href="/admin/test-feedback">Voir les commentaires</a></section>}
    {selected&&<div className="modal-backdrop"><section className="modal compact"><header><div><h2>Confirmation requise</h2><p>{ACTIONS[selected].title}</p></div><button className="icon-button" onClick={()=>setSelected(null)}>×</button></header><div className="modal-body"><p>Cette opération agit sur Firebase et ne peut pas être annulée depuis l’application.</p><label>Tapez <strong>{ACTIONS[selected].confirmation}</strong> pour confirmer<input autoFocus value={confirmation} onChange={event=>setConfirmation(event.target.value)} disabled={busy}/></label></div><footer><span/><button className="button secondary" onClick={()=>setSelected(null)} disabled={busy}>Annuler</button><button className={`button ${ACTIONS[selected].danger?"danger":""}`} onClick={execute} disabled={busy||confirmation!==ACTIONS[selected].confirmation}>{busy?"Traitement…":"Confirmer"}</button></footer></section></div>}
  </>;
}

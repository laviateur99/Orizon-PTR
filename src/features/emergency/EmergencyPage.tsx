"use client";
import{useEffect,useMemo,useState}from"react";
import{PageHeader}from"@/components/ui/PageHeader";
import{subscribeResources}from"@/features/scheduler/firestore";
import type{SchedulerResource}from"@/features/scheduler/types";
import{createEmergency,subscribeEmergencies,updateEmergency}from"./firestore";
import type{EmergencyRecord}from"./types";

const CHECKLISTS=[
 {title:"Directives générales - section 8.3",items:[
  "Signaler immédiatement la situation d’urgence conformément à la liste pertinente",
  "Ne pas retarder le signalement si tous les renseignements ne sont pas disponibles",
  "Considérer tous les occupants vivants et blessés, sauf certitude absolue du contraire",
  "Utiliser le moyen de communication le plus rapide disponible",
  "Signaler la situation le plus discrètement possible et ne transmettre que les renseignements nécessaires",
  "Ne faire aucune déclaration aux médias; diriger les demandes vers le gestionnaire des opérations",
  "Demeurer calme et adopter une attitude responsable et professionnelle",
  "Garder les lignes de communication libres pour les urgences seulement",
  "Prendre des notes sur toutes les communications, observations et mesures prises"
 ]},
 {title:"Aéronef en retard - 30 minutes après l’HAP",items:[
  "Passer en revue l’itinéraire de vol",
  "Commencer une recherche par moyens de communication",
  "Communiquer avec le gestionnaire supérieur avec l’itinéraire de vol disponible",
  "Si le gestionnaire supérieur est indisponible, joindre le chef instructeur; sinon la FSS la plus près"
 ]},
 {title:"Aéronef en retard - 60 minutes après l’HAP",items:[
  "Communiquer avec l’unité pertinente des services de contrôle de la circulation aérienne",
  "Poursuivre la recherche par moyens de communication",
  "Communiquer avec le centre de coordination des opérations de sauvetage",
  "Communiquer avec les plus proches parents et aviser le chef instructeur s’il n’est pas présent"
 ]},
 {title:"Accident d’aéronef",items:[
  "Organiser les secours sur place selon les besoins",
  "Communiquer avec les auxiliaires médicaux, l’ambulance, les incendies et la police",
  "Aviser le gestionnaire des opérations",
  "Le gestionnaire supérieur communique avec le Bureau de la sécurité des transports",
  "Le gestionnaire supérieur communique avec le centre de coordination des opérations de sauvetage",
  "Le gestionnaire supérieur communique avec l’ATC pertinente",
  "Communiquer avec les plus proches parents et aviser le chef instructeur s’il n’est pas présent"
 ]}
] as const;

export function EmergencyPage(){
 const[aircraft,setAircraft]=useState<SchedulerResource[]>([]),[records,setRecords]=useState<EmergencyRecord[]>([]),[error,setError]=useState(""),[message,setMessage]=useState("");
 const[form,setForm]=useState({aircraftId:"",openedBy:"",contactEstablished:"Inconnu",nature:"",personsOnBoard:"",fuelEndurance:"",lastKnownPosition:"",lastContactTime:"",intentions:"",transponderCode:"",eltStatus:"Inconnu",weather:"",notes:"",actions:[] as string[]});
 useEffect(()=>{const requested=new URLSearchParams(window.location.search).get("aircraft");if(requested)setForm(current=>({...current,aircraftId:requested}))},[]);
 useEffect(()=>{const a=subscribeResources({next:x=>setAircraft(x.filter(r=>r.kind==="aircraft")),error:e=>setError(e.message)}),b=subscribeEmergencies({next:setRecords,error:e=>setError(e.message)});return()=>{a();b()}},[]);
 const selected=aircraft.find(x=>x.id===form.aircraftId),open=useMemo(()=>records.filter(r=>r.status!=="Résolue").sort((a,b)=>b.openedAt.localeCompare(a.openedAt)),[records]);
 function toggle(action:string){setForm(current=>({...current,actions:current.actions.includes(action)?current.actions.filter(item=>item!==action):[...current.actions,action]}))}
 async function submit(event:React.FormEvent){event.preventDefault();if(!selected||!form.openedBy.trim()||!form.nature.trim()){setMessage("L’avion, la personne responsable et la nature de l’urgence sont obligatoires.");return}await createEmergency({...form,aircraftRegistration:selected.name,reservationId:""});setMessage("Dossier d’urgence créé et journalisé.");setForm(current=>({...current,aircraftId:"",nature:"",notes:"",actions:[]}))}
 return <><PageHeader title="Urgences" subtitle="Listes de vérification - Manuel de contrôle, section 8"/>{error&&<div className="notice error">{error}</div>}{message&&<div className="notice">{message}</div>}
  <div className="emergency-warning"><strong>Urgence immédiate : 911</strong><p>Signalez sans délai la situation avec le moyen le plus rapide. Cette page reprend la section 8 du Manuel de contrôle; elle ne remplace pas les procédures ATS ni les services d’urgence.</p></div>
  <section className="card emergency-contacts"><h2>Contacts d’urgence du manuel</h2><div><a href="tel:911"><strong>Police, ambulance, incendie</strong><span>911</span></a><a href="tel:18002677270"><strong>Centre de sauvetage - Trenton</strong><span>1-800-267-7270</span></a><a href="tel:18005675111"><strong>Centre de sauvetage - Victoria</strong><span>1-800-567-5111</span></a><a href="tel:18005651582"><strong>Centre de sauvetage - Halifax</strong><span>1-800-565-1582</span></a><a href="tel:15146333246"><strong>Bureau de la sécurité des transports</strong><span>514-633-3246</span></a><a href="tel:18664663836"><strong>Station d’information de vol</strong><span>1-866-GO-METEO</span></a></div><p>Gestionnaire des opérations : 418-952-9933 · 418-834-7800 · 418-877-2699. Confirmer périodiquement ces coordonnées conformément au manuel.</p></section>
  <div className="emergency-layout"><section className="card"><h2>Ouvrir une urgence</h2><form className="form" onSubmit={submit}><div className="form-grid"><label>Avion<select required value={form.aircraftId} onChange={e=>setForm({...form,aircraftId:e.target.value})}><option value="">Sélectionner</option>{aircraft.map(a=><option value={a.id} key={a.id}>{a.name}</option>)}</select></label><label>Responsable du suivi<input required value={form.openedBy} onChange={e=>setForm({...form,openedBy:e.target.value})}/></label><label>Contact établi?<select value={form.contactEstablished} onChange={e=>setForm({...form,contactEstablished:e.target.value})}><option>Inconnu</option><option>Oui</option><option>Non</option><option>Intermittent</option></select></label><label>Dernier contact<input type="time" value={form.lastContactTime} onChange={e=>setForm({...form,lastContactTime:e.target.value})}/></label><label>Personnes à bord<input value={form.personsOnBoard} onChange={e=>setForm({...form,personsOnBoard:e.target.value})}/></label><label>Autonomie carburant<input value={form.fuelEndurance} onChange={e=>setForm({...form,fuelEndurance:e.target.value})}/></label><label>Dernière position connue<input value={form.lastKnownPosition} onChange={e=>setForm({...form,lastKnownPosition:e.target.value})}/></label><label>Code transpondeur<input value={form.transponderCode} onChange={e=>setForm({...form,transponderCode:e.target.value})}/></label><label>État ELT<select value={form.eltStatus} onChange={e=>setForm({...form,eltStatus:e.target.value})}><option>Inconnu</option><option>Non activée</option><option>Activée</option><option>Signal reçu</option></select></label><label>Météo connue<input value={form.weather} onChange={e=>setForm({...form,weather:e.target.value})}/></label></div><label>Nature de l’urgence<textarea required value={form.nature} onChange={e=>setForm({...form,nature:e.target.value})}/></label><label>Intentions / renseignements reçus<textarea value={form.intentions} onChange={e=>setForm({...form,intentions:e.target.value})}/></label><label>Notes<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
   <div className="emergency-checklists">{CHECKLISTS.map(group=><section key={group.title}><h3>{group.title}</h3><div className="emergency-actions">{group.items.map(action=><button type="button" className={form.actions.includes(action)?"active":""} onClick={()=>toggle(action)} key={action}>{form.actions.includes(action)?"✓ ":""}{action}</button>)}</div></section>)}</div>
   <button className="button danger">Ouvrir le dossier d’urgence</button></form></section><section className="card"><h2>Urgences ouvertes</h2>{open.map(r=><article className="emergency-record" key={r.id}><strong>{r.aircraftRegistration} - {r.nature}</strong><span>{r.openedAt.slice(0,16).replace("T"," ")} · {r.openedBy}</span><p>Contact : {r.contactEstablished} · Position : {r.lastKnownPosition||"inconnue"}</p><small>{r.actions.length} action{r.actions.length>1?"s":""} consignée{r.actions.length>1?"s":""}</small><button className="button secondary" onClick={()=>updateEmergency(r.id,{status:"Résolue"})}>Marquer résolue</button></article>)}{!open.length&&<p>Aucune urgence ouverte.</p>}</section></div>
 </>;
}

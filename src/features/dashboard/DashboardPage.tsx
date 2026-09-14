"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { subscribeDashboard, type DashboardSnapshot } from "./firestore";
import {useAuth} from "@/features/auth/AuthProvider";
import {createCamilleExampleLeave,subscribeEmployeeLeaves,subscribeEmployeeTraining} from "@/features/employees/firestore";
import type{EmployeeTrainingRecord}from"@/features/employees/types";
import{EMPLOYEE_TRAINING_SUBJECTS}from"@/features/employees/EmployeeTrainingPanel";
import{subscribeInstructors}from"@/features/instructors/firestore";
import type{Instructor}from"@/features/instructors/types";

const initial:DashboardSnapshot={
  aircraftTotal:0,aircraftAvailable:0,aircraftUnavailable:0,
  instructorTotal:0,studentTotal:0,openSnags:0,todaysReservations:0,lateFlights:0
};

type WeatherSnapshot={
  station:string;
  raw:string;
  observedAt:string;
  category:string;
  temperatureC?:number;
  dewpointC?:number;
  windDirection?:number|string;
  windSpeedKt?:number;
  windGustKt?:number;
  visibilitySm?:number|string;
  clouds?:Array<{cover?:string;base?:number}>;
  altimeterHpa?:number;
  weather:string;
  taf:string;
  tafIssuedAt:string;
  tafValidFrom:string;
  tafValidTo:string;
};

function value(value:number|string|undefined,suffix=""){
  return value===undefined||value===""?"—":`${value}${suffix}`;
}

type WeatherMinimum={id:string;label:string;visibility?:number;ceiling?:number;vfr?:boolean;temperature:number;noPrecipitation:boolean};
const WEATHER_MINIMUMS:WeatherMinimum[]=[
  {id:"manoeuvres-solo",label:"Manœuvres solo",visibility:10,ceiling:2000,temperature:-15,noPrecipitation:true},
  {id:"manoeuvres-instructeur",label:"Manœuvres avec instructeur",vfr:true,temperature:-15,noPrecipitation:false},
  {id:"circuits-solo",label:"Posés-décollés solo",visibility:6,ceiling:1500,temperature:-15,noPrecipitation:true},
  {id:"circuits-instructeur",label:"Posés-décollés avec instructeur",vfr:true,temperature:-15,noPrecipitation:false},
  {id:"navigation-solo",label:"Navigation — jour solo",visibility:10,ceiling:2500,temperature:-20,noPrecipitation:true},
  {id:"navigation-instructeur",label:"Navigation / vol aux instruments avec instructeur",vfr:true,temperature:-20,noPrecipitation:false}
];
const AIRCRAFT_CROSSWIND_LIMITS=[
  {id:"c152",label:"Cessna 152",limit:12},
  {id:"c172",label:"Cessna 172",limit:15},
  {id:"pa31",label:"PA-31",limit:20}
] as const;
const numeric=(value:number|string|undefined)=>{const result=Number(value);return Number.isFinite(result)?result:undefined};
const ceiling=(weather:WeatherSnapshot)=>(weather.clouds||[]).filter(layer=>["BKN","OVC","VV"].includes(layer.cover||"")&&typeof layer.base==="number").map(layer=>layer.base as number).sort((a,b)=>a-b)[0];
const hasPrecipitation=(weather:WeatherSnapshot)=>{
  const tokens=` ${weather.weather||""} ${weather.raw||""} `.toUpperCase().split(/\s+/);
  return tokens.some(token=>/(^|[-+])(?:VC)?(?:SH|TS|FZ)?(?:DZ|RA|SN|SG|IC|PL|GR|GS|UP)/.test(token));
};
type WindAssessment={crosswind:number;headwind:number;side:"gauche"|"droite"|"variable";limit:number;aircraft:string;variable:boolean};
function calculateWind(weather:WeatherSnapshot,runway:string,aircraftId:string):WindAssessment|undefined{
  const windDirection=numeric(weather.windDirection),windSpeed=weather.windGustKt||weather.windSpeedKt;
  const runwayNumber=Number(runway),aircraft=AIRCRAFT_CROSSWIND_LIMITS.find(item=>item.id===aircraftId);
  if(windSpeed===undefined||!Number.isFinite(runwayNumber)||runwayNumber<1||runwayNumber>36||!aircraft)return undefined;
  if(String(weather.windDirection).toUpperCase()==="VRB")return{crosswind:windSpeed,headwind:0,side:"variable",limit:aircraft.limit,aircraft:aircraft.label,variable:true};
  if(windDirection===undefined)return undefined;
  const runwayHeading=runwayNumber*10;
  const signedAngle=((windDirection-runwayHeading+540)%360)-180;
  const radians=signedAngle*Math.PI/180;
  return{
    crosswind:Math.round(Math.abs(windSpeed*Math.sin(radians))*10)/10,
    headwind:Math.round(windSpeed*Math.cos(radians)*10)/10,
    side:signedAngle<0?"gauche":"droite",
    limit:aircraft.limit,
    aircraft:aircraft.label,
    variable:false
  };
}
function assessMinimum(weather:WeatherSnapshot,minimum:WeatherMinimum,wind:WindAssessment|undefined){
  const visibility=numeric(weather.visibilitySm),reportedCeiling=ceiling(weather),temperature=weather.temperatureC;
  const failures:string[]=[];
  const unknown:string[]=[];
  if(minimum.vfr){
    if(visibility===undefined)unknown.push("visibilité VFR");
    else if(visibility<3)failures.push(`visibilité ${visibility} SM < minimum VFR de 3 SM`);
    if(reportedCeiling===undefined){
      const layers=weather.clouds||[];
      if(!layers.length&&!/\b(?:SKC|CLR|CAVOK|NSC|NCD)\b/.test(weather.raw))unknown.push("plafond VFR");
    }else if(reportedCeiling<1000)failures.push(`plafond ${reportedCeiling} pi < minimum VFR de 1 000 pi`);
  }else{
    if(visibility===undefined)unknown.push("visibilité");
    else if(visibility<(minimum.visibility||0))failures.push(`visibilité ${visibility} SM < ${minimum.visibility} SM`);
    if(reportedCeiling===undefined){
      const layers=weather.clouds||[];
      if(!layers.length&&!/\b(?:SKC|CLR|CAVOK|NSC|NCD)\b/.test(weather.raw))unknown.push("plafond");
    }else if(reportedCeiling<(minimum.ceiling||0))failures.push(`plafond ${reportedCeiling} pi < ${minimum.ceiling} pi`);
  }
  if(temperature===undefined)unknown.push("température");
  else if(temperature<minimum.temperature)failures.push(`température ${temperature} °C < ${minimum.temperature} °C`);
  if(minimum.noPrecipitation&&hasPrecipitation(weather))failures.push("précipitations observées");
  if(!wind)unknown.push("vent de travers (sélectionner la piste et le type d’avion)");
  else{
    if(wind.crosswind>wind.limit)failures.push(`vent de travers ${wind.crosswind} kt > limite ${wind.limit} kt (${wind.aircraft})`);
    if(wind.headwind< -5)failures.push(`vent arrière ${Math.abs(wind.headwind).toFixed(1)} kt > limite 5 kt`);
    else if(wind.headwind<0)unknown.push(`vent arrière ${Math.abs(wind.headwind).toFixed(1)} kt — toléré, mais hors de l’arc avant`);
  }
  return{status:failures.length?"no":unknown.length?"caution":"yes",failures,unknown,visibility,reportedCeiling};
}

export function DashboardPage(){
  const{user,profile}=useAuth(),leaveManager=profile?.role==="Administrateur"||profile?.role==="Chef instructeur";
  const [data,setData]=useState(initial);
  const [error,setError]=useState("");
  const [weather,setWeather]=useState<WeatherSnapshot|null>(null);
  const [weatherError,setWeatherError]=useState("");
  const [weatherLoading,setWeatherLoading]=useState(true);
  const [runway,setRunway]=useState("");
  const [aircraftType,setAircraftType]=useState("");
  const[pendingLeaves,setPendingLeaves]=useState(0);
  const[trainingRecords,setTrainingRecords]=useState<EmployeeTrainingRecord[]>([]),[trainingInstructors,setTrainingInstructors]=useState<Instructor[]>([]);
  const[creatingLeave,setCreatingLeave]=useState(false);
  const[leaveMessage,setLeaveMessage]=useState("");
  useEffect(()=>subscribeDashboard(setData,value=>setError(value.message)),[]);
  useEffect(()=>leaveManager?subscribeEmployeeLeaves(undefined,true,items=>setPendingLeaves(items.filter(item=>item.status==="En attente").length),value=>setError(value.message)):undefined,[leaveManager]);
  useEffect(()=>leaveManager?subscribeEmployeeTraining(undefined,setTrainingRecords,value=>setError(value.message)):undefined,[leaveManager]);
  useEffect(()=>leaveManager?subscribeInstructors({next:setTrainingInstructors,error:value=>setError(value.message)}):undefined,[leaveManager]);
  const trainingAlerts=useMemo(()=>{
    if(!leaveManager)return 0;
    const latest=new Map<string,EmployeeTrainingRecord>();trainingRecords.forEach(item=>{const key=`${item.employeeId}:${item.subjectId}`,current=latest.get(key);if(!current||item.completedDate>current.completedDate)latest.set(key,item)});
    const now=new Date();now.setHours(12,0,0,0);const urgent=(item:EmployeeTrainingRecord|undefined)=>!item||Boolean(item.expiryDate&&(new Date(`${item.expiryDate}T12:00:00`).getTime()-now.getTime())/86400000<=60);
    let count=0;const instructorIds=new Set(trainingInstructors.filter(item=>item.status==="Actif").map(item=>item.id));
    for(const instructorId of instructorIds)for(const subject of EMPLOYEE_TRAINING_SUBJECTS)if(subject.required&&urgent(latest.get(`${instructorId}:${subject.id}`)))count+=1;
    for(const [key,item]of latest)if(!instructorIds.has(item.employeeId)&&item.expiryDate&&urgent(item))count+=1;
    return count;
  },[leaveManager,trainingRecords,trainingInstructors]);
  useEffect(()=>{
    setRunway(window.localStorage.getItem("orizon-active-runway")||"");
    setAircraftType(window.localStorage.getItem("orizon-weather-aircraft")||"");
  },[]);
  useEffect(()=>{
    let active=true;
    async function loadWeather(){
      setWeatherLoading(true);
      try{
        const response=await fetch("/api/weather?station=CYQB",{cache:"no-store"});
        if(!response.ok)throw new Error("METAR indisponible");
        const report=await response.json() as WeatherSnapshot;
        if(active){setWeather(report);setWeatherError("");}
      }catch{
        if(active)setWeatherError("La météo de CYQB est temporairement indisponible.");
      }finally{
        if(active)setWeatherLoading(false);
      }
    }
    void loadWeather();
    const timer=window.setInterval(()=>void loadWeather(),300000);
    return()=>{active=false;window.clearInterval(timer)};
  },[]);
  const windAssessment=weather?calculateWind(weather,runway,aircraftType):undefined;
  const windResultStatus=!windAssessment?"caution":windAssessment.crosswind>windAssessment.limit||windAssessment.headwind< -5?"no":windAssessment.headwind<0||windAssessment.crosswind>=windAssessment.limit*.8?"caution":"yes";
  async function createCamilleExample(){
    if(!user||creatingLeave)return;
    setCreatingLeave(true);setLeaveMessage("");setError("");
    try{
      await createCamilleExampleLeave(user.uid);
      setLeaveMessage("La demande fictive de Camille a été créée. Elle apparaît maintenant dans les congés à approuver.");
    }catch(value){
      setError(`Impossible de créer l’exemple de Camille : ${value instanceof Error?value.message:"erreur inconnue"}`);
    }finally{setCreatingLeave(false)}
  }

  return <>
    <PageHeader title="Tableau de bord" subtitle="Vue opérationnelle en temps réel" />
    {error&&<div className="notice error">{error}</div>}
    {leaveMessage&&<div className="notice">{leaveMessage}</div>}
    {leaveManager&&pendingLeaves===0&&<section className="card dashboard-leave-example"><div><h2>Exemple de demande de congé</h2><p>Créez une demande fictive de vacances pour Camille Bérubé afin de vérifier le processus d’approbation.</p></div><button className="button" type="button" disabled={creatingLeave} onClick={createCamilleExample}>{creatingLeave?"Création…":"Créer l’exemple de Camille"}</button></section>}
    {leaveManager&&pendingLeaves>0&&<a className="card dashboard-leave-alert" href="/employees?tab=leave"><div><span className="badge warn">Action requise</span><h2>{pendingLeaves} demande{pendingLeaves>1?"s":""} de congé en attente</h2><p>Ouvrez la gestion des congés pour approuver ou refuser les demandes.</p></div><strong>Examiner →</strong></a>}
    {leaveManager&&trainingAlerts>0&&<a className="card dashboard-training-alert" href="/employees?tab=training"><div><span className="badge danger">Formation</span><h2>{trainingAlerts} formation{trainingAlerts>1?"s":""} expirée{trainingAlerts>1?"s":""} ou à renouveler</h2><p>Échéance dépassée ou prévue dans les 60 prochains jours.</p></div><strong>Examiner →</strong></a>}
    <section className="card dashboard-weather">
      <header>
        <div>
          <span className="weather-label">Météo opérationnelle</span>
          <h2>METAR CYQB</h2>
        </div>
        <strong className={`flight-category ${(weather?.category||"").toLowerCase()}`}>{weather?.category||"—"}</strong>
      </header>
      {weatherLoading&&!weather&&<p className="muted">Chargement de la météo…</p>}
      {weatherError&&<div className="notice error">{weatherError}</div>}
      {weather&&<>
        <div className="weather-metrics">
          <div><span>Vent</span><strong>{value(weather.windDirection,"°")} · {value(weather.windSpeedKt," kt")}{weather.windGustKt?` G${weather.windGustKt}`:""}</strong></div>
          <div><span>Visibilité</span><strong>{value(weather.visibilitySm," SM")}</strong></div>
          <div><span>Température</span><strong>{value(weather.temperatureC," °C")}</strong></div>
          <div><span>Point de rosée</span><strong>{value(weather.dewpointC," °C")}</strong></div>
          <div><span>Altimètre</span><strong>{value(weather.altimeterHpa," hPa")}</strong></div>
          <div><span>Observation</span><strong>{weather.observedAt?new Date(weather.observedAt).toLocaleTimeString("fr-CA",{hour:"2-digit",minute:"2-digit"}):"—"}</strong></div>
        </div>
        <code className="raw-metar">{weather.raw}</code>
        <div className="weather-forecast">
          <div className="weather-forecast-head">
            <div>
              <span className="weather-label">Prévision d’aérodrome</span>
              <h3>TAF CYQB</h3>
            </div>
            <a className="button weather-navcanada" href="https://plan.navcanada.ca/wxrecall/" target="_blank" rel="noreferrer">Ouvrir NAV CANADA ↗</a>
          </div>
          {weather.taf
            ?<code className="raw-metar">{weather.taf}</code>
            :<p className="muted weather-muted">Aucun TAF disponible actuellement pour CYQB.</p>}
        </div>
        <div className="weather-dispatch-assessment">
          <div className="weather-assessment-head"><div><span className="weather-label">Aide à la décision du dispatch</span><h3>Minimums météorologiques Orizon</h3></div><span>Basé sur le METAR observé seulement</span></div>
          <div className="weather-wind-controls"><label>Piste en usage<div className="runway-input"><span>RWY</span><input inputMode="numeric" maxLength={2} placeholder="Ex. 24" value={runway} onChange={e=>{const value=e.target.value.replace(/\D/g,"").slice(0,2);setRunway(value);window.localStorage.setItem("orizon-active-runway",value)}}/></div></label><label>Type d’avion<select value={aircraftType} onChange={e=>{setAircraftType(e.target.value);window.localStorage.setItem("orizon-weather-aircraft",e.target.value)}}><option value="">Sélectionner</option>{AIRCRAFT_CROSSWIND_LIMITS.map(item=><option value={item.id} key={item.id}>{item.label} — limite {item.limit} kt</option>)}</select></label>{windAssessment&&<div className={`wind-result ${windResultStatus}`}><span>{windAssessment.variable?"Vent variable — calcul conservateur":windResultStatus==="yes"?"Vent dans l’arc avant":windResultStatus==="no"?"Limite de vent dépassée":"Attention — marge réduite"}</span><strong>{windAssessment.crosswind.toFixed(1)} kt traversier {windAssessment.variable?"maximum possible":`de la ${windAssessment.side}`}</strong><small>Limite traversière {windAssessment.limit} kt · {windAssessment.variable?"direction variable, composante maximale retenue":windAssessment.headwind>=0?`vent de face ${windAssessment.headwind.toFixed(1)} kt`:`vent arrière ${Math.abs(windAssessment.headwind).toFixed(1)} kt / limite 5 kt`} · calcul avec {weather.windGustKt?"rafale":"vent moyen"}</small></div>}</div>
          <div className="weather-minimum-grid">{WEATHER_MINIMUMS.map(minimum=>{const assessment=assessMinimum(weather,minimum,windAssessment);return <article className={`weather-minimum ${assessment.status}`} key={minimum.id}><header><strong>{minimum.label}</strong><b>{assessment.status==="no"?"NON CONFORME":assessment.status==="yes"?"CONFORME":"À CONFIRMER"}</b></header><p>{minimum.vfr?"Minimum VFR":`${minimum.visibility} SM · plafond ${minimum.ceiling} pi AGL`} · température ≥ {minimum.temperature} °C{minimum.noPrecipitation?" · aucune précipitation":" · précipitations sans objet"}</p>{windAssessment&&assessment.status!=="no"&&<span className="weather-success">✓ vent traversier {windAssessment.crosswind.toFixed(1)} kt ≤ {windAssessment.limit} kt</span>}{assessment.failures.map(item=><span className="weather-failure" key={item}>✕ {item}</span>)}{assessment.unknown.map(item=><span className="weather-unknown" key={item}>! {item}</span>)}</article>})}</div>
          <div className="weather-ifr-rule"><strong>Vol IFR en IMC</strong><span>Le plafond doit être supérieur de 400 pieds à la MDA de la piste utilisable pour permettre un retour sécuritaire à la base. Les conditions de givrage doivent respecter les capacités de l’aéronef.</span><small>Vérification manuelle requise : la MDA, la piste utilisable et les capacités de givrage ne sont pas contenues dans le METAR.</small></div>
          <p className="weather-assessment-disclaimer">Aide visuelle seulement : le dispatch et le pilote doivent vérifier le METAR complet, le TAF, les NOTAM, la piste en service, la composante de vent de travers et les limites du POH avant d’autoriser le vol.</p>
        </div>
      </>}
    </section>
    <div className="dashboard-kpis">
      <a className="card dashboard-kpi" href="/schedule"><span>Vols aujourd’hui</span><strong>{data.todaysReservations}</strong></a>
      <a className="card dashboard-kpi" href="/fleet"><span>Avions disponibles</span><strong>{data.aircraftAvailable}/{data.aircraftTotal}</strong></a>
      <a className="card dashboard-kpi" href="/maintenance/snags"><span>SNAG ouverts</span><strong>{data.openSnags}</strong></a>
      <a className={`card dashboard-kpi ${data.lateFlights?"alert":""}`} href="/schedule"><span>Vols en retard</span><strong>{data.lateFlights}</strong></a>
      <a className="card dashboard-kpi" href="/instructors"><span>Instructeurs actifs</span><strong>{data.instructorTotal}</strong></a>
      <a className="card dashboard-kpi" href="/students"><span>Étudiants</span><strong>{data.studentTotal}</strong></a>
      <a className="card dashboard-kpi" href="/fleet"><span>Avions indisponibles</span><strong>{data.aircraftUnavailable}</strong></a>
      {leaveManager&&<a className={`card dashboard-kpi ${pendingLeaves?"alert":""}`} href="/employees?tab=leave"><span>Congés à approuver</span><strong>{pendingLeaves}</strong></a>}
      {leaveManager&&<a className={`card dashboard-kpi training-renewal-kpi ${trainingAlerts?"alert training-danger":""}`} href="/employees?tab=training"><span>Formations à renouveler</span><strong>{trainingAlerts}</strong></a>}
    </div>
    <div className="dashboard-actions">
      <a className="button" href="/schedule">Ouvrir l’horaire</a>
      <a className="button secondary" href="/fleet">Gérer la flotte</a>
      <a className="button secondary" href="/maintenance/snags">Tableau SNAG</a>
      <a className="button secondary" href="/ptr">PTR électronique</a>
    </div>
  </>;
}

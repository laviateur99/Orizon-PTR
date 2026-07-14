"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { subscribeDashboard, type DashboardSnapshot } from "./firestore";

const initial:DashboardSnapshot={
  aircraftTotal:0,aircraftAvailable:0,aircraftUnavailable:0,
  instructorTotal:0,studentTotal:0,openSnags:0,todaysReservations:0,lateFlights:0
};

export function DashboardPage(){
  const [data,setData]=useState(initial);
  const [error,setError]=useState("");
  useEffect(()=>subscribeDashboard(setData,value=>setError(value.message)),[]);

  return <>
    <PageHeader title="Tableau de bord" subtitle="Vue opérationnelle en temps réel" />
    {error&&<div className="notice error">{error}</div>}
    <div className="dashboard-kpis">
      <a className="card dashboard-kpi" href="/schedule"><span>Vols aujourd’hui</span><strong>{data.todaysReservations}</strong></a>
      <a className="card dashboard-kpi" href="/fleet"><span>Avions disponibles</span><strong>{data.aircraftAvailable}/{data.aircraftTotal}</strong></a>
      <a className="card dashboard-kpi" href="/maintenance/snags"><span>SNAG ouverts</span><strong>{data.openSnags}</strong></a>
      <a className={`card dashboard-kpi ${data.lateFlights?"alert":""}`} href="/schedule"><span>Vols en retard</span><strong>{data.lateFlights}</strong></a>
      <a className="card dashboard-kpi" href="/instructors"><span>Instructeurs actifs</span><strong>{data.instructorTotal}</strong></a>
      <a className="card dashboard-kpi" href="/students"><span>Étudiants</span><strong>{data.studentTotal}</strong></a>
      <a className="card dashboard-kpi" href="/fleet"><span>Avions indisponibles</span><strong>{data.aircraftUnavailable}</strong></a>
    </div>
    <div className="dashboard-actions">
      <a className="button" href="/schedule">Ouvrir l’horaire</a>
      <a className="button secondary" href="/fleet">Gérer la flotte</a>
      <a className="button secondary" href="/maintenance/snags">Tableau SNAG</a>
      <a className="button secondary" href="/ptr">PTR électronique</a>
    </div>
  </>;
}

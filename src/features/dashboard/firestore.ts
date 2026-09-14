import { collection, onSnapshot, type FirestoreError, type Unsubscribe } from "firebase/firestore";
import { db } from "@/services/firebase/client";

export type DashboardSnapshot = {
  aircraftTotal:number;
  aircraftAvailable:number;
  aircraftUnavailable:number;
  instructorTotal:number;
  studentTotal:number;
  openSnags:number;
  todaysReservations:number;
  lateFlights:number;
};

export function subscribeDashboard(
  next:(value:DashboardSnapshot)=>void,
  error:(value:FirestoreError)=>void
):Unsubscribe {
  const state:DashboardSnapshot={
    aircraftTotal:0,aircraftAvailable:0,aircraftUnavailable:0,
    instructorTotal:0,studentTotal:0,openSnags:0,todaysReservations:0,lateFlights:0
  };
  const emit=()=>next({...state});
  const today=new Date().toISOString().slice(0,10);
  const now=new Date();const nowMinutes=now.getHours()*60+now.getMinutes();

  const offAircraft=onSnapshot(collection(db,"aircraft"),snap=>{
    const docs=snap.docs.map(x=>x.data()).filter(x=>x.active!==false);
    state.aircraftTotal=docs.length;
    state.aircraftAvailable=docs.filter(x=>String(x.status||"Disponible")==="Disponible").length;
    state.aircraftUnavailable=state.aircraftTotal-state.aircraftAvailable;emit();
  },error);

  const offInstructors=onSnapshot(collection(db,"instructors"),snap=>{state.instructorTotal=snap.docs.filter(x=>x.data().active!==false).length;emit();},error);
  const offStudents=onSnapshot(collection(db,"students"),snap=>{state.studentTotal=snap.docs.filter(x=>String(x.data().status||"Actif")!=="Retiré").length;emit();},error);
  const offSnags=onSnapshot(collection(db,"snags"),snap=>{state.openSnags=snap.docs.filter(x=>String(x.data().status)!=="Fermé").length;emit();},error);
  const offReservations=onSnapshot(collection(db,"reservations"),snap=>{
    const todays=snap.docs.map(x=>x.data()).filter(x=>String(x.date)===today);
    state.todaysReservations=todays.length;
    state.lateFlights=todays.filter(x=>{
      const alert=typeof x.overdueAlertMinutes==="number"?x.overdueAlertMinutes:0;
      const status=String(x.status||"");
      const end=typeof x.endMinutes==="number"?x.endMinutes:0;
      return alert>0&&["Check-in","En vol"].includes(status)&&nowMinutes>end+alert;
    }).length;emit();
  },error);

  return()=>{offAircraft();offInstructors();offStudents();offSnags();offReservations();};
}

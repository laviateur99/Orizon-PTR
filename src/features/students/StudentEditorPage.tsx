"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/services/firebase/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { addHistory, saveStudent, subscribeInstructors } from "./firestore";
import type { InstructorOption, Student, StudentProgram } from "./types";
import {selectableTrainingPrograms,studentProgramType} from "./programs";
import {ATPA_PROGRAM} from "@/features/programs/data";
import {subscribeManagedPrograms,type ManagedTrainingProgram} from "@/features/programs/management";
const empty:Student={id:"",firstName:"",lastName:"",email:"",phone:"",address:"",emergencyContact:"",emergencyPhone:"",program:"ATP(A) intégré",programType:"Intégré",trainingProgramId:ATPA_PROGRAM.id,trainingProgramName:ATPA_PROGRAM.name,language:"Français",status:"Actif",primaryInstructorId:"",theoryCohortId:"",startDate:"",flightHours:0,groundHours:0,notes:""};
export function StudentEditorPage({mode}:{mode:"new"}){
 const router=useRouter(); const [form,setForm]=useState(empty); const [instructors,setInstructors]=useState<InstructorOption[]>([]); const [managedPrograms,setManagedPrograms]=useState<ManagedTrainingProgram[]>([]); const [saving,setSaving]=useState(false); const [error,setError]=useState("");
 const [signupRequestId,setSignupRequestId]=useState(""); const [signupAccountUid,setSignupAccountUid]=useState("");
 useEffect(()=>{const a=subscribeInstructors({next:setInstructors,error:e=>setError(e.message)}),b=subscribeManagedPrograms(setManagedPrograms,e=>setError(e.message));return()=>{a();b()}},[]);
 useEffect(()=>{
  const params=new URLSearchParams(window.location.search);
  const requestId=params.get("requestId");
  if(!requestId)return;
  setSignupRequestId(requestId);
  setSignupAccountUid(params.get("accountUid")||"");
  setForm(current=>({...current,firstName:params.get("firstName")||"",lastName:params.get("lastName")||"",email:params.get("email")||"",phone:params.get("phone")||""}));
 },[]);
 const trainingPrograms=selectableTrainingPrograms(managedPrograms);
 async function submit(e:React.FormEvent){e.preventDefault();if(!form.trainingProgramId){setError("Choisissez un programme de formation actif.");return}setSaving(true);setError("");try{
  const id=`student-${Date.now()}`;const student={...form,id};
  await saveStudent(student,false);
  await addHistory({studentId:id,type:"Création",title:"Dossier créé",detail:`${student.program} · ${student.trainingProgramName||"Programme à déterminer"}`});
  if(signupRequestId){
   await updateDoc(doc(db,"signupRequests",signupRequestId),{studentId:id,studentCreatedAt:new Date().toISOString(),studentCreatedBy:auth.currentUser?.email||""});
   if(signupAccountUid)await updateDoc(doc(db,"users",signupAccountUid),{linkedStudentId:id});
  }
  router.push(`/students/${id}`)}catch(err){setError(err instanceof Error?err.message:"Erreur") }finally{setSaving(false)}}
 return <><PageHeader title="Ajouter un étudiant" subtitle="Création du dossier de formation" />{signupRequestId&&<div className="notice">Dossier créé à partir d’une demande d’inscription approuvée{signupAccountUid?" — le compte de connexion sera automatiquement lié.":""}.</div>}{error&&<div className="notice error">{error}</div>}<form className="card student-form" onSubmit={submit}><div className="form-grid"><label>Prénom<input required value={form.firstName} onChange={e=>setForm({...form,firstName:e.target.value})}/></label><label>Nom<input required value={form.lastName} onChange={e=>setForm({...form,lastName:e.target.value})}/></label><label>Courriel<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label>Téléphone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label><label>Programme<select required value={form.trainingProgramId} onChange={e=>{const selected=trainingPrograms.find(program=>program.id===e.target.value);if(selected)setForm({...form,program:selected.name as StudentProgram,programType:studentProgramType(selected),trainingProgramId:selected.id,trainingProgramName:selected.name})}}>{trainingPrograms.map(program=><option value={program.id} key={program.id}>{program.name}</option>)}</select></label><label>Type<input value={form.programType} readOnly /></label><label>Instructeur principal<select value={form.primaryInstructorId} onChange={e=>setForm({...form,primaryInstructorId:e.target.value})}><option value="">Non assigné</option>{instructors.map(i=><option value={i.id} key={i.id}>{i.name}</option>)}</select></label><label>Date de début<input type="date" value={form.startDate} onChange={e=>setForm({...form,startDate:e.target.value})}/></label><label>Langue<select value={form.language} onChange={e=>setForm({...form,language:e.target.value as Student["language"]})}><option>Français</option><option>Anglais</option></select></label><label>Statut<select value={form.status} onChange={e=>setForm({...form,status:e.target.value as Student["status"]})}><option>Actif</option><option>En pause</option><option>Diplômé</option><option>Retiré</option></select></label></div><label>Adresse<textarea value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/></label><div className="form-grid"><label>Contact d’urgence<input value={form.emergencyContact} onChange={e=>setForm({...form,emergencyContact:e.target.value})}/></label><label>Téléphone urgence<input value={form.emergencyPhone} onChange={e=>setForm({...form,emergencyPhone:e.target.value})}/></label></div><div className="form-actions"><button type="button" className="button secondary" onClick={()=>router.push('/students')}>Annuler</button><button className="button" disabled={saving}>{saving?"Enregistrement…":"Créer le dossier"}</button></div></form></>;
}

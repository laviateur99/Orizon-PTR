"use client";

import { useEffect, useMemo, useState } from "react";
import { PinSignaturePad } from "@/components/ui/PinSignaturePad";
import { savePreSoloChecklist, subscribeInstructors, subscribePreSoloChecklist } from "./firestore";
import { PRE_SOLO_EXERCISES } from "./preSoloExercises";
import type { InstructorOption, PreSoloChecklist, PreSoloExercise } from "./types";

const today=()=>new Date().toLocaleDateString("en-CA");
const emptyExercise=():PreSoloExercise=>({completed:false,instructorId:"",instructorName:"",instructorLicense:"",instructorSignature:"",studentSignature:"",signedAt:""});
const emptyChecklist=(studentId:string):PreSoloChecklist=>({
  studentId,radioExaminerId:"",radioExaminerName:"",radioExaminerSignature:"",radioIssueDate:"",pstarMark:"",pstarDate:"",
  permitAuthorizedPersonId:"",permitAuthorizedPerson:"",permitSignature:"",permitIssueDate:"",permitExpiryDate:"",
  medicalAuthorizedPersonId:"",medicalAuthorizedPerson:"",medicalSignature:"",medicalIssueDate:"",medicalExpiryDate:"",
  exercises:Object.fromEntries(PRE_SOLO_EXERCISES.map(([id])=>[id,emptyExercise()])),
  recommendingInstructorId:"",recommendingInstructorName:"",recommendingInstructorLicenseClass:"",recommendingInstructorSignature:"",
  recommendingDate:"",recommendingInstructorIsClass4:false,supervisingInstructorId:"",supervisingInstructorName:"",
  supervisingInstructorLicenseClass:"",supervisingInstructorSignature:"",supervisingDate:"",
  authorized:false,completedAt:""
});
const present=(value:string)=>Boolean(value.trim());
const exerciseFieldsComplete=(item:PreSoloExercise|undefined)=>!!item&&[
  item.instructorName,item.instructorLicense,item.instructorSignature,item.studentSignature,item.signedAt
].every(present);
const exerciseComplete=(item:PreSoloExercise|undefined)=>!!item?.completed&&exerciseFieldsComplete(item);
export function preSoloMissingItems(value:PreSoloChecklist){
  const missing:string[]=[];
  if(![value.radioExaminerName,value.radioExaminerSignature,value.radioIssueDate].every(present))missing.push("Certificat de compétence en radio");
  if(![value.pstarMark,value.pstarDate].every(present))missing.push("Examen PSTAR");
  if(![value.permitAuthorizedPerson,value.permitSignature,value.permitIssueDate,value.permitExpiryDate].every(present))missing.push("Permis d’élève-pilote");
  if(![value.medicalAuthorizedPerson,value.medicalSignature,value.medicalIssueDate,value.medicalExpiryDate].every(present))missing.push("Certificat médical");
  PRE_SOLO_EXERCISES.forEach(([id,label])=>{if(!exerciseComplete(value.exercises[id]))missing.push(`Exercice : ${label}`);});
  if(![value.recommendingInstructorName,value.recommendingInstructorLicenseClass,value.recommendingInstructorSignature,value.recommendingDate].every(present))missing.push("Autorisation de l’instructeur recommandant");
  if(value.recommendingInstructorIsClass4&&![value.supervisingInstructorName,value.supervisingInstructorLicenseClass,value.supervisingInstructorSignature,value.supervisingDate].every(present))missing.push("Autorisation de l’instructeur surveillant");
  return missing;
}
export function isPreSoloComplete(value:PreSoloChecklist){
  const admin=[
    value.radioExaminerName,value.radioExaminerSignature,value.radioIssueDate,value.pstarMark,value.pstarDate,
    value.permitAuthorizedPerson,value.permitSignature,value.permitIssueDate,value.permitExpiryDate,
    value.medicalAuthorizedPerson,value.medicalSignature,value.medicalIssueDate,value.medicalExpiryDate
  ].every(present);
  const exercises=PRE_SOLO_EXERCISES.every(([id])=>exerciseComplete(value.exercises[id]));
  const recommendation=[
    value.recommendingInstructorName,value.recommendingInstructorLicenseClass,
    value.recommendingInstructorSignature,value.recommendingDate
  ].every(present);
  const supervision=!value.recommendingInstructorIsClass4||[
    value.supervisingInstructorName,value.supervisingInstructorLicenseClass,
    value.supervisingInstructorSignature,value.supervisingDate
  ].every(present);
  return admin&&exercises&&recommendation&&supervision;
}

export function PreSoloChecklistPanel({studentId,studentName,readOnly}:{studentId:string;studentName:string;readOnly?:boolean}){
  const [form,setForm]=useState<PreSoloChecklist>(()=>emptyChecklist(studentId));
  const [instructors,setInstructors]=useState<InstructorOption[]>([]);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  useEffect(()=>subscribePreSoloChecklist(studentId,value=>{
    if(!value)return;
    const exercises=Object.fromEntries(PRE_SOLO_EXERCISES.map(([id])=>[id,{...emptyExercise(),...(value.exercises?.[id]||{})}]));
    setForm({...emptyChecklist(studentId),...value,exercises});
  },e=>setError(e.message)),[studentId]);
  useEffect(()=>subscribeInstructors({next:setInstructors,error:e=>setError(e.message)}),[]);
  const complete=useMemo(()=>isPreSoloComplete(form),[form]);
  const missingItems=useMemo(()=>preSoloMissingItems(form),[form]);
  const exercisesReady=useMemo(()=>PRE_SOLO_EXERCISES.every(([id])=>exerciseComplete(form.exercises[id])),[form]);
  const field=<K extends keyof PreSoloChecklist>(key:K,value:PreSoloChecklist[K])=>setForm(current=>({...current,[key]:value}));
  const exercise=(id:string,patch:Partial<PreSoloExercise>)=>setForm(current=>({...current,exercises:{...current.exercises,[id]:{...(current.exercises[id]||emptyExercise()),...patch}}}));
  async function save(){
    setError("");setMessage("");
    try{
      const completedAt=complete?(form.completedAt||new Date().toISOString()):"";
      const exercises={...form.exercises};
      await savePreSoloChecklist({...form,exercises,authorized:complete,completedAt});
      setForm(current=>({...current,exercises,authorized:complete,completedAt}));
      setMessage(complete?"Check-list complète : l’élève est autorisé pour son premier solo.":"Brouillon enregistré. Le solo demeure bloqué jusqu’à ce que tous les éléments obligatoires soient remplis.");
    }catch(e){setError(e instanceof Error?e.message:"Impossible d’enregistrer la check-list.");}
  }
  return <section className="card pre-solo-checklist">
    <header className="pre-solo-head"><div><span>Premier solo</span><h2>Liste de vérification avant le premier solo</h2><p>La réservation et le check-out Solo demeurent bloqués jusqu’à l’autorisation complète.</p></div><strong className={complete?"authorized":"incomplete"}>{complete?"Prêt pour autorisation solo":"Incomplète — solo bloqué"}</strong></header>
    {error&&<div className="notice error">{error}</div>}{message&&<div className="notice">{message}</div>}
    {!complete&&<div className="pre-solo-missing"><strong>Éléments qui empêchent actuellement l’autorisation :</strong><ul>{missingItems.map(item=><li key={item}>{item}</li>)}</ul></div>}
    <fieldset disabled={readOnly} style={{border:"none",padding:0,margin:0}}>
    <h3>Validations administratives</h3>
    <div className="pre-solo-admin">
      <fieldset><legend>Certificat de compétence en radio</legend><label>Examinateur délégué<select value={form.radioExaminerId} onChange={e=>{const selected=instructors.find(i=>i.id===e.target.value);setForm(current=>({...current,radioExaminerId:e.target.value,radioExaminerName:selected?.name||""}))}}><option value="">Sélectionner…</option>{instructors.map(i=><option value={i.id} key={i.id}>{i.name}</option>)}</select></label><label>Date d’émission<input type="date" value={form.radioIssueDate} onChange={e=>field("radioIssueDate",e.target.value)}/></label>{form.radioExaminerId?<PinSignaturePad label="Signature de l’examinateur" kind="instructor" personId={form.radioExaminerId} signerName={form.radioExaminerName} value={form.radioExaminerSignature} onChange={value=>field("radioExaminerSignature",value)}/>:<p className="notice">Sélectionnez l’examinateur avant de signer.</p>}</fieldset>
      <fieldset><legend>Examen PSTAR</legend><label>Note<input value={form.pstarMark} onChange={e=>field("pstarMark",e.target.value)} placeholder="Ex. 92 %"/></label><label>Date<input type="date" value={form.pstarDate} onChange={e=>field("pstarDate",e.target.value)}/></label></fieldset>
      <fieldset><legend>Permis d’élève-pilote</legend><label>Personne autorisée<select value={form.permitAuthorizedPersonId} onChange={e=>{const selected=instructors.find(i=>i.id===e.target.value);setForm(current=>({...current,permitAuthorizedPersonId:e.target.value,permitAuthorizedPerson:selected?.name||""}))}}><option value="">Sélectionner…</option>{instructors.map(i=><option value={i.id} key={i.id}>{i.name}</option>)}</select></label><div className="form-grid"><label>Émission<input type="date" value={form.permitIssueDate} onChange={e=>field("permitIssueDate",e.target.value)}/></label><label>Expiration<input type="date" value={form.permitExpiryDate} onChange={e=>field("permitExpiryDate",e.target.value)}/></label></div>{form.permitAuthorizedPersonId?<PinSignaturePad label="Signature de la personne autorisée" kind="instructor" personId={form.permitAuthorizedPersonId} signerName={form.permitAuthorizedPerson} value={form.permitSignature} onChange={value=>field("permitSignature",value)}/>:<p className="notice">Sélectionnez la personne autorisée avant de signer.</p>}</fieldset>
      <fieldset><legend>Certificat médical</legend><label>Personne autorisée<select value={form.medicalAuthorizedPersonId} onChange={e=>{const selected=instructors.find(i=>i.id===e.target.value);setForm(current=>({...current,medicalAuthorizedPersonId:e.target.value,medicalAuthorizedPerson:selected?.name||""}))}}><option value="">Sélectionner…</option>{instructors.map(i=><option value={i.id} key={i.id}>{i.name}</option>)}</select></label><div className="form-grid"><label>Émission<input type="date" value={form.medicalIssueDate} onChange={e=>field("medicalIssueDate",e.target.value)}/></label><label>Expiration<input type="date" value={form.medicalExpiryDate} onChange={e=>field("medicalExpiryDate",e.target.value)}/></label></div>{form.medicalAuthorizedPersonId?<PinSignaturePad label="Signature de la personne autorisée" kind="instructor" personId={form.medicalAuthorizedPersonId} signerName={form.medicalAuthorizedPerson} value={form.medicalSignature} onChange={value=>field("medicalSignature",value)}/>:<p className="notice">Sélectionnez la personne autorisée avant de signer.</p>}</fieldset>
    </div>
    <h3>Exercices exigés avant le premier solo</h3>
    <div className="pre-solo-exercises">{PRE_SOLO_EXERCISES.map(([id,label])=>{const item=form.exercises[id]||emptyExercise();const done=exerciseComplete(item);const fieldsReady=exerciseFieldsComplete(item);return <article className={done?"completed":""} key={id}><label className="pre-solo-check"><input type="checkbox" checked={item.completed} onChange={e=>exercise(id,{completed:e.target.checked})}/><b>{label}</b><span>{done?"Validé":item.completed&&!fieldsReady?"Informations, date ou signatures manquantes":"À confirmer"}</span></label><div className="form-grid"><label>Instructeur<select value={item.instructorId} onChange={e=>{const selected=instructors.find(i=>i.id===e.target.value);exercise(id,{instructorId:e.target.value,instructorName:selected?.name||"",instructorLicense:selected?.licenseNumber||""})}}><option value="">Sélectionner…</option>{instructors.map(i=><option value={i.id} key={i.id}>{i.name}</option>)}</select></label><label>No de licence<input value={item.instructorLicense} readOnly placeholder="Selon la fiche instructeur"/></label><label>Date de signature<input type="date" value={item.signedAt||""} onChange={e=>exercise(id,{signedAt:e.target.value})}/></label></div>{item.instructorId?<PinSignaturePad label="Signature de l’instructeur" kind="instructor" personId={item.instructorId} signerName={item.instructorName} value={item.instructorSignature} onChange={value=>exercise(id,{instructorSignature:value,signedAt:value?(item.signedAt||today()):""})}/>:<p className="notice">Sélectionnez l’instructeur avant de signer.</p>}<div className="student-exercise-confirmation"><p>Je confirme avoir vu cet exercice avec mon instructeur, avoir reçu les explications nécessaires et maîtriser la manœuvre.</p><PinSignaturePad label="Signature de l’élève" kind="student" personId={studentId} signerName={studentName} value={item.studentSignature} onChange={value=>exercise(id,{studentSignature:value})}/></div></article>})}</div>
    <h3>Autorisation de vol en solo</h3>
    <p>Je certifie que l’élève possède une expérience et une compétence satisfaisantes pour effectuer des vols en solo sous la supervision d’un instructeur.</p>
    {!exercisesReady&&<div className="notice warning">⚠ Tous les exercices exigés avant le premier solo ne sont pas encore complétés. Signer ici n’autorise pas le solo tant qu’ils ne le sont pas.</div>}
    <div className="pre-solo-authorization">
      <fieldset><legend>Instructeur recommandant</legend><label>Instructeur<select value={form.recommendingInstructorId} onChange={e=>{const selected=instructors.find(i=>i.id===e.target.value);setForm(current=>({...current,recommendingInstructorId:e.target.value,recommendingInstructorName:selected?.name||"",recommendingInstructorLicenseClass:selected?`${selected.licenseNumber} — ${selected.classLevel}`.trim():""}))}}><option value="">Sélectionner…</option>{instructors.map(i=><option value={i.id} key={i.id}>{i.name}</option>)}</select></label><label>No de licence — classe<input value={form.recommendingInstructorLicenseClass} readOnly placeholder="Selon la fiche instructeur"/></label><label>Date<input type="date" value={form.recommendingDate} onChange={e=>field("recommendingDate",e.target.value)}/></label><label className="pre-solo-check"><input type="checkbox" checked={form.recommendingInstructorIsClass4} onChange={e=>field("recommendingInstructorIsClass4",e.target.checked)}/>Instructeur de classe 4 (supervision obligatoire)</label>{form.recommendingInstructorId?<PinSignaturePad label="Signature de l’instructeur recommandant" kind="instructor" personId={form.recommendingInstructorId} signerName={form.recommendingInstructorName} value={form.recommendingInstructorSignature} onChange={value=>field("recommendingInstructorSignature",value)}/>:<p className="notice">Sélectionnez l’instructeur avant de signer.</p>}</fieldset>
      <fieldset className={!form.recommendingInstructorIsClass4?"optional":""}><legend>Instructeur surveillant {form.recommendingInstructorIsClass4?"(obligatoire)":"(si requis)"}</legend><label>Instructeur<select value={form.supervisingInstructorId} onChange={e=>{const selected=instructors.find(i=>i.id===e.target.value);setForm(current=>({...current,supervisingInstructorId:e.target.value,supervisingInstructorName:selected?.name||"",supervisingInstructorLicenseClass:selected?`${selected.licenseNumber} — ${selected.classLevel}`.trim():""}))}}><option value="">Sélectionner…</option>{instructors.map(i=><option value={i.id} key={i.id}>{i.name}</option>)}</select></label><label>No de licence — classe<input value={form.supervisingInstructorLicenseClass} readOnly placeholder="Selon la fiche instructeur"/></label><label>Date<input type="date" value={form.supervisingDate} onChange={e=>field("supervisingDate",e.target.value)}/></label>{form.supervisingInstructorId?<PinSignaturePad label="Signature de l’instructeur surveillant" kind="instructor" personId={form.supervisingInstructorId} signerName={form.supervisingInstructorName} value={form.supervisingInstructorSignature} onChange={value=>field("supervisingInstructorSignature",value)}/>:<p className="notice">Sélectionnez l’instructeur avant de signer.</p>}</fieldset>
    </div>
    <div className="form-actions"><span/><button className="button" type="button" onClick={save}>Enregistrer la check-list</button></div>
    </fieldset>
  </section>;
}

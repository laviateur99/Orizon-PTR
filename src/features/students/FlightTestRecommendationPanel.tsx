"use client";

import { useEffect, useMemo, useState } from "react";
import { SignaturePad } from "@/components/ui/SignaturePad";
import { saveFlightTestRecommendation, subscribeFlightTestRecommendation } from "./firestore";
import type { FlightTestRecommendation } from "./types";

const emptyRecommendation=(studentId:string):FlightTestRecommendation=>({
  studentId,
  recommendingInstructorName:"",
  recommendingInstructorLicense:"",
  recommendingInstructorClass:"",
  recommendingInstructorSignature:"",
  recommendingDate:"",
  recommendingInstructorIsClass4:false,
  supervisingInstructorName:"",
  supervisingInstructorLicense:"",
  supervisingInstructorClass:"",
  supervisingInstructorSignature:"",
  supervisingDate:"",
  valid:false,
  completedAt:""
});

export function FlightTestRecommendationPanel({studentId}:{studentId:string}){
  const [form,setForm]=useState<FlightTestRecommendation>(()=>emptyRecommendation(studentId));
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  useEffect(()=>subscribeFlightTestRecommendation(studentId,value=>{
    setForm({...emptyRecommendation(studentId),...(value||{})});
  },e=>setError(e.message)),[studentId]);
  const field=<K extends keyof FlightTestRecommendation>(key:K,value:FlightTestRecommendation[K])=>
    setForm(current=>({...current,[key]:value}));
  const missing=useMemo(()=>{
    const values=[
      ["Nom de l’instructeur recommandant",form.recommendingInstructorName],
      ["Numéro de licence de l’instructeur recommandant",form.recommendingInstructorLicense],
      ["Classe de l’instructeur recommandant",form.recommendingInstructorClass],
      ["Date de recommandation",form.recommendingDate],
      ["Signature de l’instructeur recommandant",form.recommendingInstructorSignature]
    ];
    if(form.recommendingInstructorIsClass4)values.push(
      ["Nom de l’instructeur surveillant",form.supervisingInstructorName],
      ["Numéro de licence de l’instructeur surveillant",form.supervisingInstructorLicense],
      ["Classe de l’instructeur surveillant",form.supervisingInstructorClass],
      ["Date de supervision",form.supervisingDate],
      ["Signature de l’instructeur surveillant",form.supervisingInstructorSignature]
    );
    return values.filter(([,value])=>!String(value).trim()).map(([label])=>label);
  },[form]);
  const complete=missing.length===0;
  async function save(){
    setError("");setMessage("");
    const completedAt=complete?(form.completedAt||new Date().toISOString()):"";
    try{
      await saveFlightTestRecommendation({...form,valid:complete,completedAt});
      setForm(current=>({...current,valid:complete,completedAt}));
      setMessage(complete?"Recommandation de test en vol validée.":"Brouillon enregistré. La recommandation demeure incomplète.");
    }catch(e){setError(e instanceof Error?e.message:"Impossible d’enregistrer la recommandation.");}
  }
  return <section className="card flight-test-recommendation">
    <header className="flight-test-head">
      <div><span>TEST EN VOL</span><h2>Recommandation de test en vol</h2><p>Fiche officielle versée au dossier de formation de l’étudiant.</p></div>
      <strong className={complete?"valid":"incomplete"}>{complete?"Complète — recommandation valide":"Incomplète"}</strong>
    </header>
    {error&&<div className="notice error">{error}</div>}
    {message&&<div className="notice">{message}</div>}
    {!complete&&<div className="flight-test-missing"><b>Éléments requis avant validation :</b><ul>{missing.map(item=><li key={item}>{item}</li>)}</ul></div>}
    <div className="flight-test-signers">
      <fieldset>
        <legend>Instructeur recommandant</legend>
        <label>Nom<input value={form.recommendingInstructorName} onChange={e=>field("recommendingInstructorName",e.target.value)}/></label>
        <div className="form-grid">
          <label>No de licence<input value={form.recommendingInstructorLicense} onChange={e=>field("recommendingInstructorLicense",e.target.value)}/></label>
          <label>Classe<select value={form.recommendingInstructorClass} onChange={e=>{field("recommendingInstructorClass",e.target.value);field("recommendingInstructorIsClass4",e.target.value==="4")}}><option value="">Sélectionner</option><option>1</option><option>2</option><option>3</option><option>4</option></select></label>
          <label>Date<input type="date" value={form.recommendingDate} onChange={e=>field("recommendingDate",e.target.value)}/></label>
        </div>
        <SignaturePad label="Signature de l’instructeur recommandant" value={form.recommendingInstructorSignature} onChange={value=>field("recommendingInstructorSignature",value)}/>
      </fieldset>
      <fieldset className={form.recommendingInstructorIsClass4?"required":"optional"}>
        <legend>Instructeur surveillant {form.recommendingInstructorIsClass4?"— obligatoire (classe 4)":"— non requis"}</legend>
        <label>Nom<input disabled={!form.recommendingInstructorIsClass4} value={form.supervisingInstructorName} onChange={e=>field("supervisingInstructorName",e.target.value)}/></label>
        <div className="form-grid">
          <label>No de licence<input disabled={!form.recommendingInstructorIsClass4} value={form.supervisingInstructorLicense} onChange={e=>field("supervisingInstructorLicense",e.target.value)}/></label>
          <label>Classe<select disabled={!form.recommendingInstructorIsClass4} value={form.supervisingInstructorClass} onChange={e=>field("supervisingInstructorClass",e.target.value)}><option value="">Sélectionner</option><option>1</option><option>2</option><option>3</option></select></label>
          <label>Date<input disabled={!form.recommendingInstructorIsClass4} type="date" value={form.supervisingDate} onChange={e=>field("supervisingDate",e.target.value)}/></label>
        </div>
        {form.recommendingInstructorIsClass4
          ?<SignaturePad label="Signature de l’instructeur surveillant" value={form.supervisingInstructorSignature} onChange={value=>field("supervisingInstructorSignature",value)}/>
          :<p className="flight-test-not-required">Cette signature devient obligatoire lorsque l’instructeur recommandant est de classe 4.</p>}
      </fieldset>
    </div>
    <div className="form-actions"><span/><button className="button" type="button" onClick={save}>Enregistrer la recommandation</button></div>
  </section>;
}

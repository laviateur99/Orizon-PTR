"use client";

import { useEffect, useMemo, useState } from "react";
import { subscribeStudent, subscribePreSoloChecklist, subscribeFlightTestRecommendation, subscribeDocuments } from "@/features/students/firestore";
import type { FlightTestRecommendation, PreSoloChecklist, Student, StudentDocument } from "@/features/students/types";
import { PRE_SOLO_EXERCISES } from "@/features/students/preSoloExercises";
import { subscribeTheorySessions } from "@/features/theory/firestore";
import type { TheorySession } from "@/features/theory/types";
import { subscribeAircraft, subscribeEvaluations, subscribeInstructors, subscribeLessons, subscribeReservations } from "./firestore";
import type { AircraftOption, InstructorOption, PTREvaluation, PTRLesson, ReservationOption } from "./types";
import { useAuth } from "@/features/auth/AuthProvider";
import { canAccessPtr } from "@/features/auth/ptrAccess";

const BLUE="#315f8f";
const exerciseNames=[
  "Familiarisation","Préparation au vol","Commandes auxiliaires","Circulation au sol","Assiettes et mouvements",
  "Vol rectiligne en palier","Montée","Descente","Virage","Autonomie maximale","Vol lent","Décrochage","Vrille","Spirale","Glissade",
  "Décollage","Circuit","Approche et atterrissage","Premier solo","Illusions créées par la dérive","Atterrissage de précaution",
  "Atterrissage forcé","Procédure de départ","Procédure en route","Déroutement","Panneau complet","Panneau partiel",
  "Assiettes inhabituelles","Radionavigation","Procédures d’urgence / radio"
];
const exercisePatterns:RegExp[][]=[
  [/familiar/],
  [/avant vol/,/prevol/,/verification avant decollage/,/preparation.*vol/],
  [/commandes auxiliaires/,/commandes de vol/],
  [/circulation au sol/],
  [/assiettes et mouvement/],
  [/vol rectiligne/,/vol en palier/],
  [/\bmontee/],
  [/\bdescente/],
  [/\bvirage/],
  [/autonomie maximale/,/distance franchissable/],
  [/vol lent/],
  [/decroch/],
  [/\bvrille/],
  [/\bspirale/],
  [/\bglissade/],
  [/\bdecollage/],
  [/\bcircuit/],
  [/\bapproche/,/\batterrissage/],
  [/premier vol en solo/,/premier solo/],
  [/illusion.*derive/],
  [/atterrissage de precaution/],
  [/atterrissage force/],
  [/procedure de depart/,/depart de navigation/,/mise en cap/],
  [/procedure en route/,/communications? en route/,/progression du vol/,/navigation en vfr/],
  [/\bderoutement/],
  [/panneau complet/,/instruments de vol/,/vol aux instruments/],
  [/panneau partiel/],
  [/assiette inhabituelle/],
  [/radionavigation/,/aides? a la navigation/],
  [/procedure.*urgence/,/urgences? en vol/,/communications? radio/,/procedures? radio/]
];
const minutes=(value:string)=>{const match=value.match(/^(\d{1,2}):(\d{2})$/);return match?Number(match[1])*60+Number(match[2]):0;};
const duration=(start:string,end:string)=>Math.max(0,Math.round((minutes(end)-minutes(start))/6)/10);
const hours=(value:number|undefined)=>value===undefined?"":value.toFixed(1);
const fullName=(student:Student|null)=>student?`${student.firstName} ${student.lastName}`.trim():"";
const signature=({src,alt}:{src:string;alt:string})=>src?<img className="print-signature" src={src} alt={alt}/>:<span className="print-empty">Non signée</span>;
const normalized=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const officialLessonNumber=(lesson:PTRLesson|undefined,reservation:ReservationOption|undefined)=>{
  const stored=lesson?.lessonNumber?.trim()||"";
  const technicalSource=lesson?.lessonPlanId||reservation?.lessonPlanId||stored;
  const extracted=technicalSource.match(/-L(\d+)(?:-|$)/i)?.[1]||"";
  return extracted||stored;
};
const trainingCode=(evaluation:PTREvaluation,lesson:PTRLesson|undefined,reservation:ReservationOption|undefined)=>{
  const componentIndex=Number(evaluation.componentKey?.split("::").pop());
  const component=Number.isFinite(componentIndex)?lesson?.components?.[componentIndex]:undefined;
  const description=normalized([component?.modality,component?.category,component?.title,lesson?.title,reservation?.type].filter(Boolean).join(" "));
  if(/familiar/.test(description))return"F";
  if(/revision|reprise|review/.test(description))return"R";
  if(/solo/.test(description))return"S";
  if(evaluation.evaluationType==="ground"||/sol|ground|prepar/.test(description))return"P";
  return"D";
};
const relatedExercises=(evaluation:PTREvaluation,lesson:PTRLesson|undefined)=>{
  const componentIndex=Number(evaluation.componentKey?.split("::").pop());
  const component=Number.isFinite(componentIndex)?lesson?.components?.[componentIndex]:undefined;
  return (component?.exercises?.length?component.exercises:lesson?.exercises||[]).map(normalized);
};
const coversAllExercises=(lesson:PTRLesson|undefined,covered:string[])=>{
  const description=normalized([lesson?.title,...covered].filter(Boolean).join(" "));
  return /revision finale|elements du test en vol|test en vol de pilote prive|tous les exercices/.test(description);
};
const exerciseCovered=(index:number,covered:string[],all:boolean)=>all||covered.some(value=>exercisePatterns[index].some(pattern=>pattern.test(value)));

export function PTRPrintPage({studentId}:{studentId:string}){
  const{profile}=useAuth(),allowed=canAccessPtr(profile,studentId);
  const[student,setStudent]=useState<Student|null>(null),[lessons,setLessons]=useState<PTRLesson[]>([]),[evaluations,setEvaluations]=useState<PTREvaluation[]>([]);
  const[reservations,setReservations]=useState<ReservationOption[]>([]),[instructors,setInstructors]=useState<InstructorOption[]>([]),[aircraft,setAircraft]=useState<AircraftOption[]>([]);
  const[theory,setTheory]=useState<TheorySession[]>([]),[preSolo,setPreSolo]=useState<PreSoloChecklist|null>(null),[recommendation,setRecommendation]=useState<FlightTestRecommendation|null>(null);
  const[documents,setDocuments]=useState<StudentDocument[]>([]);
  const[error,setError]=useState(""),[printing,setPrinting]=useState(false);
  useEffect(()=>{
    if(!allowed)return;
    document.body.classList.add("ptr-print-mode");
    const fail=(e:Error)=>setError(e.message);
    const offs=[
      subscribeStudent(studentId,setStudent,fail),
      subscribeDocuments(studentId,{next:setDocuments,error:fail}),
      subscribeLessons(studentId,{next:setLessons,error:fail}),
      subscribeEvaluations(studentId,{next:setEvaluations,error:fail}),
      subscribeReservations(studentId,{next:setReservations,error:fail}),
      subscribeInstructors({next:setInstructors,error:fail}),
      subscribeAircraft({next:setAircraft,error:fail}),
      subscribeTheorySessions(values=>setTheory(values.filter(item=>item.studentIds.includes(studentId))),fail),
      subscribePreSoloChecklist(studentId,setPreSolo,fail),
      subscribeFlightTestRecommendation(studentId,setRecommendation,fail)
    ];
    return()=>{document.body.classList.remove("ptr-print-mode");offs.forEach(off=>off());};
  },[studentId,allowed]);
  const completed=useMemo(()=>reservations.filter(item=>item.status==="Complété").sort((a,b)=>a.date.localeCompare(b.date)),[reservations]);
  const theoryRows=useMemo(()=>theory.filter(item=>item.status==="Complétée").sort((a,b)=>a.date.localeCompare(b.date)),[theory]);
  const lessonMap=useMemo(()=>new Map(lessons.map(item=>[item.id,item])),[lessons]);
  const totals=useMemo(()=>completed.reduce((sum,item)=>{
    const elapsed=item.hobbsStart!==undefined&&item.hobbsEnd!==undefined?Math.max(0,item.hobbsEnd-item.hobbsStart):(item.airtimeMinutes||0)/60;
    const role=item.flightCrewRole||(item.type==="Solo"?"PIC":"Double");
    const day=item.dayHours??(item.nightHours===undefined?elapsed:0),night=item.nightHours??0;
    if(item.type==="Double commande"||item.type==="Solo"){
      sum[role==="PIC"?"dayPic":"dayDual"]+=day;sum[role==="PIC"?"nightPic":"nightDual"]+=night;
      sum[role==="PIC"?"xcDayPic":"xcDayDual"]+=item.crossCountryDayHours??0;
      sum[role==="PIC"?"xcNightPic":"xcNightDual"]+=item.crossCountryNightHours??0;
      sum.instrumentAircraft+=item.instrumentAircraftHours??0;
    }
    if(item.type==="Simulateur")sum.ftd+=item.ftdHours??item.groundTimeHours??duration(item.startTime,item.endTime);
    return sum;
  },{dayDual:0,dayPic:0,nightDual:0,nightPic:0,instrumentAircraft:0,ftd:0,xcDayDual:0,xcDayPic:0,xcNightDual:0,xcNightPic:0}),[completed]);
  const theoryHours=theoryRows.filter(item=>item.attendance[studentId]==="Présent").reduce((sum,item)=>sum+duration(item.startTime,item.endTime),0);
  const sortedEvaluations=useMemo(()=>evaluations.slice().sort((a,b)=>(a.date||a.signedAt).localeCompare(b.date||b.signedAt)),[evaluations]);
  const summaryCertification=[...sortedEvaluations].reverse().find(item=>item.instructorSignature||item.studentSignature);
  const datePrinted=new Intl.DateTimeFormat("fr-CA",{dateStyle:"long"}).format(new Date());
  const candidateLicense=useMemo(()=>documents.filter(item=>item.type==="Certificat médical").sort((a,b)=>(b.issueDate||b.expiryDate).localeCompare(a.issueDate||a.expiryDate)).map(item=>item.number.replace(/\D/g,"")).find(value=>/^\d{5,6}$/.test(value))||"",[documents]);
  useEffect(()=>{
    const done=()=>setPrinting(false);
    window.addEventListener("afterprint",done);
    return()=>window.removeEventListener("afterprint",done);
  },[]);
  const print=()=>{
    if(printing)return;
    setPrinting(true);
    window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>{
      window.print();
      window.setTimeout(()=>setPrinting(false),300);
    }));
  };
  if(!allowed)return <main className="ptr-print-loading">Accès non autorisé à ce PTR.</main>;
  if(!student)return <main className="ptr-print-loading">{error||"Préparation du PTR imprimable…"}</main>;
  return <main className="ptr-print-page">
    <div className="ptr-print-toolbar">
      <a className="button secondary" href={`/ptr/${studentId}`}>Retour au PTR</a>
      <div><b>Aperçu d’impression - modèle TC 26-0313</b><span>Dans les options d’impression, sélectionnez le format Lettre et l’orientation Paysage.</span></div>
      <button className={`button print-action${printing?" printing":""}`} onClick={print} disabled={printing} aria-busy={printing}>
        {printing&&<span className="print-action-spinner" aria-hidden="true"/>}
        {printing?"Préparation de l’impression…":"Imprimer / Enregistrer en PDF"}
      </button>
    </div>

    <section className="ptr-cover-sheet">
      <div className="ptr-cover-copy">
        <div className="ptr-cover-school">
          <span>Unité de formation au pilotage</span>
          <strong>Orizon Aviation Québec 2088</strong>
        </div>
        <div className="ptr-cover-title">
          <span>Dossier officiel de formation</span>
          <h1>Dossier d’entraînement du pilote</h1>
          <p>Pilot Training Record</p>
        </div>
        <div className="ptr-cover-student">
          <span>Élève-pilote / Student pilot</span>
          <strong>{fullName(student)}</strong>
          <dl>
            <div><dt>Programme</dt><dd>{student.program||"—"}</dd></div>
            <div><dt>No de licence</dt><dd>{candidateLicense||"—"}</dd></div>
            <div><dt>Début de formation</dt><dd>{student.startDate||"—"}</dd></div>
          </dl>
        </div>
        <footer>Orizon Flight Director · Dossier confidentiel de formation</footer>
      </div>
      <div className="ptr-cover-brand">
        <img src="/branding/orizon-aviation-logo.png" alt="Logo Orizon Aviation Québec"/>
      </div>
    </section>

    <PrintSheet number="1" title="Dossier d’entraînement - Pilote" subtitle="Pilot Training Record" referenceDetail={`No de licence : ${candidateLicense||"—"}`}>
      <div className="print-title-band">Renseignements sur l’élève-pilote</div>
      <div className="print-fields">
        <PrintField label="Nom / Name" value={student.lastName}/><PrintField label="Prénom / Given name" value={student.firstName}/>
        <PrintField label="Adresse / Address" value={student.address} wide/><PrintField label="Téléphone / Telephone" value={student.phone}/>
        <PrintField label="Courriel / Email" value={student.email}/><PrintField label="Programme / Course" value={student.program}/>
        <PrintField label="Type / Training type" value={student.programType}/><PrintField label="Début de formation / Start date" value={student.startDate}/>
        <PrintField label="Unité de formation / Flight Training Unit" value="Orizon Aviation Québec 2088" wide/>
      </div>
      <div className="print-title-band">Recommandation de test en vol / Recommendation for Flight Test</div>
      <div className="print-recommendations">
        <Signer title="Instructeur recommandant / Recommending Instructor" name={recommendation?.recommendingInstructorName||""} licence={`${recommendation?.recommendingInstructorLicense||""}${recommendation?.recommendingInstructorClass?` - Classe ${recommendation.recommendingInstructorClass}`:""}`} date={recommendation?.recommendingDate||""} signature={recommendation?.recommendingInstructorSignature||""}/>
        <Signer title="Instructeur surveillant / Supervising Instructor" name={recommendation?.supervisingInstructorName||""} licence={`${recommendation?.supervisingInstructorLicense||""}${recommendation?.supervisingInstructorClass?` - Classe ${recommendation.supervisingInstructorClass}`:""}`} date={recommendation?.supervisingDate||""} signature={recommendation?.supervisingInstructorSignature||""}/>
      </div>
      <p className="print-note">* Obligatoire si l’instructeur recommandant est de classe 4. État du dossier : <b>{recommendation?.valid?"Recommandation valide":"Recommandation incomplète"}</b>.</p>
    </PrintSheet>

    <PrintSheet number="2" title="Liste de vérification avant le premier solo" subtitle="First Solo Check List">
      <div className="print-title-band pre-solo-section-title">Validations administratives</div>
      <table className="print-table pre-solo-admin-print"><thead><tr><th>Exigence</th><th>Responsable</th><th>No licence / résultat</th><th>Date</th><th>État</th></tr></thead><tbody>
        <tr><td>Certificat de compétence en radio</td><td>{preSolo?.radioExaminerName}</td><td></td><td>{preSolo?.radioIssueDate}</td><td>{preSolo?.radioExaminerSignature?"Signé":""}</td></tr>
        <tr><td>Examen PSTAR</td><td></td><td>{preSolo?.pstarMark}</td><td>{preSolo?.pstarDate}</td><td>{preSolo?.pstarMark?"Consigné":""}</td></tr>
        <tr><td>Permis d’élève-pilote</td><td>{preSolo?.permitAuthorizedPerson}</td><td></td><td>{preSolo?.permitIssueDate}</td><td>{preSolo?.permitSignature?"Signé":""}</td></tr>
        <tr><td>Certificat médical</td><td>{preSolo?.medicalAuthorizedPerson}</td><td></td><td>{preSolo?.medicalIssueDate}</td><td>{preSolo?.medicalSignature?"Signé":""}</td></tr>
      </tbody></table>
      <div className="print-title-band pre-solo-section-title">Exercices exigés avant le premier solo</div>
      <table className="print-table pre-solo-exercises-print"><thead><tr><th>Exercice</th><th>Instructeur</th><th>No de licence</th><th>Date de signature</th><th>Signature de l’instructeur</th><th>État</th></tr></thead><tbody>
        {PRE_SOLO_EXERCISES.map(([id,label])=>{
          const item=preSolo?.exercises?.[id];
          const signedAt=item?.signedAt||preSolo?.completedAt?.slice(0,10)||"";
          return <tr key={id}>
            <td>{label}</td><td>{item?.instructorName||""}</td><td>{item?.instructorLicense||""}</td><td>{signedAt}</td>
            <td className="pre-solo-signature-cell">{signature({src:item?.instructorSignature||"",alt:`Signature de l’instructeur — ${label}`})}</td>
            <td>{item?.completed&&item.instructorSignature&&item.studentSignature?"Complété":""}</td>
          </tr>;
        })}
      </tbody></table>
      <div className="print-recommendations pre-solo-recommendations">
        <Signer title="Autorisation de l’instructeur recommandant" name={preSolo?.recommendingInstructorName||""} licence={preSolo?.recommendingInstructorLicenseClass||""} date={preSolo?.recommendingDate||""} signature={preSolo?.recommendingInstructorSignature||""}/>
        <Signer title="Autorisation de l’instructeur surveillant" name={preSolo?.supervisingInstructorName||""} licence={preSolo?.supervisingInstructorLicenseClass||""} date={preSolo?.supervisingDate||""} signature={preSolo?.supervisingInstructorSignature||""}/>
      </div>
    </PrintSheet>

    <PrintSheet number="3" title="Registre de l’instruction théorique au sol" subtitle="Ground School Instruction Record">
      <table className="print-table print-ground"><thead><tr><th>Date</th><th>Sujet / Subject</th><th>Instructeur</th><th>Présence</th><th>Heures</th></tr></thead><tbody>
        {theoryRows.map(item=><tr key={item.id}><td>{item.date}</td><td><b>{item.title}</b>{item.topic&&<small>{item.topic}</small>}</td><td>{item.instructorName}</td><td>{item.attendance[studentId]||"Non consignée"}</td><td>{item.attendance[studentId]==="Présent"?duration(item.startTime,item.endTime).toFixed(1):"0.0"}</td></tr>)}
        {!theoryRows.length&&<tr><td colSpan={5}>Aucune formation théorique complétée.</td></tr>}
      </tbody><tfoot><tr><th colSpan={4}>Total des heures reconnues</th><th>{theoryHours.toFixed(1)}</th></tr></tfoot></table>
      <Certification name={fullName(student)} text="Les inscriptions sur cette page correspondent au registre électronique de présence et de formation théorique."/>
    </PrintSheet>

    <PrintSheet number="4" title="Registre de l’entraînement en vol" subtitle="Flight Training Record">
      <table className="print-table print-flight-detail"><thead><tr><th rowSpan={2}>Date</th><th colSpan={2}>Avion</th><th rowSpan={2}>Commandant de bord</th><th colSpan={4}>Heures d’entraînement</th><th colSpan={2}>Instruments</th><th colSpan={4}>Vol-voyage</th><th colSpan={2}>Route du vol</th></tr><tr><th>Type</th><th>Immat.</th><th>Jour<br/>Double</th><th>Jour<br/>PIC</th><th>Nuit<br/>Double</th><th>Nuit<br/>PIC</th><th>Avion</th><th>FTD/DEV</th><th>Jour<br/>Double</th><th>Jour<br/>PIC</th><th>Nuit<br/>Double</th><th>Nuit<br/>PIC</th><th>De</th><th>À</th></tr></thead><tbody>
        {completed.filter(item=>["Double commande","Solo","Simulateur"].includes(item.type)).map(item=>{
          const plane=aircraft.find(value=>value.id===item.aircraftId),instructor=instructors.find(value=>value.id===item.instructorId);
          const elapsed=item.hobbsStart!==undefined&&item.hobbsEnd!==undefined?Math.max(0,item.hobbsEnd-item.hobbsStart):(item.airtimeMinutes||0)/60;
          const sim=item.type==="Simulateur"?(item.groundTimeHours??duration(item.startTime,item.endTime)):undefined;
          const role=item.flightCrewRole||(item.type==="Solo"?"PIC":"Double"),day=item.dayHours??(item.nightHours===undefined?elapsed:0),night=item.nightHours??0;
          const pic=role==="PIC"?fullName(student):(instructor?.name||"");
          return <tr key={item.id}><td>{item.date}</td><td>{plane?.type||item.simulatorTcId||""}</td><td>{plane?.registration||""}</td><td>{pic}</td><td>{role==="Double"?hours(day):""}</td><td>{role==="PIC"?hours(day):""}</td><td>{role==="Double"?hours(night):""}</td><td>{role==="PIC"?hours(night):""}</td><td>{hours(item.instrumentAircraftHours)}</td><td>{hours(item.ftdHours??sim)}</td><td>{role==="Double"?hours(item.crossCountryDayHours):""}</td><td>{role==="PIC"?hours(item.crossCountryDayHours):""}</td><td>{role==="Double"?hours(item.crossCountryNightHours):""}</td><td>{role==="PIC"?hours(item.crossCountryNightHours):""}</td><td>{item.routeFrom||""}</td><td>{item.routeTo||""}</td></tr>;
        })}
      </tbody><tfoot><tr><th colSpan={4}><span className="training-total-summary"><span>Totaux à ce jour</span><b>{(totals.dayDual+totals.dayPic+totals.nightDual+totals.nightPic).toFixed(1)}</b></span></th><th>{totals.dayDual.toFixed(1)}</th><th>{totals.dayPic.toFixed(1)}</th><th>{totals.nightDual.toFixed(1)}</th><th>{totals.nightPic.toFixed(1)}</th><th>{totals.instrumentAircraft.toFixed(1)}</th><th>{totals.ftd.toFixed(1)}</th><th>{totals.xcDayDual.toFixed(1)}</th><th>{totals.xcDayPic.toFixed(1)}</th><th>{totals.xcNightDual.toFixed(1)}</th><th>{totals.xcNightPic.toFixed(1)}</th><th colSpan={2}></th></tr></tfoot></table>
      <Certification name={fullName(student)} text="Les inscriptions sur cette page proviennent des réservations ayant un check-in complété."/>
    </PrintSheet>

    <PrintSheet number="5" title="Sommaire des exercices en vol" subtitle="Air Exercises Summary">
      <table className="print-table exercise-summary"><thead><tr className="exercise-label-row"><th><span>Date</span></th><th><span>Leçon</span></th><th><span>Type</span></th>{exerciseNames.map(name=><th key={name}><span>{name}</span></th>)}</tr><tr className="exercise-number-row"><th></th><th></th><th></th>{exerciseNames.map((_,index)=><th key={index}>{index+1}</th>)}</tr></thead><tbody>
        {sortedEvaluations.map(item=>{
          const lesson=lessonMap.get(item.lessonId),reservation=reservations.find(value=>value.id===item.reservationId);
          const code=trainingCode(item,lesson,reservation),covered=relatedExercises(item,lesson),all=coversAllExercises(lesson,covered);
          return <tr key={item.id}><td>{item.date}</td><td>{officialLessonNumber(lesson,reservation)}</td><td className={`training-code code-${code.toLowerCase()}`}>{code}</td>{exerciseNames.map((name,index)=>{
            const matched=exerciseCovered(index,covered,all);
            return <td key={index}>{matched?code:""}</td>;
          })}</tr>;
        })}
        {Array.from({length:Math.max(0,8-sortedEvaluations.length)},(_,row)=><tr className="exercise-empty-row" key={`empty-${row}`}><td></td><td></td><td></td>{exerciseNames.map((_,index)=><td key={index}></td>)}</tr>)}
      </tbody></table>
      <div className="summary-code-legend"><strong>Légende</strong><span><b>F</b> Familiarisation / démonstration</span><span><b>P</b> Instruction préparatoire au sol</span><span><b>D</b> Démonstration et pratique</span><span><b>S</b> Exercice en solo</span><span><b>R</b> Révision</span></div>
      <div className="exercise-summary-certifications">
        <SummaryCertification title="Les inscriptions sur cette page sont certifiées exactes - Chef-instructeur ou représentant" name={summaryCertification?.instructorName||""} date={summaryCertification?.date||summaryCertification?.signedAt?.slice(0,10)||""} signatureSrc={summaryCertification?.instructorSignature||""}/>
        <SummaryCertification title="Les inscriptions sur cette page sont certifiées exactes - Élève" name={fullName(student)} date={summaryCertification?.date||summaryCertification?.signedAt?.slice(0,10)||""} signatureSrc={summaryCertification?.studentSignature||""}/>
      </div>
    </PrintSheet>

    <PrintSheet number="6" title="Commentaires et signatures" subtitle="Instructor's and Student's Respective Comments - Signatures">
      <table className="print-table print-comments"><thead><tr><th>Date</th><th>Leçon</th><th>Commentaires et mesures correctives</th><th>Instructeur</th><th>Élève</th></tr></thead><tbody>
        {sortedEvaluations.map(item=>{const lesson=lessonMap.get(item.lessonId),reservation=reservations.find(value=>value.id===item.reservationId);return <tr key={item.id}><td>{item.date}</td><td>{lesson?`${officialLessonNumber(lesson,reservation)} - ${lesson.title}`:""}</td><td>{[item.comments,item.strengths&&`Forces : ${item.strengths}`,item.improvements&&`À améliorer : ${item.improvements}`,item.actions.length&&`Actions : ${item.actions.join(", ")}`].filter(Boolean).join(" | ")}</td><td>{signature({src:item.instructorSignature,alt:"Signature instructeur"})}</td><td>{signature({src:item.studentSignature,alt:"Signature élève"})}</td></tr>})}
      </tbody></table>
      <footer className="print-document-footer">Document généré le {datePrinted} par Orizon Flight Director - Élève : {fullName(student)}</footer>
    </PrintSheet>
  </main>;
}

function PrintSheet({number,title,subtitle,referenceDetail,children}:{number:string;title:string;subtitle:string;referenceDetail?:string;children:React.ReactNode}){
  return <section className="ptr-print-sheet"><header><div><h1>{title}</h1><p>{subtitle}</p></div><div className="print-sheet-reference"><strong>TC 26-0313 · {number}/6</strong>{referenceDetail&&<span>{referenceDetail}</span>}</div></header>{children}</section>;
}
function PrintField({label,value,wide=false}:{label:string;value:string;wide?:boolean}){return <div className={wide?"wide":""}><span>{label}</span><b>{value||"—"}</b></div>;}
function Signer({title,name,licence,date,signature:src}:{title:string;name:string;licence:string;date:string;signature:string}){return <section className="print-signer"><h3>{title}</h3><div><PrintField label="Nom / Name" value={name}/><PrintField label="No de licence - classe" value={licence}/><PrintField label="Date" value={date}/></div>{signature({src,alt:title})}</section>;}
function Certification({name,text}:{name:string;text:string}){return <div className="print-certification"><p>{text}</p><span><b>{name}</b> - Signature électronique au dossier - Date d’impression</span></div>;}
function SummaryCertification({title,name,date,signatureSrc}:{title:string;name:string;date:string;signatureSrc:string}){return <section><p>{title}</p><div><span>Nom / Name<b>{name||"—"}</b></span><span>Signature{signature({src:signatureSrc,alt:title})}</span><span>Date<b>{date||"—"}</b></span></div></section>;}

"use client";

import { lessonProgress } from "./lessonProgress";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PinSignaturePad } from "@/components/ui/PinSignaturePad";
import { subscribeStudent } from "@/features/students/firestore";
import type { Student } from "@/features/students/types";
import { PreSoloChecklistPanel } from "@/features/students/PreSoloChecklistPanel";
import { StudentTheoryRecordPanel } from "@/features/theory/StudentTheoryRecordPanel";
import { FlightTestRecommendationPanel } from "@/features/students/FlightTestRecommendationPanel";
import { addEvaluation, resetLessonAfterActivityRemoval, saveLesson, subscribeAircraft, subscribeEvaluations, subscribeInstructors, subscribeLessonHistory, subscribeLessons, subscribeReservations } from "./firestore";
import { finalScore, TC_CRITERIA, TC_SCALE } from "./evaluation";
import { initializeTrainingProgramForStudent } from "@/features/programs/firestore";
import { ATPA_PROGRAM } from "@/features/programs/data";
import { OFFICIAL_PROGRAMS } from "@/features/programs/modularPrograms";
import type { AircraftOption, InstructorOption, PTREvaluation, PTRFlightRecord, PTRLesson, PTRLessonHistory, PTRLessonStatus, ReservationOption, TCScore } from "./types";
import { useAuth } from "@/features/auth/AuthProvider";
import { canAccessPtr } from "@/features/auth/ptrAccess";
import { StudentAgreementPanel } from "@/features/students/StudentAgreementPanel";
import { StudentProgramAgreementPanel } from "@/features/students/StudentProgramAgreementPanel";
import { StudentPinPanel } from "@/features/students/StudentPinPanel";
import { InstructorPinPanel } from "@/features/instructors/InstructorPinPanel";

type ScoreKey = "pilotage" | "technical" | "situationalAwareness" | "flightManagement" | "safetyMargins";
type LessonComponent = NonNullable<PTRLesson["components"]>[number];
const CUMULATIVE_SOLO_LESSONS=new Set([50,51,52]);
const isGroundModality = (value: string) => /sol|théorie|ground|briefing/i.test(value);
const planLessonNumber=(value:string)=>value.match(/-L(\d+)(?:-|$)/)?.[1]||"";
const timeMinutes=(value:string)=>{const match=value.match(/^(\d{1,2}):(\d{2})$/);return match?Number(match[1])*60+Number(match[2]):undefined};
const activityType=(value:string):PTRLessonHistory["activityType"]=>value==="Sol"?"Sol":value==="Simulateur"?"Simulateur":"Vol";
const decimalOperationalTime=(record:PTRFlightRecord)=>{
  if(record.groundTimeHours!==undefined)return record.groundTimeHours;
  if(record.hobbsElapsed!==undefined)return record.hobbsElapsed;
  if(record.airtimeMinutes!==undefined)return Math.round(record.airtimeMinutes/6)/10;
  if(record.scheduledStartMinutes!==undefined&&record.scheduledEndMinutes!==undefined)
    return Math.round((record.scheduledEndMinutes-record.scheduledStartMinutes)/6)/10;
  return undefined;
};
const ptrRecordedHours=(record:PTRFlightRecord)=>{
  if(record.type==="Sol"||record.type==="Simulateur")return decimalOperationalTime(record)||0;
  if(record.hobbsElapsed!==undefined)return record.hobbsElapsed;
  if(record.hobbsStart!==undefined&&record.hobbsEnd!==undefined)
    return Math.round((record.hobbsEnd-record.hobbsStart)*10)/10;
  return 0;
};
const recordedStatus=(evaluation:PTREvaluation):PTRLessonStatus=>{
  if(evaluation.groundResult)return evaluation.groundResult;
  if(evaluation.finalScore!==undefined)return evaluation.finalScore>=3?"Réussi":"À reprendre";
  return evaluation.lessonStatus==="En cours"?"À reprendre":evaluation.lessonStatus;
};
const officialLessonDefinition=(lesson:PTRLesson,student:Student|null)=>{
  const studentProgram=OFFICIAL_PROGRAMS.find(item=>item.id===student?.trainingProgramId)||
    OFFICIAL_PROGRAMS.find(item=>item.name===student?.trainingProgramName)||
    (student?.program==="ATP(A) intégré"?ATPA_PROGRAM:undefined)||
    OFFICIAL_PROGRAMS.find(item=>item.name===student?.program);
  const looksLikeAtpaPlan8=String(lesson.lessonNumber)==="8"&&(
    /décrochages?.*glissade/i.test(lesson.title)||
    lesson.components?.some(component=>
      /limites de vol de l’avion/i.test(component.category)||
      /décrochages?.*glissade/i.test(component.title)
    )
  );
  const legacyAtpaLesson=lesson.id.startsWith("atpa-")||
    /Manuel de formation\s*[–-]\s*ATP\(A\)/i.test(lesson.sourceManual||"");
  const program=OFFICIAL_PROGRAMS.find(item=>item.id===lesson.programId)||
    studentProgram||
    (legacyAtpaLesson||looksLikeAtpaPlan8?ATPA_PROGRAM:undefined);
  const template=program?.lessons.find(item=>String(item.number)===String(lesson.lessonNumber));
  if(!template)return lesson;
  return{
    ...lesson,
    phase:`Phase ${template.phase} — ${template.phaseName}`,
    title:template.title,
    objective:template.objectives.join("\n\n"),
    exercises:template.exercises,
    successCriteria:template.successCriteria,
    components:template.components.map(component=>({
      modality:component.modality,category:component.category,title:component.title,
      objective:component.objective,hours:component.hours,exercises:component.exercises,
      nextLesson:component.nextLesson,successCriteria:component.successCriteria,
      manualPage:component.manualPage
    }))
  };
};

const emptyEvaluation = () => ({
  date: new Date().toISOString().slice(0, 10),
  reservationId: "",
  instructorId: "",
  pilotage: undefined as TCScore | undefined,
  technical: undefined as TCScore | undefined,
  situationalAwareness: undefined as TCScore | undefined,
  flightManagement: undefined as TCScore | undefined,
  safetyMargins: undefined as TCScore | undefined,
  strengths: "",
  improvements: "",
  comments: "",
  actions: [] as string[],
  lessonStatus: "En cours" as PTRLessonStatus,
  instructorSignature: "",
	  studentSignature: ""
	  ,groundResult: "" as "" | "Réussi" | "À reprendre"
});

export function PTRStudentPage({ studentId }: { studentId: string }) {
  useEffect(() => {
    const openSection = () => { const id = window.location.hash.slice(1); if (!["rental-agreement", "training-agreement"].includes(id)) return; const section = document.getElementById(id) as HTMLDetailsElement | null; if (section) { section.open = true; section.scrollIntoView({block: "start"}); observer.disconnect(); } };
    const observer = new MutationObserver(openSection);
    observer.observe(document.body, {childList: true, subtree: true});
    window.addEventListener("hashchange", openSection);
    openSection();
    return () => { observer.disconnect(); window.removeEventListener("hashchange", openSection); };
  }, []);

  const {user,profile}=useAuth();
  const allowed=canAccessPtr(profile,studentId);
  const canManagePtrHistory=Boolean(profile?.active&&profile.permissions.includes("ptr")&&
    ["Administrateur","Chef instructeur","Instructeur"].includes(profile.role));
  const [student, setStudent] = useState<Student | null>(null);
  const [lessons, setLessons] = useState<PTRLesson[]>([]);
  const [evaluations, setEvaluations] = useState<PTREvaluation[]>([]);
  const [lessonHistory,setLessonHistory]=useState<PTRLessonHistory[]>([]);
  const [reservations, setReservations] = useState<ReservationOption[]>([]);
  const [instructors, setInstructors] = useState<InstructorOption[]>([]);
  const [aircraft,setAircraft]=useState<AircraftOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedComponentIndex,setSelectedComponentIndex]=useState(0);
  const [message, setMessage] = useState("");
  const [checkoutMode, setCheckoutMode] = useState(false);
  const [requestedReservationId, setRequestedReservationId] = useState("");
  const [loadedEvaluationId,setLoadedEvaluationId]=useState("");
  const [initializingProgram, setInitializingProgram] = useState(false);
  const [error, setError] = useState("");
  const [studentLoading,setStudentLoading]=useState(true);
  const [studentError,setStudentError]=useState("");
  const [lessonsLoaded,setLessonsLoaded]=useState(false);
  const [reservationsLoaded,setReservationsLoaded]=useState(false);
  const [unlinkReason,setUnlinkReason]=useState("");
  const [unlinking,setUnlinking]=useState(false);
  const [rentalAgreementOpen,setRentalAgreementOpen]=useState(false);
  const [programAgreementOpen,setProgramAgreementOpen]=useState(false);
  const reconcilingActivities=useRef(new Set<string>());
  const [lessonForm, setLessonForm] = useState({
    phase: "Phase 1", lessonNumber: "", title: "", objective: "", exercises: ""
  });
  const [form, setForm] = useState(emptyEvaluation());

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const requestedLesson = params.get("lesson");
    const reservationId = params.get("reservation") || "";
    const isCheckout = params.get("checkout") === "1";

    setCheckoutMode(isCheckout);
    setRequestedReservationId(reservationId);

    if (requestedLesson) {
      const matching = lessons.find(
        item =>
          item.id.endsWith(requestedLesson) ||
          item.lessonPlanId === requestedLesson
      );
      if (matching) {
        setSelectedId(matching.id);
        setForm(current => ({
          ...current,
          reservationId: reservationId || matching.linkedReservationId || ""
        }));
      }
    } else if (reservationId) {
      const matching = lessons.find(
        item => item.linkedReservationId === reservationId
      );
      if (matching) {
        setSelectedId(matching.id);
        setForm(current => ({
          ...current,
          reservationId
        }));
      }
    }
  }, [lessons]);

  useEffect(() => {
    if(!allowed)return;
    setStudentLoading(true);setStudentError("");setStudent(null);
    const offStudent = subscribeStudent(studentId, value=>{setStudent(value);setStudentLoading(false)}, value=>{setStudentError(value.message);setStudentLoading(false)});
    setLessonsLoaded(false);
    const offLessons = subscribeLessons(studentId, { next: value=>{setLessons(value);setLessonsLoaded(true)}, error: value => setError(value.message) });
    return () => { offStudent(); offLessons(); };
  }, [studentId,allowed]);

  useEffect(() => {
    if(!allowed||!lessonsLoaded||!lessons.length)return;
    setReservationsLoaded(false);
    const offEvaluations = subscribeEvaluations(studentId, { next: setEvaluations, error: value => setError(value.message) });
    const offHistory=canManagePtrHistory
      ?subscribeLessonHistory(studentId,{next:setLessonHistory,error:value=>setError(value.message)})
      :()=>undefined;
    const offReservations = subscribeReservations(studentId, { next: value=>{setReservations(value);setReservationsLoaded(true)}, error: value => setError(value.message) });
    const offInstructors = subscribeInstructors({ next: setInstructors, error: value => setError(value.message) });
    const offAircraft=subscribeAircraft({next:setAircraft,error:value=>setError(value.message)});
    return () => { offEvaluations(); offHistory(); offReservations(); offInstructors(); offAircraft(); };
  }, [studentId,allowed,canManagePtrHistory,lessonsLoaded,lessons.length]);

  useEffect(()=>{
    if(!canManagePtrHistory||!lessonsLoaded||!reservationsLoaded)return;
    const reservationIds=new Set(reservations.map(item=>item.id));
    lessons.filter(lesson=>lesson.linkedReservationId&&!reservationIds.has(lesson.linkedReservationId)).forEach(lesson=>{
      const activityId=lesson.linkedReservationId;
      if(reconcilingActivities.current.has(activityId))return;
      reconcilingActivities.current.add(activityId);
      const record=lesson.flightRecords?.find(item=>item.reservationId===activityId);
      void resetLessonAfterActivityRemoval({
        lesson,activityId,activityType:activityType(record?.type||""),action:"Activité supprimée",
        reason:"L’activité liée n’existe plus dans les réservations. Réconciliation automatique du PTR.",
        deletedBy:{uid:"system",name:"Flight Director",role:"Système"},requireMissingReservation:true
      }).catch(value=>{
        reconcilingActivities.current.delete(activityId);
        setError(value instanceof Error?value.message:"Impossible de réconcilier le statut PTR.");
      });
    });
  },[lessons,reservations,lessonsLoaded,reservationsLoaded,canManagePtrHistory]);

	  const orderedLessons = useMemo(() => lessons.map(lesson=>officialLessonDefinition(lesson,student)).sort((a,b) =>
	    a.lessonNumber.localeCompare(b.lessonNumber, undefined, { numeric: true })), [lessons,student]);
	  const selected = orderedLessons.find(item=>item.id===selectedId)||orderedLessons[0];
	  const selectedComponent:LessonComponent|undefined=selected?.components?.[selectedComponentIndex]||selected?.components?.[0];
	  const isGroundLesson=selectedComponent?isGroundModality(selectedComponent.modality):false;
	  const expectedComponentId=selected?`${selected.lessonNumber}-${selectedComponentIndex+1}`:"";
	  const selectedFlightRecords=useMemo(()=>{
	    if(!selected)return[];
	    const records=new Map<string,PTRFlightRecord>();
	    (selected.flightRecords||[]).forEach(record=>records.set(record.reservationId,record));
	    reservations.filter(reservation=>{
	      if(reservation.status!=="Complété")return false;
	      return reservation.id===selected.linkedReservationId||
	        (!!selected.lessonPlanId&&reservation.lessonPlanId===selected.lessonPlanId)||
	        (!!reservation.lessonPlanId&&planLessonNumber(reservation.lessonPlanId)===String(selected.lessonNumber));
	    }).forEach(reservation=>{
	      records.set(reservation.id,{
	        reservationId:reservation.id,lessonComponentId:reservation.lessonComponentId,simulatorTcId:reservation.simulatorTcId,date:reservation.date,type:reservation.type,
	        aircraftId:reservation.aircraftId,instructorId:reservation.instructorId,
	        scheduledStartMinutes:timeMinutes(reservation.startTime),
	        scheduledEndMinutes:timeMinutes(reservation.endTime),
	        hobbsStart:reservation.hobbsStart,hobbsEnd:reservation.hobbsEnd,
	        hobbsElapsed:reservation.hobbsStart!==undefined&&reservation.hobbsEnd!==undefined
	          ?Math.round((reservation.hobbsEnd-reservation.hobbsStart)*10)/10:undefined,
	        takeoffTime:reservation.takeoffTime,landingTime:reservation.landingTime,
	        airtimeMinutes:reservation.airtimeMinutes,
		        groundTimeHours:reservation.groundTimeHours,
		        flightCrewRole:reservation.flightCrewRole,dayHours:reservation.dayHours,nightHours:reservation.nightHours,
		        instrumentAircraftHours:reservation.instrumentAircraftHours,ftdHours:reservation.ftdHours,
		        crossCountryDayHours:reservation.crossCountryDayHours,crossCountryNightHours:reservation.crossCountryNightHours,
		        routeFrom:reservation.routeFrom,routeTo:reservation.routeTo,
	        checkInMetar:reservation.checkInMetar,checkOutMetar:reservation.checkOutMetar,
	        metarStation:reservation.metarStation,
	        checkedInAt:reservation.checkedInAt,checkedInBy:reservation.checkedInBy,
	        checkedOutAt:reservation.checkedOutAt,checkedOutBy:reservation.checkedOutBy,
	        recordedAt:reservation.checkedOutAt||`${reservation.date}T00:00:00`
	      });
	    });
	    return[...records.values()]
	      .filter(record=>record.lessonComponentId
	        ?record.lessonComponentId===expectedComponentId
	        :isGroundLesson?record.type==="Sol":record.type!=="Sol")
	      .sort((a,b)=>b.recordedAt.localeCompare(a.recordedAt));
	  },[selected,reservations,expectedComponentId,isGroundLesson]);
	  const selectedLessonNumber=Number(selected?.lessonNumber||0);
	  const selectedPhaseNumber=selected?.phase.match(/\d+/)?.[0]||"1";
	  const cumulativeTargetHours=selectedComponent&&CUMULATIVE_SOLO_LESSONS.has(selectedLessonNumber)
	    ?selectedComponent.hours.solo
	    :0;
	  const cumulativeCompletedHours=Math.round(selectedFlightRecords.reduce((sum,record)=>sum+ptrRecordedHours(record),0)*10)/10;
	  const cumulativeRemainingHours=Math.max(0,Math.round((cumulativeTargetHours-cumulativeCompletedHours)*10)/10);
	  const cumulativeReady=cumulativeTargetHours>0&&cumulativeCompletedHours+0.05>=cumulativeTargetHours;
	  const selectedComponentKey=selected?`${selected.id}::${selectedComponentIndex}`:"";
	  const history = evaluations.filter(item => item.lessonId === selected?.id && (item.componentKey === selectedComponentKey || (!item.componentKey && selectedComponentIndex===0))).sort((a,b) => (b.signedAt||b.date).localeCompare(a.signedAt||a.date));
	  const evaluationForReservation=form.reservationId
	    ?history.find(item=>item.reservationId===form.reservationId)
	    :history.find(item=>!item.reservationId);
	  const score = isGroundLesson
	    ? form.groundResult === "Réussi" ? 4 as TCScore : form.groundResult === "À reprendre" ? 2 as TCScore : undefined
	    : finalScore([form.pilotage, form.technical, form.situationalAwareness, form.flightManagement, form.safetyMargins]);
	  const evaluatedStatus:PTRLessonStatus=isGroundLesson
	    ?form.groundResult==="Réussi"?"Réussi":"À reprendre"
	    :score!==undefined&&score>=3?"Réussi":"À reprendre";
	  const completedStatus:PTRLessonStatus=cumulativeTargetHours>0&&evaluatedStatus==="Réussi"&&!cumulativeReady
	    ?"En cours"
	    :evaluatedStatus;
	  const visualLessonStatus=(lesson:PTRLesson):PTRLessonStatus=>lessonProgress(
      lesson.id, lesson.components?.length||1,
      evaluations.map(item=>({...item,signedAt:item.signedAt||item.date,status:recordedStatus(item)})),
      new Set(reservations.map(item=>item.id)),
    );
	  const successfulLessons=orderedLessons.filter(item=>visualLessonStatus(item)==="Réussi").length;
	  const progress=orderedLessons.length?Math.round(successfulLessons/orderedLessons.length*100):0;
	  const modificationHistory=lessonHistory.filter(item=>item.lessonId===selected?.id)
	    .sort((a,b)=>b.createdAt.localeCompare(a.createdAt));

	  useEffect(()=>{
	    const groundIndex=selected?.components?.findIndex(component=>isGroundModality(component.modality))??-1;
	    setSelectedComponentIndex(groundIndex>=0?groundIndex:0);
	  },[selected?.id]);
	  useEffect(()=>{setLoadedEvaluationId("");setForm(emptyEvaluation());},[selectedComponentKey]);

  useEffect(() => {
    if(!selected)return;
    const linked=reservations.find(item=>item.id===(requestedReservationId||selected.linkedReservationId))||
      reservations.filter(item=>
        item.lessonPlanId&&planLessonNumber(item.lessonPlanId)===String(selected.lessonNumber)&&
        (item.lessonComponentId?item.lessonComponentId===expectedComponentId:isGroundLesson?item.type==="Sol":item.type!=="Sol"))
        .sort((a,b)=>b.date.localeCompare(a.date))[0];
    if (linked) {
      setForm(current => ({
        ...current,
        reservationId:linked.id,
        instructorId:linked.instructorId||current.instructorId,
        date:linked.date||current.date
      }));
    }
  }, [requestedReservationId, reservations, selected, expectedComponentId, isGroundLesson]);

	  useEffect(()=>{
	    const latest=evaluationForReservation;
	    if(!latest||latest.id===loadedEvaluationId)return;
    setForm({
      date:latest.date||new Date().toISOString().slice(0,10),
      reservationId:latest.reservationId||"",
      instructorId:latest.instructorId||"",
      pilotage:latest.pilotage,technical:latest.technical,
      situationalAwareness:latest.situationalAwareness,
      flightManagement:latest.flightManagement,safetyMargins:latest.safetyMargins,
      strengths:latest.strengths,improvements:latest.improvements,
      comments:latest.comments,actions:latest.actions,
      lessonStatus:recordedStatus(latest),
      instructorSignature:latest.instructorSignature,
      studentSignature:latest.studentSignature,
      groundResult:latest.groundResult||""
	    });
	    setLoadedEvaluationId(latest.id);
	  },[evaluationForReservation,loadedEvaluationId]);

  async function installAtpaProgram() {
    if (lessons.length > 0 && !window.confirm("Le PTR contient déjà des leçons. Voulez-vous importer ou mettre à jour le programme associé au dossier?")) return;
    setInitializingProgram(true);
    try {
      const program=await initializeTrainingProgramForStudent(studentId,student?.program||"ATP(A) intégré",student?.trainingProgramId||"");
      setMessage(`${program.name} importé : ${program.lessonCount} leçons créées à partir du manuel officiel.`);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Impossible d’importer le programme.");
    } finally {
      setInitializingProgram(false);
    }
  }

  async function addLesson(event: React.FormEvent) {
    event.preventDefault();
    const id = `lesson-${studentId}-${Date.now()}`;
    await saveLesson({
      id, studentId, phase: lessonForm.phase, lessonNumber: lessonForm.lessonNumber,
      title: lessonForm.title, objective: lessonForm.objective,
      exercises: lessonForm.exercises.split(",").map(item => item.trim()).filter(Boolean),
      status: "Non commencé", linkedReservationId: ""
    }, false);
    setLessonForm({ phase: "Phase 1", lessonNumber: "", title: "", objective: "", exercises: "" });
    setSelectedId(id);
    setMessage("Leçon ajoutée.");
  }

  function setCriterion(key: ScoreKey, value: TCScore) {
    setForm(current => ({ ...current, [key]: value }));
  }

  function toggleAction(action: string) {
    setForm(current => ({
      ...current,
      actions: current.actions.includes(action)
        ? current.actions.filter(item => item !== action)
        : [...current.actions, action]
    }));
  }

  async function unlinkActivity(){
    if(!selected?.linkedReservationId)return;
    if(!unlinkReason.trim()){
      setMessage("Inscris le motif de la désassociation.");
      return;
    }
    const activityId=selected.linkedReservationId;
    const reservation=reservations.find(item=>item.id===activityId);
    const record=selected.flightRecords?.find(item=>item.reservationId===activityId);
    setUnlinking(true);setError("");
    try{
      const changed=await resetLessonAfterActivityRemoval({
        lesson:selected,activityId,activityType:activityType(reservation?.type||record?.type||""),
        action:"Activité désassociée",reason:unlinkReason,
        deletedBy:{uid:user?.uid||profile?.uid||"",name:profile?.name||profile?.email||"Utilisateur",role:profile?.role||""}
      });
      if(changed){
        setForm(emptyEvaluation());setLoadedEvaluationId("");setUnlinkReason("");
        setMessage("Activité désassociée. La leçon est revenue à « Non commencé »; son historique est conservé.");
      }
    }catch(value){
      setError(value instanceof Error?value.message:"Impossible de désassocier l’activité.");
    }finally{
      setUnlinking(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
	    if (!selected || !score) {
	      setMessage(isGroundLesson ? "Sélectionne le résultat de la formation au sol." : "Sélectionne une leçon et au moins un critère d’évaluation.");
      return;
    }
	    if(!form.reservationId||!reservations.some(item=>item.id===form.reservationId)){
	      setMessage("Lie une activité existante à la leçon avant d’enregistrer l’évaluation.");
	      return;
	    }
	    const instructor = instructors.find(item => item.id === form.instructorId);
	    if(!instructor){
	      setMessage("Sélectionne l’instructeur responsable de cette évaluation.");
	      return;
	    }
	    if(!form.comments.trim()){
	      setMessage("Inscris un commentaire propre à cette composante de la leçon.");
	      return;
	    }
	    if(!form.instructorSignature.trim()||!form.studentSignature.trim()){
	      setMessage("Les signatures de l’instructeur et de l’élève sont requises pour cette évaluation.");
	      return;
	    }
	    const evaluationId = await addEvaluation({
      studentId, lessonId: selected.id, reservationId: form.reservationId,
      instructorId: form.instructorId, instructorName: instructor?.name || "",
      date: form.date, pilotage: form.pilotage, technical: form.technical,
      situationalAwareness: form.situationalAwareness, flightManagement: form.flightManagement,
      safetyMargins: form.safetyMargins, finalScore: score, strengths: form.strengths,
      improvements: form.improvements, comments: form.comments, actions: form.actions,
      lessonStatus: completedStatus, instructorSignature: form.instructorSignature,
	      studentSignature: form.studentSignature, signedAt: new Date().toISOString()
	      ,evaluationType:isGroundLesson?"ground":"flight",groundResult:isGroundLesson?form.groundResult||undefined:undefined,
	      componentKey:selectedComponentKey,componentModality:selectedComponent?.modality
	    });
	    const componentStatuses={...selected.componentStatuses,[String(selectedComponentIndex)]:completedStatus};
	    const overallStatus:PTRLessonStatus=(selected.components?.length||0)>1
	      ?selected.components!.every((_,index)=>componentStatuses[String(index)]==="Réussi")
	        ?"Réussi"
	        :completedStatus==="À reprendre"?"À reprendre":"En cours"
	      :completedStatus;
	    await saveLesson({
	      ...selected,
	      status: overallStatus,
	      componentStatuses,
      linkedReservationId: form.reservationId,
      lastEvaluationId: evaluationId,
      lastFinalScore: score
    }, true);
    setLoadedEvaluationId(evaluationId);
    setForm(current=>({...current,lessonStatus:completedStatus}));
    setMessage("Évaluation PTR enregistrée.");
  }

  if(!allowed)return <><PageHeader title="Accès refusé" subtitle="Dossier PTR protégé"/><section className="card"><h2>Accès non autorisé</h2><p>Un compte étudiant peut uniquement consulter le PTR lié à son propre dossier.</p><a className="button secondary" href="/ptr">Retour</a></section></>;
  if(studentLoading)return <><PageHeader title="PTR électronique" subtitle="Chargement du dossier…"/><section className="card">Chargement…</section></>;
  if(!student)return <><PageHeader title="PTR électronique" subtitle="Dossier indisponible"/><section className="card"><h2>{studentError?"Impossible de charger ce PTR":"Dossier étudiant introuvable"}</h2><p>{studentError||"Le dossier sélectionné n’existe plus ou son identifiant a changé."}</p><a className="button secondary" href="/ptr">Retour à la liste des PTR</a></section></>;
  if(lessonsLoaded&&!lessons.length)return <>
    <PageHeader title={`${student.firstName} ${student.lastName}`} subtitle={`PTR · ${student.program} · ${student.programType}`}/>
    {error&&<div className="notice error">{error}</div>}
    {message&&<div className="notice">{message}</div>}
    <section className="card program-install-banner">
      <div>
        <span className="badge ok">Nouveau dossier PTR</span>
        <h2>{student.trainingProgramName||student.program||"Programme d’entraînement"}</h2>
        <p>Ce dossier ne contient encore aucune leçon. Installez le programme associé pour préparer le PTR de test.</p>
      </div>
      <button className="button" onClick={installAtpaProgram} disabled={initializingProgram}>
        {initializingProgram?"Importation…":"Installer le programme sélectionné"}
      </button>
    </section>
    <a className="button secondary" href="/ptr">Retour à la liste des PTR</a>
  </>;

  return (
    <>
      <PageHeader title={`${student.firstName} ${student.lastName}`} subtitle={checkoutMode ? `Évaluation après vol · ${student.program}` : `PTR · ${student.program} · ${student.programType}`} />
      <div className="ptr-print-launch"><a className="button secondary" href={`/ptr/${studentId}/print`} target="_blank" rel="noreferrer">Imprimer le PTR - format Transports Canada</a></div>
      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice">{message}</div>}
      <section className="card"><StudentPinPanel studentId={studentId} studentName={`${student.firstName} ${student.lastName}`.trim()}/></section>
      <details id="rental-agreement" className="pre-solo-details" onToggle={event=>setRentalAgreementOpen(event.currentTarget.open)}>
        <summary>Contrat de location et consentement</summary>
        {rentalAgreementOpen&&<StudentAgreementPanel student={student}/>} 
      </details>
      <details id="training-agreement" className="pre-solo-details" onToggle={event=>setProgramAgreementOpen(event.currentTarget.open)}>
        <summary>Programme d’entraînement applicable</summary>
        {programAgreementOpen&&<StudentProgramAgreementPanel student={student}/>} 
      </details>
      <details className="pre-solo-details">
        <summary>Check-list pré-solo et autorisation du premier solo</summary>
        <PreSoloChecklistPanel studentId={studentId}/>
      </details>

      <section className="card program-install-banner">
        <div>
          <span className="badge ok">Manuel officiel Orizon Aviation</span>
          <h3>{student?.trainingProgramName||student?.program||"Programme d’entraînement"}</h3>
          <p>Importe automatiquement les plans officiels associés au programme sélectionné dans le dossier, sans renumérotation.</p>
        </div>
        <button className="button" onClick={installAtpaProgram} disabled={initializingProgram}>
          {initializingProgram ? "Importation…" : lessons.length ? "Mettre à jour le programme" : "Installer le programme sélectionné"}
        </button>
      </section>

      <section className="card ptr-summary">
	        <div><strong>Progression</strong><p>{successfulLessons} plan(s) réussi(s) sur {orderedLessons.length}</p></div>
        <strong className="progress-number">{progress}%</strong>
        <div className="progress-bar"><span style={{ width: `${progress}%` }} /></div>
      </section>
      <StudentTheoryRecordPanel studentId={studentId}/>
      <details className="pre-solo-details">
        <summary>Recommandation de test en vol</summary>
        <FlightTestRecommendationPanel studentId={studentId}/>
      </details>

      <div className="ptr-layout">
        <aside className="card ptr-sidebar">
		          <h3>Plan de formation — {orderedLessons.length} leçon(s)</h3>
          <details>
            <summary className={`ptr-lesson ${selected ? (visualLessonStatus(selected)==="Réussi"?"passed":visualLessonStatus(selected)==="À reprendre"?"failed":visualLessonStatus(selected)==="En cours"?"in-progress":"") : ""}`} aria-label="Choisir un plan de formation">
              <strong>{selected ? `Leçon ${selected.lessonNumber} · ${selected.title}` : "Choisir un plan de formation"}</strong>
              {selected && <span>{selected.phase} · {visualLessonStatus(selected)==="En cours"?"En cours — non terminée":visualLessonStatus(selected)}</span>}
            </summary>
            <div style={{maxHeight:320,overflowY:"auto",padding:4}}>
	          {orderedLessons.map(lesson=>{const displayedStatus=visualLessonStatus(lesson);return(
	            <button className={`ptr-lesson ${selected?.id===lesson.id?"active":""} ${displayedStatus==="Réussi"?"passed":displayedStatus==="À reprendre"?"failed":displayedStatus==="En cours"?"in-progress":""}`} onClick={event=>{setSelectedId(lesson.id); const menu=event.currentTarget.closest("details"); if(menu) menu.open=false;}} key={lesson.id}>
	              <strong>Leçon {lesson.lessonNumber} · {lesson.title}</strong>
	              <span>{lesson.phase} · {displayedStatus==="En cours"?"En cours — non terminée":displayedStatus}</span>
	            </button>
	          )})}
            </div>
          </details>
          <h3>Ajouter une leçon</h3>
          <form className="form" onSubmit={addLesson}>
            <input required placeholder="Phase" value={lessonForm.phase} onChange={event => setLessonForm({...lessonForm, phase:event.target.value})}/>
            <input required placeholder="Numéro" value={lessonForm.lessonNumber} onChange={event => setLessonForm({...lessonForm, lessonNumber:event.target.value})}/>
            <input required placeholder="Titre" value={lessonForm.title} onChange={event => setLessonForm({...lessonForm, title:event.target.value})}/>
            <textarea required placeholder="Objectif" value={lessonForm.objective} onChange={event => setLessonForm({...lessonForm, objective:event.target.value})}/>
            <input placeholder="Exercices séparés par des virgules" value={lessonForm.exercises} onChange={event => setLessonForm({...lessonForm, exercises:event.target.value})}/>
            <button className="button">Ajouter</button>
          </form>
        </aside>

        <main className="ptr-main">
          {selected ? <>
            <section className="card">
		              <div className="lesson-title-row">
                <div>
                  <span className="badge">{selected.phase}</span>
	                  <h2>Leçon {selected.lessonNumber} — {selected.title}</h2>
		                  <span className={`badge lesson-kind ${isGroundLesson?"ground":"flight"}`}>{isGroundLesson?"Formation au sol":"Formation en vol"}</span>
		                </div>
                {selected.programRevision && <span className="badge ok">{selected.programRevision}</span>}
		              </div>
		              <p className="official-component-count">{selected.components?.length||1} composante(s) officielle(s) dans ce plan. Chaque composante possède une évaluation, des commentaires et des signatures distincts.</p>
              {selected.sourceManual && <p className="muted">{selected.sourceManual}</p>}
	              {selected.components&&selected.components.length>1&&<div className="component-selector">
	                <strong>Composantes du plan</strong>
	                <div>
		                  {selected.components.map((component,index)=>({component,index})).sort((a,b)=>Number(isGroundModality(b.component.modality))-Number(isGroundModality(a.component.modality))).map(({component,index})=><button type="button" className={`${selectedComponentIndex===index?"active":""} ${isGroundModality(component.modality)?"ground":"flight"}`} onClick={()=>{setSelectedComponentIndex(index);setForm(emptyEvaluation());}} key={`${component.modality}-${index}`}>{component.modality}</button>)}
	                </div>
	              </div>}
	              <h4>Objectif</h4>
	              <p className="lesson-objective">{selectedComponent?.objective||selected.objective}</p>

	              {selectedComponent && (
	                <div className="manual-components">
	                    <section className="manual-component" key={`${selectedComponent.modality}-${selectedComponentIndex}`}>
	                      <header>
	                        <strong>{selectedComponent.modality}</strong>
	                        <span>Page {selectedComponent.manualPage}</span>
	                      </header>
	                      <p><b>{selectedComponent.category}</b> · {selectedComponent.title}</p>
	                      <div className="hours">
	                        {selectedComponent.hours.sol > 0 && <span>Sol {selectedComponent.hours.sol} h</span>}
	                        {selectedComponent.hours.dev > 0 && <span>DEV {selectedComponent.hours.dev} h</span>}
	                        {selectedComponent.hours.doubleCommande > 0 && <span>DC {selectedComponent.hours.doubleCommande} h</span>}
	                        {selectedComponent.hours.solo > 0 && <span>Solo {selectedComponent.hours.solo} h</span>}
	                      </div>
	                      {selectedComponent.exercises.length > 0 && (
	                        <details>
	                          <summary>Exercices ({selectedComponent.exercises.length})</summary>
	                          <ul>{selectedComponent.exercises.map((item, exerciseIndex) => <li key={exerciseIndex}>{item}</li>)}</ul>
	                        </details>
	                      )}
	                      {selectedComponent.successCriteria && <p className="success-criteria"><b>Norme de réussite :</b> {selectedComponent.successCriteria}</p>}
	                      {selectedComponent.nextLesson && <p className="muted"><b>Leçon suivante :</b> {selectedComponent.nextLesson}</p>}
	                    </section>
	                </div>
	              )}

	              {cumulativeTargetHours>0&&(
	                <section className={`cumulative-training ${cumulativeReady?"complete":""}`}>
	                  <div>
	                    <span className="badge">{cumulativeReady?"Minimum atteint":"Plan cumulatif"}</span>
	                    <h3>{cumulativeCompletedHours.toFixed(1)} / {cumulativeTargetHours.toFixed(1)} h</h3>
	                    <p>{cumulativeReady
	                      ?"Les heures minimales sont atteintes. L’instructeur peut effectuer l’évaluation finale."
	                      :`${cumulativeRemainingHours.toFixed(1)} h restent à effectuer dans une ou plusieurs réservations.`}</p>
	                  </div>
	                  <div className="cumulative-progress" aria-label={`${cumulativeCompletedHours} heures réalisées sur ${cumulativeTargetHours}`}>
	                    <span style={{width:`${Math.min(100,cumulativeCompletedHours/cumulativeTargetHours*100)}%`}}/>
	                  </div>
	                  <div className="cumulative-actions">
	                    <span>{selectedFlightRecords.length} entrée(s) de vol consignée(s)</span>
	                    <a className="button" href={`/schedule?student=${encodeURIComponent(studentId)}&lesson=${encodeURIComponent(`P${selectedPhaseNumber}-L${selected.lessonNumber}-C${selectedComponentIndex+1}`)}&lessonNumber=${encodeURIComponent(selected.lessonNumber)}`}>Ajouter une réservation pour ce plan</a>
	                  </div>
	                </section>
	              )}

	              {selectedFlightRecords.length>0&&(
	                <div className="ptr-flight-records">
	                  <h3>Données opérationnelles liées au plan de leçon</h3>
	                  {selectedFlightRecords.map(record=>{const airplane=aircraft.find(item=>item.id===record.aircraftId);const instructor=instructors.find(item=>item.id===record.instructorId);return(
	                    <article className="ptr-flight-record" key={`${record.reservationId}-${record.recordedAt}`}>
	                      <header>
	                        <strong>{record.date} · {record.type}</strong>
	                        <span className="badge ok">Check-in complété</span>
	                      </header>
	                      <div className="ptr-operation-identity">
	                        {(record.type==="Double commande"||record.type==="Solo")&&<><span>Avion <b>{airplane?.registration||record.aircraftId||"—"}</b></span><span>Type <b>{airplane?.type||"—"}</b></span></>}
	                        {record.type==="Double commande"&&<span>Instructeur <b>{instructor?.name||record.instructorId||"—"}</b></span>}
	                        {record.type==="Solo"&&<span>Élève <b>{student?`${student.firstName} ${student.lastName}`:"—"}</b></span>}
	                        {record.type==="Simulateur"&&<><span>Instructeur <b>{instructor?.name||record.instructorId||"—"}</b></span><span>ID Transports Canada <b>{record.simulatorTcId||"Non inscrit"}</b></span></>}
	                      </div>
	                      <div className="ptr-flight-metrics">
	                        {record.type==="Sol"||record.type==="Simulateur"?<span>{record.type==="Simulateur"?"Temps simulateur":"Temps au sol"} <b>{decimalOperationalTime(record)!==undefined?`${decimalOperationalTime(record)} h`:"—"}</b></span>:<>
	                          <span>Décollage <b>{record.takeoffTime||"—"}</b></span>
	                          <span>Atterrissage <b>{record.landingTime||"—"}</b></span>
	                          <span>Temps en vol <b>{record.airtimeMinutes!==undefined?`${record.airtimeMinutes} min`:"—"}</b></span>
	                          <span>Hobbs départ <b>{record.hobbsStart??"—"}</b></span>
	                          <span>Hobbs fin <b>{record.hobbsEnd??"—"}</b></span>
		                          <span>Hobbs total <b>{record.hobbsElapsed!==undefined?`${record.hobbsElapsed} h`:"—"}</b></span>
		                          <span>Fonction <b>{record.flightCrewRole==="PIC"?"Commandant de bord (PIC)":"Double commande"}</b></span>
		                          <span>Jour <b>{record.dayHours!==undefined?`${record.dayHours} h`:"—"}</b></span>
		                          <span>Nuit <b>{record.nightHours!==undefined?`${record.nightHours} h`:"—"}</b></span>
		                          <span>Instruments avion <b>{record.instrumentAircraftHours!==undefined?`${record.instrumentAircraftHours} h`:"—"}</b></span>
		                          <span>Vol-voyage jour / nuit <b>{record.crossCountryDayHours||0} / {record.crossCountryNightHours||0} h</b></span>
		                          <span>Route <b>{record.routeFrom||"—"} → {record.routeTo||"—"}</b></span>
		                        </>}
		                        {record.type==="Simulateur"&&<span>Instruments FTD/DEV <b>{record.ftdHours!==undefined?`${record.ftdHours} h`:"—"}</b></span>}
	                      </div>
	                      {(record.type==="Double commande"||record.type==="Solo")&&<div className="ptr-flight-weather">
	                        <span>METAR au check-out</span><code>{record.checkInMetar||"Non disponible"}</code>
	                        <span>METAR au check-in</span><code>{record.checkOutMetar||"Non disponible"}</code>
	                      </div>}
	                      <small>Dispatch : {record.checkedInBy||"—"} / {record.checkedOutBy||"—"}{(record.type==="Double commande"||record.type==="Solo")?` · Station ${record.metarStation||"—"}`:""}</small>
	                    </article>
	                  )})}
	                </div>
	              )}

              {(!selected.components || selected.components.length === 0) && (
                <>
                <div className="lesson-exercises">{selected.exercises.map(item => <span key={item}>{item}</span>)}</div>
              <div className="ptr-lesson-tracking">
                <strong>Suivi de la leçon</strong>
                <span>
                  Vol associé à cette leçon : {
                    reservations.find(item => item.id === selected.linkedReservationId)
                      ? `${reservations.find(item => item.id === selected.linkedReservationId)?.date} · ${reservations.find(item => item.id === selected.linkedReservationId)?.title}`
                      : "Aucun vol lié"
                  }
                </span>
                {selected.lessonPdfPath && (
                  <a
                    className="button secondary small"
                    href={selected.lessonPdfPath}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ouvrir le plan de leçon PDF
                  </a>
                )}
              </div>
                </>
              )}
            </section>

            {canManagePtrHistory&&selected.linkedReservationId&&<section className="card">
              <h3>Désassocier l’activité liée</h3>
              <p className="muted">La leçon reviendra à « Non commencé ». L’évaluation, les signatures et les données historiques seront conservées.</p>
              <label>Motif de la désassociation
                <textarea value={unlinkReason} onChange={event=>setUnlinkReason(event.target.value)} placeholder="Motif obligatoire"/>
              </label>
              <button type="button" className="button secondary" disabled={unlinking||!unlinkReason.trim()} onClick={unlinkActivity}>
                {unlinking?"Désassociation…":"Désassocier l’activité"}
              </button>
            </section>}

            <section className="card">
	              <h3>{isGroundLesson?"Évaluation de la formation au sol":"Échelle d’évaluation Transports Canada — Vol"}</h3>
	              <p className="muted">{isGroundLesson?"Le sol est évalué selon l’atteinte des objectifs pédagogiques, sans note de vol 1 à 4.":"La note finale correspond à la moyenne des critères évalués."}</p>
	              {!isGroundLesson&&<div className={checkoutMode ? "tc-scale compact" : "tc-scale"}>
	                {TC_SCALE.map(item => (
	                  <div key={item.score}>
	                    <strong>{item.score}</strong>
	                    <b>{item.title}</b>
	                    {!checkoutMode && <p>{item.summary}</p>}
	                  </div>
	                ))}
	              </div>}

              {history.length>0&&<div className="notice evaluation-saved">✓ Évaluation enregistrée — les résultats demeurent affichés dans la grille.</div>}
              <form className="form" onSubmit={submit}>
                <div className="form-grid">
                  <label>Instructeur<select value={form.instructorId} onChange={event => setForm({...form, instructorId:event.target.value})}><option value="">Sélectionner</option>{instructors.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
                  <label>Date<input type="date" value={form.date} onChange={event => setForm({...form, date:event.target.value})}/></label>
                </div>
                <label>
	                  {isGroundLesson?"Activité liée":"Vol lié"}
                  <select
                    value={form.reservationId}
                    disabled={checkoutMode && Boolean(requestedReservationId)}
                    onChange={event => {
                      const reservation=reservations.find(item=>item.id===event.target.value);
                      setLoadedEvaluationId("");
                      setForm({...emptyEvaluation(),reservationId:event.target.value,instructorId:reservation?.instructorId||"",date:reservation?.date||new Date().toISOString().slice(0,10)});
                    }}
                  >
	                    <option value="">{isGroundLesson?"Aucune activité liée":"Aucun vol lié"}</option>
	                    {reservations.filter(item=>isGroundLesson?item.type==="Sol":item.type!=="Sol").map(item => (
                      <option value={item.id} key={item.id}>
                        {item.date} · {item.startTime}-{item.endTime} · {item.title}
                      </option>
                    ))}
                  </select>
                </label>
                {checkoutMode && requestedReservationId && (
                  <div className="notice">
                    Cette évaluation sera enregistrée sur le vol du check-in.
                  </div>
                )}

	                {isGroundLesson?<div className="ground-result-selector">
	                  <button type="button" className={form.groundResult==="Réussi"?"selected success":""} onClick={()=>setForm({...form,groundResult:"Réussi",lessonStatus:"Réussi"})}>Réussi</button>
	                  <button type="button" className={form.groundResult==="À reprendre"?"selected retry":""} onClick={()=>setForm({...form,groundResult:"À reprendre",lessonStatus:"À reprendre"})}>À reprendre</button>
	                </div>:<div className="score-table">
                  {TC_CRITERIA.map(criterion => {
                    const key = criterion.key as ScoreKey;
                    return <div className="score-row" key={criterion.key}>
                      <strong>{criterion.label}</strong>
                      {[1,2,3,4].map(value => <button type="button" className={form[key] === value ? "selected" : ""} onClick={() => setCriterion(key, value as TCScore)} key={value}>{value}</button>)}
                    </div>;
                  })}
	                </div>}

	                <div className="final-score"><span>{isGroundLesson?"Résultat du sol":"Note finale calculée"}</span><strong>{isGroundLesson?(form.groundResult||"—"):(score||"—")}</strong></div>
                <div className="form-grid">
                  <textarea placeholder="Points forts" value={form.strengths} onChange={event => setForm({...form, strengths:event.target.value})}/>
                  <textarea placeholder="Points à améliorer" value={form.improvements} onChange={event => setForm({...form, improvements:event.target.value})}/>
                </div>
	                <textarea required placeholder="Commentaires de l’instructeur pour cette composante" value={form.comments} onChange={event => setForm({...form, comments:event.target.value})}/>
                <div className="action-list">{["Révision au sol","Refaire l’exercice","Poursuivre","Vol supplémentaire","Évaluation finale"].map(action => <button type="button" className={form.actions.includes(action) ? "active" : ""} onClick={() => toggleAction(action)} key={action}>{action}</button>)}</div>
	                <label>Statut de la leçon<select value={form.lessonStatus} onChange={event => setForm({...form, lessonStatus:event.target.value as PTRLessonStatus})}><option>Non commencé</option><option>En cours</option><option disabled={cumulativeTargetHours>0&&!cumulativeReady}>Réussi</option><option>À reprendre</option></select></label>
	                {cumulativeTargetHours>0&&!cumulativeReady&&<div className="notice">La réservation peut être évaluée, mais le plan demeurera « En cours » jusqu’à l’atteinte de {cumulativeTargetHours.toFixed(1)} h.</div>}
                {form.instructorId&&<InstructorPinPanel instructorId={form.instructorId} instructorName={instructors.find(item=>item.id===form.instructorId)?.name||"l’instructeur"}/>}
                <div className="form-grid">
                  {form.instructorId
                    ? <PinSignaturePad label="Signature de l’instructeur" kind="instructor" personId={form.instructorId} signerName={instructors.find(item => item.id === form.instructorId)?.name || "l’instructeur"} value={form.instructorSignature} onChange={value => setForm({...form, instructorSignature:value})}/>
                    : <div className="notice">Sélectionne l’instructeur responsable ci-dessus avant de signer.</div>}
                  <PinSignaturePad label="Signature de l’élève" kind="student" personId={studentId} signerName={`${student.firstName} ${student.lastName}`.trim()} value={form.studentSignature} onChange={value => setForm({...form, studentSignature:value})}/>
                </div>
                <button className="button">Enregistrer l’évaluation</button>
              </form>
            </section>

            <section className="card">
              <h3>Historique de la leçon</h3>
	              <div className="ptr-history">{history.map(item => <div key={item.id}><strong>{item.date} · {item.evaluationType==="ground"?`Sol : ${item.groundResult||recordedStatus(item)}`:`Moyenne ${item.finalScore??"—"}`}</strong><span>{item.instructorName || "Instructeur"} · Évaluation terminée · {recordedStatus(item)}</span>{item.comments && <p>{item.comments}</p>}</div>)}{!history.length && <p>Aucune évaluation.</p>}</div>
              {canManagePtrHistory&&<><h3>Historique des modifications</h3>
              <div className="ptr-history">{modificationHistory.map(item=><div key={item.id}>
                <strong>{item.createdAt?new Date(item.createdAt).toLocaleString("fr-CA",{dateStyle:"long",timeStyle:"short"}):"Date non disponible"} · {item.action}</strong>
                <span>{item.activityType} {item.activityId} retiré(e) de cette leçon · {item.previousStatus} → {item.newStatus}</span>
                <p><b>Effectué par :</b> {item.deletedBy.name||"Flight Director"} ({item.deletedBy.role||"Système"})</p>
                <p><b>Motif :</b> {item.reason||"Non précisé"}</p>
              </div>)}{!modificationHistory.length&&<p>Aucune modification.</p>}</div></>}
            </section>
          </> : <section className="card">Ajoute une première leçon pour commencer.</section>}
        </main>
      </div>
    </>
  );
}

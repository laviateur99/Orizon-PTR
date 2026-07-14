"use client";
import {useEffect,useMemo,useRef,useState}from"react";import{PageHeader}from"@/components/ui/PageHeader";import{DEFAULT_RESOURCES}from"./data";import{assignLessonToStudentPTR,markLinkedPTRLessonAfterCheckout,removeReservation,saveReservation,subscribeCancellations,subscribeReservations,subscribeResources,subscribeSnagBlocks,subscribeStudents,subscribeSchedulerSettings,updateFlightOperation,type StudentOption}from"./firestore";import type{ActivityType,Cancellation,SchedulerEvent,SchedulerResource}from"./types";import{DEFAULT_SCHEDULER_SETTINGS,type SchedulerSettings}from"./settings";
import { ATPA_PROGRAM } from "@/features/programs/data";
const W=96;const TYPES:ActivityType[]=["Double commande","Solo","Sol","Simulateur","Examen","Maintenance","Hors service"];const REASONS=["Météo","Maintenance","NOTAM","Instructeur malade","Élève malade","Avion indisponible","Conflit d’horaire","Reporté","Autre"];
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));const snap=(v:number,step:number)=>Math.round(v/step)*step;const label=(v:number)=>`${String(Math.floor(v/60)).padStart(2,"0")}:${String(v%60).padStart(2,"0")}`;const cls=(t:ActivityType)=>t==="Solo"?"solo":t==="Maintenance"?"maintenance":t==="Hors service"?"out":t==="Sol"?"ground":t==="Simulateur"?"sim":t==="Examen"?"exam":"dual";const ids=(e:SchedulerEvent)=>[e.resourceId,e.aircraftId,e.instructorId,e.roomId].filter(Boolean);function conflict(c:SchedulerEvent,events:SchedulerEvent[]){return events.some(x=>x.id!==c.id&&x.date===c.date&&x.startMinutes<c.endMinutes&&c.startMinutes<x.endMinutes&&(ids(c).some(id=>ids(x).includes(id))||!!(c.studentId&&x.studentId&&c.studentId===x.studentId)));}function inRange(date:string,e:SchedulerEvent){return e.source==="snag"?date>=e.date&&date<=(e.rangeEndDate||e.date):e.date===date;}function nowMinutes(){const d=new Date();return d.getHours()*60+d.getMinutes();}function airtime(a:string,b:string){if(!a||!b)return undefined;const [ah,am]=a.split(":").map(Number),[bh,bm]=b.split(":").map(Number);let value=bh*60+bm-(ah*60+am);if(value<0)value+=1440;return value;}
type Draft={id?:string;resourceId:string;date:string;type:ActivityType;startMinutes:number;endMinutes:number;studentId:string;studentName:string;aircraftId:string;instructorId:string;roomId:string;title:string;notes:string;overdueAlertMinutes:string;lessonPlanId:string;lessonTitle:string;lessonPdfPath:string;lessonComponentId:string};
type Ops={event:SchedulerEvent;mode:"checkin"|"checkout";dispatch:string;hobbsStart:string;hobbsEnd:string;takeoffTime:string;landingTime:string;overdueAlertMinutes:string};
type PointerDrag={event:SchedulerEvent;mode:"move"|"start"|"end";originX:number;originStart:number;originEnd:number;originResourceId:string;currentResourceId:string};
export function SchedulerPage(){const[date,setDate]=useState(new Date().toISOString().slice(0,10));const[events,setEvents]=useState<SchedulerEvent[]>([]);const[snagBlocks,setSnagBlocks]=useState<SchedulerEvent[]>([]);const[resources,setResources]=useState<SchedulerResource[]>([]);const[students,setStudents]=useState<StudentOption[]>([]);const[cancellations,setCancellations]=useState<Cancellation[]>([]);const[loading,setLoading]=useState(4);const[error,setError]=useState("");const[message,setMessage]=useState("");const[draft,setDraft]=useState<Draft|null>(null);const[ops,setOps]=useState<Ops|null>(null);const[deleteEvent,setDeleteEvent]=useState<SchedulerEvent|null>(null);const[deleteReason,setDeleteReason]=useState(REASONS[0]);const[tick,setTick]=useState(0);const[settings,setSettings]=useState<SchedulerSettings>(DEFAULT_SCHEDULER_SETTINGS);const[drag,setDrag]=useState<PointerDrag|null>(null);const gridRef=useRef<HTMLDivElement|null>(null);
useEffect(()=>{const fail=(e:Error)=>setError(e.message);const done=()=>setLoading(x=>Math.max(0,x-1));setLoading(5);const a=subscribeResources({next:x=>{setResources(x);done()},error:fail}),b=subscribeReservations({next:x=>{setEvents(x);done()},error:fail}),c=subscribeSnagBlocks({next:x=>{setSnagBlocks(x);done()},error:fail}),d=subscribeStudents({next:x=>{setStudents(x);done()},error:fail}),e=subscribeCancellations({next:setCancellations,error:fail}),f=subscribeSchedulerSettings({next:x=>{setSettings(x[0]||DEFAULT_SCHEDULER_SETTINGS);done()},error:fail});return()=>{a();b();c();d();e();f();}},[]);useEffect(()=>{const i=setInterval(()=>setTick(x=>x+1),60000);return()=>clearInterval(i)},[]);
const lessonOptions=ATPA_PROGRAM.lessons.flatMap(lesson=>lesson.components.map((component,index)=>({
  id:`P${lesson.phase}-L${lesson.number}-C${index+1}`,
  label:`Phase ${lesson.phase} · Leçon ${lesson.number} · ${component.modality} · ${lesson.title}`,
  title:`Leçon ${lesson.number} — ${lesson.title}`,
  pdfPath:component.pdfPath||component.manualPdfPath||"",
  componentId:`${lesson.number}-${index+1}`
})));
const simulatorResources:SchedulerResource[]=[{id:"SIM-DCX",kind:"simulator",name:"DCX",detail:"Simulateur DCX",groupLabel:"Simulateurs"},{id:"SIM-737MAX",kind:"simulator",name:"737MAX",detail:"Simulateur Boeing 737 MAX",groupLabel:"Simulateurs"}];const allEvents=useMemo(()=>[...events,...snagBlocks],[events,snagBlocks]);const visible=useMemo(()=>allEvents.filter(e=>inRange(date,e)),[allEvents,date]);const eventStart=visible.length?Math.floor(Math.min(...visible.map(e=>e.startMinutes))/60):settings.startHour;const eventEnd=visible.length?Math.ceil(Math.max(...visible.map(e=>e.endMinutes))/60):settings.endHour;const START=Math.max(0,Math.min(settings.startHour,eventStart));const END=Math.min(24,Math.max(settings.endHour,eventEnd));const SNAP=settings.slotMinutes;const HOURS=Array.from({length:END-START+1},(_,i)=>START+i);const baseList=resources.length?resources:DEFAULT_RESOURCES;const list=useMemo(()=>{const merged=[...baseList];simulatorResources.forEach(x=>{if(!merged.some(y=>y.id===x.id))merged.push(x)});const order=(x:SchedulerResource)=>x.kind==="aircraft"?0:x.kind==="simulator"?1:x.kind==="instructor"?2:3;return merged.sort((a,b)=>order(a)-order(b)||(a.groupLabel||a.detail).localeCompare(b.groupLabel||b.detail)||a.name.localeCompare(b.name))},[baseList]);
function openCreate(r:SchedulerResource,x:number,rect:DOMRect){if(r.blocked){setMessage(`${r.name} est indisponible.`);return;}const rel=clamp(x-rect.left,0,(END-START)*W),start=snap(START*60+rel/W*60,SNAP);setDraft({resourceId:r.id,date,type:r.kind==="room"?"Sol":r.kind==="simulator"?"Simulateur":"Double commande",startMinutes:start,endMinutes:Math.min(start+90,END*60),studentId:"",studentName:"",aircraftId:r.kind==="aircraft"?r.id:"",instructorId:r.kind==="instructor"?r.id:"",roomId:r.kind==="room"||r.kind==="simulator"?r.id:"",title:"",notes:"",overdueAlertMinutes:"",lessonPlanId:"",lessonTitle:"",lessonPdfPath:"",lessonComponentId:""});}
function openEdit(e:SchedulerEvent){if(e.source==="snag"){setMessage("Ce bloc provient d’un SNAG. Modifie-le dans le module Flotte.");return;}setDraft({id:e.id,resourceId:e.resourceId,date:e.date,type:e.type,startMinutes:e.startMinutes,endMinutes:e.endMinutes,studentId:e.studentId||"",studentName:e.studentName||"",aircraftId:e.aircraftId||"",instructorId:e.instructorId||"",roomId:e.roomId||"",title:e.title,notes:e.notes||"",overdueAlertMinutes:e.overdueAlertMinutes?.toString()||"",lessonPlanId:e.lessonPlanId||"",lessonTitle:e.lessonTitle||"",lessonPdfPath:e.lessonPdfPath||"",lessonComponentId:e.lessonComponentId||""});}
async function save(){if(!draft)return;const aircraft=list.find(r=>r.id===draft.aircraftId);if(aircraft?.blocked){setMessage(`${aircraft.name} est bloqué par maintenance ou SNAG.`);return;}const e:SchedulerEvent={id:draft.id||`event-${Date.now()}`,resourceId:draft.resourceId,date:draft.date,type:draft.type,startMinutes:draft.startMinutes,endMinutes:draft.endMinutes,studentId:draft.studentId||undefined,studentName:draft.studentName||undefined,aircraftId:draft.aircraftId||undefined,instructorId:draft.instructorId||undefined,roomId:draft.roomId||undefined,title:draft.title||draft.type,notes:draft.notes,overdueAlertMinutes:draft.overdueAlertMinutes?Number(draft.overdueAlertMinutes):undefined,lessonPlanId:draft.lessonPlanId||undefined,lessonTitle:draft.lessonTitle||undefined,lessonPdfPath:draft.lessonPdfPath||undefined,lessonComponentId:draft.lessonComponentId||undefined,status:draft.id?events.find(x=>x.id===draft.id)?.status||"Planifié":"Planifié"};if(conflict(e,allEvents)){setMessage("Conflit détecté.");return;}await saveReservation(e,events.some(x=>x.id===e.id));await assignLessonToStudentPTR(e);setDraft(null);setMessage("Réservation enregistrée.");}
function late(e:SchedulerEvent){return date===new Date().toISOString().slice(0,10)&&!!e.overdueAlertMinutes&&["Check-in","En vol"].includes(e.status||"")&&nowMinutes()>e.endMinutes+e.overdueAlertMinutes;}
function openOps(e:SchedulerEvent,mode:"checkin"|"checkout"){
  if(mode==="checkin"){
    const aircraft=list.find(item=>item.id===e.aircraftId);
    if(aircraft?.blocked){
      setMessage(`${aircraft.name} est indisponible en raison d’un SNAG ou d’une maintenance. Check-in impossible.`);
      return;
    }
  }
  setOps({event:e,mode,dispatch:"",hobbsStart:e.hobbsStart?.toString()||"",hobbsEnd:e.hobbsEnd?.toString()||"",takeoffTime:e.takeoffTime||"",landingTime:e.landingTime||"",overdueAlertMinutes:e.overdueAlertMinutes?.toString()||""});}
async function saveOps(){
  if(!ops||!ops.dispatch.trim()){
    setMessage("Le nom du dispatch est obligatoire.");
    return;
  }

  if(ops.mode==="checkin"){
    if(!ops.hobbsStart){
      setMessage("Le Hobbs de départ est obligatoire au check-in.");
      return;
    }

    await updateFlightOperation(ops.event.id,{
      status:"Check-in",
      checkedInAt:new Date().toISOString(),
      checkedInBy:ops.dispatch.trim(),
      hobbsStart:Number(ops.hobbsStart),
      ...(ops.overdueAlertMinutes
        ? {overdueAlertMinutes:Number(ops.overdueAlertMinutes)}
        : {})
    });
  }else{
    if(!ops.hobbsEnd||!ops.takeoffTime||!ops.landingTime){
      setMessage("Hobbs fin, décollage et atterrissage sont obligatoires au check-out.");
      return;
    }

    await updateFlightOperation(ops.event.id,{
      status:"Complété",
      checkedOutAt:new Date().toISOString(),
      checkedOutBy:ops.dispatch.trim(),
      hobbsEnd:Number(ops.hobbsEnd),
      takeoffTime:ops.takeoffTime,
      landingTime:ops.landingTime,
      airtimeMinutes:airtime(ops.takeoffTime,ops.landingTime)
    });

    await markLinkedPTRLessonAfterCheckout(ops.event);
  }

  const completedMode=ops.mode;
  setOps(null);
  setMessage(`${completedMode==="checkin"?"Check-in":"Check-out"} enregistré.`);
}

function beginPointerDrag(event:React.PointerEvent, item:SchedulerEvent, mode:"move"|"start"|"end"){
  if(item.source==="snag")return;
  event.preventDefault();event.stopPropagation();
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  setDrag({event:item,mode,originX:event.clientX,originStart:item.startMinutes,originEnd:item.endMinutes,originResourceId:item.resourceId,currentResourceId:item.resourceId});
}
function resourceFromPoint(x:number,y:number){
  const element=document.elementFromPoint(x,y) as HTMLElement|null;
  return element?.closest<HTMLElement>("[data-resource-id]")?.dataset.resourceId||drag?.currentResourceId||"";
}
function previewDrag(event:React.PointerEvent){
  if(!drag)return;
  const delta=snap((event.clientX-drag.originX)/W*60,SNAP);
  const targetResource=resourceFromPoint(event.clientX,event.clientY);
  const duration=drag.originEnd-drag.originStart;
  let start=drag.originStart,end=drag.originEnd;
  if(drag.mode==="move"){start=clamp(drag.originStart+delta,START*60,END*60-duration);end=start+duration;}
  if(drag.mode==="start"){start=clamp(drag.originStart+delta,START*60,drag.originEnd-SNAP);}
  if(drag.mode==="end"){end=clamp(drag.originEnd+delta,drag.originStart+SNAP,END*60);}
  setDrag({...drag,currentResourceId:targetResource,event:{...drag.event,startMinutes:start,endMinutes:end,resourceId:targetResource||drag.event.resourceId,
    aircraftId:list.find(r=>r.id===targetResource&&r.kind==="aircraft")?targetResource:drag.event.aircraftId,
    instructorId:list.find(r=>r.id===targetResource&&r.kind==="instructor")?targetResource:drag.event.instructorId,
    roomId:list.find(r=>r.id===targetResource&&r.kind==="room")?targetResource:drag.event.roomId
  }});
}
async function finishPointerDrag(){
  if(!drag)return;
  const candidate=drag.event;
  if(conflict(candidate,allEvents)){setMessage("Déplacement refusé : conflit détecté.");setDrag(null);return;}
  await saveReservation(candidate,true);
  setMessage("Réservation déplacée.");setDrag(null);
}

if(loading>0)return<><PageHeader title="Horaire" subtitle="Chargement des opérations…"/><section className="card">Chargement…</section></>;
return<><PageHeader title="Horaire" subtitle="Réservations, check-in, check-out, retards et SNAG"/><div className="scheduler-toolbar"><button className="button secondary" onClick={()=>setDate(new Date().toISOString().slice(0,10))}>Aujourd’hui</button><input type="date" value={date} onChange={e=>setDate(e.target.value)}/><span className="scheduler-help">Plage {String(START).padStart(2,"0")}:00–{END===24?"24:00":`${String(END).padStart(2,"0")}:00`} · réglable par l’administrateur.</span></div>{error&&<div className="notice error">{error}</div>}{message&&<div className={message.includes("Conflit")||message.includes("bloqué")||message.includes("obligatoire")?"notice error":"notice"}>{message}</div>}<section className="scheduler-shell"><div className="scheduler-scroll"><div className="scheduler-grid" style={{minWidth:260+(END-START)*W}}><div className="resource-head">Ressources</div>{HOURS.map(h=><div className="hour-head" key={h}>{String(h).padStart(2,"0")}:00</div>)}{list.map((r,i,all)=>{const prev=all[i-1],currentGroup=r.groupLabel||r.detail.split(" · ")[0]||r.kind,previousGroup=prev?(prev.groupLabel||prev.detail.split(" · ")[0]||prev.kind):"",group=!prev||previousGroup!==currentGroup,row=visible.filter(e=>e.resourceId===r.id);return<div className="scheduler-row-wrapper" style={{gridTemplateColumns:`260px ${(END-START)*W}px`}} key={r.id}>{group&&<div className="resource-group">{r.kind==="aircraft"?`AVIONS — ${currentGroup}`:r.kind==="simulator"?"SIMULATEURS":r.kind==="instructor"?"INSTRUCTEURS":"LOCAUX"}</div>}<div className={`resource-cell ${r.blocked?"blocked":""}`}><strong>{r.name}</strong><span>{r.detail}</span>{r.kind==="aircraft"&&<a className="resource-emergency" href={`/emergency?aircraft=${r.id}`}>Urgence</a>}</div><div className="time-row" data-resource-id={r.id} onPointerMove={previewDrag} onPointerUp={finishPointerDrag} onPointerCancel={()=>setDrag(null)} onClick={m=>{if(drag)return;if(!(m.target as HTMLElement).closest(".schedule-event"))openCreate(r,m.clientX,m.currentTarget.getBoundingClientRect())}}>{HOURS.slice(0,-1).map((h,j)=><div className="hour-cell" style={{left:j*W}} key={h}/>)}{row.map(e=>{const left=((e.startMinutes-START*60)/60)*W,width=((e.endMinutes-e.startMinutes)/60)*W,isLate=late(e);return<div
  className={`schedule-event ${cls(e.type)} ${e.source==="snag"?"snag-block":""} ${isLate?"late-flight":""} ${drag?.event.id===e.id?"dragging":""}`}
  style={{
    left:drag?.event.id===e.id?((drag.event.startMinutes-START*60)/60)*W:left,
    width:drag?.event.id===e.id?((drag.event.endMinutes-drag.event.startMinutes)/60)*W:width
  }}
  key={e.id}
  onClick={x=>{
    x.stopPropagation();
    if(!drag&&e.source!=="snag")openEdit(e);
  }}
>
  <button
    className="resize-handle left"
    onClick={x=>x.stopPropagation()}
    onPointerDown={x=>beginPointerDrag(x,e,"start")}
    aria-label="Changer le début"
  />
  <button
    className="event-drag-handle"
    onClick={x=>x.stopPropagation()}
    onPointerDown={x=>beginPointerDrag(x,e,"move")}
    aria-label="Déplacer la réservation"
    title="Glisser pour déplacer"
  >⋮⋮</button>
  <div className="event-content">
    <strong>{label(e.startMinutes)}–{label(e.endMinutes)} {isLate&&"⚠ RETARD"}</strong>
    <span>{e.title}</span>
    <span>{e.studentName||e.status||""}</span>
    {e.lessonPdfPath&&<a className="event-plan-link" href={e.lessonPdfPath} target="_blank" rel="noreferrer" onClick={x=>x.stopPropagation()}>Plan</a>}
  </div>
  <button
    className="resize-handle right"
    onClick={x=>x.stopPropagation()}
    onPointerDown={x=>beginPointerDrag(x,e,"end")}
    aria-label="Changer la fin"
  />
  {e.source!=="snag"&&<div className="event-ops" onClick={x=>x.stopPropagation()} onPointerDown={x=>x.stopPropagation()}>
    <button
      type="button"
      onPointerDown={x=>x.stopPropagation()}
      onClick={x=>{x.stopPropagation();openOps(e,"checkin")}}
      title="Check-in"
    >IN</button>
    <button
      type="button"
      onPointerDown={x=>x.stopPropagation()}
      onClick={x=>{x.stopPropagation();openOps(e,"checkout")}}
      title="Check-out"
    >OUT</button>
  </div>}
</div>})}</div></div>})}</div></div></section><section className="card cancellation-card"><strong>Annulations récentes</strong>{cancellations.slice(0,5).map(x=><div className="cancellation-row" key={x.id}><span>{x.eventTitle}</span><span>{x.reason}</span></div>)}</section>
{draft&&<div className="modal-backdrop"><section className="modal" onClick={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()}><header><div><h2>{draft.id?"Modifier":"Nouvelle réservation"}</h2><p>{label(draft.startMinutes)} à {label(draft.endMinutes)}</p></div><button className="icon-button" onClick={()=>setDraft(null)}>×</button></header><div className="modal-body"><div className="form-grid"><label>Type<select value={draft.type} onChange={e=>setDraft({...draft,type:e.target.value as ActivityType})}>{TYPES.map(x=><option key={x}>{x}</option>)}</select></label><label>Date<input type="date" value={draft.date} onChange={e=>setDraft({...draft,date:e.target.value})}/></label><label>Début<input type="time" value={label(draft.startMinutes)} onChange={e=>{const[h,m]=e.target.value.split(":").map(Number);setDraft({...draft,startMinutes:h*60+m})}}/></label><label>Fin<input type="time" value={label(draft.endMinutes)} onChange={e=>{const[h,m]=e.target.value.split(":").map(Number);setDraft({...draft,endMinutes:h*60+m})}}/></label><label>Élève<select value={draft.studentId} onChange={e=>{const s=students.find(x=>x.id===e.target.value);setDraft({...draft,studentId:e.target.value,studentName:s?.name||""})}}><option value="">Aucun</option>{students.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label><label>Avion<select value={draft.aircraftId} onChange={e=>setDraft({...draft,aircraftId:e.target.value,resourceId:e.target.value||draft.resourceId})}><option value="">Aucun</option>{list.filter(x=>x.kind==="aircraft").map(x=><option disabled={x.blocked} value={x.id} key={x.id}>{x.name}{x.blocked?" — INDISPONIBLE":""}</option>)}</select></label><label>Instructeur<select value={draft.instructorId} onChange={e=>setDraft({...draft,instructorId:e.target.value})}><option value="">Aucun</option>{list.filter(x=>x.kind==="instructor").map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select></label><label>Local / simulateur<select value={draft.roomId} onChange={e=>{const resource=list.find(x=>x.id===e.target.value);setDraft({...draft,roomId:e.target.value,resourceId:e.target.value||draft.resourceId,type:resource?.kind==="simulator"?"Simulateur":draft.type})}}><option value="">Aucun</option>{list.filter(x=>x.kind==="room"||x.kind==="simulator").map(x=><option value={x.id} key={x.id}>{x.name} — {x.detail}</option>)}</select></label><label>Alerte retard (minutes)<input type="number" min="0" placeholder="Optionnel" value={draft.overdueAlertMinutes} onChange={e=>setDraft({...draft,overdueAlertMinutes:e.target.value})}/></label></div><label>Plan de leçon
      <select
        value={draft.lessonPlanId}
        onChange={e=>{
          const option=lessonOptions.find(item=>item.id===e.target.value);
          setDraft({
            ...draft,
            lessonPlanId:e.target.value,
            lessonTitle:option?.title||"",
            lessonPdfPath:option?.pdfPath||"",
            lessonComponentId:option?.componentId||"",
            title:option?.title||draft.title
          })
        }}
      >
        <option value="">Aucun plan de leçon</option>
        {lessonOptions.map(option=><option value={option.id} key={option.id}>{option.label}</option>)}
      </select>
    </label>
    {draft.lessonPdfPath&&<div className="lesson-prep-links">
      <a className="button secondary small" href={draft.lessonPdfPath} target="_blank" rel="noreferrer">Voir le plan PDF</a>
      {draft.studentId&&<a className="button secondary small" href={`/ptr/${draft.studentId}`} target="_blank" rel="noreferrer">Ouvrir le PTR de l’élève</a>}
    </div>}
    <label>Titre<input value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label><label>Notes<textarea value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label></div><footer>{draft.id&&<button className="button danger" onClick={()=>{const e=events.find(x=>x.id===draft.id);if(e)setDeleteEvent(e);setDraft(null)}}>Supprimer</button>}<span/><button className="button secondary" onClick={()=>setDraft(null)}>Annuler</button><button className="button" onClick={save}>Enregistrer</button></footer></section></div>}
{ops&&<div className="modal-backdrop"><section className="modal compact" onClick={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()}><header><div><h2>{ops.mode==="checkin"?"Check-in":"Check-out"}</h2><p>{ops.event.title}</p></div><button className="icon-button" onClick={()=>setOps(null)}>×</button></header><div className="modal-body"><label>Dispatch<input value={ops.dispatch} onChange={e=>setOps({...ops,dispatch:e.target.value})}/></label><div className="form-grid"><label>Hobbs départ<input type="number" step="0.1" value={ops.hobbsStart} onChange={e=>setOps({...ops,hobbsStart:e.target.value})}/></label>{ops.mode==="checkin"?<label>Alerte retard (minutes)<input type="number" min="0" value={ops.overdueAlertMinutes} onChange={e=>setOps({...ops,overdueAlertMinutes:e.target.value})}/></label>:<><label>Hobbs fin<input type="number" step="0.1" value={ops.hobbsEnd} onChange={e=>setOps({...ops,hobbsEnd:e.target.value})}/></label><label>Décollage<input type="time" value={ops.takeoffTime} onChange={e=>setOps({...ops,takeoffTime:e.target.value})}/></label><label>Atterrissage<input type="time" value={ops.landingTime} onChange={e=>setOps({...ops,landingTime:e.target.value})}/></label></>}</div>{ops.mode==="checkout"&&<div className="final-score"><span>Airtime calculé</span><strong>{airtime(ops.takeoffTime,ops.landingTime)??"—"} min</strong></div>}</div><footer><span/><button className="button secondary" onClick={()=>setOps(null)}>Annuler</button>{ops.mode==="checkout"&&ops.event.studentId&&ops.event.lessonPlanId&&<a
      className="button secondary"
      href={`/ptr/${ops.event.studentId}?lesson=${encodeURIComponent(ops.event.lessonPlanId)}&reservation=${encodeURIComponent(ops.event.id)}&checkout=1`}
      target="_blank"
      rel="noreferrer"
    >Évaluer les objectifs TC</a>}
    <button className="button" onClick={saveOps}>Enregistrer</button></footer></section></div>}
{deleteEvent&&<div className="modal-backdrop"><section className="modal compact" onClick={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()}><header><h2>Supprimer la réservation</h2></header><div className="modal-body"><label>Raison<select value={deleteReason} onChange={e=>setDeleteReason(e.target.value)}>{REASONS.map(x=><option key={x}>{x}</option>)}</select></label></div><footer><span/><button className="button secondary" onClick={()=>setDeleteEvent(null)}>Annuler</button><button className="button danger" onClick={async()=>{await removeReservation(deleteEvent,deleteReason);setDeleteEvent(null)}}>Confirmer</button></footer></section></div>}</>}

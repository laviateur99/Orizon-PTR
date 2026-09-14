import type {Aircraft,MaintenanceTask} from "@/features/fleet/types";

export type CalendarAircraftType="C152"|"C172"|"PA31";
export type CalendarChange={task:MaintenanceTask;aircraft:Aircraft;previous:string;next:string;updated:MaintenanceTask;manual:boolean};
const tidy=(value:string)=>value.replace(/\s+/g," ").trim();
const addMonths=(date:string,months:number)=>{const value=new Date(`${date}T12:00:00`);value.setMonth(value.getMonth()+months);return value.toISOString().slice(0,10)};
const matchesType=(aircraft:Aircraft,type:CalendarAircraftType)=>type==="C152"?/152/i.test(`${aircraft.model} ${aircraft.typeLabel}`):type==="C172"?/172/i.test(`${aircraft.model} ${aircraft.typeLabel}`):/PA-?31|Navajo/i.test(`${aircraft.model} ${aircraft.typeLabel}`);
const searchKey=(title:string)=>title.toUpperCase().replace(/[^A-ZÀ-Ÿ0-9 ]/g," ").split(/\s+/).filter(word=>word.length>2&&!/^(THE|AND|INSPECTION|REPLACE|VERIFICATION)$/.test(word)).slice(0,3).join(" ");

export async function readMaintenanceCalendar(file:File,onProgress:(message:string)=>void){
  const pdfjs=await import("pdfjs-dist");pdfjs.GlobalWorkerOptions.workerSrc="/pdf.worker.min.mjs";
  const pdf=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise,texts:string[]=[];
  for(let number=1;number<=Math.min(pdf.numPages,8);number++){
    onProgress(`Lecture de la page ${number} sur ${Math.min(pdf.numPages,8)}…`);
    const page=await pdf.getPage(number),content=await page.getTextContent();
    let text=tidy(content.items.map(item=>("str" in item?item.str:"")).join(" "));
    if(text.length<150){
      onProgress(`OCR local de la page ${number}…`);
      const viewport=page.getViewport({scale:1.7}),canvas=document.createElement("canvas");canvas.width=viewport.width;canvas.height=viewport.height;
      const context=canvas.getContext("2d");if(!context)throw new Error("Canvas OCR indisponible.");
      await page.render({canvasContext:context,viewport}).promise;
      const {createWorker}=await import("tesseract.js"),worker=await createWorker("eng",1,{langPath:"/ocr",workerPath:"/ocr/worker.min.js",corePath:"/ocr",logger:value=>{if(value.status==="recognizing text")onProgress(`OCR page ${number} — ${Math.round(value.progress*100)} %`)}});
      try{text=tidy((await worker.recognize(canvas)).data.text)}finally{await worker.terminate()}
    }
    texts.push(text);
  }
  const text=tidy(texts.join(" ")),revision=text.match(/REV(?:ISION)?\s*(?:#|NO|N°)?\s*[-:.]?\s*(\d+)/i)?.[1]||"À vérifier";
  if(text.length<300)throw new Error("Le calendrier n’a pas produit assez de texte. Vérification manuelle requise.");
  return{text,revision,pages:pdf.numPages};
}

export function compareCalendar(text:string,type:CalendarAircraftType,aircraft:Aircraft[],tasks:MaintenanceTask[]):CalendarChange[]{
  const normalized=tidy(text.toUpperCase()),changes:CalendarChange[]=[];
  for(const plane of aircraft.filter(item=>matchesType(item,type))){
    for(const task of tasks.filter(item=>item.aircraftId===plane.id&&!item.completed)){
      const key=searchKey(task.title);if(key.length<4)continue;
      const index=normalized.indexOf(key);if(index<0)continue;
      const area=normalized.slice(index,index+260),values=[...area.matchAll(/(\d{1,4})\s*(HRS?|HEURES?|HOURS?|MONTHS?|MOIS|YEARS?|ANS?)/g)].map(match=>({value:Number(match[1]),unit:match[2]}));
      if(values.length<2)continue;
      const interval=values[0],tolerance=values[values.length-1],updated={...task};
      if(/HR|HEURE|HOUR/.test(interval.unit))updated.intervalHours=interval.value;
      else if(/MONTH|MOIS/.test(interval.unit))updated.intervalMonths=interval.value;
      else updated.intervalMonths=interval.value*12;
      if(/HR|HEURE|HOUR/.test(tolerance.unit))updated.toleranceHours=tolerance.value;
      else if(/MONTH|MOIS/.test(tolerance.unit))updated.toleranceMonths=tolerance.value;
      else updated.toleranceMonths=tolerance.value*12;
      let manual=false;
      if(updated.intervalHours!==undefined){if(task.lastCompletedAirTime!==undefined)updated.dueAirTime=task.lastCompletedAirTime+updated.intervalHours;else manual=true}
      if(updated.intervalMonths!==undefined){if(task.lastCompletedDate)updated.dueDate=addMonths(task.lastCompletedDate,updated.intervalMonths);else manual=true}
      const previous=`Intervalle ${task.intervalHours?`${task.intervalHours} h`:task.intervalMonths?`${task.intervalMonths} mois`:"—"} · Tolérance ${task.toleranceHours?`${task.toleranceHours} h`:task.toleranceMonths?`${task.toleranceMonths} mois`:"—"}`;
      const next=`Intervalle ${updated.intervalHours?`${updated.intervalHours} h`:updated.intervalMonths?`${updated.intervalMonths} mois`:"—"} · Tolérance ${updated.toleranceHours?`${updated.toleranceHours} h`:updated.toleranceMonths?`${updated.toleranceMonths} mois`:"—"}`;
      if(previous!==next)changes.push({task,aircraft:plane,previous,next,updated,manual});
    }
  }
  return changes;
}

export async function archiveCalendarPdf(file:File,type:CalendarAircraftType,revision:string){
  const request=indexedDB.open("orizon-maintenance-calendars",1);
  const database=await new Promise<IDBDatabase>((resolve,reject)=>{request.onupgradeneeded=()=>request.result.createObjectStore("pdfs",{keyPath:"id"});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
  await new Promise<void>((resolve,reject)=>{const transaction=database.transaction("pdfs","readwrite");transaction.objectStore("pdfs").put({id:`${type}-${revision}-${Date.now()}`,type,revision,name:file.name,file,importedAt:new Date().toISOString()});transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error)});database.close();
}

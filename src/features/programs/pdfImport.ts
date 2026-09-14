import type {ManagedTrainingProgram} from "./management";

const tidy=(value:string)=>value.replace(/\s+/g," ").trim();
const titleFrom=(text:string,number:number)=>{
 const match=text.match(new RegExp(`(?:PLAN\\s+DE\\s+)?LE[ÇC]ON\\s*(?:N[Oº°]?\\.?\\s*)?${number}\\s*[-–—:]?\\s*([^|]{3,100})`,"i"));
 return tidy(match?.[1]||`Leçon ${number}`).split(/(?:OBJECTIF|BUT|EXERCICE|DURÉE|NORME)/i)[0].trim()||`Leçon ${number}`;
};

export async function importProgramPdf(file:File,onProgress:(message:string)=>void):Promise<ManagedTrainingProgram>{
 onProgress("Lecture du PDF…");
 const pdfjs=await import("pdfjs-dist");
 pdfjs.GlobalWorkerOptions.workerSrc="/pdf.worker.min.mjs";
 const pdf=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise;
 const pages:Array<{page:number;text:string}>=[];
 for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
  onProgress(`Analyse de la page ${pageNumber} sur ${pdf.numPages}…`);
  const page=await pdf.getPage(pageNumber),content=await page.getTextContent();
  pages.push({page:pageNumber,text:tidy(content.items.map(item=>("str" in item?item.str:"")).join(" "))});
 }
 const grouped=new Map<number,{pages:number[];text:string}>();
 for(const page of pages){
  const matches=[...page.text.matchAll(/(?:PLAN\s+DE\s+)?LE[ÇC]ON\s*(?:N[Oº°]?\.?\s*)?(\d{1,3})/gi)];
  const number=Number(matches[0]?.[1]);if(!number)continue;
  const current=grouped.get(number)||{pages:[],text:""};current.pages.push(page.page);current.text=tidy(`${current.text} ${page.text}`);grouped.set(number,current);
 }
 const entries=[...grouped.entries()].sort((a,b)=>a[0]-b[0]);
 const lessons=(entries.length?entries:[[1,{pages:pages.map(item=>item.page),text:pages.map(item=>item.text).join(" ")}]] as const).map(([number,data])=>{
  const objective=(data.text.match(/OBJECTIF[S]?\s*[:–-]?\s*(.*?)(?=EXERCICE[S]?|NORME|DURÉE|$)/i)?.[1]||"").trim();
  const criteria=(data.text.match(/NORME(?:\s+DE\s+RÉUSSITE)?\s*[:–-]?\s*(.*?)(?=LE[ÇC]ON\s+SUIVANTE|$)/i)?.[1]||"").trim();
  const title=titleFrom(data.text,number);
  return{number,phase:1,phaseName:"Phase 1",title,objectives:objective?[objective]:[],exercises:[],successCriteria:criteria?[criteria]:[],components:[{number,phase:1,modality:"Double commande",category:"Formation en vol",title,objective,hours:{sol:0,dev:0,doubleCommande:0,solo:0},exercises:[],nextLesson:"",successCriteria:criteria,manualPage:data.pages[0],manualPdfPage:data.pages[0]}]};
 });
 const name=file.name.replace(/\.pdf$/i,"").replace(/[-_]+/g," ");
 return{id:`programme-${Date.now()}`,name,organization:"Orizon Aviation",revision:"À vérifier",effectiveDate:new Date().toISOString().slice(0,10),source:`Importé de ${file.name}`,programType:"integrated",catalogKind:"program",moduleIds:[],lessonCount:lessons.length,componentCount:lessons.length,phases:[{number:1,name:"Phase 1"}],lessons,managed:true};
}

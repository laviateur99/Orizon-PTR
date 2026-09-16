import{addDoc,collection,deleteDoc,doc,getDoc,getDocs,onSnapshot,serverTimestamp,setDoc,updateDoc,writeBatch,type DocumentData,type FirestoreError,type Unsubscribe}from"firebase/firestore";
import{db}from"@/services/firebase/client";
import type{TrainingEmailTemplate,TrainingQuote,TrainingQuoteTemplate,TrainingRate,TrainingTaxSettings,TrainingTemplateRateChange}from"./types";
import{defaultTrainingQuoteTemplates}from"./templates";
type Handlers<T>={next:(items:T[])=>void;error:(error:FirestoreError)=>void};
const text=(v:unknown)=>typeof v==="string"?v:"",number=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)?v:Number(v)||0;
const withoutUndefined=(value:unknown):unknown=>Array.isArray(value)?value.map(withoutUndefined):value&&typeof value==="object"&&Object.getPrototypeOf(value)===Object.prototype?Object.fromEntries(Object.entries(value).filter(([,item])=>item!==undefined).map(([key,item])=>[key,withoutUndefined(item)])):value;
const mapPriceHistory=(value:unknown):TrainingRate["priceHistory"]=>Array.isArray(value)?value.filter((item):item is Record<string,unknown>=>Boolean(item)&&typeof item==="object").map(item=>({price:number(item.price),effectiveDate:text(item.effectiveDate),recordedAt:text(item.recordedAt)})):undefined;
const mapRate=(id:string,d:DocumentData):TrainingRate=>({id,rateId:text(d.rateId)||id,name:text(d.name),category:d.category,description:text(d.description),price:number(d.price),unit:d.unit,taxable:d.taxable===true,externalFee:d.externalFee===true,active:d.active!==false,effectiveDate:text(d.effectiveDate),aircraftId:text(d.aircraftId)||undefined,aircraftType:text(d.aircraftType)||undefined,resourceId:text(d.resourceId)||undefined,priceHistory:mapPriceHistory(d.priceHistory),t2202Eligible:d.t2202Eligible===true,tp752Eligible:d.tp752Eligible===true,createdAt:d.createdAt,updatedAt:d.updatedAt});
const mapQuote=(id:string,d:DocumentData):TrainingQuote=>({id,quoteNumber:text(d.quoteNumber),date:text(d.date),expirationDate:text(d.expirationDate),customerType:d.customerType==="student"?"student":"prospect",studentId:text(d.studentId)||undefined,customerName:text(d.customerName),customerPhone:text(d.customerPhone),customerEmail:text(d.customerEmail),trainingType:text(d.trainingType),notes:text(d.notes),customPdfNote:text(d.customPdfNote)||undefined,status:d.status,lines:Array.isArray(d.lines)?d.lines:[],subtotal:number(d.subtotal),orizonSubtotal:typeof d.orizonSubtotal==="number"?d.orizonSubtotal:number(d.subtotal),externalFees:number(d.externalFees),gstRate:typeof d.gstRate==="number"?d.gstRate:5,qstRate:typeof d.qstRate==="number"?d.qstRate:9.975,gst:number(d.gst),qst:number(d.qst),taxes:number(d.taxes),total:number(d.total),templateId:text(d.templateId)||undefined,sentAt:d.sentAt,sentTo:text(d.sentTo)||undefined,createdBy:text(d.createdBy),createdAt:d.createdAt,updatedAt:d.updatedAt});
const mapTemplate=(id:string,d:DocumentData):TrainingQuoteTemplate=>({id,name:text(d.name),trainingType:text(d.trainingType),active:d.active!==false,sourceDocument:text(d.sourceDocument),description:text(d.description)||undefined,lines:Array.isArray(d.lines)?d.lines:[],createdAt:d.createdAt,updatedAt:d.updatedAt});
const mapEmailTemplate=(id:string,d:DocumentData):TrainingEmailTemplate=>({id,trainingTemplateId:text(d.trainingTemplateId),trainingType:text(d.trainingType),subject:text(d.subject),body:text(d.body),createdAt:d.createdAt,updatedAt:d.updatedAt});
export function subscribeTrainingRates(h:Handlers<TrainingRate>):Unsubscribe{return onSnapshot(collection(db,"trainingRates"),s=>h.next(s.docs.map(x=>mapRate(x.id,x.data())).sort((a,b)=>a.category.localeCompare(b.category)||a.name.localeCompare(b.name))),h.error)}
export function subscribeTrainingQuotes(h:Handlers<TrainingQuote>):Unsubscribe{return onSnapshot(collection(db,"trainingQuotes"),s=>h.next(s.docs.map(x=>mapQuote(x.id,x.data())).sort((a,b)=>b.date.localeCompare(a.date)||b.quoteNumber.localeCompare(a.quoteNumber))),h.error)}
export function subscribeTrainingQuote(id:string,next:(quote:TrainingQuote|null)=>void,error:(error:FirestoreError)=>void):Unsubscribe{return onSnapshot(doc(db,"trainingQuotes",id),s=>next(s.exists()?mapQuote(s.id,s.data()):null),error)}
export function subscribeTrainingQuoteTemplates(h:Handlers<TrainingQuoteTemplate>):Unsubscribe{return onSnapshot(collection(db,"trainingQuoteTemplates"),s=>h.next(s.docs.map(x=>mapTemplate(x.id,x.data())).sort((a,b)=>a.name.localeCompare(b.name))),h.error)}
export function subscribeTrainingEmailTemplates(h:Handlers<TrainingEmailTemplate>):Unsubscribe{return onSnapshot(collection(db,"trainingEmailTemplates"),s=>h.next(s.docs.map(x=>mapEmailTemplate(x.id,x.data())).sort((a,b)=>a.trainingType.localeCompare(b.trainingType))),h.error)}
export async function ensureTrainingQuoteTemplates(){const snapshot=await getDocs(collection(db,"trainingQuoteTemplates")),existing=new Set(snapshot.docs.map(item=>item.id));await Promise.all(defaultTrainingQuoteTemplates.filter(template=>!existing.has(template.id)).map(template=>{const{id,...data}=template;return setDoc(doc(db,"trainingQuoteTemplates",id),{...withoutUndefined(data) as Record<string,unknown>,createdAt:serverTimestamp(),updatedAt:serverTimestamp()})}))}
export async function saveTrainingQuoteTemplate(template:TrainingQuoteTemplate){const{id,...data}=template;await setDoc(doc(db,"trainingQuoteTemplates",id),{...withoutUndefined(data) as Record<string,unknown>,updatedAt:serverTimestamp()},{merge:true})}
export function subscribeTrainingTaxSettings(next:(value:TrainingTaxSettings)=>void,error:(error:FirestoreError)=>void):Unsubscribe{return onSnapshot(doc(db,"trainingQuoteSettings","taxes"),s=>{const d=s.data();next({gstRate:typeof d?.gstRate==="number"?d.gstRate:5,qstRate:typeof d?.qstRate==="number"?d.qstRate:9.975,updatedAt:d?.updatedAt})},error)}
export async function saveTrainingTaxSettings(settings:TrainingTaxSettings){await setDoc(doc(db,"trainingQuoteSettings","taxes"),{gstRate:Number(settings.gstRate),qstRate:Number(settings.qstRate),updatedAt:serverTimestamp()},{merge:true})}
export async function saveTrainingRate(rate:TrainingRate){
  const{id,...data}=rate,ref=id?doc(db,"trainingRates",id):doc(collection(db,"trainingRates"));
  let priceHistory=rate.priceHistory;
  if(id){
    const current=await getDoc(ref);
    if(current.exists()){
      const previous=mapRate(current.id,current.data());
      if(previous.price!==rate.price){
        const entry={price:previous.price,effectiveDate:previous.effectiveDate,recordedAt:new Date().toISOString()};
        const existing=previous.priceHistory||[];
        const isDuplicate=existing.some(item=>item.price===entry.price&&item.effectiveDate===entry.effectiveDate);
        priceHistory=isDuplicate?existing:[...existing,entry];
      }else{
        priceHistory=previous.priceHistory;
      }
    }
  }
  await setDoc(ref,{...withoutUndefined({...data,priceHistory}) as Record<string,unknown>,updatedAt:serverTimestamp(),...(!id?{createdAt:serverTimestamp()}: {})},{merge:true});
  return ref.id;
}
export async function setTrainingRateActive(id:string,active:boolean){await updateDoc(doc(db,"trainingRates",id),{active,updatedAt:serverTimestamp()})}
export async function saveTrainingEmailTemplate(template:TrainingEmailTemplate){const{id,...data}=template;await setDoc(doc(db,"trainingEmailTemplates",id),{...withoutUndefined(data) as Record<string,unknown>,updatedAt:serverTimestamp()},{merge:true})}
export async function saveTrainingQuote(quote:TrainingQuote){const{id,...data}=quote,payload=withoutUndefined(data) as Record<string,unknown>;if(id){await setDoc(doc(db,"trainingQuotes",id),{...payload,updatedAt:serverTimestamp()},{merge:true});return id}const ref=await addDoc(collection(db,"trainingQuotes"),{...payload,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});return ref.id}
export async function deleteTrainingQuote(id:string){await deleteDoc(doc(db,"trainingQuotes",id))}
export async function syncTrainingQuoteTemplatePrices(templates:TrainingQuoteTemplate[],changes:TrainingTemplateRateChange[]){const grouped=new Map<string,Map<string,number>>();for(const change of changes){const lines=grouped.get(change.templateId)||new Map<string,number>();lines.set(change.lineId,change.newPrice);grouped.set(change.templateId,lines)}const batch=writeBatch(db);for(const template of templates){const prices=grouped.get(template.id);if(!prices)continue;batch.update(doc(db,"trainingQuoteTemplates",template.id),{lines:template.lines.map(line=>line.fixedUnitPrice!==undefined?line:prices.has(line.id)?{...line,defaultUnitPrice:prices.get(line.id)}:line),updatedAt:serverTimestamp()})}await batch.commit()}

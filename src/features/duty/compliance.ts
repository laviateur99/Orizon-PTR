import { studentBreakKey, confirmedStudentBreak } from "./breaks";
import type { SchedulerEvent } from "@/features/scheduler/types";

export type ComplianceIssue={severity:"warning"|"block";personId:string;personName:string;message:string;breakKey?:string};
type Person={id:string;name:string};
type Role="student"|"instructor";
type Item={event:SchedulerEvent;start:number;end:number;duration:number;flight:number};
const DAY=86_400_000;
const at=(date:string,minutes:number)=>new Date(`${date}T00:00:00`).getTime()+minutes*60_000;
const dateFrom=(value:string,days:number)=>{const date=new Date(`${value}T12:00:00`);date.setDate(date.getDate()-days);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;};
const flight=(event:SchedulerEvent,role:Role)=>{
  if(role==="student"&&!['Double commande','Solo'].includes(event.type))return 0;
  if(role==="instructor"&&event.type!=="Double commande")return 0;
  if(event.hobbsStart!==undefined&&event.hobbsEnd!==undefined)return Math.max(0,event.hobbsEnd-event.hobbsStart);
  if(event.airtimeMinutes!==undefined)return event.airtimeMinutes/60;
  return Math.max(0,event.endMinutes-event.startMinutes)/60;
};
const belongs=(event:SchedulerEvent,id:string,role:Role)=>role==="instructor"
  ?event.instructorId===id
  :event.studentId===id||Boolean(event.participantStudentIds?.includes(id));
const itemsFor=(candidate:SchedulerEvent,events:SchedulerEvent[],id:string,role:Role):Item[]=>[
  ...events.filter(event=>event.id!==candidate.id),candidate
].filter(event=>event.status!=="Annulé"&&belongs(event,id,role)&&!(role==="student"&&event.theoreticalSessionId&&event.theoryAttendance?.[id]==="Absent"))
 .map(event=>({event,start:at(event.date,event.startMinutes),end:at(event.date,event.endMinutes),duration:(event.endMinutes-event.startMinutes)/60,flight:flight(event,role)}))
 .sort((a,b)=>a.start-b.start);

function assess(candidate:SchedulerEvent,events:SchedulerEvent[],person:Person,role:Role):ComplianceIssue[]{
  const values=itemsFor(candidate,events,person.id,role),index=values.findIndex(item=>item.event.id===candidate.id);
  if(index<0)return[];
  const current=values[index],issues:ComplianceIssue[]=[];
  const add=(severity:ComplianceIssue["severity"],message:string)=>issues.push({severity,personId:person.id,personName:person.name,message});
  let first=index,last=index;
  while(first>0&&(values[first].start-values[first-1].end)/3_600_000<8)first--;
  while(last<values.length-1&&(values[last+1].start-values[last].end)/3_600_000<8)last++;
  const service=(values[last].end-values[first].start)/3_600_000;
  if(service>13)add("block",`la réservation porterait la période de service à ${service.toFixed(1)} h (limite : 13 h)`);
  const flightLimit=role==="instructor"?12:8;
  const endpoints=values.filter(item=>item.end>=current.end&&item.end<=current.end+DAY).map(item=>item.end);
  const flight24=Math.max(0,...endpoints.map(end=>values.filter(item=>item.end>end-DAY&&item.start<=end).reduce((sum,item)=>sum+item.flight,0)));
  if(flight24>flightLimit)add("block",`la réservation porterait le temps de vol à ${flight24.toFixed(1)} h sur 24 h (limite : ${flightLimit} h)`);
  ([{days:28,limit:112},{days:90,limit:300},{days:365,limit:1000}] as const).forEach(rule=>{
    const from=dateFrom(candidate.date,rule.days-1);
    const total=values.filter(item=>item.event.date>=from&&item.event.date<=candidate.date).reduce((sum,item)=>sum+item.flight,0);
    if(total>rule.limit)add("block",`le cumul atteindrait ${total.toFixed(1)} h sur ${rule.days} jours (limite : ${rule.limit} h)`);
  });
  const sameDay=values.filter(item=>item.event.date===candidate.date);
  if(role==="student"){
    const dayIndex=sameDay.findIndex(item=>item.event.id===candidate.id),previous=sameDay[dayIndex-1],next=sameDay[dayIndex+1];
    const assessBreak = (before: Item, after: Item) => {
      const pause = (after.start-before.end)/60_000, required = before.duration*60*.15;
      if (pause < required && !confirmedStudentBreak(before.event, after.event, person.id))
        issues.push({severity:"warning", personId:person.id, personName:person.name,
          breakKey:studentBreakKey(before.event, after.event, person.id),
          message:`pause entre « ${before.event.title} » et « ${after.event.title} » : ${Math.max(0,pause).toFixed(0)} min à l’horaire; ${required.toFixed(0)} min prévues par la règle de pause`});
    };
    if(previous) assessBreak(previous, current);
    if(next) assessBreak(current, next);
  }
  const previousDay=values.slice(0,index).reverse().find(item=>item.event.date!==candidate.date),nextDay=values.slice(index+1).find(item=>item.event.date!==candidate.date);
  if(previousDay){const rest=(current.start-previousDay.end)/3_600_000;if(rest<8)add("warning",`le repos avant cette activité ne serait que de ${Math.max(0,rest).toFixed(1)} h; 8 h de sommeil doivent être possibles`);}
  if(nextDay){const rest=(nextDay.start-current.end)/3_600_000;if(rest<8)add("warning",`le repos après cette activité ne serait que de ${Math.max(0,rest).toFixed(1)} h; 8 h de sommeil doivent être possibles`);}
  const activeDates=new Set(values.map(item=>item.event.date));
  const free7=Array.from({length:7},(_,offset)=>dateFrom(candidate.date,offset)).filter(date=>!activeDates.has(date)).length;
  const free28=Array.from({length:28},(_,offset)=>dateFrom(candidate.date,offset)).filter(date=>!activeDates.has(date)).length;
  if(free7<1)add("block","aucune journée sans service ne resterait dans la période de 7 jours");
  if(free28<4)add("block",`seulement ${free28} journée(s) sans service resteraient dans la période de 28 jours (minimum : 4)`);
  return issues;
}

export function checkScheduleCompliance(candidate:SchedulerEvent,events:SchedulerEvent[],students:Person[],instructors:Person[]){
  const issues:ComplianceIssue[]=[];
  const studentIds=[candidate.studentId,...(candidate.participantStudentIds||[])].filter((id):id is string=>Boolean(id));
  [...new Set(studentIds)].forEach(id=>issues.push(...assess(candidate,events,students.find(item=>item.id===id)||{id,name:id},"student")));
  if(candidate.instructorId)issues.push(...assess(candidate,events,instructors.find(item=>item.id===candidate.instructorId)||{id:candidate.instructorId,name:candidate.instructorId},"instructor"));
  return issues;
}

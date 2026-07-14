export type ResourceKind = "aircraft" | "instructor" | "room";
export type SchedulerResource = { id:string; kind:ResourceKind; name:string; detail:string; blocked?:boolean };
export type ActivityType = "Double commande" | "Solo" | "Sol" | "Simulateur" | "Examen" | "Maintenance" | "Hors service";
export type FlightStatus = "Planifié" | "Check-in" | "En vol" | "Complété" | "Annulé";
export type SchedulerEvent = {
  id:string; date:string; resourceId:string; aircraftId?:string; instructorId?:string; roomId?:string; studentId?:string; studentName?:string;
  type:ActivityType; startMinutes:number; endMinutes:number; title:string; notes?:string; source?:"reservation"|"snag"; snagId?:string; rangeEndDate?:string;
  status?:FlightStatus; checkedInAt?:string; checkedInBy?:string; checkedOutAt?:string; checkedOutBy?:string;
  hobbsStart?:number; hobbsEnd?:number; takeoffTime?:string; landingTime?:string; airtimeMinutes?:number; overdueAlertMinutes?:number;
};
export type Cancellation = {id:string;eventId:string;eventTitle:string;reason:string;cancelledAt:string};
export type FlightOperationUpdate = Partial<Pick<SchedulerEvent,"status"|"checkedInAt"|"checkedInBy"|"checkedOutAt"|"checkedOutBy"|"hobbsStart"|"hobbsEnd"|"takeoffTime"|"landingTime"|"airtimeMinutes"|"overdueAlertMinutes">>;

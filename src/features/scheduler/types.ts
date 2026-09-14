export type ResourceKind = "aircraft" | "instructor" | "room" | "simulator";
export type SchedulerResource = { id:string; kind:ResourceKind; name:string; detail:string; blocked?:boolean; status?:string; statusReason?:string; groupLabel?:string; order?:number; maintenanceStartAt?:string; expectedReturnAt?:string };
export type ActivityType = "Double commande" | "Solo" | "Sol" | "Simulateur" | "Examen" | "Maintenance" | "Hors service" | "Supervision solo" | "Administration" | "Cours théorique" | "Test en vol" | "Vol de navigation AEC DEC" | "Vol de P/D double" | "Vol de P/D solo";
export type FlightStatus = "Planifié" | "Check-in" | "En vol" | "Complété" | "Annulé";
export type StudentBreakConfirmation = { key: string; studentId: string; confirmedBy: string; confirmedByName: string; confirmedAt: string };
export type SchedulerEvent = {
  id:string; date:string; resourceId:string; primaryResourceId?:string; aircraftId?:string; instructorId?:string; roomId?:string; studentId?:string; studentName?:string;
  participantStudentIds?:string[]; participantStudentNames?:string[]; theoreticalSessionId?:string;
  theoryAttendance?:Record<string,"Présent"|"Absent">;
  type:ActivityType; reservationType?:"Flight"|"Ground"|"Simulator"|"Maintenance"; startMinutes:number; endMinutes:number; title:string; notes?:string; source?:"reservation"|"snag"|"leave"|"maintenanceWorkOrder"; snagId?:string; maintenanceWorkOrderId?:string; prmName?:string; technicianName?:string; rangeEndDate?:string;
  lessonPlanId?:string; lessonTitle?:string; lessonPdfPath?:string; lessonComponentId?:string; simulatorTcId?:string;
  status?:FlightStatus; checkedInAt?:string; checkedInBy?:string; checkedOutAt?:string; checkedOutBy?:string;
  hobbsStart?:number; hobbsEnd?:number; hobbsElapsed?:number; actualDurationHours?:number; takeoffTime?:string; landingTime?:string; airtimeMinutes?:number; groundTimeHours?:number; overdueAlertMinutes?:number;
  flightCrewRole?:"Double"|"PIC"; dayHours?:number; nightHours?:number; instrumentAircraftHours?:number; ftdHours?:number;
  crossCountryDayHours?:number; crossCountryNightHours?:number; routeFrom?:string; routeTo?:string;
  checkInMetar?:string; checkOutMetar?:string; metarStation?:string;
  studentBreakConfirmations?: StudentBreakConfirmation[];
  complianceOverrideReason?:string;
};
export type Cancellation = {id:string;eventId:string;eventTitle:string;reason:string;comment?:string;cancelledAt:string};
export type FlightOperationUpdate = Partial<Pick<SchedulerEvent,"status"|"checkedInAt"|"checkedInBy"|"checkedOutAt"|"checkedOutBy"|"hobbsStart"|"hobbsEnd"|"takeoffTime"|"landingTime"|"airtimeMinutes"|"groundTimeHours"|"overdueAlertMinutes"|"checkInMetar"|"checkOutMetar"|"metarStation"|"flightCrewRole"|"dayHours"|"nightHours"|"instrumentAircraftHours"|"ftdHours"|"crossCountryDayHours"|"crossCountryNightHours"|"routeFrom"|"routeTo">>;

export function canDeleteReservation(event: SchedulerEvent): boolean {
  return !event.checkedInAt && !event.checkedOutAt && !["Check-in", "En vol", "Complété"].includes(event.status || "");
}

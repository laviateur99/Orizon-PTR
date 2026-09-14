export type ProgressLesson={id:string;studentId:string;programId:string;lessonNumber:string;status:string;phase:string;linkedReservationId:string;updatedAt:string};
export type ProgressActivity={id:string;studentId:string;participantStudentIds:string[];instructorId:string;date:string;startMinutes:number;endMinutes:number;type:string;status:string;lessonPlanId:string;hobbsStart?:number;hobbsEnd?:number;airtimeMinutes?:number;groundTimeHours?:number;notes:string;cancellationReason:string};
export type ProgressStatus="En avance"|"Conforme"|"À surveiller"|"En retard"|"Critique"|"Non configuré";
export type ProgressThresholds={inactiveWarningDays:number;inactiveCriticalDays:number;watchGapPercent:number;lateGapPercent:number;criticalGapPercent:number};

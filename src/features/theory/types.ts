export type TheoryCohort={
  id:string;
  name:string;
  program:string;
  studentIds:string[];
};

export type TheorySession={
  id:string;
  title:string;
  program:string;
  topic:string;
  date:string;
  startTime:string;
  endTime:string;
  instructorId:string;
  instructorName:string;
  roomId:string;
  roomName:string;
  cohortId:string;
  cohortName:string;
  studentIds:string[];
  studentNames:string[];
  additionalStudentIds?:string[];
  additionalParticipantsVersion?:number;
  attendance:Record<string,"Présent"|"Absent">;
  status:"Planifiée"|"Complétée"|"Annulée";
  notes:string;
};

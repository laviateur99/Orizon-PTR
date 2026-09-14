export type TrainingCohortStatus="Planifiée"|"Active"|"Terminée"|"Archivée";
export type TrainingCohort={
 id:string;
 name:string;
 programId:string;
 startDate:string;
 endDate?:string;
 status:TrainingCohortStatus;
 studentIds:string[];
 createdBy:string;
 createdAt:string;
 updatedBy:string;
 updatedAt:string;
};

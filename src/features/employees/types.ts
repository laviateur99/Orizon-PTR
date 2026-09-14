import type { UserRole } from "@/features/auth/types";

export type EmployeeQualificationStatus="valid"|"expiring"|"expired"|"missing"|"not-applicable";
export type EmployeeQualification={
 id:string;employeeId:string;qualificationType:"flight"|"aircraft"|"instructor-class"|"mandatory-training"|"other";
 qualificationName:string;issuedAt?:string;expiresAt?:string;status:EmployeeQualificationStatus;notes?:string;
 createdAt?:string;updatedAt?:string;source:"instructor-document"|"employee-training"|"instructor-record"|"employee-aircraft-qualification"|"employee-compliance";
};
export type EmployeeAircraftQualification=EmployeeQualification&{
 aircraftType:string;qualificationType:"aircraft"|"flight";completedAt?:string;
 status:"valid"|"not-applicable";createdBy:PayrollActor;createdAt:string;updatedBy:PayrollActor;updatedAt:string;
};
export type EmployeeQualificationHistory={id:string;employeeId:string;qualificationId:string;action:string;previousValue:unknown;newValue:unknown;reason:string;actor:PayrollActor;eventAt:string};
export type EmployeeComplianceRecord=
 |{id:string;employeeId:string;recordType:"medical";examDate:string;calculatedExpiry:string;officialExpiry?:string;manualOverrideReason?:string;previousExpiry?:string;updatedBy:PayrollActor;updatedAt:string}
 |{id:string;employeeId:string;recordType:"instructor-rating";instructorClass:"Classe 1"|"Classe 2"|"Classe 3"|"Classe 4";testDate:string;calculatedExpiry:string;officialExpiry?:string;renewalMethod?:string;manualOverrideReason?:string;previousExpiry?:string;updatedBy:PayrollActor;updatedAt:string}
 |{id:string;employeeId:string;recordType:"ifr-recency";ifrHeld:boolean;ifrGroup:string;eventType:"Test en vol IFR"|"IPC"|"PPC"|"PCC"|"Autre";eventDate:string;cycleEnd:string;sixSixRequiredFrom:string;instrumentHours:number;instrumentApproaches:number;instrumentExperienceAsOf?:string;notes?:string;updatedBy:PayrollActor;updatedAt:string};

export type EmployeeCommunication={
 id:string;title:string;body:string;audienceRoles:UserRole[];required:boolean;active:boolean;
 createdAt:string;createdBy:string;createdByName:string;
};
export type CommunicationAcknowledgement={
 id:string;communicationId:string;uid:string;name:string;email:string;readAt:string;
};

export type LeaveType="Vacances"|"Férié"|"Maladie"|"Sans solde";
export type LeaveStatus="En attente"|"Approuvé"|"Refusé";
export type EmployeeLeave={
 id:string;employeeId:string;employeeName:string;employeeRole:UserRole;type:LeaveType;
 startDate:string;endDate:string;hoursPerDay:number;status:LeaveStatus;notes:string;
 requestedBy:string;requestedAt:string;reviewedBy?:string;reviewedByName?:string;reviewedAt?:string;
};

export type TimeClockEntry={
 id:string;employeeId:string;employeeName:string;date:string;clockIn:string;clockOut:string;
 breakMinutes:number;notes:string;status:"Ouvert"|"Complété";createdBy:string;
};

export type PayrollCategory="Vol"|"Débriefing"|"Sol préparatoire"|"Théorie"|"Simulateur"|"Autre"|"Vacances"|"Férié"|"Maladie"|"Sans solde";
export type TimeEntrySource="scheduler"|"manual"|"timeClock"|"leave"|"admin";
export type TimeEntryComponent="activity"|"briefing"|"adjustment";
export type TimeEntryStatus="Brouillon"|"Soumis employé"|"Approuvé administration"|"Verrouillé"|"Correction requise"|"Refusé"|"Ajustement";
export type PayrollActor={uid:string;name:string;role:string};
export type TimeEntry={
 id:string;employeeId:string;employeeName:string;category:PayrollCategory;workDate:string;durationHours:number;
 source:TimeEntrySource;sourceId:string;sourceComponent:TimeEntryComponent;payPeriodId:string;status:TimeEntryStatus;
 reservationId?:string;studentId?:string;aircraftId?:string;activityType?:string;description?:string;
 rateSnapshot?:number;bonusSnapshot?:number;amountSnapshot?:number;
 createdBy:PayrollActor;createdAt:string;updatedBy?:PayrollActor;updatedAt:string;
 submittedBy?:PayrollActor;submittedAt?:string;approvedBy?:PayrollActor;approvedAt?:string;
 correctionReason?:string;replacesEntryId?:string;
 validationMode?:"Tests internes Flight Director";
};
export type PayPeriodStatus="Ouverte"|"Validation"|"Approbation administration"|"Approbation comptabilité"|"Approuvée"|"Exportée"|"Verrouillée";
export type PayPeriod={id:string;startDate:string;endDate:string;status:PayPeriodStatus;validationMode?:"Tests internes Flight Director";administrationApprovedBy?:PayrollActor;administrationApprovedAt?:string;accountingApprovedBy?:PayrollActor;accountingApprovedAt?:string;approvedBy?:PayrollActor;approvedAt?:string;lockedBy?:PayrollActor;lockedAt?:string;createdAt:string;updatedAt:string};
export type TimeEntryHistory={id:string;timeEntryId:string;employeeId:string;action:string;previousValue?:unknown;newValue?:unknown;reason:string;actorId:string;actorName:string;actorRole:string;eventAt:string};
export type PayrollExport={id:string;payPeriodId:string;format:"CSV";entryCount:number;employeeCount:number;totalHours:number;totalAmount:number;generatedBy:PayrollActor;generatedAt:string;checksum:string;fileName:string;version:string};
export type PayrollClass="Classe 1"|"Classe 2"|"Classe 3"|"Classe 4"|"ADM";
export type PayrollClassRate={
 id:PayrollClass;payrollClass:PayrollClass;flightRate:number;groundRate:number;theoryRate:number;simulatorRate:number;leaveRate:number;
 developmentRate:number;
 updatedAt?:string;updatedBy?:string;
};

export type EmployeePayrollProfile={
 id:string;employeeId:string;employeeName:string;
 payrollEmployeeId?:string;
 payrollClass?:PayrollClass;
 isSupervisor:boolean;
 flightRate:number;groundRate:number;theoryRate:number;simulatorRate:number;leaveRate:number;
 vacationDays:number;holidayDays:number;sickDays:number;standardDayHours:number;
 effectiveDate:string;updatedAt?:string;updatedBy?:string;
};

export type EmployeeTrainingRecord={
 id:string;employeeId:string;employeeName:string;employeeRole:string;subjectId:string;subject:string;
 completedDate:string;validityYears:number;expiryDate:string;trainer:string;notes:string;
 recordedBy:string;recordedAt:string;
};

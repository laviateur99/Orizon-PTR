export type AircraftStatus = "Disponible" | "Maintenance planifiée" | "En maintenance" | "Retour en service retardé" | "Hors service" | "Inspection" | "SNAG";
export type SnagSeverity = "Critique (AOG)" | "Avant prochain vol" | "À surveiller" | "Cosmétique";
export type SnagStatus = "Ouvert" | "Pris en charge" | "Pièces commandées" | "En réparation" | "Essai en vol" | "Fermé";
export type NotificationRole = "Administrateur" | "Dispatch" | "Instructeur" | "Chef instructeur" | "Maintenance" | "Directeur de maintenance";
export type SnagReporterRole = "Dispatch" | "Instructeur" | "Admin" | "Autre";

export type Aircraft = {
  id: string;
  registration: string;
  manufacturer: string;
  model: string;
  typeLabel: string;
  status: AircraftStatus;
  active: boolean;
  maintenanceStart?: string;
  maintenanceEnd?: string;
  statusReason?: string;
  blockedForScheduling?: boolean;
  hobbsTotal?: number;
  airTimeTotal?: number;
  maintenanceStartAt?: string;
  expectedReturnAt?: string;
  actualReturnAt?: string;
  maintenanceTitle?: string;
  maintenanceNotes?: string;

  // V19.28.1 - Suivi maintenance
  maintenanceResponsibleId?: string;
  maintenanceResponsibleName?: string;
  maintenancePriority?: MaintenancePriority;

  // V19.28.1 - Audit
  maintenanceUpdatedAt?: string;
  maintenanceUpdatedBy?: string;

  // V19.28.1 - Retour en service
  returnedToServiceBy?: string;
  returnedToServiceAt?: string;
};
export type MaintenancePriority =
  | "Critique"
  | "Haute"
  | "Normale"
  | "Basse"
  // Compatibilité des Work Orders créés avant la Phase 3.4.
  | "Surveillance"
  | "Urgente";

export type MaintenanceAlertLevel =
  | "Aucune"
  | "Surveillance"
  | "Planification requise"
  | "Dépassée";

export type MaintenanceChangeType =
  | "Statut"
  | "Retour en service"
  | "Échéance"
  | "Tolérance"
  | "Défectuosité";
export type MaintenanceDueBasis = "Air Time" | "Date" | "Air Time et date" | "Condition";
export type MaintenanceWorkStatus =
  | "Planifiée"
  | "Assignée"
  | "En cours"
  | "Travail terminé"
  | "Inspection requise"
  | "Inspection complétée"
  | "Autorisée pour retour en service"
  | "Fermée"
  | "En attente de pièces"
  | "Suspendue"
  | "Annulée"
  | "Retour en service refusé";
export type MaintenanceAssignee = {uid:string;name:string};
export type MaintenanceRtsActor = {uid:string;name:string;role:string;at:string};
export type MaintenanceWorkSource = "Échéance maintenance existante" | "SNAG" | "Intervention manuelle";
export type MaintenanceWorkOrder = {
  id:string;
  aircraftId:string;
  aircraftRegistration:string;
  aircraftType:string;
  maintenanceTaskId?:string;
  snagId?:string;
  title:string;
  description?:string;
  source:MaintenanceWorkSource;
  priority:MaintenancePriority;
  dueAirTime?:number;
  dueDate?:string;
  prm?:MaintenanceAssignee;
  dom?:MaintenanceAssignee;
  technician?:MaintenanceAssignee;
  workStatus:MaintenanceWorkStatus;
  assignedAt?:string;
  plannedStartAt?:string;
  plannedEndAt?:string;
  actualStartAt?:string;
  workCompletedBy?:MaintenanceRtsActor;
  workCompletedAt?:string;
  inspectionRequired?:boolean;
  inspectionPerformedBy?:MaintenanceRtsActor;
  inspectionResult?:"Accepté"|"Refusé";
  rtsAuthorizedBy?:MaintenanceRtsActor;
  returnedToServiceAt?:string;
  rtsComments?:string;
  inspectionCompletedAt?:string;
  approvedForReturnAt?:string;
  closedAt?:string;
  followUpComments?:string;
  schedulerReservationId?:string;
  createdBy:{uid:string;name:string;role:string};
  createdAt:string;
  updatedBy?:{uid:string;name:string;role:string};
  updatedAt:string;
  documents?:unknown[];
};
export type MaintenanceTask = {
  id: string; aircraftId: string; title: string; category: string;
  dueBasis: MaintenanceDueBasis; dueAirTime?: number; dueDate?: string;
  warningHours?: number; warningDays?: number; completed: boolean;
  intervalHours?: number; intervalDays?: number; intervalMonths?: number;
  lastCompletedAirTime?: number; lastCompletedDate?: string;
  sourceSheet?: string; sourceRow?: number;
  notApplicable?: boolean;
  toleranceHours?: number; toleranceMonths?: number;
  toleranceRequiresInspection?: boolean;
  toleranceAuthorized?: boolean;

  // V19.28.1
  alertLevel?: MaintenanceAlertLevel;
};

export type MaintenanceHistory = {
  id: string; aircraftId: string; aircraftRegistration: string;
  action: string; actorId: string; actorName: string; actorRole: string;
  reason?: string; previousExpectedReturnAt?: string; expectedReturnAt?: string;
  taskId?: string; taskTitle?: string;
  previousDueAirTime?: number; dueAirTime?: number;
  previousDueDate?: string; dueDate?: string;
  previousNotApplicable?: boolean; notApplicable?: boolean;
  previousToleranceAuthorized?: boolean; toleranceAuthorized?: boolean;
  eventAt: string;

  // V19.28.1
  changeType?: MaintenanceChangeType;
  workOrderId?:string;
  snagId?:string;
  fieldName?:string;
  previousValue?:string;
  newValue?:string;
  previousStatus?:MaintenanceWorkStatus;
  newStatus?:MaintenanceWorkStatus;
  previousResponsible?:string;
  newResponsible?:string;
};

export type Snag = {
  id: string;
  snagNumber?: string;
  aircraftId: string;
  aircraftRegistration: string;
  reportedAt: string;
  reportedBy: string;
  reportedByRole: SnagReporterRole;
  category: string;
  severity: SnagSeverity;
  defectTitle: string;
  description: string;
  tach?: number;
  hobbs?: number;
  status: SnagStatus;
  estimatedReturnDate?: string;
  maintenanceNotes?: string;
  workOrderId?: string;
  resolvedByWorkOrderId?: string;
  returnedToServiceAt?: string;
  returnedToServiceBy?: string;
  notifyRoles: NotificationRole[];
};

export type ImpactedReservation={id:string;date:string;startMinutes:number;endMinutes:number;title:string;studentId:string;studentName:string;instructorId:string;aircraftId:string;status:string};
export type ImpactResolutionAction="Déplacer vers un autre avion"|"Aviser l’élève"|"Aviser l’instructeur"|"Aviser l’élève et l’instructeur"|"Annuler le vol"|"À décider plus tard";

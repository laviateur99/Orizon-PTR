export type AircraftStatus = "Disponible" | "Maintenance" | "Hors service" | "Inspection" | "SNAG";
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
};

export type Snag = {
  id: string;
  aircraftId: string;
  aircraftRegistration: string;
  reportedAt: string;
  reportedBy: string;
  reportedByUserId?: string;
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
  notifyRoles: NotificationRole[];
};

export type AppUserOption = {
  id: string;
  name: string;
  email: string;
  roles: string[];
  active: boolean;
};

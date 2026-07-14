export type AircraftStatus = "Disponible" | "Maintenance" | "Hors service" | "Inspection" | "SNAG";
export type SnagSeverity = "Critique (AOG)" | "Avant prochain vol" | "À surveiller" | "Cosmétique";
export type SnagStatus = "Ouvert" | "Pris en charge" | "Pièces commandées" | "En réparation" | "Essai en vol" | "Fermé";
export type NotificationRole = "Administrateur" | "Dispatch" | "Instructeur" | "Chef instructeur" | "Maintenance" | "Directeur de maintenance";

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
  reportedByRole: "Dispatch" | "Instructeur";
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

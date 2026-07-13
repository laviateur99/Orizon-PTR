export type ResourceKind = "aircraft" | "instructor" | "room";

export type SchedulerResource = {
  id: string;
  kind: ResourceKind;
  name: string;
  detail: string;
};

export type ActivityType =
  | "Double commande"
  | "Solo"
  | "Sol"
  | "Simulateur"
  | "Examen"
  | "Maintenance"
  | "Hors service";

export type SchedulerEvent = {
  id: string;
  date: string;
  resourceId: string;
  aircraftId?: string;
  instructorId?: string;
  roomId?: string;
  studentId?: string;
  studentName?: string;
  type: ActivityType;
  startMinutes: number;
  endMinutes: number;
  title: string;
  notes?: string;
};

export type Cancellation = {
  id: string;
  eventId: string;
  eventTitle: string;
  reason: string;
  cancelledAt: string;
};

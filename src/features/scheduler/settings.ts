export type SchedulerSettings = {
  startHour: number;
  endHour: number;
  slotMinutes: 15 | 30 | 60;
  updatedAt?: string;
  updatedBy?: string;
};

export const DEFAULT_SCHEDULER_SETTINGS: SchedulerSettings = {
  startHour: 6,
  endHour: 22,
  slotMinutes: 30
};

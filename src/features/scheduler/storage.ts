import { Cancellation, SchedulerEvent } from "./types";

const EVENTS_KEY = "orizon-fd-v15-events";
const CANCELLATIONS_KEY = "orizon-fd-v15-cancellations";

export function loadEvents(fallback: SchedulerEvent[]) {
  if (typeof window === "undefined") return fallback;
  try {
    const value = localStorage.getItem(EVENTS_KEY);
    return value ? (JSON.parse(value) as SchedulerEvent[]) : fallback;
  } catch {
    return fallback;
  }
}

export function saveEvents(events: SchedulerEvent[]) {
  localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
}

export function loadCancellations() {
  if (typeof window === "undefined") return [];
  try {
    const value = localStorage.getItem(CANCELLATIONS_KEY);
    return value ? (JSON.parse(value) as Cancellation[]) : [];
  } catch {
    return [];
  }
}

export function saveCancellations(items: Cancellation[]) {
  localStorage.setItem(CANCELLATIONS_KEY, JSON.stringify(items));
}

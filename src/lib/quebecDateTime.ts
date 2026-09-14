import { Timestamp } from "firebase/firestore";

export const QUEBEC_TIME_ZONE = "America/Toronto";
const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: QUEBEC_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
const displayFormatter = new Intl.DateTimeFormat("fr-CA", {
  timeZone: QUEBEC_TIME_ZONE,
  dateStyle: "medium",
  timeStyle: "short",
});
const pad = (value: number) => String(value).padStart(2, "0");
const parts = (date: Date) =>
  Object.fromEntries(
    partsFormatter
      .formatToParts(date)
      .filter((item) => item.type !== "literal")
      .map((item) => [item.type, Number(item.value)]),
  ) as Record<string, number>;
const offsetAt = (date: Date) => {
  const value = parts(date);
  return (
    Date.UTC(
      value.year,
      value.month - 1,
      value.day,
      value.hour,
      value.minute,
      value.second,
    ) - date.getTime()
  );
};

export function quebecLocalInputToDate(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number),
    wall = Date.UTC(year, month - 1, day, hour, minute);
  let result = new Date(wall - offsetAt(new Date(wall)));
  const corrected = offsetAt(result);
  result = new Date(wall - corrected);
  return Number.isNaN(result.getTime()) ? null : result;
}
export function localInputToFirestoreTimestamp(
  value: string,
): Timestamp | null {
  const date = quebecLocalInputToDate(value);
  return date ? Timestamp.fromDate(date) : null;
}
export function firestoreDateTimeToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value;
  if (value instanceof Timestamp) return value.toDate();
  if (
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  )
    return (value as { toDate: () => Date }).toDate();
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}
export function firestoreDateTimeToIso(value: unknown): string {
  const date = firestoreDateTimeToDate(value);
  return date ? date.toISOString() : "";
}
export function quebecLocalInputToIso(value: string): string {
  return firestoreDateTimeToIso(localInputToFirestoreTimestamp(value));
}
export function dateTimeToFirestoreTimestamp(value: unknown): Timestamp | null {
  const date = firestoreDateTimeToDate(value);
  return date ? Timestamp.fromDate(date) : null;
}
export function firestoreDateTimeToLocalInput(value: unknown): string {
  const date = firestoreDateTimeToDate(value);
  if (!date) return "";
  const valueParts = parts(date);
  return `${valueParts.year}-${pad(valueParts.month)}-${pad(valueParts.day)}T${pad(valueParts.hour)}:${pad(valueParts.minute)}`;
}
export function formatQuebecDateTime(value: unknown): string {
  const date = firestoreDateTimeToDate(value);
  return date ? displayFormatter.format(date) : "—";
}
export function quebecToday(value = new Date()): string {
  const dateParts = parts(value);
  return `${dateParts.year}-${pad(dateParts.month)}-${pad(dateParts.day)}`;
}
export function quebecNowMinutes(value = new Date()): number {
  const dateParts = parts(value);
  return dateParts.hour * 60 + dateParts.minute;
}
export function timeInputToMinutes(value: string): number | undefined {
  if (!/^\d{2}:\d{2}$/.test(value)) return undefined;
  const [hour, minute] = value.split(":").map(Number);
  return hour >= 0 && hour < 24 && minute >= 0 && minute < 60
    ? hour * 60 + minute
    : undefined;
}
export function minutesToTimeInput(value: number): string {
  const normalized = Math.max(0, Math.min(1439, Math.round(value)));
  return `${pad(Math.floor(normalized / 60))}:${pad(normalized % 60)}`;
}

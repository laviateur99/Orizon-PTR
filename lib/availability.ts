import { Reservation, ResourceUnavailability } from "./types";

export function dateTimeValue(date: string, time: string) {
  return new Date(`${date}T${time}:00`).getTime();
}

export function rangesOverlap(
  startDateA: string,
  startTimeA: string,
  endDateA: string,
  endTimeA: string,
  startDateB: string,
  startTimeB: string,
  endDateB: string,
  endTimeB: string
) {
  const aStart = dateTimeValue(startDateA, startTimeA);
  const aEnd = dateTimeValue(endDateA, endTimeA);
  const bStart = dateTimeValue(startDateB, startTimeB);
  const bEnd = dateTimeValue(endDateB, endTimeB);

  return aStart < bEnd && bStart < aEnd;
}

export function unavailabilityConflictsWithReservation(
  reservation: Pick<Reservation, "date" | "startTime" | "endTime" | "aircraftId" | "instructorId">,
  item: ResourceUnavailability
) {
  if (item.status !== "Active") return false;

  const resourceMatches =
    (item.resourceType === "aircraft" && item.resourceId === reservation.aircraftId) ||
    (item.resourceType === "instructor" && item.resourceId === reservation.instructorId);

  if (!resourceMatches) return false;

  return rangesOverlap(
    reservation.date,
    reservation.startTime,
    reservation.date,
    reservation.endTime,
    item.startDate,
    item.startTime,
    item.endDate,
    item.endTime
  );
}

export function getUnavailabilityConflict(
  reservation: Pick<Reservation, "date" | "startTime" | "endTime" | "aircraftId" | "instructorId">,
  items: ResourceUnavailability[]
) {
  return items.find((item) => unavailabilityConflictsWithReservation(reservation, item));
}

export function unavailabilityVisibleOnDate(item: ResourceUnavailability, date: string) {
  if (item.status !== "Active") return false;
  return item.startDate <= date && date <= item.endDate;
}

export function visibleTimesForDate(item: ResourceUnavailability, date: string) {
  return {
    startTime: date === item.startDate ? item.startTime : "07:00",
    endTime: date === item.endDate ? item.endTime : "21:00",
  };
}

"use client";

import {
  getAircraft,
  getCohorts,
  getFlights,
  getInstructors,
  getNotes,
  getReservations,
  getStudents,
} from "./storage";
import { upsertDocument } from "./firestore";

export async function migrateLocalDataToFirestore() {
  const students = getStudents();
  const instructors = getInstructors();
  const cohorts = getCohorts();
  const aircraft = getAircraft();
  const reservations = getReservations();
  const flights = getFlights();
  const notes = getNotes();

  for (const item of students) await upsertDocument("students", item.id, item as any);
  for (const item of instructors) await upsertDocument("instructors", item.id, item as any);
  for (const item of cohorts) await upsertDocument("cohorts", item.id, item as any);
  for (const item of aircraft) await upsertDocument("aircraft", item.id, item as any);
  for (const item of reservations) await upsertDocument("reservations", item.id, item as any);
  for (const item of flights) await upsertDocument("flights", item.id, item as any);
  for (const item of notes) await upsertDocument("notes", item.id, item as any);

  return {
    students: students.length,
    instructors: instructors.length,
    cohorts: cohorts.length,
    aircraft: aircraft.length,
    reservations: reservations.length,
    flights: flights.length,
    notes: notes.length,
  };
}

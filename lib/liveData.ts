"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db, firebaseConfigured } from "./firebase";
import { listenCollection } from "./firestore";
import {
  Aircraft,
  Cohort,
  Flight,
  Instructor,
  Reservation,
  ResourceUnavailability,
  Student,
  InstructorDocument,
  InstructorQualification,
  TrainingNote,
  PTRLesson,
  PTREvaluation,
} from "./types";

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function useLiveCollection<T>(collectionName: any) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!firebaseConfigured || !db) {
      setError("Firebase n'est pas configuré.");
      setLoading(false);
      return;
    }

    try {
      const unsubscribe = listenCollection<T>(collectionName, (data) => {
        setItems(data || []);
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (err: any) {
      setError(err.message || "Erreur Firestore.");
      setLoading(false);
    }
  }, [collectionName]);

  return { items, loading, error };
}

export function useFlightDirectorData() {
  const students = useLiveCollection<Student>("students");
  const instructors = useLiveCollection<Instructor>("instructors");
  const instructorDocuments = useLiveCollection<InstructorDocument>("instructorDocuments");
  const instructorQualifications = useLiveCollection<InstructorQualification>("instructorQualifications");
  const cohorts = useLiveCollection<Cohort>("cohorts");
  const aircraft = useLiveCollection<Aircraft>("aircraft");
  const reservations = useLiveCollection<Reservation>("reservations");
  const unavailabilities = useLiveCollection<ResourceUnavailability>("unavailabilities");
  const flights = useLiveCollection<Flight>("flights");
  const notes = useLiveCollection<TrainingNote>("notes");
  const ptrLessons = useLiveCollection<PTRLesson>("ptrLessons");
  const ptrEvaluations = useLiveCollection<PTREvaluation>("ptrEvaluations");

  const studentMap = useMemo(
    () => Object.fromEntries(students.items.map((item) => [item.id, item])),
    [students.items]
  );

  const instructorMap = useMemo(
    () => Object.fromEntries(instructors.items.map((item) => [item.id, item])),
    [instructors.items]
  );

  const cohortMap = useMemo(
    () => Object.fromEntries(cohorts.items.map((item) => [item.id, item])),
    [cohorts.items]
  );

  const aircraftMap = useMemo(
    () => Object.fromEntries(aircraft.items.map((item) => [item.id, item])),
    [aircraft.items]
  );

  return {
    students,
    instructors,
    instructorDocuments,
    instructorQualifications,
    cohorts,
    aircraft,
    reservations,
    unavailabilities,
    flights,
    notes,
    ptrLessons,
    ptrEvaluations,
    studentMap,
    instructorMap,
    cohortMap,
    aircraftMap,
  };
}

export async function saveWithId(collectionName: string, id: string, data: any) {
  if (!firebaseConfigured || !db) {
    throw new Error("Firebase n'est pas configuré.");
  }

  await setDoc(
    doc(db, collectionName, id),
    {
      ...data,
      id,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

export async function createWithGeneratedId(collectionName: string, data: any, baseName: string) {
  const id = `${slugify(baseName)}-${Date.now()}`;
  await saveWithId(collectionName, id, data);
  return id;
}

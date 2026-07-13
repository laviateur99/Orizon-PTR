"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db, firebaseConfigured } from "./firebase";

export type CollectionName =
  | "students"
  | "instructors"
  | "instructorQualifications"
  | "instructorDocuments"
  | "cohorts"
  | "aircraft"
  | "reservations"
  | "unavailabilities"
  | "cancellations"
  | "flights"
  | "notes"
  | "ptrLessons";

export function requireFirestore() {
  if (!firebaseConfigured || !db) {
    throw new Error("Firebase n'est pas configuré. Remplis le fichier .env.local.");
  }
  return db;
}

export async function getCollection<T>(name: CollectionName): Promise<T[]> {
  const database = requireFirestore();
  const snap = await getDocs(collection(database, name));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() } as T));
}

export function listenCollection<T>(
  name: CollectionName,
  callback: (items: T[]) => void
) {
  const database = requireFirestore();
  const q = query(collection(database, name));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((item) => ({ id: item.id, ...item.data() } as T)));
  });
}

export async function createDocument<T extends Record<string, unknown>>(
  name: CollectionName,
  data: T
) {
  const database = requireFirestore();
  return addDoc(collection(database, name), {
    ...data,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export async function updateDocument<T extends Record<string, unknown>>(
  name: CollectionName,
  id: string,
  data: Partial<T>
) {
  const database = requireFirestore();
  return updateDoc(doc(database, name, id), {
    ...data,
    updatedAt: new Date().toISOString(),
  });
}

export async function upsertDocument<T extends Record<string, unknown>>(
  name: CollectionName,
  id: string,
  data: T
) {
  const database = requireFirestore();
  return setDoc(doc(database, name, id), {
    ...data,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

export async function deleteDocument(name: CollectionName, id: string) {
  const database = requireFirestore();
  return deleteDoc(doc(database, name, id));
}

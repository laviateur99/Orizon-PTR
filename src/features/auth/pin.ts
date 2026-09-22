// Utilitaires de NIP (signature électronique) — utilisables autant côté client (pour définir un
// NIP) que côté serveur Node.js (pour le vérifier), via Web Crypto (disponible nativement dans
// les deux environnements, aucune dépendance ajoutée).
//
// IMPORTANT — limite de sécurité à connaître : cette application n'a pas de compte de service
// Firebase Admin (aucun secret serveur). La route de vérification (voir
// src/app/api/pin/verify-student/[id]/route.ts) protège contre le devinage EN LIGNE (limite de
// tentatives, verrouillage) pour quiconque n'a pas déjà d'accès Firestore direct à la collection
// studentPins. Elle ne peut pas cacher le hash à une personne qui a déjà un accès Firestore
// légitime à cette collection (membre du personnel avec le module 'students'/'ptr') : Firestore
// n'offre pas de sécurité au niveau d'un champ, donc quiconque peut lire le document peut aussi
// en calculer le hash hors ligne. Un NIP à 4 chiffres reste donc vulnérable à un acteur interne
// déterminé ayant déjà accès à Firestore — la protection réelle ici vise le devinage occasionnel
// et les tentatives externes, pas un employé malveillant avec accès légitime.

export type PinRecord = { hash: string; salt: string; failedAttempts: number; lockedUntil?: string; updatedAt: string };

export const PIN_LENGTH = 4;
export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCKOUT_MINUTES = 5;

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function randomPinSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes.buffer);
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

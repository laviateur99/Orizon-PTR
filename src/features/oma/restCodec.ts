import type { FirestoreValue } from "@/features/auth/pinServer";

/** Encode une valeur JS en valeur Firestore REST (routes serveur uniquement). */
export function encodeValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === "object") return { mapValue: { fields: encodeFields(value as Record<string, unknown>) } };
  return { nullValue: null };
}

export function encodeFields(value: Record<string, unknown>): Record<string, FirestoreValue> {
  const out: Record<string, FirestoreValue> = {};
  for (const [key, item] of Object.entries(value)) if (item !== undefined) out[key] = encodeValue(item);
  return out;
}

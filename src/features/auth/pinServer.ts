// Bibliothèque serveur (runtime Node.js) : lecture/vérification d'un NIP avec le jeton de l'appelant.
// Aucun compte de service : les Règles de sécurité Firestore s'appliquent exactement comme au SDK client.
import { hashPinForAlgo, PIN_LOCKOUT_MINUTES, PIN_MAX_ATTEMPTS } from "./pin";

export type FirestoreValue = { stringValue?: string; integerValue?: string; timestampValue?: string; booleanValue?: boolean; doubleValue?: number; nullValue?: null; arrayValue?: { values?: FirestoreValue[] }; mapValue?: { fields?: Record<string, FirestoreValue> } };

export function decodeValue(value: FirestoreValue): unknown {
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.integerValue !== undefined) return Number(value.integerValue);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.timestampValue !== undefined) return value.timestampValue;
  if (value.arrayValue) return (value.arrayValue.values || []).map(decodeValue);
  if (value.mapValue) return decodeFields(value.mapValue.fields);
  return null;
}

export function decodeFields(fields: Record<string, FirestoreValue> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields || {})) out[key] = decodeValue(value);
  return out;
}

export function firestoreDocUrl(path: string): string {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
}

export function bearerToken(request: Request): string {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

/** uid contenu dans le jeton. Non vérifié ici : chaque appel Firestore suivant est authentifié par Firestore lui-même. */
export function uidFromToken(token: string): string {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] || "", "base64url").toString("utf8"));
    return typeof payload.user_id === "string" ? payload.user_id : typeof payload.sub === "string" ? payload.sub : "";
  } catch { return ""; }
}

export type PinCheck = { ok: true; verifiedAt: string; fields: Record<string, unknown> } | { ok: false; status: number; message: string };

/** Vérifie un NIP stocké à `docPath` : comparaison côté serveur, compteur d'essais et verrouillage. */
export async function verifyPinAtPath(token: string, docPath: string, pin: string): Promise<PinCheck> {
  const headers = { Authorization: `Bearer ${token}` };
  const getResponse = await fetch(firestoreDocUrl(docPath), { headers, cache: "no-store" });
  if (getResponse.status === 404) return { ok: false, status: 404, message: "Aucun NIP configuré pour cette personne." };
  if (getResponse.status === 401 || getResponse.status === 403) return { ok: false, status: 403, message: "Missing or insufficient permissions." };
  if (!getResponse.ok) return { ok: false, status: 500, message: "Vérification du NIP impossible." };

  const fields = decodeFields((await getResponse.json()).fields);
  const storedHash = typeof fields.hash === "string" ? fields.hash : "";
  const storedSalt = typeof fields.salt === "string" ? fields.salt : "";
  const algo = typeof fields.algo === "string" ? fields.algo : undefined;
  const failedAttempts = typeof fields.failedAttempts === "number" ? fields.failedAttempts : 0;
  const lockedUntil = typeof fields.lockedUntil === "string" ? fields.lockedUntil : undefined;
  if (!storedHash || !storedSalt) return { ok: false, status: 404, message: "Aucun NIP configuré pour cette personne." };
  if (lockedUntil && new Date(lockedUntil).getTime() > Date.now()) {
    return { ok: false, status: 423, message: `NIP verrouillé temporairement après trop de tentatives. Réessayez après ${new Date(lockedUntil).toLocaleTimeString("fr-CA")}.` };
  }

  const computed = await hashPinForAlgo(pin, storedSalt, algo);
  const nowIso = new Date().toISOString();

  if (computed !== storedHash) {
    const nextAttempts = failedAttempts + 1;
    const locked = nextAttempts >= PIN_MAX_ATTEMPTS;
    const patchFields: Record<string, FirestoreValue> = { failedAttempts: { integerValue: String(nextAttempts) }, updatedAt: { timestampValue: nowIso } };
    const maskFields = ["failedAttempts", "updatedAt"];
    if (locked) { patchFields.lockedUntil = { timestampValue: new Date(Date.now() + PIN_LOCKOUT_MINUTES * 60000).toISOString() }; maskFields.push("lockedUntil"); }
    const mask = maskFields.map(f => `updateMask.fieldPaths=${f}`).join("&");
    await fetch(`${firestoreDocUrl(docPath)}?${mask}`, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ fields: patchFields }) });
    if (locked) return { ok: false, status: 423, message: "NIP incorrect. Verrouillé temporairement après trop de tentatives." };
    return { ok: false, status: 401, message: `NIP incorrect. ${PIN_MAX_ATTEMPTS - nextAttempts} tentative(s) restante(s).` };
  }

  const resetMask = ["failedAttempts", "lockedUntil", "updatedAt"].map(f => `updateMask.fieldPaths=${f}`).join("&");
  await fetch(`${firestoreDocUrl(docPath)}?${resetMask}`, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ fields: { failedAttempts: { integerValue: "0" }, lockedUntil: { timestampValue: nowIso }, updatedAt: { timestampValue: nowIso } } }) });
  return { ok: true, verifiedAt: nowIso, fields };
}

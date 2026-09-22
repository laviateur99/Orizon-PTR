import { hashPin, isValidPin, PIN_LOCKOUT_MINUTES, PIN_MAX_ATTEMPTS } from "@/features/auth/pin";

// Vérification de hash uniquement — nécessite le runtime Node.js, pas Edge.
export const runtime = "nodejs";

type FirestoreValue = { stringValue?: string; integerValue?: string; timestampValue?: string };
function decodeFields(fields: Record<string, FirestoreValue> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields || {})) {
    if (value.stringValue !== undefined) out[key] = value.stringValue;
    else if (value.integerValue !== undefined) out[key] = Number(value.integerValue);
    else if (value.timestampValue !== undefined) out[key] = value.timestampValue;
  }
  return out;
}

function firestoreDocUrl(path: string): string {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
}

// Le NIP n'est jamais transmis au navigateur : cette route relit le hash depuis Firestore avec le
// jeton de l'appelant (mêmes Règles de sécurité que le SDK client — voir studentPins dans
// firestore.rules) et compare côté serveur uniquement. Le [id] désigne uniquement quel dossier
// vérifier ; la valeur du NIP transite dans le corps de la requête, jamais dans l'URL/les logs.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: studentId } = await params;
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return new Response("Missing or insufficient permissions.", { status: 401 });

  let pin = "";
  try {
    const body = await request.json();
    pin = typeof body.pin === "string" ? body.pin : "";
  } catch {
    return new Response("Requête invalide.", { status: 400 });
  }
  if (!isValidPin(pin)) return new Response("NIP invalide.", { status: 400 });

  const headers = { Authorization: `Bearer ${token}` };
  const docPath = `studentPins/${encodeURIComponent(studentId)}`;

  const getResponse = await fetch(firestoreDocUrl(docPath), { headers, cache: "no-store" });
  if (getResponse.status === 404) return new Response("Aucun NIP configuré pour cet étudiant.", { status: 404 });
  if (getResponse.status === 401 || getResponse.status === 403) return new Response("Missing or insufficient permissions.", { status: 403 });
  if (!getResponse.ok) return new Response("Vérification du NIP impossible.", { status: 500 });

  const fields = decodeFields((await getResponse.json()).fields);
  const storedHash = typeof fields.hash === "string" ? fields.hash : "";
  const storedSalt = typeof fields.salt === "string" ? fields.salt : "";
  const failedAttempts = typeof fields.failedAttempts === "number" ? fields.failedAttempts : 0;
  const lockedUntil = typeof fields.lockedUntil === "string" ? fields.lockedUntil : undefined;
  if (!storedHash || !storedSalt) return new Response("Aucun NIP configuré pour cet étudiant.", { status: 404 });
  if (lockedUntil && new Date(lockedUntil).getTime() > Date.now()) {
    return new Response(`NIP verrouillé temporairement après trop de tentatives. Réessayez après ${new Date(lockedUntil).toLocaleTimeString("fr-CA")}.`, { status: 423 });
  }

  const computed = await hashPin(pin, storedSalt);
  const nowIso = new Date().toISOString();

  if (computed !== storedHash) {
    const nextAttempts = failedAttempts + 1;
    const locked = nextAttempts >= PIN_MAX_ATTEMPTS;
    const patchFields: Record<string, FirestoreValue> = { failedAttempts: { integerValue: String(nextAttempts) }, updatedAt: { timestampValue: nowIso } };
    const maskFields = ["failedAttempts", "updatedAt"];
    if (locked) { patchFields.lockedUntil = { timestampValue: new Date(Date.now() + PIN_LOCKOUT_MINUTES * 60000).toISOString() }; maskFields.push("lockedUntil"); }
    const mask = maskFields.map(f => `updateMask.fieldPaths=${f}`).join("&");
    await fetch(`${firestoreDocUrl(docPath)}?${mask}`, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ fields: patchFields }) });
    if (locked) return new Response("NIP incorrect. Verrouillé temporairement après trop de tentatives.", { status: 423 });
    return new Response(`NIP incorrect. ${PIN_MAX_ATTEMPTS - nextAttempts} tentative(s) restante(s).`, { status: 401 });
  }

  // Succès : réinitialise le compteur de tentatives et le verrouillage.
  const resetMask = ["failedAttempts", "lockedUntil", "updatedAt"].map(f => `updateMask.fieldPaths=${f}`).join("&");
  await fetch(`${firestoreDocUrl(docPath)}?${resetMask}`, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ fields: { failedAttempts: { integerValue: "0" }, lockedUntil: { timestampValue: nowIso }, updatedAt: { timestampValue: nowIso } } }) });

  return Response.json({ verified: true, verifiedAt: nowIso });
}

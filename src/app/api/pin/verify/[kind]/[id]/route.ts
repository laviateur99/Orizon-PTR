import { isValidPin } from "@/features/auth/pin";
import { bearerToken, verifyPinAtPath } from "@/features/auth/pinServer";

// Vérification de hash uniquement — nécessite le runtime Node.js, pas Edge.
export const runtime = "nodejs";

// Collection Firestore par type de signataire — étendre ici pour un futur type.
const COLLECTIONS: Record<string, string> = { student: "studentPins", instructor: "instructorPins", technician: "technicianPins" };

// Le NIP n'est jamais transmis au navigateur : cette route relit le hash depuis Firestore avec le
// jeton de l'appelant (mêmes Règles de sécurité que le SDK client — voir studentPins/instructorPins/
// technicianPins dans firestore.rules) et compare côté serveur uniquement. [kind]/[id] désignent
// uniquement quel dossier vérifier; la valeur du NIP transite dans le corps de la requête, jamais
// dans l'URL/les logs.
export async function POST(request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id: personId } = await params;
  const collectionName = COLLECTIONS[kind];
  if (!collectionName) return new Response("Type de signataire invalide.", { status: 400 });

  const token = bearerToken(request);
  if (!token) return new Response("Missing or insufficient permissions.", { status: 401 });

  let pin = "";
  try {
    const body = await request.json();
    pin = typeof body.pin === "string" ? body.pin : "";
  } catch {
    return new Response("Requête invalide.", { status: 400 });
  }
  if (!isValidPin(pin)) return new Response("NIP invalide.", { status: 400 });

  const result = await verifyPinAtPath(token, `${collectionName}/${encodeURIComponent(personId)}`, pin);
  if (!result.ok) return new Response(result.message, { status: result.status });
  return Response.json({ verified: true, verifiedAt: result.verifiedAt });
}

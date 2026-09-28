import { isValidPin } from "@/features/auth/pin";
import { bearerToken, decodeFields, firestoreDocUrl, uidFromToken, verifyPinAtPath } from "@/features/auth/pinServer";
import { cardContentHash } from "@/features/oma/contentHash";
import { mapCard } from "@/features/oma/mappers";
import { computeNextDue } from "@/features/oma/nextDue";
import { encodeFields } from "@/features/oma/restCodec";
import type { ClassMatch } from "@/features/oma/types";

export const runtime = "nodejs";

const projectPath = () => `projects/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}/databases/(default)/documents`;

/**
 * Certification d'une carte de travail par NIP.
 *  1. lit la carte, le projet et la fiche de membre du technicien avec le jeton de l'appelant;
 *  2. vérifie le NIP du technicien assigné (blocage après 5 essais);
 *  3. calcule le hash du contenu de la carte CÔTÉ SERVEUR (jamais fourni par le client);
 *  4. écrit dans UN commit atomique : signature immuable + carte fermée + compteurs du projet,
 *     avec précondition sur la version lue de la carte (si elle a changé entre-temps, tout échoue).
 * Limite connue : sans compte de service, les règles Firestore imposent l'immuabilité et la
 * cohérence mais ne peuvent pas recalculer un hash SHA-256 (voir docs/audit-maintenance.md, D6).
 */
export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return new Response("Missing or insufficient permissions.", { status: 401 });
  const callerUid = uidFromToken(token);
  if (!callerUid) return new Response("Jeton invalide.", { status: 401 });

  let cardId = "", pin = "";
  try {
    const body = await request.json();
    cardId = typeof body.cardId === "string" ? body.cardId : "";
    pin = typeof body.pin === "string" ? body.pin : "";
  } catch { return new Response("Requête invalide.", { status: 400 }); }
  if (!cardId || /[\/\s]/.test(cardId)) return new Response("Carte invalide.", { status: 400 });
  if (!isValidPin(pin)) return new Response("NIP invalide.", { status: 400 });

  const headers = { Authorization: `Bearer ${token}` };
  const getDoc = async (path: string) => {
    const response = await fetch(firestoreDocUrl(path), { headers, cache: "no-store" });
    if (response.status === 401 || response.status === 403) throw new Response("Missing or insufficient permissions.", { status: 403 });
    if (response.status === 404) throw new Response("Document introuvable.", { status: 404 });
    if (!response.ok) throw new Response("Lecture impossible.", { status: 500 });
    return response.json() as Promise<{ fields?: Record<string, never>; updateTime?: string }>;
  };

  try {
    const cardDoc = await getDoc(`workCards/${encodeURIComponent(cardId)}`);
    const card = mapCard(cardId, decodeFields(cardDoc.fields as never));
    if (card.status !== "ouvert") return new Response("Cette carte est déjà signée (lecture seule).", { status: 409 });
    if (!card.assignedUserId) return new Response("Aucun technicien assigné à cette carte.", { status: 409 });
    const snapshot = card.taskSnapshot;
    const hasInterval = Boolean(snapshot && (snapshot.intervalHours || snapshot.intervalDays || snapshot.intervalMonths));
    if (hasInterval && (card.completedAirTime === undefined && !card.completedDate)) {
      return new Response("Renseignez les heures ou la date d’accomplissement avant de signer.", { status: 409 });
    }
    if (!card.rectification.trim()) return new Response("La rectification doit être renseignée avant la signature.", { status: 409 });

    const member = decodeFields((await getDoc(`organizations/${encodeURIComponent(card.orgId)}/members/${encodeURIComponent(card.assignedUserId)}`)).fields as never);
    if (member.active === false) return new Response("Le technicien assigné n’est plus actif.", { status: 409 });
    const licenseType = typeof member.licenseType === "string" ? member.licenseType : "";
    const licenseNumber = typeof member.licenseNumber === "string" ? member.licenseNumber : "";
    const licenseClass = typeof member.licenseClass === "string" ? member.licenseClass : "";
    if (!licenseType || !licenseNumber) return new Response("Le technicien n’a pas de numéro ACA/SCA/AS enregistré.", { status: 409 });

    const check = await verifyPinAtPath(token, `technicianPins/${encodeURIComponent(card.assignedUserId)}`, pin);
    if (!check.ok) return new Response(check.message, { status: check.status });

    const contentHash = await cardContentHash(card);
    const classMatch: ClassMatch = !card.requiredClass ? "unspecified" : licenseClass === card.requiredClass ? "match" : "mismatch";
    const nextDue = computeNextDue(snapshot, card.completedAirTime, card.completedDate);
    const signatureId = crypto.randomUUID();
    const base = projectPath();
    const signerName = typeof member.displayName === "string" && member.displayName ? member.displayName : card.assignedUserName;

    const commit = await fetch(`https://firestore.googleapis.com/v1/projects/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}/databases/(default)/documents:commit`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ writes: [
        {
          update: { name: `${base}/workCards/${cardId}/signatures/${signatureId}`, fields: encodeFields({
            cardId, projectId: card.projectId, orgId: card.orgId, workOrderOrgId: card.workOrderOrgId,
            signerUid: card.assignedUserId, signerName, licenseType, licenseNumber, licenseClass,
            requiredClass: card.requiredClass || "", classMatch, contentHash, hashAlgo: "sha256", contentVersion: 1,
          }) },
          updateTransforms: [{ fieldPath: "signedAt", setToServerValue: "REQUEST_TIME" }],
          currentDocument: { exists: false },
        },
        {
          update: { name: `${base}/workCards/${cardId}`, fields: encodeFields({
            status: "ferme", signedBy: card.assignedUserId, signedContentHash: contentHash, signatureId,
            ...(nextDue ? { nextDue } : {}),
          }) },
          updateMask: { fieldPaths: ["status", "signedBy", "signedContentHash", "signatureId", ...(nextDue ? ["nextDue"] : [])] },
          updateTransforms: [{ fieldPath: "signedAt", setToServerValue: "REQUEST_TIME" }, { fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }],
          currentDocument: { updateTime: cardDoc.updateTime },
        },
        {
          update: { name: `${base}/projects/${card.projectId}`, fields: encodeFields({ lastClosedCardId: cardId, lastSignatureId: signatureId }) },
          updateMask: { fieldPaths: ["lastClosedCardId", "lastSignatureId"] },
          updateTransforms: [
            { fieldPath: "openCardCount", increment: { integerValue: "-1" } },
            { fieldPath: "signerUids", appendMissingElements: { values: [{ stringValue: card.assignedUserId }] } },
          ],
          currentDocument: { exists: true },
        },
      ] }),
    });
    if (commit.status === 401 || commit.status === 403) return new Response("Missing or insufficient permissions.", { status: 403 });
    if (commit.status === 409 || commit.status === 400) return new Response("La carte a été modifiée pendant la signature ou une règle a refusé l’écriture. Rechargez et réessayez.", { status: 409 });
    if (!commit.ok) return new Response("Enregistrement de la signature impossible.", { status: 500 });
    return Response.json({ signatureId, contentHash, classMatch, nextDue: nextDue || null });
  } catch (error) {
    if (error instanceof Response) return error;
    return new Response("Certification impossible.", { status: 500 });
  }
}

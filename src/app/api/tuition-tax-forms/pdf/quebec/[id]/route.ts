import { fetchFinalizedTuitionForm, TuitionFormAccessError } from "@/features/tuition/pdfForms/firestoreRest";
import { buildTp752Pdf } from "@/features/tuition/pdfForms/tp752Pdf";

// pdf-lib manipule des Buffer/fichiers — nécessite le runtime Node.js, pas Edge.
export const runtime = "nodejs";

// Le [id] ne transporte jamais de valeur fiscale : le dossier est systématiquement relu depuis
// Firestore avec le jeton de l'appelant, jamais depuis un corps de requête envoyé par le navigateur.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return new Response("Missing or insufficient permissions.", { status: 401 });
  try {
    const form = await fetchFinalizedTuitionForm(id, token);
    const bytes = await buildTp752Pdf(form);
    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="TP-752-${id}.pdf"`, "Cache-Control": "no-store" }
    });
  } catch (error) {
    if (error instanceof TuitionFormAccessError) return new Response(error.message, { status: error.status });
    return new Response(error instanceof Error ? error.message : "Génération du TP-752 impossible.", { status: 500 });
  }
}

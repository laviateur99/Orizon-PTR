import { DossierVolPage } from "@/features/oma/DossierVolPage";

export default async function Page({ params }: { params: Promise<{ workOrderId: string }> }) {
  const { workOrderId } = await params;
  return <DossierVolPage workOrderId={workOrderId} />;
}

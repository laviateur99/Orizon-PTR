import { OmaProjectPrintPage } from "@/features/oma/OmaProjectPrintPage";

export default async function Page({ params }: { params: Promise<{ workOrderId: string }> }) {
  const { workOrderId } = await params;
  return <OmaProjectPrintPage workOrderId={workOrderId} />;
}

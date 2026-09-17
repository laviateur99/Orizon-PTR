import { TuitionOfficialPdfPage } from "@/features/tuition/TuitionOfficialPdfPage";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <TuitionOfficialPdfPage id={id} kind="quebec" />; }

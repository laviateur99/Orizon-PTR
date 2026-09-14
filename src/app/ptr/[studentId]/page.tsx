import { PTRStudentEntryPage } from "@/features/ptr/PTRStudentEntryPage";
export default async function Page({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  return <PTRStudentEntryPage studentId={studentId} />;
}

import { PTRStudentPage } from "@/features/ptr/PTRStudentPage";
export default function Page({ params }: { params: { studentId: string } }) {
  return <PTRStudentPage studentId={params.studentId} />;
}

import { StudentDetailPage } from "@/features/students/StudentDetailPage";
export default function Page({params}:{params:{id:string}}){ return <StudentDetailPage studentId={params.id}/>; }

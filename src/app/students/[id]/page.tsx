import { StudentDetailPage } from "@/features/students/StudentDetailPage";
export default async function Page({params}:{params:Promise<{id:string}>}){ const {id}=await params; return <StudentDetailPage studentId={id}/>; }

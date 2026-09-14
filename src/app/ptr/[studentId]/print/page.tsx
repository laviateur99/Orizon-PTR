import { PTRPrintPage } from "@/features/ptr/PTRPrintPage";
export default async function Page({params}:{params:Promise<{studentId:string}>}){const {studentId}=await params;return <PTRPrintPage studentId={studentId}/>;}

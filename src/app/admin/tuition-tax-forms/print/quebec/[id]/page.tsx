import { TuitionQuebecPrintPage } from "@/features/tuition/TuitionQuebecPrintPage";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <TuitionQuebecPrintPage id={id}/>;}

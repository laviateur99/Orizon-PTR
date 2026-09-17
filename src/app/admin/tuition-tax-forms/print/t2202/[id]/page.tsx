import { TuitionT2202PrintPage } from "@/features/tuition/TuitionT2202PrintPage";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <TuitionT2202PrintPage id={id}/>;}

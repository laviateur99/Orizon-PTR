import { TrainingQuotePrintPage } from "@/features/training-quotes/TrainingQuotePrintPage";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <TrainingQuotePrintPage quoteId={id}/>;}

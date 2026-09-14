import{AdministrationHub}from"@/features/admin/AdministrationHub";
import{administrationTabs,type AdministrationTab}from"@/features/admin/administrationTabs";
export default async function Page({searchParams}:{searchParams:Promise<{tab?:string}>}){const value=(await searchParams).tab,tab=administrationTabs.includes(value as AdministrationTab)?value as AdministrationTab:"progress";return <AdministrationHub initialTab={tab}/>}

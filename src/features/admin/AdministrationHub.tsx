"use client";
import Link from"next/link";
import{PageHeader}from"@/components/ui/PageHeader";
import{useAuth}from"@/features/auth/AuthProvider";
import{canManageAdministration,canViewTrainingManagementDashboard,hasModuleAccess}from"@/features/auth/types";
import{TrainingProgressDashboard}from"@/features/training-progress/TrainingProgressDashboard";
import{TrainingCohortsPage}from"@/features/training-cohorts/TrainingCohortsPage";
import{InstructorsPage}from"@/features/instructors/InstructorsPage";
import{EmployeesPage}from"@/features/employees/EmployeesPage";
import{ProgramsPage}from"@/features/programs/ProgramsPage";
import{AdminPage}from"./AdminPage";
import{administrationTabs,type AdministrationTab}from"./administrationTabs";

const labels:Record<AdministrationTab,string>={progress:"Suivi de progression",cohorts:"Cohortes",instructors:"Instructeurs",employees:"Employés",programs:"Programmes",settings:"Paramètres"};
export function AdministrationHub({initialTab}:{initialTab:AdministrationTab}){
 const{profile}=useAuth(),allowed=(tab:AdministrationTab)=>tab==="progress"||tab==="cohorts"?canViewTrainingManagementDashboard(profile):tab==="settings"?hasModuleAccess(profile,"admin"):hasModuleAccess(profile,tab==="programs"?"programs":tab),available=administrationTabs.filter(allowed),tab=allowed(initialTab)?initialTab:available[0];
 if(!tab)return <section className="card access-denied"><h1>Accès refusé</h1><p>Votre rôle ne permet pas d’ouvrir les fonctions administratives.</p></section>;
 return <div className="administration-hub"><PageHeader title="Administration" subtitle="Gestion centralisée de Flight Director"/><nav className="student-tabs admin-management-tabs" aria-label="Gestion administrative">{available.map(item=><Link className={tab===item?"active":""} href={`/admin?tab=${item}`} key={item}>{labels[item]}</Link>)}</nav>{tab==="progress"&&<TrainingProgressDashboard/>}{tab==="cohorts"&&<TrainingCohortsPage/>}{tab==="instructors"&&<InstructorsPage/>}{tab==="employees"&&<EmployeesPage/>}{tab==="programs"&&<ProgramsPage/>}{tab==="settings"&&canManageAdministration(profile)&&<AdminPage/>}</div>;
}

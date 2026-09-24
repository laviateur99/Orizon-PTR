export const modules=["dashboard","schedule","ptr","students","instructors","employees","theory","fleet","maintenance","snags","emergency","programs","admin"] as const;
export type AppModule=typeof modules[number];
export const roles=["Administrateur","Chef instructeur","Dispatch","Instructeur","Maintenance","Directeur de maintenance","Étudiant"] as const;
export type UserRole=typeof roles[number];
export type UserProfile={uid:string;name:string;email:string;role:UserRole;permissions:AppModule[];active:boolean;mustSetPassword?:boolean;linkedStudentId?:string;linkedInstructorId?:string;createdAt?:string;lastLoginAt?:string};
export const moduleLabels:Record<AppModule,string>={dashboard:"Tableau de bord",schedule:"Horaire",ptr:"PTR",students:"Étudiants",instructors:"Instructeurs",employees:"Employés",theory:"Formation théorique",fleet:"Flotte",maintenance:"Maintenance",snags:"SNAG",emergency:"Urgence",programs:"Programme",admin:"Administration"};
export const rolePermissions:Record<UserRole,AppModule[]>={
  Administrateur:[...modules],
  "Chef instructeur":["dashboard","schedule","ptr","students","instructors","employees","theory","fleet","maintenance","snags","emergency","programs"],
  Dispatch:["dashboard","schedule","students","instructors","employees","fleet","maintenance","snags","emergency"],
  Instructeur:["dashboard","schedule","ptr","students","instructors","employees","theory","programs"],
  Maintenance:["dashboard","schedule","employees","fleet","maintenance","snags","emergency"],
  "Directeur de maintenance":["dashboard","schedule","employees","fleet","maintenance","snags","emergency"],
  Étudiant:["dashboard","schedule","students","ptr"]
};
export const employeeRoles:UserRole[]=["Administrateur","Chef instructeur","Dispatch","Instructeur","Maintenance","Directeur de maintenance"];
export const hasModuleAccess=(profile:Pick<UserProfile,"active"|"role"|"permissions">|null,module:AppModule)=>Boolean(profile?.active&&(profile.role==="Administrateur"||profile.permissions.includes(module)||(module==="maintenance"&&profile.permissions.includes("fleet"))||(module==="employees"&&employeeRoles.includes(profile.role))));
export const canViewTrainingManagementDashboard=(profile:Pick<UserProfile,"active"|"role">|null)=>Boolean(profile?.active&&["Administrateur","Chef instructeur"].includes(profile.role));
export const canManageTrainingObjectives=(profile:Pick<UserProfile,"active"|"role">|null)=>Boolean(profile?.active&&["Administrateur","Chef instructeur"].includes(profile.role));
export const canManageAdministration=(profile:Pick<UserProfile,"active"|"role">|null)=>Boolean(profile?.active&&["Administrateur","Chef instructeur"].includes(profile.role));
export const canViewTestFeedback=(profile:Pick<UserProfile,"active"|"role">|null)=>Boolean(profile?.active&&["Administrateur","Chef instructeur","Instructeur"].includes(profile.role));
export const pathModule=(path:string):AppModule=>path.startsWith("/schedule")?"schedule":path.startsWith("/ptr")?"ptr":path.startsWith("/training-progress")||path.startsWith("/training-cohorts")?"students":path.startsWith("/students")?"students":path.startsWith("/instructors")?"instructors":path.startsWith("/employees")?"employees":path.startsWith("/theory")?"theory":path.startsWith("/fleet")?"fleet":path.startsWith("/maintenance/snags")?"snags":path.startsWith("/maintenance")?"maintenance":path.startsWith("/emergency")?"emergency":path.startsWith("/programs")?"programs":path.startsWith("/admin")?"admin":"dashboard";

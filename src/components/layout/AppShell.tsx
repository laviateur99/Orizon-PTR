"use client";
import Link from "next/link";
import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { OrizonLogo } from "@/components/branding/OrizonLogo";
import { LoginPage } from "@/features/auth/LoginPage";
import { SetPasswordPage } from "@/features/auth/SetPasswordPage";
import { useAuth } from "@/features/auth/AuthProvider";
import {canManageAdministration,pathModule,type AppModule} from "@/features/auth/types";
import { CommunicationGate } from "@/features/employees/CommunicationGate";
import { FeedbackWidget } from "@/components/test/FeedbackWidget";

const links:Array<[string,string,AppModule]>=[["/","Tableau de bord","dashboard"],["/schedule","Horaire","schedule"],["/ptr","PTR","ptr"],["/students","Étudiants","students"],["/theory","Formation théorique","theory"],["/fleet","Flotte","fleet"],["/maintenance","Maintenance","maintenance"],["/emergency","Urgence","emergency"]];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname=usePathname(),{user,profile,loading,can,logout}=useAuth();
  if(loading)return <main className="auth-loading"><OrizonLogo/><strong>Chargement de Flight Director…</strong></main>;
  if(!user)return <LoginPage/>;
  if(!profile)return <main className="access-state"><section className="card"><h1>Compte en attente</h1><p>Votre compte existe, mais aucun rôle ne lui a encore été attribué. Communiquez avec un administrateur.</p><button className="button secondary" onClick={logout}>Déconnexion</button></section></main>;
  if(profile.mustSetPassword)return <SetPasswordPage/>;
  if(!profile.active)return <main className="access-state"><section className="card"><h1>Compte suspendu</h1><p>L’accès à ce compte a été désactivé par un administrateur.</p><button className="button secondary" onClick={logout}>Déconnexion</button></section></main>;
  const administrationVisible=canManageAdministration(profile)||can("instructors")||can("employees")||can("programs")||can("admin"),allowed=pathname==="/admin"?administrationVisible:pathname.startsWith("/admin/test-feedback")?canManageAdministration(profile):can(pathModule(pathname));
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><OrizonLogo /></div>
        <nav>{links.filter(([, ,module])=>can(module)).map(([href,label]) => <Link className={pathname===href||href!=="/"&&pathname.startsWith(href)?"active":""} key={href} href={href}>{label}</Link>)}{administrationVisible?<Link className={pathname.startsWith("/admin")?"active":""} href="/admin">Administration</Link>:null}</nav>
        <div className="sidebar-user"><strong>{profile.name||profile.email}</strong><span>{profile.role}</span><button onClick={logout}>Déconnexion</button></div>
      </aside>
      <main className="main"><CommunicationGate>{allowed?children:<section className="card access-denied"><h1>Accès refusé</h1><p>Votre rôle ne permet pas d’ouvrir cette section.</p><Link className="button" href="/">Retour au tableau de bord</Link></section>}</CommunicationGate></main><FeedbackWidget/>
    </div>
  );
}

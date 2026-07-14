import Link from "next/link";
import { ReactNode } from "react";
import { OrizonLogo } from "@/components/branding/OrizonLogo";

const links = [
  ["/", "Tableau de bord"], ["/schedule", "Horaire"], ["/students", "Étudiants"],
  ["/instructors", "Instructeurs"], ["/fleet", "Flotte"], ["/emergency", "Urgences"], ["/ptr", "PTR"], ["/programs", "Programmes"]
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><OrizonLogo /><div><strong>Orizon Aviation</strong><span>Flight Director</span></div></div>
        <nav>{links.map(([href,label]) => <Link key={href} href={href}>{label}</Link>)}</nav>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

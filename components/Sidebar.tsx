import Link from "next/link";
import { OrizonLogo } from "./OrizonLogo";

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <OrizonLogo />
        <div className="logo-wordmark">
          <strong>Orizon Aviation</strong>
          <span>Flight director</span>
        </div>
      </div>

      <nav>
        <Link href="/">🏠 Tableau de bord</Link>
        <Link href="/operations">🛫 Opérations</Link>
        <Link href="/schedule">📅 Horaire</Link>
        <Link href="/flights/new">✈️ Nouveau vol</Link>
        <Link href="/ptr">📘 PTR</Link>
        <Link href="/students">👨‍🎓 Étudiants</Link>
        <Link href="/cohorts">👥 Cohortes</Link>
        <Link href="/instructors">👨‍✈️ Instructeurs</Link>
        <Link href="/compliance">✅ Conformité</Link>
        <Link href="/fleet">🛩️ Flotte</Link>
        <Link href="/reports">📊 Rapports</Link>
        <Link href="/notes">📝 Notes</Link>
        <Link href="/admin">⚙️ Administration</Link>
        <Link href="/server">🖥️ Serveur</Link>
      </nav>
    </aside>
  );
}

import Link from"next/link";

export function MaintenanceSectionNav({active}:{active:"maintenance"|"snags"}){
 return <nav className="student-tabs maintenance-tabs maintenance-section-nav" aria-label="Module Maintenance"><Link className={active==="maintenance"?"active":""} aria-current={active==="maintenance"?"page":undefined} href="/maintenance">Vue maintenance</Link><Link className={active==="snags"?"active":""} aria-current={active==="snags"?"page":undefined} href="/maintenance/snags">Défectuosités (Snags)</Link></nav>;
}

import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
export function DashboardPage(){
  return <>
    <PageHeader title="Tableau de bord" subtitle="Fondation Flight Director propre et déployable" />
    <div className="grid">
      <Card><strong>Horaire</strong><p>Moteur du scheduler à migrer.</p></Card>
      <Card><strong>PTR</strong><p>Module pédagogique isolé.</p></Card>
      <Card><strong>Flotte</strong><p>Gestion des avions et disponibilités.</p></Card>
      <Card><strong>Conformité</strong><p>Documents et échéances.</p></Card>
    </div>
  </>;
}

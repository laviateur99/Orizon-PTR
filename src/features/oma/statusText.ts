// Texte d'affichage seulement (retour d'utilisation, diagnostic non codé précédemment) : décrit en
// langage humain où en est un bon de travail et quelle est la prochaine action possible, à partir
// des mêmes conditions qui déterminent déjà quels boutons afficher. Ne change aucune logique de
// statut ni aucune règle — purement informatif.
import type { Project, WorkCard, WorkOrder } from "./types";

export type StepText = { here: string; next: string };

/** Nombre de cartes fermées/annulées/total, calculé à partir des cartes réellement chargées
 * (plus fiable que les compteurs dénormalisés du projet, qui ne distinguent pas fermée d'annulée). */
export function cardProgress(cards: WorkCard[]): { closed: number; cancelled: number; total: number } {
  return {
    closed: cards.filter(card => card.status === "ferme").length,
    cancelled: cards.filter(card => card.status === "annulee").length,
    total: cards.length,
  };
}

export function describeSchoolStep(order: WorkOrder, project: Project | null, cards: WorkCard[]): StepText {
  switch (order.status) {
    case "brouillon":
      return { here: "Brouillon — en cours de rédaction", next: "Transmettre à l’OMA, ou annuler." };
    case "transmis":
      return { here: "Transmis à l’OMA", next: "En attente que l’OMA prenne le bon en charge — rien à faire de votre côté (ou annuler)." };
    case "pris_en_charge": {
      const { total } = cardProgress(cards);
      return { here: "Pris en charge par l’OMA", next: total ? "En attente que l’OMA dépose son rapport — rien à faire de votre côté (ou annuler)." : "En attente que l’OMA ajoute des cartes et dépose son rapport — rien à faire de votre côté (ou annuler)." };
    }
    case "rapport_depose":
      return { here: "Rapport déposé par l’OMA", next: "Démarrer le contrôle PRM, ou annuler." };
    case "controle_prm": {
      const allClosed = Boolean(project) && project!.openCardCount === 0 && cards.every(card => card.status !== "ouvert");
      return { here: "Contrôle PRM en cours", next: allClosed ? "Clôturer et remettre l’avion en service." : "En attente que toutes les cartes soient fermées avant de pouvoir clôturer." };
    }
    case "cloture":
      return { here: "Clôturé — avion remis en service", next: "Aucune action supplémentaire." };
    case "annule":
      return { here: "Annulé", next: "Aucune action supplémentaire." };
    default:
      return { here: order.status, next: "" };
  }
}

export function describeOmaStep(order: WorkOrder, project: Project | null, cards: WorkCard[], isPrm: boolean): StepText {
  switch (order.status) {
    case "transmis":
      return { here: "Transmis, en attente de prise en charge", next: isPrm ? "Prendre en charge." : "Seul le PRM/administrateur de l’OMA peut le prendre en charge — rien à faire de votre côté." };
    case "pris_en_charge": {
      const { total } = cardProgress(cards);
      const anyOpen = cards.some(card => card.status === "ouvert");
      if (!isPrm) return { here: "Projet ouvert", next: "Renseignez et signez les cartes qui vous sont assignées." };
      if (anyOpen) return { here: "Projet ouvert", next: "Fermer (signer) les cartes encore ouvertes, ou en ajouter." };
      if (total) return { here: "Projet ouvert — toutes les cartes sont fermées", next: "Déposer le rapport." };
      return { here: "Projet ouvert", next: "Ajouter des cartes de travail." };
    }
    case "rapport_depose":
      return { here: "Rapport déposé", next: "En attente du contrôle PRM de l’école — rien à faire de votre côté." };
    case "controle_prm":
      return { here: "Contrôle PRM en cours côté école", next: "Rien à faire de votre côté." };
    case "cloture":
      return { here: "Clôturé — avion remis en service", next: "Aucune action supplémentaire." };
    case "annule":
      return { here: "Annulé par l’école", next: "Aucune action supplémentaire." };
    default:
      return { here: order.status, next: "" };
  }
}

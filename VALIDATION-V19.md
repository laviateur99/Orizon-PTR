# Orizon Flight Director — Version 19

## Horaire

- Ligne rouge de l’heure actuelle, visible uniquement sur la date d’aujourd’hui.
- Position et libellé mis à jour automatiquement chaque minute.
- Plage horaire élargie automatiquement pour garder l’heure actuelle visible.
- Bouton **Maintenant** avec l’heure courante.
- Recentrage animé sur l’heure actuelle.
- Recentrage automatique au premier chargement de l’horaire du jour.
- Calcul de la date locale corrigé afin d’éviter un décalage lié au fuseau UTC.

## Administration

- Entrée **Administration** restaurée dans la navigation.
- Nouvelle page `/admin`.
- Remise à zéro des heures de vol, sol, simulateur, double commande et solo.
- Réinitialisation des dossiers étudiants : PTR, évaluations, historique, notes et documents.
- Réinitialisation de l’environnement de test : horaire, annulations, PTR, évaluations, historique et notes.
- Création de trois étudiants et trois réservations de démonstration.
- Traitement Firestore par lots pour respecter les limites d’écriture.
- Confirmation textuelle obligatoire avant chaque opération.
- Les identités des étudiants, instructeurs, avions et réglages sont conservés lors des remises à zéro.

## Validation

- `npm run typecheck` : réussi.
- `npm run build` : réussi.
- 15 routes générées, dont `/admin`, `/admin/schedule` et `/schedule`.
- Vérification locale de la page Administration et de sa fenêtre de confirmation : réussie.

## Installation

1. Conserver une copie de votre fichier `.env.local`.
2. Remplacer le dossier du projet par cette version.
3. Remettre `.env.local` à la racine du projet.
4. Exécuter `npm install --registry=https://registry.npmjs.org/`.
5. Exécuter `npm run dev`.

Les réinitialisations administratives modifient directement les données Firebase partagées. Utiliser ces boutons uniquement pour les essais prévus.

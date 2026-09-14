# Orizon Flight Director 19.27.1 — validation

## Programmes ajoutés

Les phases 1 à 10 du manuel ATP(A), modification no 6 de juin 2025, sont offertes
comme dix programmes modulaires officiels indépendants. Chaque programme est dérivé
directement du programme officiel existant au moment de l'exécution.

- Les numéros officiels, l'ordre, les phases, les titres, les objectifs, les exercices,
  les heures, les critères, les composantes et les liens PDF sont conservés.
- Les identifiants modulaires utilisent l'espace distinct
  `orizon-atpa-phase-XX-mod6-2025`.
- Le programme ATP(A) intégré conserve l'identifiant et les identifiants de leçons PTR
  historiques; aucune migration Firestore n'est exécutée.
- Les onze programmes officiels (intégré + dix modulaires) sont protégés contre la
  modification et la suppression dans l'interface et dans la couche d'enregistrement.
- Un dossier étudiant peut sélectionner une phase modulaire et installer uniquement
  ses plans officiels dans le PTR.
- Une version officielle peut être copiée pour créer un programme entièrement modifiable.
- Plusieurs phases peuvent être assemblées dans l'ordre officiel, puis renommées,
  réordonnées ou retirées du programme personnalisé.
- Les plans d'une copie ou d'un assemblage peuvent être ajoutés, modifiés ou supprimés.

## Contrôles effectués

- Vérification TypeScript sans émission : réussie.
- Compilation de production Next.js : réussie (18 pages générées).
- Programme ATP(A) source : 102 leçons et 146 composantes, inchangé.
- Empreinte SHA-256 du fichier ATP(A) source après intégration :
  `ab7689fe8b48a48611977a46d6b73bcd55a7ecd5ad5bd5994ad1753ba66caca5`.

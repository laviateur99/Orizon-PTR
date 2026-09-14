# Orizon Flight Director — Correctif 19.1.1

## Correction PTR

- Restauration de la liste originale des **102 plans de leçon**.
- Restauration des titres et numéros exacts provenant du manuel officiel.
- Les 146 composantes ne remplacent plus les plans dans la liste.
- Lorsqu’un plan est ouvert, ses composantes sont proposées à l’intérieur du plan.
- Les composantes sont identifiées comme **Formation au sol** ou **Formation en vol**.
- Le sol conserve l’évaluation **Réussi / À reprendre**.
- Le vol conserve l’échelle Transports Canada de 1 à 4.
- Le statut de chaque composante demeure indépendant.

## Horaire

- Les heures restent retirées des blocs de réservation.
- La ligne rouge et le bouton **Maintenant** sont conservés.

## Validation

- Données officielles vérifiées : 102 plans et 146 composantes.
- `npm run typecheck` : réussi.
- `npm run build` : réussi.

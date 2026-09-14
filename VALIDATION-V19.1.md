# Orizon Flight Director — Version 19.1

## Horaire

- L’heure de début et de fin a été retirée de chaque bloc de réservation.
- La ligne rouge et le bouton **Maintenant** de la version 19 sont conservés.
- L’heure demeure accessible dans l’entête de l’horaire et dans les formulaires de réservation.

## PTR

- Le plan de formation est maintenant séparé en deux sections :
  - **Formation au sol**
  - **Formation en vol**
- Chaque composante du manuel est affichée comme une activité distincte.
- Chaque composante possède son propre statut, sa propre progression et son propre historique.
- Une activité au sol réussie ne marque plus automatiquement le vol correspondant comme réussi.
- Les activités en vol conservent l’échelle Transports Canada de 1 à 4.
- Les activités au sol utilisent une évaluation pédagogique distincte :
  - **Réussi**
  - **À reprendre**
- Les réservations proposées sont filtrées selon le type d’activité : sol ou vol.

## Vérifications

- `npm run typecheck` : réussi.
- `npm run build` : réussi.
- Les 15 routes de l’application ont été générées.

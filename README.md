# Orizon Aviation - Flight Director v15.9.5

## Horaire et plans de leçon
- la leçon demeure attachée à la réservation;
- le check-in et le check-out ne contiennent plus l’évaluation TC;
- le check-out conserve uniquement le lien entre le vol et la leçon;
- l’évaluation se fait exclusivement dans le PTR de l’élève.

## PTR
Dans le PTR de l’élève, l’instructeur voit :
- la leçon sélectionnée;
- le vol lié;
- le PDF original du plan;
- la grille d’évaluation Transport Canada;
- les commentaires, signatures et le statut.

L’enregistrement de l’évaluation met directement à jour la leçon dans le PTR.

## Ordre de l’horaire
Administration → Horaire permet maintenant de modifier :
- l’ordre des groupes;
- l’ordre de chaque avion dans son groupe;
- l’ordre des simulateurs;
- l’ordre des instructeurs;
- l’ordre des locaux.

## Installation
```bash
cd ~/Downloads/Orizon-Flight-Director-v15.9.5-PTR-Reservation-Ordre-Ressources
./install-foundation.sh
```

Puis :
```bash
cd ~/Documents/Orizon-PTR
git push
npm run dev
```

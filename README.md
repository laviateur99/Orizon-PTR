# Orizon Aviation - Flight Director v15.9.0

## Horaire
- fenêtre de réservation centrée et toujours visible;
- réservation placée sous le bandeau SNAG;
- bloc SNAG compact afin de conserver les vols visibles;
- plan de leçon sélectionnable dans la réservation;
- lien direct vers le PDF original;
- lien vers le PTR de l’élève;
- bouton d’évaluation TC au check-out.

## PTR
Lorsqu’une réservation comporte un étudiant et un plan de leçon :
- la leçon est créée ou mise à jour dans son PTR;
- la réservation est reliée à la leçon;
- l’instructeur peut ouvrir le PTR au check-out et évaluer les objectifs.

## Flotte et ressources
- ajout, modification et retrait d’un avion;
- ajout, modification et retrait d’un simulateur;
- ajout, modification et retrait d’un local;
- les changements apparaissent dans l’horaire en temps réel.

## SNAG
- les réservations demeurent visibles;
- fenêtre automatique des vols affectés;
- bouton permanent « Gérer les vols affectés » sur l’avion;
- déplacement, avis, annulation ou décision ultérieure.

## Installation
```bash
cd ~/Downloads/Orizon-Flight-Director-v15.9.0-Ressources-Plans-Lecons-SNAG
./install-foundation.sh
```

Puis :
```bash
cd ~/Documents/Orizon-PTR
git push
npm run dev
```

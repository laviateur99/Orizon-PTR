# Orizon Aviation - Flight Director v15.8.1

## Correctifs Horaire
- un clic simple sur une réservation ouvre de nouveau la fenêtre de modification;
- les boutons Check-in et Check-out fonctionnent de nouveau;
- les boutons IN/OUT ne déclenchent plus le déplacement du bloc;
- petite poignée dédiée pour déplacer une réservation;
- poignées gauche et droite conservées pour modifier les heures;
- interaction plus claire : clic pour modifier, poignée pour déplacer.

## Programmes étudiants
La fiche étudiante propose maintenant :
- Modulaire;
- ATP(A) intégré;
- CPL IR/ME intégré;
- CPL intégré.

Le champ Type est calculé automatiquement :
- Modulaire → Modulaire;
- les trois autres programmes → Intégré.

## Installation
```bash
cd ~/Downloads/Orizon-Flight-Director-v15.8.1-Correctif-Horaire-Programmes-Etudiants
./install-foundation.sh
```

Puis :
```bash
cd ~/Documents/Orizon-PTR
git push
npm run dev
```

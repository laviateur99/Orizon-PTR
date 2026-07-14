# Orizon Aviation - Flight Director v15.7.1

## Correctifs et ajouts
- Lorsqu’un autre avion est choisi dans la fenêtre de réservation, le bloc est maintenant placé sur la ligne de cet avion.
- Nouveau Tableau des SNAG accessible depuis le menu.
- Recherche, filtres par statut et gravité.
- Compteurs SNAG ouverts, AOG, en réparation et fermés.
- Modification rapide du statut.
- Configuration des rôles autorisés, par défaut Maintenance, Directeur de maintenance et Administrateur.

## Installation
```bash
cd ~/Downloads/Orizon-Flight-Director-v15.7.1-Correctif-Horaire-Tableau-SNAG
./install-foundation.sh
```
Puis :
```bash
cd ~/Documents/Orizon-PTR
git push
npm run dev
```

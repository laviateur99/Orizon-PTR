# Orizon Aviation - Flight Director v15.7.2

## Plage horaire administrable
- nouvelle page **Réglages horaire**;
- heure de début configurable de 00:00 à 23:00;
- heure de fin configurable jusqu’à 24:00;
- précision de 15, 30 ou 60 minutes;
- paramètres conservés dans Firestore `appSettings/scheduler`;
- élargissement automatique si une réservation existe en dehors de la plage configurée;
- une réservation à 06:00 ne peut donc plus être cachée.

## Installation
```bash
cd ~/Downloads/Orizon-Flight-Director-v15.7.2-Plage-Horaire-Admin
./install-foundation.sh
```
Puis :
```bash
cd ~/Documents/Orizon-PTR
git push
npm run dev
```

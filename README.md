# Orizon Aviation - Flight Director v15.9.3

## Correctif Check-in / Check-out

Correction de l’erreur Firestore :

```text
Unsupported field value: undefined
found in field hobbsStart
```

### Changements

- aucun champ `undefined` n’est envoyé à Firestore;
- nettoyage récursif des données;
- le check-out n’envoie plus `hobbsStart`;
- le check-in n’envoie plus de délai d’alerte vide;
- Hobbs départ obligatoire au check-in;
- Hobbs fin, décollage et atterrissage obligatoires au check-out;
- mise à jour du PTR après le check-out conservée;
- protection ajoutée aux réservations et annulations.

## Installation

```bash
cd ~/Downloads/Orizon-Flight-Director-v15.9.3-Correctif-Checkin-Checkout
./install-foundation.sh
```

Puis :

```bash
cd ~/Documents/Orizon-PTR
git push
npm run dev
```

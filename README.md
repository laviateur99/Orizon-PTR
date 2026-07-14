# Orizon Aviation - Flight Director v15.7.0 — Opérations et urgences

## Ajouts
- SNAG visible dans l’horaire pendant toute sa période ouverte;
- avion bloqué pour les nouvelles réservations selon la gravité;
- nom libre de la personne qui signale le SNAG;
- check-in et check-out dans chaque vol;
- Hobbs départ et fin;
- heure de décollage, heure d’atterrissage et airtime calculé;
- alerte optionnelle de vol en retard;
- bouton Urgence pour chaque avion;
- questionnaire guidé et journal Firestore `emergencies`.

Le module urgence complète, mais ne remplace jamais, le plan d’intervention d’urgence approuvé par Orizon Aviation.

## Installation
```bash
cd ~/Downloads/Orizon-Flight-Director-v15.7.0-Operations-Urgences
./install-foundation.sh
```
Puis `cd ~/Documents/Orizon-PTR`, `git push`, `npm run dev`.

# Orizon Aviation — Flight Director v15.3.0

## Module 2 — Dossier étudiant + base PTR

Inclus :
- liste, recherche et filtres des étudiants;
- création d’un dossier;
- fiche complète avec onglets;
- informations générales et instructeur principal;
- documents avec échéances (sans NAS ni permis de conduire);
- progression PTR alimentée par `ptrLessons`;
- réservations liées depuis `reservations`;
- notes internes;
- historique du dossier;
- données Firestore en temps réel.

## Installation

```bash
cd ~/Downloads/Orizon-Flight-Director-v15.3.0-Module-Etudiants
./install-foundation.sh
```

Puis :

```bash
cd ~/Documents/Orizon-PTR
git push
npm run dev
```

Consulter `firestore-module2.rules.txt` pour les collections nécessaires.

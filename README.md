# Orizon Aviation - Flight Director v15.2.0

## Scheduler Firebase en temps réel

Cette version remplace les données locales du Scheduler par Firestore.

Collections utilisées :

- `aircraft`
- `instructors`
- `students`
- `resources`
- `reservations`
- `cancellations`

Fonctions :

- avions, instructeurs, élèves et locaux lus depuis Firestore;
- réservations synchronisées en temps réel sur tous les appareils;
- création, modification, glisser-déposer et redimensionnement sauvegardés dans Firestore;
- conflits sur avion, instructeur, local et élève;
- suppression avec raison et historique dans `cancellations`;
- état de chargement et erreurs Firestore visibles;
- compatibilité avec les anciens champs `startTime`, `endTime`, `lesson`, `studentName`.

## Installation

Après extraction :

```bash
cd ~/Downloads/Orizon-Flight-Director-v15.2.0-Firebase-Realtime
./install-foundation.sh
```

Puis :

```bash
cd ~/Documents/Orizon-PTR
git add .
git commit -m "Add Firebase realtime scheduler v15.2"
git push
npm run dev
```

Ouvre l’adresse affichée par Terminal, normalement `http://localhost:3000`.

## Firestore

Si les locaux n’apparaissent pas, ajoute des documents dans la collection `resources` avec les champs :

- `name`
- `detail`

Exemples : Salle de classe, Salle examen, Salle de briefing, Salle de conférence, Local Mérici.

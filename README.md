# Orizon Aviation - Flight Director v15.7.3

## Correctifs et ajouts
- Module Instructeurs fonctionnel relié à Firestore.
- Tableau de bord en temps réel.
- Suppression administrative d’un SNAG.
- Historique complet des suppressions de SNAG.
- Suppression des notifications liées au SNAG.
- Remise en disponibilité de l’avion lorsqu’aucun autre SNAG ouvert ne subsiste.
- Déplacement des réservations à la souris avec Pointer Events.
- Redimensionnement fluide par les poignées gauche et droite.
- Déplacement entre les lignes de ressources.
- Validation des conflits avant l’enregistrement.

## Installation
```bash
cd ~/Downloads/Orizon-Flight-Director-v15.7.3-Correctifs-Modules
./install-foundation.sh
```

Puis :
```bash
cd ~/Documents/Orizon-PTR
git push
npm run dev
```

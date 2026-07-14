# Orizon Aviation - Flight Director v15.7.4

## Correctif SNAG
- nettoyage récursif de toutes les valeurs `undefined`;
- correction définitive de l’erreur `snagSnapshot.tach`;
- nettoyage des tableaux et objets imbriqués;
- conservation des objets spéciaux Firebase;
- numéro automatique de SNAG;
- historique lors de la création;
- historique lors d’un changement de statut;
- historique lors de la fermeture;
- archivage administratif complet avant suppression;
- suppression des notifications liées;
- remise en disponibilité de l’avion lorsqu’aucun autre SNAG ouvert ne subsiste;
- affichage de l’historique complet dans le tableau des SNAG.

## Installation
```bash
cd ~/Downloads/Orizon-Flight-Director-v15.7.4-Correctif-SNAG-Historique
./install-foundation.sh
```

Puis :
```bash
cd ~/Documents/Orizon-PTR
git push
npm run dev
```

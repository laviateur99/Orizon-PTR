# Orizon Aviation - Flight Director v15.6.1 — Correctif SNAG

## Corrections
- élimine les valeurs `undefined` avant écriture Firestore;
- corrige l’erreur `Unsupported field value: undefined`;
- ajoute une liste des utilisateurs dans **Signalé par**;
- ajoute **Autre personne** avec saisie manuelle;
- ajoute les rôles **Admin** et **Autre**;
- conserve les notifications par rôle.

## Installation

```bash
cd ~/Downloads/Orizon-Flight-Director-v15.6.1-Module-Flotte-Correctif-SNAG
./install-foundation.sh
```

Puis :

```bash
cd ~/Documents/Orizon-PTR
git push
npm run dev
```

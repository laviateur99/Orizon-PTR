# Orizon Aviation - Flight Director v15.5.0

## Programme ATP(A) importé depuis le manuel officiel

Cette version structure le manuel de formation d’Orizon Aviation :
- Modification no 6;
- entrée en vigueur le 1er juin 2025;
- 10 phases;
- 102 leçons;
- 146 composantes (sol préparatoire, double commande, DEV et solo);
- objectifs;
- exercices;
- normes de réussite;
- durées;
- aperçu de la leçon suivante;
- page de référence du manuel.

Dans le PTR d’un étudiant, clique sur **Installer le programme ATP(A)**. Les 102 leçons sont créées automatiquement dans Firestore.

## Installation

```bash
cd ~/Downloads/Orizon-Flight-Director-v15.5.0-Programme-ATPA
./install-foundation.sh
```

Puis :

```bash
cd ~/Documents/Orizon-PTR
git push
npm run dev
```

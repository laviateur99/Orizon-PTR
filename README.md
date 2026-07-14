# Orizon Aviation - Flight Director v15.9.1

## Correctifs PTR
- l’évaluation d’une leçon met maintenant à jour le document `ptrLessons`;
- le statut de la leçon est synchronisé dans le dossier étudiant;
- la note finale TC est enregistrée dans la leçon;
- l’identifiant de la dernière évaluation est enregistré;
- l’historique demeure dans `ptrEvaluations`.

## Check-out
- la bonne leçon est automatiquement sélectionnée;
- le vol lié est automatiquement celui du check-out;
- le vol lié est verrouillé pendant l’évaluation;
- le plan de leçon original PDF apparaît directement dans la page;
- bouton pour ouvrir le PDF dans un nouvel onglet;
- échelle TC raccourcie en mode check-out;
- fenêtre plus compacte et centrée sur l’évaluation.

## Installation
```bash
cd ~/Downloads/Orizon-Flight-Director-v15.9.1-Correctif-PTR-Checkout
./install-foundation.sh
```

Puis :
```bash
cd ~/Documents/Orizon-PTR
git push
npm run dev
```

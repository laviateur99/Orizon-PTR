# Orizon Aviation - Flight Director v15.9.2

## PTR et check-out
- le check-out met la leçon liée au statut **En cours**;
- le dossier étudiant lit maintenant la note `lastFinalScore`;
- lien vers le PDF original dans la progression PTR;
- lien direct vers la bonne leçon dans le PTR;
- l’évaluation TC demeure requise pour passer la leçon à Réussi ou À reprendre.

## SNAG
- check-in impossible sur un avion bloqué par un SNAG ou une maintenance;
- l’heure exacte du début du SNAG apparaît dans l’horaire;
- le bandeau SNAG est généré pour chaque journée de la période;
- les vols demeurent visibles sous le bandeau;
- options : changement d’avion, avis, annulation, report ou attente;
- statut des SNAG corrigé avec mise à jour de l’avion;
- fermeture du dernier SNAG remet l’avion disponible.

## Ordre de l’horaire
Dans Administration → Horaire :
- réordonner les avions;
- réordonner les simulateurs;
- réordonner les instructeurs;
- réordonner les locaux;
- ordre sauvegardé dans Firestore.

## Installation
```bash
cd ~/Downloads/Orizon-Flight-Director-v15.9.2-PTR-SNAG-Ordre-Horaire
./install-foundation.sh
```

Puis :
```bash
cd ~/Documents/Orizon-PTR
git push
npm run dev
```

# Redémarrer Flight Director sur Mac

Après avoir fermé le Terminal, rien n’est perdu.

## Méthode Terminal

Ouvre **Terminal**, puis exécute :

```bash
cd ~/Documents/Orizon-PTR
git checkout flightdirector-next
git pull
npm run dev
```

Ouvre ensuite Safari :

```text
http://localhost:3000
```

Laisse la fenêtre Terminal ouverte pendant l’utilisation.

## Arrêter le serveur

Dans la fenêtre qui exécute `npm run dev`, appuie sur **Control + C**.

Si le raccourci ne répond pas, ferme cette fenêtre Terminal. Cela n’endommage pas le projet.

## Méthode par double-clic

Le fichier `start-flight-director.command` peut être placé sur le Bureau et ouvert par double-clic.

La première fois, macOS peut demander une autorisation :
- clic droit sur le fichier;
- choisir **Ouvrir**;
- confirmer **Ouvrir**.

## Enregistrer une modification

```bash
cd ~/Documents/Orizon-PTR
git add .
git commit -m "Description de la modification"
git push
```

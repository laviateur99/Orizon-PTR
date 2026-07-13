#!/bin/bash
cd "$HOME/Documents/Orizon-PTR" || exit 1

echo "Orizon Aviation - Flight Director"
echo "Démarrage du serveur local..."
echo ""

if [ ! -d "node_modules" ]; then
  echo "Installation des dépendances..."
  npm install || exit 1
fi

echo ""
echo "Ouvre Safari à l’adresse : http://localhost:3000"
echo "Pour arrêter le serveur, ferme cette fenêtre Terminal."
echo ""

npm run dev

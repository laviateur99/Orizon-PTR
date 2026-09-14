#!/bin/zsh
set -e

PROJECT_DIR="/Users/rogersamson/Documents/Orizon-PTR"
SCRIPT_DIR="${0:A:h}"
AGENT_ID="ca.orizon.flightdirector"
AGENT_FILE="$HOME/Library/LaunchAgents/$AGENT_ID.plist"
DOMAIN="gui/$(id -u)"

if [[ ! -d "$PROJECT_DIR" ]]; then
  echo "Le dossier $PROJECT_DIR est introuvable."
  read -k 1 "?Appuyez sur une touche pour fermer."
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"
launchctl bootout "$DOMAIN/$AGENT_ID" 2>/dev/null || true

# Arrête seulement les anciens serveurs Next appartenant au dossier Orizon-PTR.
for PORT in 3000 3001; do
  for PID in $(lsof -tiTCP:$PORT -sTCP:LISTEN 2>/dev/null); do
    PROCESS_CWD=$(lsof -a -p "$PID" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')
    PROCESS_COMMAND=$(ps -p "$PID" -o command= 2>/dev/null)
    if [[ "$PROCESS_CWD" == "$PROJECT_DIR" && "$PROCESS_COMMAND" == *"next"* ]]; then
      kill "$PID" 2>/dev/null || true
    fi
  done
done

: > /tmp/orizon-flight-director.log
: > /tmp/orizon-flight-director-error.log
cp "$SCRIPT_DIR/ca.orizon.flightdirector.plist" "$AGENT_FILE"
plutil -lint "$AGENT_FILE"
launchctl bootstrap "$DOMAIN" "$AGENT_FILE"
launchctl enable "$DOMAIN/$AGENT_ID"
launchctl kickstart -k "$DOMAIN/$AGENT_ID"

echo ""
echo "Démarrage automatique activé."
echo "Flight Director démarrera désormais avec votre session Mac."
echo "Adresse : http://localhost:3000"
echo ""
read -k 1 "?Appuyez sur une touche pour fermer."

#!/bin/zsh
set -e

AGENT_ID="ca.orizon.flightdirector"
AGENT_FILE="$HOME/Library/LaunchAgents/$AGENT_ID.plist"
DOMAIN="gui/$(id -u)"

launchctl bootout "$DOMAIN/$AGENT_ID" 2>/dev/null || true
rm -f "$AGENT_FILE"

echo "Le démarrage automatique de Flight Director est désactivé."
read -k 1 "?Appuyez sur une touche pour fermer."

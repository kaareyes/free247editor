#!/bin/bash
# Double-click to open kaareyesAiEditor in your browser.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  for p in /opt/homebrew/bin /usr/local/bin "$HOME/.nvm/versions/node"/*/bin; do [ -x "$p/node" ] && export PATH="$p:$PATH"; done
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Opening the download page..."
  open "https://nodejs.org" 
  read -r -p "Install Node.js (LTS), then double-click this file again. Press Enter to close."
  exit 1
fi
node app/server.mjs

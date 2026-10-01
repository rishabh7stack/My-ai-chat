#!/bin/zsh
# Double-click this file in Finder to launch My AI Chat with Google Search research.
cd "$(dirname "$0")" || exit 1

if [[ -z "$GEMINI_API_KEY" ]]; then
  echo ""
  echo "My AI Chat Research needs a Gemini API key for Google Search-grounded answers."
  echo "Paste your key below (nothing will be shown while you type), then press Return:"
  read -r -s GEMINI_API_KEY
  echo ""
  export GEMINI_API_KEY
fi

if [[ -z "$GEMINI_API_KEY" ]]; then
  echo "No API key received. Press any key to close."
  read -n 1
  exit 1
fi

OPEN_BROWSER=1 node my-ai-chat-server.mjs

#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${ASTERISK_REPO_URL:-https://github.com/BackGwa/Asterisk-Code.git}"
REF="${ASTERISK_REF:-main}"
SOURCE_DIR="${ASTERISK_SOURCE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || pwd)}"
OPENCODE_SOURCE_DIR="${SOURCE_DIR}/.opencode"
GLOBAL_CONFIG_DIR="${HOME}/.config/opencode"
AGENTS_DIR="${GLOBAL_CONFIG_DIR}/agents"
PLUGINS_DIR="${GLOBAL_CONFIG_DIR}/plugins"
COMMANDS_DIR="${GLOBAL_CONFIG_DIR}/commands"
LIB_DIR="${GLOBAL_CONFIG_DIR}/lib"
TUI_DIR="${GLOBAL_CONFIG_DIR}/tui"
GLOBAL_TUI="${GLOBAL_CONFIG_DIR}/tui.jsonc"
TEMP_DIR=""

if [ ! -d "$OPENCODE_SOURCE_DIR" ]; then
  if ! command -v git >/dev/null 2>&1; then
    echo "git is required for remote installation." >&2
    exit 1
  fi

  TEMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TEMP_DIR"' EXIT
  git clone --depth 1 --branch "$REF" "$REPO_URL" "$TEMP_DIR"
  SOURCE_DIR="$TEMP_DIR"
  OPENCODE_SOURCE_DIR="${SOURCE_DIR}/.opencode"
fi

mkdir -p "$AGENTS_DIR" "$PLUGINS_DIR" "$COMMANDS_DIR" "$LIB_DIR" "$TUI_DIR"
cp -R "${OPENCODE_SOURCE_DIR}/agents/." "$AGENTS_DIR"/
cp -R "${OPENCODE_SOURCE_DIR}/plugins/." "$PLUGINS_DIR"/
cp -R "${OPENCODE_SOURCE_DIR}/commands/." "$COMMANDS_DIR"/
cp -R "${OPENCODE_SOURCE_DIR}/lib/." "$LIB_DIR"/
cp -R "${OPENCODE_SOURCE_DIR}/tui/." "$TUI_DIR"/

if [ ! -f "$GLOBAL_TUI" ]; then
  cp "${OPENCODE_SOURCE_DIR}/tui.jsonc" "$GLOBAL_TUI"
else
  echo "Global TUI config already exists and was not modified."
  echo "Add ./tui/Asterisk-Code.ts to ${GLOBAL_TUI} if Asterisk TUI is not already configured."
fi

echo "Installed Asterisk agents to ${AGENTS_DIR}"
echo "Installed Asterisk plugins to ${PLUGINS_DIR}"
echo "Installed Asterisk commands to ${COMMANDS_DIR}"
echo "Installed Asterisk libraries to ${LIB_DIR}"
echo "Installed Asterisk TUI to ${TUI_DIR}"
echo "Global TUI config: ${GLOBAL_TUI}"

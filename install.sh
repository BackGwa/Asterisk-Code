#!/usr/bin/env bash
set -euo pipefail

REPO="${ASTERISK_REPO:-BackGwa/Asterisk-Code}"
TAG="${ASTERISK_TAG:-main}"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT
GLOBAL_CONFIG_DIR="${HOME}/.config/opencode"
INSTALL_DIR="${ASTERISK_INSTALL_DIR:-${GLOBAL_CONFIG_DIR}/asterisk}"
AGENTS_DIR="${GLOBAL_CONFIG_DIR}/agents"
PLUGINS_DIR="${GLOBAL_CONFIG_DIR}/plugins"
TUI_DIR="${INSTALL_DIR}/tui"
TUI_PLUGIN_PATH="${TUI_DIR}/Asterisk-Tui.ts"
TUI_PLUGIN_URI="file://${TUI_PLUGIN_PATH}"
GLOBAL_TUI="${GLOBAL_CONFIG_DIR}/tui.jsonc"

curl -fsSL "https://api.github.com/repos/${REPO}/tarball/${TAG}" -o "${TEMP_DIR}/repo.tar.gz"
tar xzf "${TEMP_DIR}/repo.tar.gz" -C "$TEMP_DIR" --strip-components=1

mkdir -p "$AGENTS_DIR" "$PLUGINS_DIR" "$TUI_DIR"
cp -R "$TEMP_DIR"/.opencode/agents/. "$AGENTS_DIR"/
cp -R "$TEMP_DIR"/.opencode/plugins/. "$PLUGINS_DIR"/
cp -R "$TEMP_DIR"/.opencode/tui/. "$TUI_DIR"/

if [ ! -f "$GLOBAL_TUI" ]; then
  mkdir -p "$GLOBAL_CONFIG_DIR"
  cat > "$GLOBAL_TUI" <<-EOF
{
  "\$schema": "https://opencode.ai/tui.json",
  "plugin": ["${TUI_PLUGIN_URI}"]
}
EOF
elif grep -q "Asterisk-Tui.ts" "$GLOBAL_TUI"; then
  ESCAPED_TUI_PLUGIN_URI="$(printf '%s' "$TUI_PLUGIN_URI" | sed 's/[\/&|]/\\&/g')"
  sed -i.bak "s|file://[^\"]*Asterisk-Tui\.ts|${ESCAPED_TUI_PLUGIN_URI}|g" "$GLOBAL_TUI"
  rm -f "${GLOBAL_TUI}.bak"
else
  echo "Global TUI config already exists and was not modified."
  echo "Add this plugin path to ${GLOBAL_TUI}: ${TUI_PLUGIN_URI}"
fi

mkdir -p "$INSTALL_DIR"

echo "Installed Asterisk agents to ${AGENTS_DIR}"
echo "Installed Asterisk plugins to ${PLUGINS_DIR}"
echo "Installed Asterisk support files to ${INSTALL_DIR}"
echo "Global TUI config: ${GLOBAL_TUI}"

#!/usr/bin/env bash
set -euo pipefail

REPO="${ASTERISK_REPO:-BackGwa/Asterisk-Code}"
TAG="${ASTERISK_TAG:-main}"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

curl -fsSL "https://api.github.com/repos/${REPO}/tarball/${TAG}" -o "${TEMP_DIR}/repo.tar.gz"
tar xzf "${TEMP_DIR}/repo.tar.gz" -C "$TEMP_DIR" --strip-components=1

mkdir -p .opencode
cp -r "$TEMP_DIR"/.opencode/* .opencode/

GLOBAL_TUI="${HOME}/.config/opencode/tui.jsonc"
if [ ! -f "$GLOBAL_TUI" ]; then
  mkdir -p "$(dirname "$GLOBAL_TUI")"
  cat > "$GLOBAL_TUI" <<-EOF
{
  "\$schema": "https://opencode.ai/tui.json",
  "plugin": ["file://${PWD}/.opencode/tui/Asterisk-Tui.ts"]
}
EOF
fi

mkdir -p "${HOME}/.config/opencode/asterisk"

echo "Installed Asterisk-Code to .opencode/"
echo "Global TUI config: ${GLOBAL_TUI}"

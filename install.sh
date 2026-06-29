#!/usr/bin/env bash
# Claude Code statusline installer (macOS / Linux)
# Copies statusline.js into ~/.claude/ and patches settings.json to use it.
# Usage:  ./install.sh    (run: chmod +x install.sh first if needed)

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source="$script_dir/statusline.js"
claude_dir="$HOME/.claude"
dest="$claude_dir/statusline.js"
settings="$claude_dir/settings.json"

if [ ! -f "$source" ]; then
  echo "Error: statusline.js not found next to this installer ($source)." >&2
  exit 1
fi

# 1. Ensure ~/.claude exists, copy the script
mkdir -p "$claude_dir"
cp "$source" "$dest"
echo "Copied statusline.js -> $dest"

# 2. Locate node
node_bin="$(command -v node || true)"
if [ -z "$node_bin" ]; then
  echo "Error: node not found on PATH. Install Node.js (https://nodejs.org) and re-run." >&2
  exit 1
fi
echo "Using node: $node_bin"

# 3. Build the statusLine command
command_str="\"$node_bin\" \"$dest\""

# 4. Patch settings.json (uses node itself for safe JSON editing — no jq dependency)
[ -f "$settings" ] && cp "$settings" "$settings.bak" && echo "Backed up existing settings -> $settings.bak"

SETTINGS_PATH="$settings" CMD_STR="$command_str" node <<'NODE'
const fs = require('fs');
const path = process.env.SETTINGS_PATH;
let settings = {};
if (fs.existsSync(path)) {
  try { settings = JSON.parse(fs.readFileSync(path, 'utf8') || '{}'); }
  catch (e) { console.error('Existing settings.json is not valid JSON. Fix or remove it, then re-run.'); process.exit(1); }
}
settings.statusLine = { type: 'command', command: process.env.CMD_STR };
fs.writeFileSync(path, JSON.stringify(settings, null, 2) + '\n');
NODE

echo "Patched statusLine in $settings"
echo ""
echo "Done. Restart Claude Code (or open a new session) to see the status line."

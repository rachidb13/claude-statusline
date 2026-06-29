# claude-statusline

A clean, colorized status line for [Claude Code](https://claude.com/claude-code).
No progress bars, no directory clutter — just the things you actually watch, color-coded.

```
⎇ main ● │ Opus 4.8 │ ctx 8% (16k/200k) │ $0.42 5m12s +120/-8 │ 5h 8% resets 28min │ week 27% │ 15:12
```

## What it shows

| Segment | Meaning |
|---------|---------|
| `⎇ branch ●` | Git branch (cyan) + yellow `●` when the working tree is dirty |
| `Opus 4.8` | Active model |
| `ctx 8% (16k/200k)` | Context window used — **green** < 70%, **yellow** 70–89%, **red** ≥ 90% |
| `$0.42 5m12s +120/-8` | Session cost, duration, lines added/removed |
| `5h 8% resets 28min` | 5-hour rate-limit usage + time until it resets (subscribers only) |
| `week 27%` | 7-day rate-limit usage (subscribers only) |
| `15:12` | Clock |

Rate-limit segments only appear once Claude Code has made its first API response in the session.

## Requirements

- [Node.js](https://nodejs.org) on the machine (the script runs via `node`)
- `git` on PATH (for the branch segment)

## Install

```bash
git clone https://github.com/<you>/claude-statusline.git
cd claude-statusline
```

**Windows (PowerShell):**
```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

**macOS / Linux:**
```bash
chmod +x install.sh && ./install.sh
```

The installer:
1. Copies `statusline.js` to `~/.claude/statusline.js`
2. Auto-detects your `node` executable
3. Adds (or replaces) the `statusLine` block in `~/.claude/settings.json`, backing up the old file to `settings.json.bak`

Restart Claude Code (or start a new session) to see it.

## Customize

Edit `~/.claude/statusline.js` directly — changes show **live**, no restart needed.
Only the `command` line in `settings.json` requires a restart.

## Manual install

If you'd rather not run the script, copy `statusline.js` to `~/.claude/` and add this to `~/.claude/settings.json` (adjust the node path for your OS):

```json
{
  "statusLine": {
    "type": "command",
    "command": "\"C:\\Program Files\\nodejs\\node.exe\" \"C:\\Users\\YOU\\.claude\\statusline.js\""
  }
}
```

## How it works

Claude Code passes a JSON payload on **stdin** to the status line command. `statusline.js` parses it and prints a single colorized line. Key fields used: `model.display_name`, `context_window.*`, `cost.*`, and `rate_limits.{five_hour,seven_day}` (note `resets_at` is **Unix epoch seconds**).

'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ESC = '\x1b[';
const R   = '\x1b[0m';
const dim    = s => `${ESC}2m${s}${R}`;
const bold   = s => `${ESC}1m${s}${R}`;
const cyan   = s => `${ESC}36m${s}${R}`;
const green  = s => `${ESC}32m${s}${R}`;
const yellow = s => `${ESC}33m${s}${R}`;
const red    = s => `${ESC}31m${s}${R}`;
const blue   = s => `${ESC}34m${s}${R}`;
const mag    = s => `${ESC}35m${s}${R}`;
const white  = s => `${ESC}97m${s}${R}`;

function pctColor(pct, s) {
  return pct >= 90 ? red(s) : pct >= 70 ? yellow(s) : green(s);
}

// Is a pid still alive? true=alive, false=dead, null=unknown/no pid.
// The plugin's state.json does not reliably flip status running->completed when a
// job ends, so a bare status==='running' goes stale and the indicator sticks.
// Verifying the recorded pid is the reliable "really running" signal.
function pidAlive(pid) {
  if (!pid || typeof pid !== 'number') return null;
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code === 'EPERM'; } // EPERM = exists but not ours; ESRCH = dead
}

// Running Codex background jobs (from the codex plugin's per-workspace state.json).
// Fast, best-effort, never throws — shows nothing when idle.
function codexSeg(cwd) {
  try {
    const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
    const base = path.join(claudeDir, 'plugins', 'data', 'codex-openai-codex', 'state');
    let dirs;
    try { dirs = fs.readdirSync(base); } catch (_) { return ''; }
    let running = 0, oldest = Infinity;
    for (const dir of dirs) {
      let s;
      try { s = JSON.parse(fs.readFileSync(path.join(base, dir, 'state.json'), 'utf8')); }
      catch (_) { continue; }
      for (const j of Object.values((s && s.jobs) || {})) {
        if (j && j.status === 'running' && (!cwd || j.workspaceRoot === cwd)) {
          if (pidAlive(j.pid) === false) continue; // stale running flag, process gone
          running++;
          const t = Date.parse(j.createdAt || j.startedAt || '');
          if (!isNaN(t) && t < oldest) oldest = t;
        }
      }
    }
    if (running === 0) return '';
    let el = '';
    if (oldest !== Infinity) el = dim(` ${Math.floor((Date.now() - oldest) / 60000)}m`);
    return yellow('⚙ codex' + (running > 1 ? ` ×${running}` : '')) + el;
  } catch (_) { return ''; }
}

let raw = '';
process.stdin.on('data', c => raw += c);
process.stdin.on('end', () => {
  let d = {};
  try { d = JSON.parse(raw || '{}'); } catch (_) {}

  const cwd   = (d.cwd) || (d.workspace && d.workspace.current_dir) || '';
  const model = (d.model && d.model.display_name) || '';

  // git branch + dirty
  let gitSeg = '';
  if (cwd) {
    try {
      const branch = execSync(
        `git --no-optional-locks -C "${cwd}" symbolic-ref --short HEAD`,
        { stdio: ['ignore', 'pipe', 'ignore'] }
      ).toString().trim();
      if (branch) {
        let dirty = '';
        try {
          const st = execSync(
            `git --no-optional-locks -C "${cwd}" status --porcelain --untracked-files=no`,
            { stdio: ['ignore', 'pipe', 'ignore'] }
          ).toString().trim();
          if (st) dirty = yellow(' ●');
        } catch (_) {}
        gitSeg = cyan('⎇ ') + bold(white(branch)) + dirty;
      }
    } catch (_) {}
  }

  // context window
  let ctxSeg = '';
  const cw  = d.context_window || {};
  let pct   = cw.used_percentage != null
    ? cw.used_percentage
    : (cw.remaining_percentage != null ? 100 - cw.remaining_percentage : null);
  if (pct != null) {
    const u = Math.round(pct);
    if (cw.total_input_tokens != null && cw.context_window_size) {
      const uK = Math.round(cw.total_input_tokens / 1000);
      const tK = Math.round(cw.context_window_size / 1000);
      ctxSeg = dim('ctx ') + pctColor(u, `${u}%`) + dim(` (${uK}k/${tK}k)`);
    } else {
      ctxSeg = dim('ctx ') + pctColor(u, `${u}%`);
    }
  }

  // session: cost + duration + lines
  let sessionSeg = '';
  const cost = d.cost || {};
  if (cost.total_cost_usd != null) {
    const dollars = green('$' + Number(cost.total_cost_usd).toFixed(2));
    let dur = '';
    if (cost.total_duration_ms > 0) {
      const m = Math.floor(cost.total_duration_ms / 60000);
      const s = Math.floor((cost.total_duration_ms % 60000) / 1000);
      dur = dim(` ${m}m${s}s`);
    }
    let lines = '';
    const a = cost.total_lines_added || 0;
    const r = cost.total_lines_removed || 0;
    if (a > 0 || r > 0) lines = dim(' ') + green(`+${a}`) + dim('/') + red(`-${r}`);
    sessionSeg = dollars + dur + lines;
  }

  // rate limits
  const rl = d.rate_limits || {};
  const rateParts = [];
  if (rl.five_hour && rl.five_hour.used_percentage != null) {
    const v = Math.round(rl.five_hour.used_percentage);
    let resetSeg = '';
    // resets_at = Unix epoch SECONDS when the 5h window resets
    const resetsAt = rl.five_hour.resets_at;
    if (resetsAt != null) {
      const mins = Math.max(0, Math.round((resetsAt * 1000 - Date.now()) / 60000));
      if (mins >= 60) {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        resetSeg = dim(` resets ${h}h${m > 0 ? m + 'm' : ''}`);
      } else {
        resetSeg = dim(` resets ${mins}min`);
      }
    }
    rateParts.push(dim('5h ') + pctColor(v, `${v}%`) + resetSeg);
  }
  if (rl.seven_day && rl.seven_day.used_percentage != null) {
    const v = Math.round(rl.seven_day.used_percentage);
    rateParts.push(dim('week ') + pctColor(v, `${v}%`));
  }

  // clock
  const now = new Date();
  const hh  = String(now.getHours()).padStart(2, '0');
  const mm  = String(now.getMinutes()).padStart(2, '0');
  const clock = blue(`${hh}:${mm}`);

  const sep   = dim(' │ ');
  const parts = [gitSeg, codexSeg(cwd), model && dim(model), ctxSeg, sessionSeg, ...rateParts, clock].filter(Boolean);
  process.stdout.write(parts.join(sep));
});

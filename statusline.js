'use strict';
const { execSync } = require('child_process');

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
  const parts = [gitSeg, model && dim(model), ctxSeg, sessionSeg, ...rateParts, clock].filter(Boolean);
  process.stdout.write(parts.join(sep));
});

/* THE STABLE — discretionary trading journal (spec: TRADING_JOURNAL_SPEC.md).
   Pillars: intuition extraction (tags), discipline mirror (check-in / rules /
   wrap), clean record. Numerology is BLIND: every day + trade is silently
   stamped with Day Energy / Universal Day / compatibility / energy flow via the
   app's existing engines, but nothing shows until the day's wrap. */

/* ---------------- storage ---------------- */
const ST_TRADES_KEY = 'stable_trades';   // synced (no screenshots inside)
const ST_DAYS_KEY   = 'stable_days';     // synced
const ST_RULES_KEY  = 'stable_rules';    // synced
const ST_SHOTS_KEY  = 'stable_shots';    // LOCAL ONLY — compressed thumbnails, capped

function stLoad(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch (e) { return fallback; }
}
function stSave(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  if (key !== ST_SHOTS_KEY && typeof cloudPushKey === 'function') cloudPushKey(key);
}

let trades = stLoad(ST_TRADES_KEY, []);
let days   = stLoad(ST_DAYS_KEY, {});
let rules  = Object.assign({ lossStreak: 2, maxTrades: 5 }, stLoad(ST_RULES_KEY, {}));
let shots  = stLoad(ST_SHOTS_KEY, {});

/* ---------------- helpers ---------------- */
function dayKey(d) {
  const dt = d || new Date();
  return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate());
}
function stParseISO(value) {
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date();
  date.setFullYear(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}
function fmtR(r) { return (r > 0 ? '+' : '') + (Math.round(r * 100) / 100) + 'R'; }
function esc(s) { return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* Silent numerology stamp for a date — reuses the app's engines, never shown
   before the wrap. Profile birthdate optional (compat/energy become null). */
function stampFor(date) {
  const stamp = { de: reduceNumber(date.getDate()), ud: universalDayNumber(date), compat: null, energy: null };
  try {
    const profile = loadProfile();
    if (profile && profile.date) {
      const me = stParseISO(profile.date);
      stamp.compat = computeCompatibility(me, date).finalScore;
      stamp.energy = computeEnergyFlow(me, date).finalScore;
    }
  } catch (e) { /* profile or engines unavailable — stamp stays partial */ }
  return stamp;
}

function dayRec(key) {
  if (!days[key]) days[key] = { checkin: null, wrapped: false, answers: [], lesson: '', nums: stampFor(stParseISO(key)) };
  if (!days[key].nums) days[key].nums = stampFor(stParseISO(key));
  return days[key];
}

/* ---------------- tags ---------------- */
const TAGS = {
  saw:  ['sweep', 'momentum shift', 'level reclaim', 'FVG fill', 'trend day', 'range chop', 'news move', 'failed break'],
  mkt:  ['Asia', 'London', 'NY AM', 'NY PM', 'trending', 'ranging', 'high vol', 'low vol', 'news soon'],
  felt: ['calm', 'confident', 'rushed', 'hesitant', 'revenge-y', 'bored', 'locked in'],
  exec: ['A+ clean', 'chased', 'moved stop', 'early exit', 'late entry', 'oversized'],
};
const TAG_LABELS = { saw: 'What I saw', mkt: 'Market state', felt: 'How I felt', exec: 'Execution grade' };

/* ---------------- discipline ---------------- */
function todayTrades() { const k = dayKey(); return trades.filter((t) => t.day === k); }
function lockState() {
  const tt = todayTrades();
  const reasons = [];
  let streak = 0;
  for (let i = tt.length - 1; i >= 0; i--) { if (tt[i].r < 0) streak++; else break; }
  if (streak >= rules.lossStreak) reasons.push(streak + ' losses in a row (limit ' + rules.lossStreak + ')');
  if (tt.length > rules.maxTrades) reasons.push(tt.length + ' trades today (limit ' + rules.maxTrades + ')');
  return reasons;
}
/* Discipline streak: consecutive past days (ending yesterday or today-if-wrapped)
   that were wrapped and broke no rule. Days with no trades count if wrapped. */
function disciplineStreak() {
  let streak = 0;
  const d = new Date();
  const todayK = dayKey();
  if (!(days[todayK] && days[todayK].wrapped)) d.setDate(d.getDate() - 1);
  for (let i = 0; i < 365; i++) {
    const k = dayKey(d);
    const rec = days[k];
    if (!rec || !rec.wrapped) break;
    const dt = trades.filter((t) => t.day === k);
    let lossRun = 0, worst = 0;
    dt.forEach((t) => { lossRun = t.r < 0 ? lossRun + 1 : 0; worst = Math.max(worst, lossRun); });
    if (worst >= rules.lossStreak || dt.length > rules.maxTrades) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/* ---------------- views ---------------- */
const views = { today: renderToday, log: renderLog, history: renderHistory, stats: renderStats };
let activeView = 'today';
function show(view) {
  activeView = view;
  document.querySelectorAll('.st-view').forEach((v) => v.classList.remove('active'));
  document.querySelectorAll('.st-tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
  document.getElementById('view-' + view).classList.add('active');
  views[view]();
  document.getElementById('stStreak').textContent = disciplineStreak();
}
document.querySelectorAll('.st-tab').forEach((t) => t.addEventListener('click', () => show(t.dataset.view)));
document.getElementById('stBack').addEventListener('click', () => { location.href = 'profile.html'; });

/* ---------------- TODAY ---------------- */
const WRAP_PROMPTS = [
  'What did you see best today?', 'What would you undo?', 'Where did you force it?',
  'What kept working?', 'When were you most in flow?', 'What did the market teach you?',
  'Which trade was pure instinct — how did it go?', 'What will you NOT do tomorrow?',
  'Did you stop at the right time?',
];
function wrapPrompts() {
  const doy = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  return [0, 1, 2].map((i) => WRAP_PROMPTS[(doy * 3 + i) % WRAP_PROMPTS.length]);
}

function renderToday() {
  const el = document.getElementById('view-today');
  const k = dayKey();
  const rec = dayRec(k);
  const tt = todayTrades();
  const locked = lockState();
  const sumR = tt.reduce((s, t) => s + t.r, 0);
  let html = '';

  if (locked.length) {
    html += '<div class="st-locked"><h3>▣ LOCKED</h3><div class="st-muted">' + locked.map(esc).join(' · ') +
      '</div><div class="st-muted" style="margin-top:4px">The best trade left today is no trade.</div></div>';
  }

  if (!rec.checkin) {
    html += '<div class="st-card"><h3>Pre-session check-in</h3>';
    [['sleep', ['slept bad', 'ok', 'slept great']], ['mood', ['off', 'neutral', 'sharp']], ['energy', ['drained', 'fine', 'charged']]].forEach(([dim, opts]) => {
      html += '<label class="st-lbl">' + dim + '</label><div class="chip-row">' +
        opts.map((o, i) => '<button class="chip" data-ci="' + dim + '|' + i + '">' + o + '</button>').join('') + '</div>';
    });
    html += '<button class="save-btn" id="ciSave" style="margin-top:16px">START THE DAY</button></div>';
  } else {
    html += '<div class="st-card"><h3>Today</h3><table class="stat-table"><tr>' +
      '<td>Trades</td><td>' + tt.length + ' / ' + rules.maxTrades + '</td></tr><tr>' +
      '<td>Day R</td><td class="' + (sumR >= 0 ? 'mu-pos' : 'mu-neg') + '">' + fmtR(sumR) + '</td></tr><tr>' +
      '<td>Check-in</td><td class="st-muted">' + esc(Object.values(rec.checkin).join(' · ')) + '</td></tr></table></div>';
  }

  // Rules (editable, terse)
  html += '<div class="st-card"><h3>Rules</h3><div class="chip-row">' +
    '<span class="st-muted">stop after</span><input class="r-input" id="ruleLoss" style="width:52px" inputmode="numeric" value="' + rules.lossStreak + '">' +
    '<span class="st-muted">losses · max</span><input class="r-input" id="ruleMax" style="width:52px" inputmode="numeric" value="' + rules.maxTrades + '">' +
    '<span class="st-muted">trades/day</span></div></div>';

  // Wrap / reveal
  if (rec.wrapped) {
    html += renderReveal(rec, sumR, tt.length);
  } else {
    html += '<div class="st-card"><h3>Daily wrap</h3><div class="st-muted">Close the day: three questions, one lesson — then the numbers reveal.</div>';
    wrapPrompts().forEach((q, i) => {
      html += '<label class="st-lbl">' + esc(q) + '</label><textarea class="st-ta wrap-a" data-q="' + esc(q) + '" id="wrapA' + i + '"></textarea>';
    });
    html += '<label class="st-lbl">One lesson</label><textarea class="st-ta" id="wrapLesson"></textarea>' +
      '<button class="mic-btn" id="wrapMic">🎙 dictate</button>' +
      '<button class="save-btn" id="wrapSave" style="margin-top:12px">WRAP THE DAY</button></div>';
  }
  el.innerHTML = html;

  // check-in interactions
  const ci = {};
  el.querySelectorAll('[data-ci]').forEach((b) => b.addEventListener('click', () => {
    const [dim, i] = b.dataset.ci.split('|');
    ci[dim] = b.textContent;
    el.querySelectorAll('[data-ci^="' + dim + '|"]').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
  }));
  const ciSave = el.querySelector('#ciSave');
  if (ciSave) ciSave.addEventListener('click', () => {
    rec.checkin = { sleep: ci.sleep || '—', mood: ci.mood || '—', energy: ci.energy || '—' };
    stSave(ST_DAYS_KEY, days); renderToday();
  });

  ['ruleLoss', 'ruleMax'].forEach((id) => {
    const inp = el.querySelector('#' + id);
    if (inp) inp.addEventListener('change', () => {
      rules.lossStreak = Math.max(1, parseInt(el.querySelector('#ruleLoss').value, 10) || 2);
      rules.maxTrades  = Math.max(1, parseInt(el.querySelector('#ruleMax').value, 10) || 5);
      stSave(ST_RULES_KEY, rules); renderToday();
    });
  });

  const wrapSave = el.querySelector('#wrapSave');
  if (wrapSave) wrapSave.addEventListener('click', () => {
    rec.answers = Array.from(el.querySelectorAll('.wrap-a')).map((a) => ({ q: a.dataset.q, a: a.value.trim() })).filter((x) => x.a);
    rec.lesson = el.querySelector('#wrapLesson').value.trim();
    rec.wrapped = true;
    rec.wrapTs = Date.now();
    rec.nums = stampFor(stParseISO(k));  // refresh stamp at reveal time
    stSave(ST_DAYS_KEY, days); renderToday();
  });
  hookMic(el.querySelector('#wrapMic'), el);
}

/* The reveal: numbers stay hidden all session — this card is the ONLY place
   today's numerology appears, and only after the wrap. */
function renderReveal(rec, sumR, n) {
  const nums = rec.nums || {};
  let html = '<div class="reveal-card"><h3>🐎 THE REVEAL — what today actually was</h3><div class="reveal-grid">' +
    '<div><div class="rg-num">' + (nums.de ?? '—') + '</div><div class="rg-lbl">Day Energy</div></div>' +
    '<div><div class="rg-num">' + (nums.ud ?? '—') + '</div><div class="rg-lbl">Universal Day</div></div>' +
    '<div><div class="rg-num">' + (nums.compat != null ? nums.compat + '%' : '—') + '</div><div class="rg-lbl">Compat w/ Today</div></div>' +
    '<div><div class="rg-num">' + (nums.energy != null ? nums.energy + '%' : '—') + '</div><div class="rg-lbl">Energy Flow</div></div>' +
    '</div><div class="st-muted" style="margin-top:10px">You traded this day blind: ' + n + ' trade' + (n === 1 ? '' : 's') + ', ' + fmtR(sumR) + '.</div>';
  if (rec.lesson) html += '<div class="trade-note" style="margin-top:6px">“' + esc(rec.lesson) + '”</div>';
  html += '</div>';
  return html;
}

/* ---------------- LOG ---------------- */
const logState = { dir: null, r: null, tags: { saw: [], mkt: [], felt: [], exec: null }, shot: null };

function renderLog() {
  const el = document.getElementById('view-log');
  const locked = lockState();
  let html = '';
  if (locked.length) {
    html += '<div class="st-locked"><h3>▣ LOCKED</h3><div class="st-muted">' + locked.map(esc).join(' · ') +
      '</div><button class="st-override" id="lockOverride">log anyway — it happened, record it</button></div>';
  }
  html += '<div class="st-card" id="logCard"' + (locked.length && !logState.override ? ' style="display:none"' : '') + '>' +
    '<div class="dir-row">' +
    '<button class="dir-btn long' + (logState.dir === 'L' ? ' on' : '') + '" id="dirL">▲ LONG</button>' +
    '<button class="dir-btn short' + (logState.dir === 'S' ? ' on' : '') + '" id="dirS">▼ SHORT</button></div>' +
    '<label class="st-lbl">Result</label><div class="r-row">' +
    [-2, -1, -0.5, 0.5, 1, 2, 3].map((r) => '<button class="chip r-chip" data-r="' + r + '">' + (r > 0 ? '+' : '') + r + 'R</button>').join('') +
    '<input class="r-input" id="rFree" placeholder="R" inputmode="decimal"></div>' +
    '<div class="r-row" style="margin-top:8px"><span class="st-muted">$</span><input class="r-input" id="usdFree" placeholder="optional" inputmode="decimal" style="width:110px"></div>';

  Object.keys(TAGS).forEach((dim) => {
    html += '<label class="st-lbl">' + TAG_LABELS[dim] + '</label><div class="chip-row">' +
      TAGS[dim].map((t) => {
        const on = dim === 'exec' ? logState.tags.exec === t : logState.tags[dim].includes(t);
        return '<button class="chip ' + dim + (on ? ' on ' + dim : '') + '" data-tag="' + dim + '|' + esc(t) + '">' + esc(t) + '</button>';
      }).join('') + '</div>';
  });

  html += '<label class="st-lbl">Note</label><input class="st-note" id="logNote" placeholder="what happened, in one line">' +
    '<label class="st-lbl">Screenshot</label><div class="shot-drop" id="shotDrop">' +
    (logState.shot ? '<img src="' + logState.shot + '">' : 'paste (Ctrl+V) or tap to attach — optional') +
    '<input type="file" accept="image/*" id="shotFile" style="display:none"></div>' +
    '<button class="save-btn" id="logSave">SAVE TRADE</button></div>';
  el.innerHTML = html;

  const ov = el.querySelector('#lockOverride');
  if (ov) ov.addEventListener('click', () => { logState.override = true; renderLog(); });

  el.querySelector('#dirL').addEventListener('click', () => { logState.dir = 'L'; renderLog(); });
  el.querySelector('#dirS').addEventListener('click', () => { logState.dir = 'S'; renderLog(); });
  el.querySelectorAll('.r-chip').forEach((c) => c.addEventListener('click', () => {
    logState.r = parseFloat(c.dataset.r);
    el.querySelectorAll('.r-chip').forEach((x) => x.classList.toggle('on', parseFloat(x.dataset.r) === logState.r));
    el.querySelector('#rFree').value = '';
  }));
  el.querySelector('#rFree').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) { logState.r = v; el.querySelectorAll('.r-chip').forEach((x) => x.classList.remove('on')); }
  });
  el.querySelectorAll('[data-tag]').forEach((c) => c.addEventListener('click', () => {
    const [dim, tag] = c.dataset.tag.split('|');
    if (dim === 'exec') logState.tags.exec = logState.tags.exec === tag ? null : tag;
    else {
      const arr = logState.tags[dim];
      const i = arr.indexOf(tag);
      i >= 0 ? arr.splice(i, 1) : arr.push(tag);
    }
    renderLog();
  }));

  const drop = el.querySelector('#shotDrop');
  const file = el.querySelector('#shotFile');
  drop.addEventListener('click', () => file.click());
  file.addEventListener('change', () => { if (file.files[0]) compressShot(file.files[0]); });

  el.querySelector('#logSave').addEventListener('click', () => {
    if (!logState.dir || logState.r === null || isNaN(logState.r)) { alert('Direction + result R are the only required fields.'); return; }
    const now = new Date();
    const k = dayKey(now);
    dayRec(k); // ensure day exists + stamped
    const usd = parseFloat(el.querySelector('#usdFree').value);
    const id = 't' + now.getTime();
    let shotId = null;
    if (logState.shot) {
      shotId = id;
      shots[shotId] = logState.shot;
      // local-only cap: keep the newest 30 thumbnails
      const ids = Object.keys(shots).sort();
      while (ids.length > 30) delete shots[ids.shift()];
      stSave(ST_SHOTS_KEY, shots);
    }
    trades.push({
      id, ts: now.getTime(), day: k, dir: logState.dir, r: logState.r,
      usd: isNaN(usd) ? null : usd,
      saw: logState.tags.saw.slice(), mkt: logState.tags.mkt.slice(),
      felt: logState.tags.felt.slice(), exec: logState.tags.exec,
      note: el.querySelector('#logNote').value.trim() || null,
      shot: shotId,
      nums: stampFor(now),           // blind stamp — shown only in stats/reveal
      override: !!logState.override, // logged through a LOCKED state
    });
    stSave(ST_TRADES_KEY, trades);
    logState.dir = null; logState.r = null; logState.shot = null; logState.override = false;
    logState.tags = { saw: [], mkt: [], felt: [], exec: null };
    show('today');
  });
}

/* paste-to-attach works anywhere while the Log view is open */
document.addEventListener('paste', (e) => {
  if (activeView !== 'log') return;
  const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'));
  if (item) compressShot(item.getAsFile());
});

function compressShot(fileBlob) {
  const img = new Image();
  img.onload = () => {
    const scale = Math.min(1, 700 / img.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    logState.shot = canvas.toDataURL('image/jpeg', 0.55);
    URL.revokeObjectURL(img.src);
    renderLog();
  };
  img.src = URL.createObjectURL(fileBlob);
}

/* ---------------- HISTORY ---------------- */
function renderHistory() {
  const el = document.getElementById('view-history');
  if (!trades.length) { el.innerHTML = '<div class="st-card st-muted">No trades yet. The first log starts the story.</div>'; return; }
  const byDay = {};
  trades.forEach((t) => { (byDay[t.day] = byDay[t.day] || []).push(t); });
  let html = '';
  Object.keys(byDay).sort().reverse().forEach((k) => {
    const dt = byDay[k];
    const sumR = dt.reduce((s, t) => s + t.r, 0);
    html += '<div class="day-head"><b>' + k + '</b> · ' + dt.length + ' trades · <span class="' +
      (sumR >= 0 ? 'mu-pos' : 'mu-neg') + '">' + fmtR(sumR) + '</span></div>';
    dt.slice().reverse().forEach((t) => {
      const tags = [].concat(t.saw, t.mkt, t.felt, t.exec ? [t.exec] : []).filter(Boolean);
      html += '<div class="trade-card ' + (t.r >= 0 ? 'win' : 'loss') + '" data-id="' + t.id + '">' +
        '<div class="trade-top"><span class="trade-dir ' + t.dir + '">' + (t.dir === 'L' ? '▲ LONG' : '▼ SHORT') + '</span>' +
        '<span class="trade-r ' + (t.r >= 0 ? 'pos' : 'neg') + '">' + fmtR(t.r) + '</span>' +
        (t.usd != null ? '<span class="st-muted">$' + t.usd + '</span>' : '') +
        (t.override ? '<span class="ttag" style="border-color:#FF4D6D;color:#FF4D6D">override</span>' : '') +
        '<span class="trade-time">' + new Date(t.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</span></div>' +
        (tags.length ? '<div class="trade-tags">' + tags.map((x) => '<span class="ttag">' + esc(x) + '</span>').join('') + '</div>' : '') +
        (t.note ? '<div class="trade-note">' + esc(t.note) + '</div>' : '') +
        (t.shot && shots[t.shot] ? '<img src="' + shots[t.shot] + '" style="max-width:100%;border-radius:6px;margin-top:6px">' : '') +
        '<button class="trade-del" data-del="' + t.id + '">delete</button></div>';
    });
  });
  el.innerHTML = html;
  el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
    if (!confirm('Delete this trade?')) return;
    trades = trades.filter((t) => t.id !== b.dataset.del);
    stSave(ST_TRADES_KEY, trades); renderHistory();
  }));
}

/* ---------------- STATS ---------------- */
function mu(arr) { return arr.length ? arr.reduce((s, t) => s + t.r, 0) / arr.length : null; }
function winRate(arr) { return arr.length ? Math.round(100 * arr.filter((t) => t.r > 0).length / arr.length) : null; }
function muCell(v) { return v == null ? '—' : '<span class="' + (v >= 0 ? 'mu-pos' : 'mu-neg') + '">' + (v >= 0 ? '+' : '') + v.toFixed(2) + 'R</span>'; }

function renderStats() {
  const el = document.getElementById('view-stats');
  if (!trades.length) { el.innerHTML = '<div class="st-card st-muted">Stats wake up after your first trades.</div>'; return; }
  const totR = trades.reduce((s, t) => s + t.r, 0);
  const totUsd = trades.reduce((s, t) => s + (t.usd || 0), 0);
  let html = '<div class="st-card"><h3>All time</h3><table class="stat-table"><tr>' +
    '<td>Trades</td><td>' + trades.length + '</td><td>Win%</td><td>' + winRate(trades) + '%</td></tr><tr>' +
    '<td>Total</td><td class="' + (totR >= 0 ? 'mu-pos' : 'mu-neg') + '">' + fmtR(totR) + '</td>' +
    '<td>μ</td><td>' + muCell(mu(trades)) + '</td></tr>' +
    (totUsd ? '<tr><td>$ P&L</td><td colspan="3" class="' + (totUsd >= 0 ? 'mu-pos' : 'mu-neg') + '">$' + Math.round(totUsd) + '</td></tr>' : '') +
    '</table></div>';

  // Equity curve (cumulative R)
  let cum = 0;
  const pts = trades.map((t) => (cum += t.r));
  const w = 300, h = 80, min = Math.min(0, ...pts), max = Math.max(0.001, ...pts);
  const xy = pts.map((v, i) => (i / Math.max(1, pts.length - 1) * w).toFixed(1) + ',' + (h - (v - min) / (max - min) * h).toFixed(1));
  const zeroY = h - (0 - min) / (max - min) * h;
  html += '<div class="st-card"><h3>Equity (R)</h3><svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:90px">' +
    '<line x1="0" y1="' + zeroY + '" x2="' + w + '" y2="' + zeroY + '" stroke="#223048" stroke-dasharray="3,3"/>' +
    '<polyline fill="none" stroke="' + (cum >= 0 ? '#00FF9C' : '#FF4D6D') + '" stroke-width="2" points="' + xy.join(' ') + '"/></svg></div>';

  // μ by tag — the intuition leaderboard
  Object.keys(TAGS).forEach((dim) => {
    const rows = TAGS[dim].map((tag) => {
      const arr = trades.filter((t) => dim === 'exec' ? t.exec === tag : (t[dim] || []).includes(tag));
      return { tag, arr };
    }).filter((r) => r.arr.length);
    if (!rows.length) return;
    rows.sort((a, b) => (mu(b.arr) || -99) - (mu(a.arr) || -99));
    html += '<div class="st-card"><h3>μ · ' + TAG_LABELS[dim] + '</h3><table class="stat-table"><tr><th>tag</th><th>n</th><th>win%</th><th>μ</th></tr>' +
      rows.map((r) => '<tr><td>' + esc(r.tag) + '</td><td>' + r.arr.length + '</td><td>' + winRate(r.arr) + '%</td><td>' + muCell(mu(r.arr)) + '</td></tr>').join('') +
      '</table></div>';
  });

  // Decision vs outcome matrix
  const graded = trades.filter((t) => t.exec);
  if (graded.length) {
    const good = graded.filter((t) => t.exec === 'A+ clean');
    const bad = graded.filter((t) => t.exec !== 'A+ clean');
    html += '<div class="st-card"><h3>Decision vs outcome</h3><table class="stat-table">' +
      '<tr><th></th><th>n</th><th>win%</th><th>μ</th></tr>' +
      '<tr><td>Good process (A+)</td><td>' + good.length + '</td><td>' + (winRate(good) ?? '—') + '%</td><td>' + muCell(mu(good)) + '</td></tr>' +
      '<tr><td>Broken process</td><td>' + bad.length + '</td><td>' + (winRate(bad) ?? '—') + '%</td><td>' + muCell(mu(bad)) + '</td></tr>' +
      '</table><div class="st-muted" style="margin-top:6px">Good process losing is fine. Broken process winning is the trap.</div></div>';
  }

  // Calendar heatmap — current month
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysIn = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const byDay = {};
  trades.forEach((t) => { byDay[t.day] = (byDay[t.day] || 0) + t.r; });
  html += '<div class="st-card"><h3>' + now.toLocaleString([], { month: 'long' }) + '</h3><div class="cal-grid">';
  for (let i = 0; i < first.getDay(); i++) html += '<div></div>';
  for (let d = 1; d <= daysIn; d++) {
    const k = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(d);
    const r = byDay[k];
    let bgStyle = '';
    if (r != null) {
      const a = Math.min(0.85, 0.25 + Math.abs(r) * 0.18);
      bgStyle = ' style="background:rgba(' + (r >= 0 ? '0,255,156' : '255,77,109') + ',' + a.toFixed(2) + ');color:#04121a;font-weight:700"';
    }
    html += '<div class="cal-cell"' + bgStyle + '>' + d + '</div>';
  }
  html += '</div></div>';

  // The blind test — numerology correlations, WRAPPED/PAST days only so today's
  // numbers can never leak mid-session.
  const todayK = dayKey();
  const revealed = trades.filter((t) => t.day !== todayK || (days[todayK] && days[todayK].wrapped));
  if (revealed.length) {
    const dims = [
      ['Day Energy', (t) => t.nums && t.nums.de],
      ['Universal Day', (t) => t.nums && t.nums.ud],
      ['Compat bucket', (t) => t.nums && t.nums.compat != null ? (t.nums.compat >= 70 ? '70%+' : t.nums.compat >= 40 ? '40-69%' : '<40%') : null],
    ];
    dims.forEach(([label, fn]) => {
      const groups = {};
      revealed.forEach((t) => { const v = fn(t); if (v != null && v !== '') (groups[v] = groups[v] || []).push(t); });
      const keys = Object.keys(groups);
      if (!keys.length) return;
      keys.sort((a, b) => (mu(groups[b]) || -99) - (mu(groups[a]) || -99));
      html += '<div class="st-card"><h3>🐎 Blind test · ' + label + '</h3><table class="stat-table"><tr><th></th><th>n</th><th>win%</th><th>μ</th></tr>' +
        keys.map((g) => '<tr><td>' + esc(String(g)) + '</td><td>' + groups[g].length + '</td><td>' + winRate(groups[g]) + '%</td><td>' + muCell(mu(groups[g])) + '</td></tr>').join('') +
        '</table><div class="st-muted" style="margin-top:6px">You traded these days blind — this is the numbers system tested live.</div></div>';
    });
  }
  el.innerHTML = html;
}

/* ---------------- voice dictation ---------------- */
let lastTA = null;
document.addEventListener('focusin', (e) => { if (e.target.classList && e.target.classList.contains('st-ta')) lastTA = e.target; });
function hookMic(btn, root) {
  if (!btn) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { btn.style.display = 'none'; return; }
  let rec = null;
  btn.addEventListener('click', () => {
    if (rec) { rec.stop(); return; }
    rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    btn.classList.add('rec');
    btn.textContent = '■ stop';
    rec.onresult = (e) => {
      const txt = Array.from(e.results).slice(e.resultIndex).map((r) => r[0].transcript).join(' ');
      const target = lastTA || root.querySelector('#wrapLesson');
      if (target) target.value = (target.value + ' ' + txt).trim();
    };
    rec.onend = () => { btn.classList.remove('rec'); btn.textContent = '🎙 dictate'; rec = null; };
    rec.start();
  });
}

/* ---------------- boot ---------------- */
show('today');

const ASTRO_SIGN_GLYPHS = {
  Aries: '♈', Taurus: '♉', Gemini: '♊', Cancer: '♋', Leo: '♌', Virgo: '♍',
  Libra: '♎', Scorpio: '♏', Sagittarius: '♐', Capricorn: '♑', Aquarius: '♒', Pisces: '♓',
};

let astroCurrentDate = new Date();
astroCurrentDate.setHours(0, 0, 0, 0);

// Which bodies are currently shown on the wheel/table - all on by default.
const astroActiveFilter = new Set(ASTRO_BODIES.map((b) => b.key));

function astroActiveBodies() {
  return ASTRO_BODIES.filter((b) => astroActiveFilter.has(b.key));
}

// The 5 major aspects - angle between two planets' longitudes, within an orb
// (tolerance). All on by default; the dropdown lets you narrow it down.
const ASTRO_ASPECTS = [
  { key: 'conjunction', label: 'Conjunction', glyph: '☌', angle: 0, orb: 6, cssClass: 'conjunction' },
  { key: 'sextile', label: 'Sextile', glyph: '⚹', angle: 60, orb: 4, cssClass: 'sextile' },
  { key: 'square', label: 'Square', glyph: '□', angle: 90, orb: 6, cssClass: 'square' },
  { key: 'trine', label: 'Trine', glyph: '△', angle: 120, orb: 6, cssClass: 'trine' },
  { key: 'opposition', label: 'Opposition', glyph: '☍', angle: 180, orb: 6, cssClass: 'opposition' },
];
const astroActiveAspects = new Set(ASTRO_ASPECTS.map((a) => a.key));

// Shortest angular distance between two longitudes, 0-180.
function angularDiff(a, b) {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

// Every other currently-shown body that bodyKey is in an active aspect with
// right now - the same pairing logic the wheel's aspect lines use, so the
// popup explanation always matches what's actually drawn.
function getAstroAspectsFor(bodyKey, date) {
  const bodyLon = getAstroBodyInfo(bodyKey, date).lon;
  return astroActiveBodies()
    .filter((b) => b.key !== bodyKey)
    .map((other) => {
      const otherLon = getAstroBodyInfo(other.key, date).lon;
      const diff = angularDiff(bodyLon, otherLon);
      const aspect = ASTRO_ASPECTS.find((a) => astroActiveAspects.has(a.key) && Math.abs(diff - a.angle) <= a.orb);
      return aspect ? { aspect, other, orbUsed: Math.abs(diff - aspect.angle) } : null;
    })
    .filter(Boolean);
}

function renderAstroAspectMenu() {
  const menu = document.getElementById('astroAspectDropdown');
  menu.querySelectorAll('input[data-aspect]').forEach((box) => {
    box.addEventListener('change', () => {
      const key = box.dataset.aspect;
      if (box.checked) astroActiveAspects.add(key);
      else astroActiveAspects.delete(key);
      renderAstroWheel(astroCurrentDate);
    });
  });

  document.getElementById('astroAspectAllBtn').addEventListener('click', () => {
    ASTRO_ASPECTS.forEach((a) => astroActiveAspects.add(a.key));
    menu.querySelectorAll('input[data-aspect]').forEach((box) => { box.checked = true; });
    renderAstroWheel(astroCurrentDate);
  });

  document.getElementById('astroAspectNoneBtn').addEventListener('click', () => {
    astroActiveAspects.clear();
    menu.querySelectorAll('input[data-aspect]').forEach((box) => { box.checked = false; });
    renderAstroWheel(astroCurrentDate);
  });
}

function renderAstroFilterBar() {
  const bar = document.getElementById('astroFilterBar');
  bar.innerHTML = ASTRO_BODIES.map((b) => `
    <button type="button" class="astro-filter-chip active" data-key="${b.key}" title="${b.label}">${b.symbol}</button>
  `).join('');
  bar.querySelectorAll('.astro-filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const key = chip.dataset.key;
      if (astroActiveFilter.has(key)) {
        astroActiveFilter.delete(key);
        chip.classList.remove('active');
      } else {
        astroActiveFilter.add(key);
        chip.classList.add('active');
      }
      renderAstroContent(astroCurrentDate);
    });
  });

  document.getElementById('astroFilterAllBtn').addEventListener('click', () => {
    ASTRO_BODIES.forEach((b) => astroActiveFilter.add(b.key));
    bar.querySelectorAll('.astro-filter-chip').forEach((chip) => chip.classList.add('active'));
    renderAstroContent(astroCurrentDate);
  });

  document.getElementById('astroFilterNoneBtn').addEventListener('click', () => {
    astroActiveFilter.clear();
    bar.querySelectorAll('.astro-filter-chip').forEach((chip) => chip.classList.remove('active'));
    renderAstroContent(astroCurrentDate);
  });
}

// Floating popup shown near the cursor when a planet marker (on the wheel or
// in the table) is clicked - the SVG <title> hover tooltip was slow to
// appear and not clickable, so this is a real HTML element positioned at the
// click point. Computes fresh (not from a stale snapshot) so it always
// reflects whatever date is currently being viewed: current sign/degree,
// when the current transit was entered, when it ends, and a day countdown
// with a small progress bar showing how far through the transit today is.
function showAstroTooltip(clientX, clientY, bodyKey) {
  const body = ASTRO_BODIES.find((b) => b.key === bodyKey);
  const date = astroCurrentDate;
  const info = getAstroBodyInfo(bodyKey, date);
  const entered = findPreviousAstroSignChange(bodyKey, date, info.signIndex);
  const leaves = findNextAstroSignChange(bodyKey, date, info.signIndex);

  const fmtDate = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  let progressHtml = '';
  if (entered && leaves) {
    const totalSpan = Math.max(1, Math.round((leaves.date - entered.date) / 86400000));
    const elapsed = Math.round((date - entered.date) / 86400000);
    const pct = Math.min(100, Math.max(0, Math.round((elapsed / totalSpan) * 100)));
    progressHtml = `<div class="astro-tooltip-progress"><div class="astro-tooltip-progress-fill" style="width:${pct}%"></div></div>`;
  }

  const enteredText = entered
    ? `${fmtDate(entered.date)} <span class="astro-tooltip-days">${Math.round((date - entered.date) / 86400000)}d ago</span>`
    : '-';
  const leavesText = leaves
    ? `${fmtDate(leaves.date)} <span class="astro-tooltip-days">${Math.round((leaves.date - date) / 86400000)}d left</span>`
    : '-';

  const activeAspects = getAstroAspectsFor(bodyKey, date);
  const aspectsHtml = activeAspects.length
    ? activeAspects.map(({ aspect, other, orbUsed }) => `
        <div class="astro-tooltip-aspect">
          <span class="astro-aspect-swatch ${aspect.cssClass}"></span>
          ${aspect.glyph} ${aspect.label} ${other.symbol} ${other.label}
          <span class="astro-tooltip-orb">${orbUsed.toFixed(1)}°</span>
        </div>
      `).join('')
    : '<div class="astro-tooltip-aspect-none">No active aspects right now</div>';

  const tip = document.getElementById('astroTooltip');
  tip.innerHTML = `
    <div class="astro-tooltip-title">${body.symbol} ${body.label}${info.retrograde ? ' <span class="astro-retro-badge">℞</span>' : ''}</div>
    <div class="astro-tooltip-body">${ASTRO_SIGN_GLYPHS[info.sign]} ${info.sign} <span class="astro-list-degree">${info.degreeInSign.toFixed(1)}°</span></div>
    ${progressHtml}
    <div class="astro-tooltip-row"><span>Entered</span><span>${enteredText}</span></div>
    <div class="astro-tooltip-row"><span>Leaves</span><span>${leavesText}</span></div>
    <div class="astro-tooltip-aspects">${aspectsHtml}</div>
  `;
  tip.style.left = `${clientX + 14}px`;
  tip.style.top = `${clientY + 14}px`;
  tip.classList.add('visible');
}

function hideAstroTooltip() {
  document.getElementById('astroTooltip').classList.remove('visible');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.astro-planet-marker') && !e.target.closest('#astroTableBody tr')) hideAstroTooltip();
});

function astroFormatInputDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function astroParseInputDate(value) {
  // setFullYear (not the multi-arg constructor) sidesteps JS's legacy
  // two-digit-year quirk, where `new Date(y, ...)` silently remaps any y in
  // 0-99 to 1900+y - which corrupted mid-typing states in the date picker
  // (a transient "0000" year while typing would snap the field to 1900).
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date();
  date.setFullYear(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}

function astroPolarToXY(cx, cy, r, lonDeg) {
  const rad = ((lonDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function astroWedgePath(cx, cy, outerR, innerR, startLon, endLon) {
  const oStart = astroPolarToXY(cx, cy, outerR, startLon);
  const oEnd = astroPolarToXY(cx, cy, outerR, endLon);
  const iEnd = astroPolarToXY(cx, cy, innerR, endLon);
  const iStart = astroPolarToXY(cx, cy, innerR, startLon);
  return `M ${oStart.x} ${oStart.y} A ${outerR} ${outerR} 0 0 1 ${oEnd.x} ${oEnd.y} L ${iEnd.x} ${iEnd.y} A ${innerR} ${innerR} 0 0 0 ${iStart.x} ${iStart.y} Z`;
}

function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

function renderAstroWheel(date) {
  const wheel = document.getElementById('astroWheel');
  wheel.innerHTML = '';
  const cx = 250, cy = 250;

  // Instrument bezel + degree ticks (outermost)
  const bezelR = 246, tickOuterR = 240, tickMinorInnerR = 233, tickMajorInnerR = 225;
  wheel.appendChild(svgEl('circle', { cx, cy, r: bezelR, class: 'astro-bezel' }));

  for (let deg = 0; deg < 360; deg += 5) {
    const isMajor = deg % 30 === 0;
    const innerR = isMajor ? tickMajorInnerR : tickMinorInnerR;
    const p1 = astroPolarToXY(cx, cy, tickOuterR, deg);
    const p2 = astroPolarToXY(cx, cy, innerR, deg);
    wheel.appendChild(svgEl('line', {
      x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
      class: `astro-tick ${isMajor ? 'major' : 'minor'}`,
    }));
  }

  // 12 sign wedges
  const signOuterR = 222, signInnerR = 172;
  for (let i = 0; i < 12; i++) {
    const startLon = i * 30, endLon = i * 30 + 30;
    const wedge = svgEl('path', {
      d: astroWedgePath(cx, cy, signOuterR, signInnerR, startLon, endLon),
      class: `astro-wedge ${i % 2 === 0 ? 'even' : 'odd'}`,
    });
    wheel.appendChild(wedge);

    const glyphPos = astroPolarToXY(cx, cy, (signOuterR + signInnerR) / 2, startLon + 15);
    const badge = svgEl('circle', {
      cx: glyphPos.x, cy: glyphPos.y, r: 15, class: 'astro-sign-badge',
    });
    wheel.appendChild(badge);
    const glyph = svgEl('text', {
      x: glyphPos.x, y: glyphPos.y, class: 'astro-sign-glyph',
      'text-anchor': 'middle', 'dominant-baseline': 'central',
    });
    glyph.textContent = ASTRO_SIGN_GLYPHS[ASTRO_ZODIAC_SIGNS[i]];
    wheel.appendChild(glyph);
  }

  wheel.appendChild(svgEl('circle', { cx, cy, r: signInnerR, class: 'astro-inner-ring' }));
  // Slowly-rotating dashed scan ring for a radar/instrument feel.
  wheel.appendChild(svgEl('circle', { cx, cy, r: 163, class: 'astro-scan-ring' }));

  const coreR = 56;

  // Planet markers, staggered inward when longitudes cluster close together,
  // each with a radial spoke pointing out to the sign ring so it's obvious
  // which wedge every planet actually belongs to.
  const infos = astroActiveBodies().map((b) => ({ ...b, info: getAstroBodyInfo(b.key, date) }));
  infos.sort((a, b) => a.info.lon - b.info.lon);

  // Greedy placement: try the outermost radius first, and only step inward
  // if that spot is actually too close (in real pixels, not just degrees) to
  // a marker already placed - a flat angular threshold alone breaks down
  // because the same angular gap is a much smaller pixel gap once you've
  // already stepped inward, or when only two bodies barely miss a fixed cutoff.
  const radiusStep = 30;
  const minSeparationPx = 36;
  const minMarkerR = coreR + 24;
  const outerMarkerR = signInnerR - 30;
  const placedPositions = [];
  const placed = infos.map((entry) => {
    let r = outerMarkerR;
    let pos = astroPolarToXY(cx, cy, r, entry.info.lon);
    while (
      r > minMarkerR
      && placedPositions.some((p) => Math.hypot(p.x - pos.x, p.y - pos.y) < minSeparationPx)
    ) {
      r -= radiusStep;
      pos = astroPolarToXY(cx, cy, r, entry.info.lon);
    }
    placedPositions.push(pos);
    return { entry, pos, r };
  });

  // Aspect lines - drawn before the markers so the markers sit on top of
  // them, connecting every pair of shown planets whose angular separation
  // falls within an active aspect's orb.
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const diff = angularDiff(placed[i].entry.info.lon, placed[j].entry.info.lon);
      const aspect = ASTRO_ASPECTS.find((a) => astroActiveAspects.has(a.key) && Math.abs(diff - a.angle) <= a.orb);
      if (!aspect) continue;
      wheel.appendChild(svgEl('line', {
        x1: placed[i].pos.x, y1: placed[i].pos.y, x2: placed[j].pos.x, y2: placed[j].pos.y,
        class: `astro-aspect-line astro-aspect-${aspect.cssClass}`,
      }));
    }
  }

  placed.forEach(({ entry, pos, r }) => {
    const retro = entry.info.retrograde;

    const spokeStart = astroPolarToXY(cx, cy, r + 20, entry.info.lon);
    const spokeEnd = astroPolarToXY(cx, cy, signInnerR, entry.info.lon);
    wheel.appendChild(svgEl('line', {
      x1: spokeStart.x, y1: spokeStart.y, x2: spokeEnd.x, y2: spokeEnd.y,
      class: `astro-spoke ${retro ? 'retro' : ''}`,
    }));

    const group = svgEl('g', { class: 'astro-planet-marker' });
    group.appendChild(svgEl('circle', { cx: pos.x, cy: pos.y, r: 18, class: `astro-planet-glow ${retro ? 'retro' : ''}` }));
    group.appendChild(svgEl('circle', { cx: pos.x, cy: pos.y, r: 12.5, class: `astro-planet-dot ${retro ? 'retro' : ''}` }));
    const label = svgEl('text', {
      x: pos.x, y: pos.y, class: 'astro-planet-symbol',
      'text-anchor': 'middle', 'dominant-baseline': 'central',
    });
    label.textContent = entry.symbol;
    group.appendChild(label);

    if (retro) {
      // Fixed screen-space offset (not polar) so the badge sits consistently
      // at the marker's upper-right corner regardless of its angle on the
      // wheel, instead of drifting toward whatever neighbor is at +8 degrees.
      const chipPos = { x: pos.x + 13, y: pos.y - 13 };
      const chip = svgEl('g', { class: 'astro-retro-chip' });
      chip.appendChild(svgEl('circle', { cx: chipPos.x, cy: chipPos.y, r: 8 }));
      const chipText = svgEl('text', {
        x: chipPos.x, y: chipPos.y, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      });
      chipText.textContent = 'R';
      chip.appendChild(chipText);
      group.appendChild(chip);
    }

    group.addEventListener('click', (e) => {
      e.stopPropagation();
      showAstroTooltip(e.clientX, e.clientY, entry.key);
    });
    wheel.appendChild(group);
  });
  // Center is left as empty space on purpose - aspect lines cross straight
  // through it, and text there collided with them.
}

// Current sign/degree/retrograde for every shown body. Entry/leave dates for
// the current transit are computed lazily per-planet in showAstroTooltip()
// when a row (or wheel marker) is actually clicked, not eagerly for all 10
// here - that's what keeps this render instant.
function renderAstroListFast(date) {
  const body = document.getElementById('astroTableBody');
  body.innerHTML = astroActiveBodies().map((b) => {
    const info = getAstroBodyInfo(b.key, date);
    return `
      <tr id="astroRow-${b.key}">
        <td class="astro-td-planet"><span class="astro-list-symbol">${b.symbol}</span>${b.label}</td>
        <td class="astro-td-sign">${ASTRO_SIGN_GLYPHS[info.sign]} ${info.sign} <span class="astro-list-degree">${info.degreeInSign.toFixed(1)}°</span>${info.retrograde ? '<span class="astro-retro-badge" title="Retrograde">℞</span>' : ''}</td>
      </tr>
    `;
  }).join('');
}

// Renders the wheel + list only - never touches the date <input> itself.
// Writing to input.value while the user is actively editing that same field
// (which the 'change'/'input' handler below is reacting to) resets the
// native widget's internal per-segment editing state mid-keystroke - that
// feedback loop was what made typing a year "stop working" / scramble.
function renderAstroContent(date) {
  renderAstroWheel(date);
  renderAstroListFast(date);
}

function renderAstro() {
  document.getElementById('astroDateInput').value = astroFormatInputDate(astroCurrentDate);
  renderAstroContent(astroCurrentDate);
}

// Delegated (not rebuilt per render, since the rows themselves are rebuilt
// on every date change) - clicking anywhere on a row shows the same transit
// detail popup the wheel markers use.
document.getElementById('astroTableBody').addEventListener('click', (e) => {
  const row = e.target.closest('tr[id^="astroRow-"]');
  if (!row) return;
  const bodyKey = row.id.replace('astroRow-', '');
  showAstroTooltip(e.clientX, e.clientY, bodyKey);
});

document.getElementById('astroPrevBtn').addEventListener('click', () => {
  astroCurrentDate.setDate(astroCurrentDate.getDate() - 1);
  renderAstro();
});

document.getElementById('astroNextBtn').addEventListener('click', () => {
  astroCurrentDate.setDate(astroCurrentDate.getDate() + 1);
  renderAstro();
});

document.getElementById('astroTodayBtn').addEventListener('click', () => {
  astroCurrentDate = new Date();
  astroCurrentDate.setHours(0, 0, 0, 0);
  renderAstro();
});

// 'change' (not 'input') - only fires once a full date is committed, instead
// of on every keystroke/spinner-tick while the native date picker is mid-edit.
// Deliberately does NOT call renderAstro() - that would reassign this same
// input's .value while it may still hold focus, which is what broke typing.
document.getElementById('astroDateInput').addEventListener('change', (e) => {
  if (!e.target.value) return;
  astroCurrentDate = astroParseInputDate(e.target.value);
  renderAstroContent(astroCurrentDate);
});

renderAstroFilterBar();
renderAstroAspectMenu();
renderAstro();

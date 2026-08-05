/* App-wide bottom tab bar (The Stable's nav pattern, promoted to the whole
   app). Self-contained: injects its own CSS + markup, replaces the scrolling
   topnav (hidden, markup left untouched), and highlights the active tab —
   including on sub-pages (UFC under Markets, category under Tools, etc.).
   stable.html does NOT load this: it keeps its own internal tab bar. */
(function () {
  const TABS = [
    { id: 'markets', icon: '📈', label: 'Markets', items: [
      { href: 'sports-betting.html', icon: '🎯', label: 'Sports Betting' },
      { href: 'stocks.html', icon: '📊', label: 'Stocks' },
    ], match: ['sports-betting', 'betting', 'bet-log', 'stats', 'polymarket', 'ufc', 'tennis', 'stocks'] },
    { id: 'days', icon: '📅', label: 'Days', items: [
      { href: 'calendar.html', icon: '📅', label: 'Calendar' },
      { href: 'astrology.html', icon: '🌙', label: 'Astrology' },
    ], match: ['calendar', 'astrology'] },
    { id: 'stable', icon: '🐎', label: 'Stable', href: 'stable.html', match: ['stable'] },
    { id: 'tools', icon: '🧮', label: 'Tools', items: [
      { href: 'calculator.html', icon: '🧮', label: 'Calculator' },
      { href: 'compatibility.html', icon: '🤝', label: 'Compatibility' },
      { href: 'famous.html', icon: '⭐', label: 'Famous Lookup' },
      { href: 'database.html', icon: '🗂', label: 'Database' },
      { href: 'emax.html', icon: '⚡', label: 'EMAX' },
      { href: 'restore.html', icon: '☁', label: 'Cloud Restore' },
    ], match: ['calculator', 'compatibility', 'famous', 'database', 'category', 'emax', 'restore'] },
    { id: 'profile', icon: '👤', label: 'Profile', href: 'profile.html', match: ['profile'] },
  ];

  const file = (location.pathname.split('/').pop() || 'profile.html').replace('.html', '') || 'profile';
  const activeTab = TABS.find((t) => t.match.some((m) => file === m || file.startsWith(m)));

  // Ground truth from device telemetry (iPhone 15 Pro Max): in the installed
  // app, scroll-locked pages get an 873pt canvas on a 932pt screen — the
  // bottom 59pt (status-bar height) is UNPAINTABLE, so no fixed/sticky/
  // translate trick can ever reach it. The Stable (normal document scroll)
  // gets the full canvas under identical meta tags. So in standalone mode we
  // unlock document scrolling (neutralize the .scroll-viewport lock) and let
  // plain fixed positioning work exactly like it does on The Stable.
  if (navigator.standalone === true) document.documentElement.classList.add('bb-standalone');

  const css = `
    .topnav { display: none !important; }
    /* iOS standalone (home-screen app) reports a layout viewport ~78pt short
       on these scroll-locked pages — Safari proper is fine, The Stable
       (document scrolls) is fine. Every anchoring strategy inherits the lie,
       so the frame measures the shortfall (screen.height - innerHeight) and
       translates itself down by exactly that much. Fixed on body: fixed
       descendants escape ancestor overflow clipping, so the translated bar
       still paints in the zone below the misreported viewport bottom. */
    .bb-frame { position: fixed; inset: 0; z-index: 500; display: flex; flex-direction: column;
      justify-content: flex-end; pointer-events: none; }
    body:has(> .bb-frame) .page { padding-bottom: calc(84px + env(safe-area-inset-bottom)); }
    /* Standalone unlock: give these pages The Stable's proven conditions —
       the document scrolls, the canvas runs full-screen, fixed lands true.
       (Safari keeps the scroll-lock and its anti-drift benefits.) */
    html.bb-standalone, html.bb-standalone body { height: auto !important; overflow-y: auto !important; }
    html.bb-standalone .scroll-viewport { position: static !important; inset: auto !important;
      overflow: visible !important; }
    /* style.css parks the sign-in pill bottom-right on phones — that spot
       belongs to the bar now, so the pill goes back up top on bar pages.
       Top-RIGHT is its exclusive territory (update pill keeps top-left).
       Collapsed to a small cloud-only circle — the email was eating a whole
       strip of screen; tap behavior (sign-in / account) is unchanged. */
    .auth-widget { top: calc(env(safe-area-inset-top) + 12px) !important; bottom: auto !important;
      right: 10px !important; left: auto !important; z-index: 95;
      width: 38px; height: 38px; border-radius: 50% !important; padding: 0 !important;
      overflow: hidden; font-size: 0 !important; display: flex; align-items: center; justify-content: center; }
    .auth-widget::before { content: '☁️'; font-size: 17px; }
    .auth-widget * { font-size: 0 !important; }
    .bb-bar { pointer-events: auto; display: flex;
      background: var(--panel, #0a0f1a); border-top: 1px solid var(--border, #223048);
      padding-bottom: env(safe-area-inset-bottom); }
    .bb-tab { flex: 1; padding: 9px 0 8px; background: none; border: none; cursor: pointer;
      color: var(--muted, #5b6a80); font-size: 10px; letter-spacing: .5px; font-family: inherit; }
    .bb-tab span { display: block; font-size: 20px; margin-bottom: 2px; }
    .bb-tab.active { color: var(--yellow, #f5c542); }
    .bb-backdrop { position: fixed; inset: 0; z-index: 490; background: rgba(0,0,0,.5); display: none; }
    .bb-backdrop.open { display: block; }
    .bb-sheet { pointer-events: auto; margin: 0 auto 8px; width: calc(100% - 20px); max-width: 420px;
      background: var(--panel, #0a0f1a); border: 1px solid var(--border, #223048);
      border-radius: 14px; padding: 6px; display: none;
      box-shadow: 0 -6px 30px rgba(0,0,0,.5); }
    .bb-sheet.open { display: block; animation: bbUp .16s ease; }
    @keyframes bbUp { from { transform: translateY(12px); opacity: 0; } to { transform: none; opacity: 1; } }
    .bb-item { display: flex; align-items: center; gap: 12px; width: 100%; padding: 13px 14px;
      background: none; border: none; border-radius: 10px; cursor: pointer; font-family: inherit;
      color: var(--text, #dfe7f3); font-size: 15px; text-align: left; }
    .bb-item .bb-ico { font-size: 19px; width: 24px; text-align: center; }
    .bb-item.active { background: rgba(245, 197, 66, .12); color: var(--yellow, #f5c542); }
  `;

  function build() {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    const backdrop = document.createElement('div');
    backdrop.className = 'bb-backdrop';
    document.body.appendChild(backdrop);

    // Full-screen click-through frame; sheets + bar bottom-align inside it
    // (the both-edges-anchored geometry that lands true in standalone iOS).
    const frame = document.createElement('div');
    frame.className = 'bb-frame';

    const bar = document.createElement('nav');
    bar.className = 'bb-bar';
    const sheets = {};

    TABS.forEach((tab) => {
      const btn = document.createElement('button');
      btn.className = 'bb-tab' + (activeTab && activeTab.id === tab.id ? ' active' : '');
      btn.innerHTML = '<span>' + tab.icon + '</span>' + tab.label;
      if (tab.href) {
        btn.addEventListener('click', () => {
          if (window.gkNavigate) window.gkNavigate(tab.href); else location.href = tab.href;
        });
      } else {
        const sheet = document.createElement('div');
        sheet.className = 'bb-sheet';
        tab.items.forEach((item) => {
          const it = document.createElement('button');
          const itFile = item.href.replace('.html', '');
          it.className = 'bb-item' + (file === itFile ? ' active' : '');
          it.innerHTML = '<span class="bb-ico">' + item.icon + '</span>' + item.label;
          it.addEventListener('click', () => {
            if (window.gkNavigate) window.gkNavigate(item.href); else location.href = item.href;
          });
          sheet.appendChild(it);
        });
        frame.appendChild(sheet);
        sheets[tab.id] = sheet;
        btn.addEventListener('click', () => {
          const wasOpen = sheet.classList.contains('open');
          closeAll();
          if (!wasOpen) { sheet.classList.add('open'); backdrop.classList.add('open'); }
        });
      }
      bar.appendChild(btn);
    });

    function closeAll() {
      Object.values(sheets).forEach((s) => s.classList.remove('open'));
      backdrop.classList.remove('open');
    }
    backdrop.addEventListener('click', closeAll);

    frame.appendChild(bar);
    document.body.appendChild(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();

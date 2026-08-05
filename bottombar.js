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
    ], match: ['calculator', 'compatibility', 'famous', 'database', 'category', 'emax'] },
    { id: 'profile', icon: '👤', label: 'Profile', href: 'profile.html', match: ['profile'] },
  ];

  const file = (location.pathname.split('/').pop() || 'profile.html').replace('.html', '') || 'profile';
  const activeTab = TABS.find((t) => t.match.some((m) => file === m || file.startsWith(m)));

  const css = `
    .topnav { display: none !important; }
    body { padding-bottom: calc(74px + env(safe-area-inset-bottom)); }
    .bb-bar { position: fixed; bottom: 0; left: 0; right: 0; z-index: 500; display: flex;
      background: var(--panel, #0a0f1a); border-top: 1px solid var(--border, #223048);
      padding-bottom: env(safe-area-inset-bottom);
      transform: translateZ(0); -webkit-transform: translateZ(0); will-change: transform; }
    .bb-tab { flex: 1; padding: 9px 0 8px; background: none; border: none; cursor: pointer;
      color: var(--muted, #5b6a80); font-size: 10px; letter-spacing: .5px; font-family: inherit; }
    .bb-tab span { display: block; font-size: 20px; margin-bottom: 2px; }
    .bb-tab.active { color: var(--yellow, #f5c542); }
    .bb-backdrop { position: fixed; inset: 0; z-index: 490; background: rgba(0,0,0,.5); display: none; }
    .bb-backdrop.open { display: block; }
    .bb-sheet { position: fixed; left: 10px; right: 10px; bottom: calc(66px + env(safe-area-inset-bottom));
      z-index: 495; background: var(--panel, #0a0f1a); border: 1px solid var(--border, #223048);
      border-radius: 14px; padding: 6px; display: none; max-width: 420px; margin: 0 auto;
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

    const bar = document.createElement('nav');
    bar.className = 'bb-bar';
    const sheets = {};

    TABS.forEach((tab) => {
      const btn = document.createElement('button');
      btn.className = 'bb-tab' + (activeTab && activeTab.id === tab.id ? ' active' : '');
      btn.innerHTML = '<span>' + tab.icon + '</span>' + tab.label;
      if (tab.href) {
        btn.addEventListener('click', () => { location.href = tab.href; });
      } else {
        const sheet = document.createElement('div');
        sheet.className = 'bb-sheet';
        tab.items.forEach((item) => {
          const it = document.createElement('button');
          const itFile = item.href.replace('.html', '');
          it.className = 'bb-item' + (file === itFile ? ' active' : '');
          it.innerHTML = '<span class="bb-ico">' + item.icon + '</span>' + item.label;
          it.addEventListener('click', () => { location.href = item.href; });
          sheet.appendChild(it);
        });
        document.body.appendChild(sheet);
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

    document.body.appendChild(bar);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();

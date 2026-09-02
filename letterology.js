// Letterology (Boost13, 2026-09-01; mobile UX rework 2026-09-02).
// Entirely new, standalone math: no existing letter-to-number system in
// this codebase to reuse (checked numerology.js/compat-engine.js/db-core.js
// first - none exists). Deliberately does NOT reuse numerology.js's
// reduceNumber(), which special-cases specific birthdate-only values
// (28 stays 28, 20 jumps to 11) that would misfire on letter positions
// (S=19, T=20 both fall inside that special table) - this ships its own
// reduceLetterTotal() with a purpose-built conserved-number set instead.
//
// 2026-09-02: mobile UX rework only (owner's explicit call - do not touch
// the math). All 7 functions from "the core" comment down through
// reduceLetterTotal() are byte-identical to the original 2026-09-01
// version; everything below that is new rendering/UX around the same
// engine, plus a new per-word breakdown that reuses letterValue()/
// reduceLetterTotal() rather than duplicating their logic.
(function () {
  'use strict';

  /* ------------------------------------------------------- the core -- */
  var ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var VOWELS = { A: 1, E: 1, I: 1, O: 1, U: 1 };

  function pythagoreanValue(letter) {
    var pos = ALPHA.indexOf(letter) + 1;
    return ((pos - 1) % 9) + 1;
  }

  function letterValue(letter, mode) {
    var pos = ALPHA.indexOf(letter) + 1;
    if (pos <= 0) return 0;
    if (mode === 'positional') return pos;
    if (mode === 'master' && (letter === 'K' || letter === 'V')) return pos;
    return pythagoreanValue(letter);
  }

  var BASE_CONSERVED = [11, 22, 33, 13, 28, 19, 31, 82, 91];
  var CONSERVED_KEY = 'ltr_conserved_extra_v1';

  function loadExtraConserved() {
    try {
      var raw = localStorage.getItem(CONSERVED_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter(function (n) { return Number.isInteger(n) && n > 0; }) : [];
    } catch (e) { return []; }
  }

  function saveExtraConserved(list) {
    try { localStorage.setItem(CONSERVED_KEY, JSON.stringify(list)); } catch (e) {}
  }

  function conservedSet() {
    return BASE_CONSERVED.concat(loadExtraConserved());
  }

  function digitSum(n) {
    return String(n).split('').reduce(function (sum, ch) {
      var d = Number(ch);
      return isNaN(d) ? sum : sum + d;
    }, 0);
  }

  function reduceLetterTotal(n, conserved) {
    if (conserved.indexOf(n) !== -1) return n;
    var sum = digitSum(n);
    if (conserved.indexOf(sum) !== -1) return sum;
    return ((sum - 1) % 9) + 1;
  }

  /* ------------------------------------------------------------- state -- */
  var mode = 'master';
  var MODE_EXPLAIN = {
    reduced: 'Letters repeat from 1 through 9.',
    master: 'The same system, but K stays 11 and V stays 22.',
    positional: "Uses each letter's alphabet position, A = 1 through Z = 26.",
  };

  function perLetterFor(chars, m) {
    return chars.map(function (ch) { return { ch: ch, val: letterValue(ch, m) }; });
  }

  function totalOf(perLetter) {
    return perLetter.reduce(function (s, l) { return s + l.val; }, 0);
  }

  // Splits the raw input into words (for the per-word subtotal breakdown)
  // and also flattens them back into one continuous letter sequence for
  // the whole-phrase totals - identical letters, identical order, as the
  // original single-pass "strip everything but A-Z" approach, so the
  // full-phrase numbers this produces are unchanged from before.
  function compute(raw, m) {
    var rawStr = raw || '';
    var hasIgnored = /[^A-Za-z\s]/.test(rawStr);

    var wordChunks = rawStr.toUpperCase().split(/\s+/)
      .map(function (w) { return w.split('').filter(function (ch) { return ALPHA.indexOf(ch) !== -1; }); })
      .filter(function (letters) { return letters.length > 0; });

    var allLetters = [].concat.apply([], wordChunks);
    if (!allLetters.length) return { hasIgnored: hasIgnored, empty: true };

    var conserved = conservedSet();
    var perLetter = perLetterFor(allLetters, m);
    var wordUnreduced = totalOf(perLetter);
    var first = perLetter[0];
    var firstVowelEntry = perLetter.find(function (l) { return VOWELS[l.ch]; }) || null;
    var first2 = perLetter.slice(0, 2);
    var first2Unreduced = totalOf(first2);
    var vowelLetters = perLetter.filter(function (l) { return VOWELS[l.ch]; });
    var consonantLetters = perLetter.filter(function (l) { return !VOWELS[l.ch]; });
    var vowelsUnreduced = totalOf(vowelLetters);
    var consonantsUnreduced = totalOf(consonantLetters);

    var words = wordChunks.map(function (letters) {
      var pl = perLetterFor(letters, m);
      var u = totalOf(pl);
      return { chars: letters.join(''), perLetter: pl, unreduced: u, reduced: reduceLetterTotal(u, conserved) };
    });

    return {
      hasIgnored: hasIgnored,
      empty: false,
      words: words,
      displayWord: words.map(function (w) { return w.chars; }).join(' '),
      perLetter: perLetter,
      wordUnreduced: wordUnreduced,
      wordReduced: reduceLetterTotal(wordUnreduced, conserved),
      first: first,
      firstVowel: firstVowelEntry,
      first2Unreduced: first2.length === 2 ? first2Unreduced : null,
      first2Reduced: first2.length === 2 ? reduceLetterTotal(first2Unreduced, conserved) : null,
      first2Chars: first2.map(function (l) { return l.ch; }).join(''),
      vowelsUnreduced: vowelLetters.length ? vowelsUnreduced : null,
      vowelsReduced: vowelLetters.length ? reduceLetterTotal(vowelsUnreduced, conserved) : null,
      consonantsUnreduced: consonantLetters.length ? consonantsUnreduced : null,
      consonantsReduced: consonantLetters.length ? reduceLetterTotal(consonantsUnreduced, conserved) : null,
    };
  }

  /* ------------------------------------------------------------ render -- */
  var EXAMPLES = ['CODE', 'BITCOIN', 'MICHAEL JACKSON'];

  function chainRow(label, sublabel, unreduced, value) {
    var subHtml = sublabel ? '<div class="ltr-result-sublabel">' + sublabel + '</div>' : '';
    var chainHtml = unreduced == null
      ? '<span class="ltr-result-value">' + (value == null ? '–' : value) + '</span>'
      : '<span class="ltr-result-chain">' +
          '<span class="ltr-result-unreduced">' + unreduced + '</span>' +
          '<span class="ltr-result-arrow">→</span>' +
          '<span class="ltr-result-value">' + value + '</span>' +
        '</span>';
    return '<div class="ltr-result-row">' +
      '<div class="ltr-result-label-wrap"><div class="ltr-result-label">' + label + '</div>' + subHtml + '</div>' +
      chainHtml +
      '</div>';
  }

  function letterTiles(perLetter) {
    return perLetter.map(function (l) {
      return '<div class="ltr-letter-chip"><div class="ltr-letter-chip-char">' + l.ch + '</div>' +
        '<div class="ltr-letter-chip-val">' + l.val + '</div></div>';
    }).join('');
  }

  function render() {
    var wordEl = document.getElementById('ltrWord');
    var raw = wordEl.value || '';
    var r = compute(raw, mode);

    var noticeEl = document.getElementById('ltrNotice');
    noticeEl.style.display = r.hasIgnored ? '' : 'none';

    var clearBtn = document.getElementById('ltrClearBtn');
    clearBtn.style.display = raw ? '' : 'none';

    var emptyEl = document.getElementById('ltrEmpty');
    var mainEl = document.getElementById('ltrMain');
    var wordRowsEl = document.getElementById('ltrWordRows');
    var resultsEl = document.getElementById('ltrResults');
    var lettersGroupsEl = document.getElementById('ltrLettersGroups');
    var letterMathPanel = document.getElementById('ltrLetterMathPanel');

    if (r.empty) {
      emptyEl.innerHTML = '<div class="ltr-empty">' +
        '<div class="ltr-empty-text">Enter a word, name, or phrase to decode it.</div>' +
        '<div class="ltr-empty-examples">' +
        EXAMPLES.map(function (ex) { return '<button type="button" class="ltr-example-chip" data-example="' + ex + '">' + ex + '</button>'; }).join('') +
        '</div></div>';
      mainEl.innerHTML = '';
      wordRowsEl.innerHTML = '';
      resultsEl.innerHTML = '';
      lettersGroupsEl.innerHTML = '';
      letterMathPanel.style.display = 'none';
      wireExamples();
      return;
    }

    emptyEl.innerHTML = '';
    letterMathPanel.style.display = '';

    mainEl.innerHTML = '<div class="ltr-main-card">' +
      '<div class="ltr-main-word">' + r.displayWord + '</div>' +
      '<div class="ltr-main-chain">' +
        '<span class="ltr-main-unreduced">' + r.wordUnreduced + '</span>' +
        '<span class="ltr-main-arrow">→</span>' +
        '<span class="ltr-main-value">' + r.wordReduced + '</span>' +
      '</div></div>';

    wordRowsEl.innerHTML = r.words.length > 1 ? r.words.map(function (w) {
      return '<div class="ltr-word-row">' +
        '<span class="ltr-word-row-label">' + w.chars + '</span>' +
        '<span class="ltr-word-row-chain">' +
          '<span class="ltr-word-row-unreduced">' + w.unreduced + '</span>' +
          '<span class="ltr-word-row-arrow">→</span>' +
          '<span class="ltr-word-row-value">' + w.reduced + '</span>' +
        '</span></div>';
    }).join('') : '';

    resultsEl.innerHTML =
      chainRow('First Letter (' + r.first.ch + ')', null, null, r.first.val) +
      chainRow(r.firstVowel ? 'First Vowel (' + r.firstVowel.ch + ')' : 'First Vowel', null, null, r.firstVowel ? r.firstVowel.val : null) +
      chainRow(r.first2Chars ? 'First Two Letters (' + r.first2Chars + ')' : 'First Two Letters', null, r.first2Unreduced, r.first2Reduced) +
      chainRow('Inner Drive', 'Vowels, also called Soul Urge', r.vowelsUnreduced, r.vowelsReduced) +
      chainRow('Outer Expression', 'Consonants, also called Personality', r.consonantsUnreduced, r.consonantsReduced);

    lettersGroupsEl.innerHTML = r.words.map(function (w) {
      return '<div class="ltr-letter-word-group">' +
        '<div class="ltr-letter-word-group-label">' + w.chars + '</div>' +
        '<div class="ltr-letters">' + letterTiles(w.perLetter) + '</div>' +
        '</div>';
    }).join('');
  }

  function wireExamples() {
    document.querySelectorAll('.ltr-example-chip').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var wordEl = document.getElementById('ltrWord');
        wordEl.value = btn.dataset.example;
        render();
      });
    });
  }

  /* --------------------------------------------------------- settings -- */
  function renderConserved() {
    var listEl = document.getElementById('ltrConservedList');
    var extra = loadExtraConserved();
    var html = BASE_CONSERVED.map(function (n) {
      return '<span class="ltr-conserved-chip ltr-conserved-default">' + n + '<button type="button" tabindex="-1" aria-hidden="true"></button></span>';
    }).join('');
    html += extra.map(function (n) {
      return '<span class="ltr-conserved-chip" data-n="' + n + '">' + n + '<button type="button" title="Remove">×</button></span>';
    }).join('');
    html += '<span class="ltr-conserved-chip" style="border-style:dashed;color:var(--muted)">+ Add below</span>';
    listEl.innerHTML = html;

    listEl.querySelectorAll('.ltr-conserved-chip[data-n] button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var n = Number(btn.parentElement.dataset.n);
        var extra2 = loadExtraConserved().filter(function (x) { return x !== n; });
        saveExtraConserved(extra2);
        renderConserved();
        render();
      });
    });
  }

  function addConserved() {
    var input = document.getElementById('ltrAddConserved');
    var n = parseInt(input.value, 10);
    if (!Number.isInteger(n) || n <= 0) return;
    var extra = loadExtraConserved();
    if (BASE_CONSERVED.indexOf(n) === -1 && extra.indexOf(n) === -1) {
      extra.push(n);
      saveExtraConserved(extra);
    }
    input.value = '';
    renderConserved();
    render();
  }

  /* -------------------------------------------------------------- wire -- */
  document.getElementById('ltrWord').addEventListener('input', render);

  document.getElementById('ltrClearBtn').addEventListener('click', function () {
    var wordEl = document.getElementById('ltrWord');
    wordEl.value = '';
    wordEl.focus();
    render();
  });

  document.getElementById('ltrModeRow').addEventListener('click', function (e) {
    var btn = e.target.closest('.ltr-mode-btn');
    if (!btn) return;
    mode = btn.dataset.mode;
    document.querySelectorAll('.ltr-mode-btn').forEach(function (b) { b.classList.toggle('active', b === btn); });
    document.getElementById('ltrModeExplain').textContent = MODE_EXPLAIN[mode];
    render();
  });

  document.getElementById('ltrSettingsBtn').addEventListener('click', function () {
    var panel = document.getElementById('ltrSettingsPanel');
    panel.open = !panel.open;
    if (panel.open) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.getElementById('ltrAddConservedBtn').addEventListener('click', addConserved);
  document.getElementById('ltrAddConserved').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') addConserved();
  });

  document.getElementById('ltrModeExplain').textContent = MODE_EXPLAIN[mode];
  renderConserved();
  render();
})();

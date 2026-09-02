// Letterology (Boost13, 2026-09-01; mobile UX reworks 2026-09-02, 2026-09-03).
// Entirely new, standalone math: no existing letter-to-number system in
// this codebase to reuse (checked numerology.js/compat-engine.js/db-core.js
// first - none exists). Deliberately does NOT reuse numerology.js's
// reduceNumber(), which special-cases specific birthdate-only values
// (28 stays 28, 20 jumps to 11) that would misfire on letter positions
// (S=19, T=20 both fall inside that special table) - this ships its own
// reduceLetterTotal() with a purpose-built conserved-number set instead.
//
// 2026-09-03: owner-authorized calculation change - Y now counts as a
// vowel (was A/E/I/O/U only). Applies everywhere VOWELS is consulted:
// First Vowel, Inner Drive, Outer Expression, no-vowel fallback. This is
// the only math change in this revision; everything else below is UI-only
// per the owner's explicit "do not change any formulas" constraint.
(function () {
  'use strict';

  /* ------------------------------------------------------- the core -- */
  var ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var VOWELS = { A: 1, E: 1, I: 1, O: 1, U: 1, Y: 1 };

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

  // Decomposes accented Latin letters (JOSE, BEYONCE, MUNOZ, ...) into
  // base letter + combining mark, then drops the mark - generic, not a
  // manual per-character table, so it isn't limited to a fixed accent list.
  function normalizeAccents(str) {
    return str.normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  /* ------------------------------------------------------------- state -- */
  var MODE_KEY = 'ltr_mode_v1';
  var VALID_MODES = { reduced: 1, master: 1, positional: 1 };

  function loadMode() {
    try {
      var saved = localStorage.getItem(MODE_KEY);
      return VALID_MODES[saved] ? saved : 'master';
    } catch (e) { return 'master'; }
  }

  function saveMode(m) {
    try { localStorage.setItem(MODE_KEY, m); } catch (e) {}
  }

  var mode = loadMode();
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
    var rawStr = normalizeAccents(raw || '');
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
      letterCount: perLetter.length,
      wordUnreduced: wordUnreduced,
      wordReduced: reduceLetterTotal(wordUnreduced, conserved),
      first: first,
      firstVowel: firstVowelEntry,
      first2Unreduced: first2.length === 2 ? first2Unreduced : null,
      first2Reduced: first2.length === 2 ? reduceLetterTotal(first2Unreduced, conserved) : null,
      first2Chars: first2.map(function (l) { return l.ch; }).join(''),
      hasFirst2: first2.length === 2,
      vowelsUnreduced: vowelLetters.length ? vowelsUnreduced : null,
      vowelsReduced: vowelLetters.length ? reduceLetterTotal(vowelsUnreduced, conserved) : null,
      hasVowels: vowelLetters.length > 0,
      consonantsUnreduced: consonantLetters.length ? consonantsUnreduced : null,
      consonantsReduced: consonantLetters.length ? reduceLetterTotal(consonantsUnreduced, conserved) : null,
      hasConsonants: consonantLetters.length > 0,
    };
  }

  /* ------------------------------------------------------------ render -- */
  var EXAMPLES = ['CODE', 'BITCOIN', 'MICHAEL JACKSON'];
  var NO_VOWEL_TEXT = 'No standard vowel found';

  // Collapses "9 -> 9" into a plain "9" when the value didn't change on
  // reduction, UNLESS that value is itself a conserved number (then the
  // chain is kept - e.g. "33 -> 33" - since it shows conservation
  // actually happened rather than "nothing to reduce").
  function chainParts(unreduced, value, conserved) {
    if (unreduced == null) return { chain: false, value: value };
    var collapse = unreduced === value && conserved.indexOf(unreduced) === -1;
    return { chain: !collapse, unreduced: unreduced, value: value };
  }

  function chainSpanHtml(parts, unreducedCls, arrowCls, valueCls) {
    if (!parts.chain) {
      return '<span class="' + valueCls + '">' + (parts.value == null ? '–' : parts.value) + '</span>';
    }
    return '<span class="' + unreducedCls + '">' + parts.unreduced + '</span>' +
      '<span class="' + arrowCls + '">→</span>' +
      '<span class="' + valueCls + '">' + parts.value + '</span>';
  }

  function chainText(parts) {
    return parts.chain ? (parts.unreduced + ' → ' + parts.value) : String(parts.value);
  }

  function chainRow(label, sublabel, unreduced, value, conserved) {
    var subHtml = sublabel ? '<div class="ltr-result-sublabel">' + sublabel + '</div>' : '';
    var parts = chainParts(unreduced, value, conserved);
    var valueHtml = '<span class="ltr-result-chain">' +
      chainSpanHtml(parts, 'ltr-result-unreduced', 'ltr-result-arrow', 'ltr-result-value') +
      '</span>';
    return '<div class="ltr-result-row">' +
      '<div class="ltr-result-label-wrap"><div class="ltr-result-label">' + label + '</div>' + subHtml + '</div>' +
      valueHtml +
      '</div>';
  }

  function noVowelRow(label, sublabel) {
    var subHtml = sublabel ? '<div class="ltr-result-sublabel">' + sublabel + '</div>' : '';
    return '<div class="ltr-result-row">' +
      '<div class="ltr-result-label-wrap"><div class="ltr-result-label">' + label + '</div>' + subHtml + '</div>' +
      '<span class="ltr-result-novowel">' + NO_VOWEL_TEXT + '</span>' +
      '</div>';
  }

  function letterTiles(perLetter) {
    return perLetter.map(function (l) {
      return '<div class="ltr-letter-chip"><div class="ltr-letter-chip-char">' + l.ch + '</div>' +
        '<div class="ltr-letter-chip-val">' + l.val + '</div></div>';
    }).join('');
  }

  // Plain-text-only summary for the Copy Results button - no HTML, no UI
  // labels/interpretations/settings, same collapse-chain rule as the
  // on-screen display.
  function buildCopyText(r, m, conserved) {
    var lines = [];
    lines.push(r.displayWord + ' (' + m.charAt(0).toUpperCase() + m.slice(1) + ')');
    lines.push('Word Total: ' + chainText(chainParts(r.wordUnreduced, r.wordReduced, conserved)));
    if (r.words.length > 1) {
      lines.push('');
      r.words.forEach(function (w) {
        lines.push(w.chars + ': ' + chainText(chainParts(w.unreduced, w.reduced, conserved)));
      });
    }
    lines.push('');
    lines.push('Inner Drive: ' + (r.hasVowels ? chainText(chainParts(r.vowelsUnreduced, r.vowelsReduced, conserved)) : NO_VOWEL_TEXT));
    if (r.hasConsonants) {
      lines.push('Outer Expression: ' + chainText(chainParts(r.consonantsUnreduced, r.consonantsReduced, conserved)));
    }
    lines.push('First Letter (' + r.first.ch + '): ' + r.first.val);
    lines.push('First Vowel' + (r.firstVowel ? ' (' + r.firstVowel.ch + ')' : '') + ': ' + (r.firstVowel ? r.firstVowel.val : NO_VOWEL_TEXT));
    if (r.hasFirst2) {
      lines.push('First Two Letters (' + r.first2Chars + '): ' + chainText(chainParts(r.first2Unreduced, r.first2Reduced, conserved)));
    }
    return lines.join('\n');
  }

  var lastResult = null;

  function render() {
    var wordEl = document.getElementById('ltrWord');
    var raw = wordEl.value || '';
    var r = compute(raw, mode);
    lastResult = r;

    var noticeEl = document.getElementById('ltrNotice');
    noticeEl.style.display = r.hasIgnored ? '' : 'none';

    var clearBtn = document.getElementById('ltrClearBtn');
    clearBtn.style.display = raw ? '' : 'none';

    var emptyEl = document.getElementById('ltrEmpty');
    var mainEl = document.getElementById('ltrMain');
    var copyBtn = document.getElementById('ltrCopyBtn');
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
      copyBtn.style.display = 'none';
      wordRowsEl.innerHTML = '';
      resultsEl.innerHTML = '';
      lettersGroupsEl.innerHTML = '';
      letterMathPanel.style.display = 'none';
      wireExamples();
      return;
    }

    var conserved = conservedSet();

    emptyEl.innerHTML = '';
    letterMathPanel.style.display = '';
    copyBtn.style.display = '';
    copyBtn.textContent = 'Copy Results';
    copyBtn.classList.remove('copied');

    mainEl.innerHTML = '<div class="ltr-main-card">' +
      '<div class="ltr-main-word">' + r.displayWord + '</div>' +
      '<div class="ltr-main-chain">' +
        chainSpanHtml(chainParts(r.wordUnreduced, r.wordReduced, conserved), 'ltr-main-unreduced', 'ltr-main-arrow', 'ltr-main-value') +
      '</div></div>';

    wordRowsEl.innerHTML = r.words.length > 1 ? r.words.map(function (w) {
      return '<div class="ltr-word-row">' +
        '<span class="ltr-word-row-label">' + w.chars + '</span>' +
        '<span class="ltr-word-row-chain">' +
          chainSpanHtml(chainParts(w.unreduced, w.reduced, conserved), 'ltr-word-row-unreduced', 'ltr-word-row-arrow', 'ltr-word-row-value') +
        '</span></div>';
    }).join('') : '';

    // Order: Inner Drive and Outer Expression first (owner: "the more
    // important calculations"), then the smaller letter-position details.
    // Rows that can't apply to this input are hidden entirely rather than
    // shown as a dash (Outer Expression with zero consonants, First Two
    // Letters on a single-letter entry); Inner Drive/First Vowel fall back
    // to a compact no-vowel message instead of disappearing.
    var rows = [];
    rows.push(r.hasVowels
      ? chainRow('Inner Drive', 'Vowels, also called Soul Urge', r.vowelsUnreduced, r.vowelsReduced, conserved)
      : noVowelRow('Inner Drive', 'Vowels, also called Soul Urge'));
    if (r.hasConsonants) {
      rows.push(chainRow('Outer Expression', 'Consonants, also called Personality', r.consonantsUnreduced, r.consonantsReduced, conserved));
    }
    rows.push(chainRow('First Letter (' + r.first.ch + ')', null, null, r.first.val, conserved));
    rows.push(r.firstVowel
      ? chainRow('First Vowel (' + r.firstVowel.ch + ')', null, null, r.firstVowel.val, conserved)
      : noVowelRow('First Vowel', null));
    if (r.hasFirst2) {
      rows.push(chainRow('First Two Letters (' + r.first2Chars + ')', null, r.first2Unreduced, r.first2Reduced, conserved));
    }
    resultsEl.innerHTML = rows.join('');

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

  /* ----------------------------------------------------------- copy -- */
  function copyResults() {
    if (!lastResult || lastResult.empty) return;
    var text = buildCopyText(lastResult, mode, conservedSet());
    var copyBtn = document.getElementById('ltrCopyBtn');

    function showCopied() {
      copyBtn.textContent = 'Copied';
      copyBtn.classList.add('copied');
      setTimeout(function () {
        copyBtn.textContent = 'Copy Results';
        copyBtn.classList.remove('copied');
      }, 1500);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(showCopied, function () { fallbackCopy(text, showCopied); });
    } else {
      fallbackCopy(text, showCopied);
    }
  }

  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    done();
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
    saveMode(mode);
    document.querySelectorAll('.ltr-mode-btn').forEach(function (b) { b.classList.toggle('active', b === btn); });
    document.getElementById('ltrModeExplain').textContent = MODE_EXPLAIN[mode];
    render();
  });

  document.getElementById('ltrSettingsBtn').addEventListener('click', function () {
    var panel = document.getElementById('ltrSettingsPanel');
    panel.hidden = !panel.hidden;
    if (!panel.hidden) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.getElementById('ltrAddConservedBtn').addEventListener('click', addConserved);
  document.getElementById('ltrAddConserved').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') addConserved();
  });

  document.getElementById('ltrCopyBtn').addEventListener('click', copyResults);

  document.querySelectorAll('.ltr-mode-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.mode === mode); });
  document.getElementById('ltrModeExplain').textContent = MODE_EXPLAIN[mode];
  renderConserved();
  render();
})();

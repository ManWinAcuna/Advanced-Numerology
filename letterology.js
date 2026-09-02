// Letterology (Boost13, 2026-09-01) - word/name numerology calculator.
// Entirely new, standalone math: no existing letter-to-number system in
// this codebase to reuse (checked numerology.js/compat-engine.js/db-core.js
// first - none exists). Deliberately does NOT reuse numerology.js's
// reduceNumber(), which special-cases specific birthdate-only values
// (28 stays 28, 20 jumps to 11) that would misfire on letter positions
// (S=19, T=20 both fall inside that special table) - this ships its own
// reduceLetterTotal() with a purpose-built conserved-number set instead.
(function () {
  'use strict';

  var ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var VOWELS = { A: 1, E: 1, I: 1, O: 1, U: 1 };

  // Pythagorean cycle 1-9 repeating (A=1...I=9, J=1...R=9, S=1...Z=8).
  function pythagoreanValue(letter) {
    var pos = ALPHA.indexOf(letter) + 1;
    return ((pos - 1) % 9) + 1;
  }

  // Owner's 3 modes (2026-09-01 Boost13 round):
  // - reduced: plain Pythagorean cycle, no exceptions.
  // - master: same cycle, EXCEPT K and V keep their raw alphabet position
  //   (11, 22) instead of cycling down to 2/4 - the two positions in A-Z
  //   that land exactly on a master number.
  // - positional: raw A-Z position for every letter (A=1...Z=26), no
  //   cycling at all.
  function letterValue(letter, mode) {
    var pos = ALPHA.indexOf(letter) + 1;
    if (pos <= 0) return 0;
    if (mode === 'positional') return pos;
    if (mode === 'master' && (letter === 'K' || letter === 'V')) return pos;
    return pythagoreanValue(letter);
  }

  // Base conserved set locked in with the owner (2026-09-01) - never
  // reduced past, same two-tier check reduceNumber() uses (raw total,
  // then one-pass digit sum) but with this tool's own set instead of
  // reduceNumber()'s birthdate-specific one.
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

  function compute(word, m) {
    var letters = word.toUpperCase().split('').filter(function (ch) { return ALPHA.indexOf(ch) !== -1; });
    if (!letters.length) return null;

    var conserved = conservedSet();
    var perLetter = letters.map(function (ch) { return { ch: ch, val: letterValue(ch, m) }; });

    var wordUnreduced = perLetter.reduce(function (s, l) { return s + l.val; }, 0);
    var first = perLetter[0];
    var firstVowelEntry = perLetter.find(function (l) { return VOWELS[l.ch]; }) || null;
    var first2 = perLetter.slice(0, 2);
    var first2Unreduced = first2.reduce(function (s, l) { return s + l.val; }, 0);
    var vowelLetters = perLetter.filter(function (l) { return VOWELS[l.ch]; });
    var consonantLetters = perLetter.filter(function (l) { return !VOWELS[l.ch]; });
    var vowelsUnreduced = vowelLetters.reduce(function (s, l) { return s + l.val; }, 0);
    var consonantsUnreduced = consonantLetters.reduce(function (s, l) { return s + l.val; }, 0);

    return {
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

  function resultRow(label, unreduced, value) {
    var unreducedHtml = unreduced == null ? '' : '<span class="ltr-result-unreduced">' + unreduced + ' unreduced</span>';
    return '<div class="ltr-result-row">' +
      '<span class="ltr-result-label">' + label + '</span>' +
      unreducedHtml +
      '<span class="ltr-result-value">' + (value == null ? '–' : value) + '</span>' +
      '</div>';
  }

  function render() {
    var wordEl = document.getElementById('ltrWord');
    var word = wordEl.value || '';
    var r = compute(word, mode);

    var lettersEl = document.getElementById('ltrLetters');
    var resultsEl = document.getElementById('ltrResults');

    if (!r) {
      lettersEl.innerHTML = '';
      resultsEl.innerHTML = resultRow('Word Total', null, null) +
        resultRow('First Letter', null, null) +
        resultRow('First Vowel', null, null) +
        resultRow('First 2 Letters', null, null) +
        resultRow('Vowels Only (Soul Urge)', null, null) +
        resultRow('Consonants Only (Personality)', null, null);
      return;
    }

    lettersEl.innerHTML = r.perLetter.map(function (l) {
      return '<div class="ltr-letter-chip"><div class="ltr-letter-chip-char">' + l.ch + '</div>' +
        '<div class="ltr-letter-chip-val">' + l.val + '</div></div>';
    }).join('');

    resultsEl.innerHTML =
      resultRow('Word Total', r.wordUnreduced, r.wordReduced) +
      resultRow('First Letter (' + r.first.ch + ')', null, r.first.val) +
      resultRow(r.firstVowel ? 'First Vowel (' + r.firstVowel.ch + ')' : 'First Vowel', null, r.firstVowel ? r.firstVowel.val : null) +
      resultRow(r.first2Chars ? 'First 2 Letters (' + r.first2Chars + ')' : 'First 2 Letters', r.first2Unreduced, r.first2Reduced) +
      resultRow('Vowels Only (Soul Urge)', r.vowelsUnreduced, r.vowelsReduced) +
      resultRow('Consonants Only (Personality)', r.consonantsUnreduced, r.consonantsReduced);
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

  document.getElementById('ltrModeRow').addEventListener('click', function (e) {
    var btn = e.target.closest('.ltr-mode-btn');
    if (!btn) return;
    mode = btn.dataset.mode;
    document.querySelectorAll('.ltr-mode-btn').forEach(function (b) { b.classList.toggle('active', b === btn); });
    render();
  });

  document.getElementById('ltrAddConservedBtn').addEventListener('click', addConserved);
  document.getElementById('ltrAddConserved').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') addConserved();
  });

  renderConserved();
  render();
})();

const currentMatches = { A: [], B: [] };
const selectedPlayers = { A: null, B: null };

function parseDateInput(value) {
  // setFullYear (not the multi-arg constructor) sidesteps JS's legacy
  // two-digit-year quirk, where `new Date(y, ...)` silently remaps any y in
  // 0-99 to 1900+y - which corrupted mid-typing states in the date picker.
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date();
  date.setFullYear(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}

function renderSuggestions(key, query) {
  const container = document.querySelector(`.player-suggestions[data-player="${key}"]`);
  const q = query.trim().toLowerCase();

  if (!q) {
    currentMatches[key] = [];
    container.innerHTML = '';
    container.classList.remove('open');
    return;
  }

  const matches = TENNIS_PLAYERS.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
  currentMatches[key] = matches;

  if (matches.length === 0) {
    container.innerHTML = '<div class="suggestion-empty">No players found</div>';
  } else {
    container.innerHTML = matches.map((p, idx) => `
      <div class="suggestion-item" data-player="${key}" data-index="${idx}">
        <span class="suggestion-name">${escapeHtml(p.name)}</span>
        <span class="suggestion-meta">${p.tour} &middot; ${escapeHtml(p.tournament)}</span>
      </div>
    `).join('');
  }
  container.classList.add('open');
}

function selectPlayer(key, player) {
  selectedPlayers[key] = player;

  const wrapEl = document.querySelector(`.player-search-wrap[data-player="${key}"]`);
  const searchEl = document.querySelector(`.player-search[data-player="${key}"]`);
  const suggestionsEl = document.querySelector(`.player-suggestions[data-player="${key}"]`);
  const selectedEl = document.querySelector(`.player-selected[data-player="${key}"]`);

  searchEl.value = '';
  suggestionsEl.innerHTML = '';
  suggestionsEl.classList.remove('open');
  wrapEl.style.display = 'none';

  selectedEl.classList.add('active');
  selectedEl.querySelector('.player-selected-name').textContent = player.name;
  selectedEl.querySelector('.player-selected-meta').textContent = `${player.tour} – ${player.tournament}`;
  selectedEl.querySelector('.player-selected-dob').textContent = formatDate(player.dob);
}

function clearPlayer(key) {
  selectedPlayers[key] = null;
  document.querySelector(`.player-selected[data-player="${key}"]`).classList.remove('active');
  document.querySelector(`.player-search-wrap[data-player="${key}"]`).style.display = 'block';
  document.querySelector(`.player-search[data-player="${key}"]`).value = '';
  document.getElementById('tennisResults').classList.remove('active');
}

document.querySelectorAll('.player-search').forEach((input) => {
  input.addEventListener('input', () => renderSuggestions(input.dataset.player, input.value));
});

document.querySelectorAll('.player-suggestions').forEach((container) => {
  container.addEventListener('click', (e) => {
    const item = e.target.closest('.suggestion-item');
    if (!item) return;
    const key = item.dataset.player;
    const idx = Number(item.dataset.index);
    const player = currentMatches[key][idx];
    if (player) selectPlayer(key, player);
  });
});

document.querySelectorAll('.player-clear').forEach((btn) => {
  btn.addEventListener('click', () => clearPlayer(btn.dataset.player));
});

document.getElementById('todayBtn').addEventListener('click', () => {
  const now = new Date();
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  document.getElementById('matchDate').value = iso;
});

document.getElementById('calculateBtn').addEventListener('click', () => {
  if (!selectedPlayers.A || !selectedPlayers.B) {
    alert('Please select both players.');
    return;
  }
  const matchDateInput = document.getElementById('matchDate');
  if (!matchDateInput.value) {
    alert('Please pick a match date (or click Today).');
    return;
  }

  const matchDate = parseDateInput(matchDateInput.value);
  const playerA = selectedPlayers.A;
  const playerB = selectedPlayers.B;

  const resultA = computeCompatibility(parseDateInput(playerA.dob), matchDate, sportsNumerologyCompat);
  const resultB = computeCompatibility(parseDateInput(playerB.dob), matchDate, sportsNumerologyCompat);

  const resultsEl = document.getElementById('tennisResults');
  resultsEl.classList.add('active');

  const edgeEl = document.getElementById('edgeBanner');
  if (resultA.finalScore === resultB.finalScore) {
    edgeEl.innerHTML = `<div class="edge-tie">🎾 Even matchup &mdash; ${resultA.finalScore} vs ${resultB.finalScore}</div>`;
  } else {
    const aWins = resultA.finalScore > resultB.finalScore;
    const winner = aWins ? playerA : playerB;
    const winnerScore = aWins ? resultA.finalScore : resultB.finalScore;
    const loserScore = aWins ? resultB.finalScore : resultA.finalScore;
    edgeEl.innerHTML = `<div class="edge-winner">🎾 Edge: <strong>${escapeHtml(winner.name)}</strong> &mdash; ${winnerScore} vs ${loserScore}</div>`;
  }

  document.getElementById('matchupTitleA').textContent = playerA.name;
  document.getElementById('matchupTitleB').textContent = playerB.name;
  renderCompatResults(document.getElementById('resultA'), resultA, playerA.name, 'Match Day');
  renderCompatResults(document.getElementById('resultB'), resultB, playerB.name, 'Match Day');
});

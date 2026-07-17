let famousMatches = [];
let famousDebounceTimer = null;

function setFamousStatus(message, isError) {
  const el = document.getElementById('famousStatus');
  el.textContent = message;
  el.className = 'famous-status' + (isError ? ' error' : '');
}

function renderFamousSuggestionsList() {
  const container = document.getElementById('famousSuggestions');
  if (famousMatches.length === 0) {
    container.innerHTML = '<div class="suggestion-empty">No matches found</div>';
  } else {
    container.innerHTML = famousMatches.map((m, idx) => `
      <div class="suggestion-item" data-index="${idx}">
        <span class="suggestion-name">${escapeHtml(m.title)}</span>
        <span class="suggestion-meta">${escapeHtml(m.description).slice(0, 40)}</span>
      </div>
    `).join('');
  }
  container.classList.add('open');
}

function fetchFamousSuggestions(query) {
  const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=8&namespace=0&format=json&origin=*`;
  fetch(url)
    .then((res) => res.json())
    .then(([, titles, descriptions]) => {
      famousMatches = titles.map((title, i) => ({ title, description: descriptions[i] || '' }));
      renderFamousSuggestionsList();
    })
    .catch(() => {
      famousMatches = [];
      showFamousSearchError();
    });
}

function showFamousSearchError() {
  const container = document.getElementById('famousSuggestions');
  container.innerHTML = '<div class="suggestion-empty">Search failed - check your connection</div>';
  container.classList.add('open');
}

function handleFamousInput(value) {
  const container = document.getElementById('famousSuggestions');
  const q = value.trim();

  if (!q) {
    famousMatches = [];
    container.innerHTML = '';
    container.classList.remove('open');
    return;
  }

  clearTimeout(famousDebounceTimer);
  famousDebounceTimer = setTimeout(() => fetchFamousSuggestions(q), 300);
}

function fetchWikidataId(title) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&titles=${encodeURIComponent(title)}&format=json&origin=*`;
  return fetch(url)
    .then((res) => res.json())
    .then((data) => {
      const pages = data.query && data.query.pages;
      if (!pages) return null;
      const page = Object.values(pages)[0];
      return (page && page.pageprops) ? page.pageprops.wikibase_item : null;
    });
}

// Wikidata dates look like "+1990-06-15T00:00:00Z". Precision 11 = day-level;
// anything coarser (year/decade/century only) isn't usable for numerology.
function dateFromClaim(claims) {
  if (!claims || claims.length === 0) return null;
  const snak = claims[0].mainsnak;
  if (!snak || !snak.datavalue) return null;
  const value = snak.datavalue.value;
  if (value.precision < 11) return null;
  const time = value.time;
  if (time.charAt(0) === '-') return null;
  return time.slice(1, 11);
}

// P569 = date of birth (people). P571 = inception (companies, organizations,
// countries, buildings, etc.) - tried as a fallback for non-person entities.
function fetchKeyDate(qid) {
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=claims&format=json&origin=*`;
  return fetch(url)
    .then((res) => res.json())
    .then((data) => {
      const entity = data.entities && data.entities[qid];
      if (!entity || !entity.claims) return null;

      const born = dateFromClaim(entity.claims.P569);
      if (born) return { date: born, kind: 'born' };

      const founded = dateFromClaim(entity.claims.P571);
      if (founded) return { date: founded, kind: 'founded' };

      return null;
    });
}

function selectFamousPerson(title) {
  document.getElementById('famousSearch').value = title;
  document.getElementById('famousSuggestions').innerHTML = '';
  document.getElementById('famousSuggestions').classList.remove('open');
  setFamousStatus('Looking up date...', false);

  fetchWikidataId(title)
    .then((qid) => {
      if (!qid) {
        setFamousStatus(`No Wikidata entry found for ${title}.`, true);
        return null;
      }
      return fetchKeyDate(qid);
    })
    .then((info) => {
      if (!info) {
        if (!document.getElementById('famousStatus').classList.contains('error')) {
          setFamousStatus(`No exact birth or founding date found for ${title}.`, true);
        }
        return;
      }
      document.getElementById('bday').value = info.date;
      render();
      const verb = info.kind === 'founded' ? 'founded' : 'born';
      setFamousStatus(`✓ ${title} — ${verb} ${info.date}`, false);
    })
    .catch(() => setFamousStatus('Lookup failed. Try again.', true));
}

document.getElementById('famousSearch').addEventListener('input', (e) => {
  handleFamousInput(e.target.value);
});

document.getElementById('famousSuggestions').addEventListener('click', (e) => {
  const item = e.target.closest('.suggestion-item');
  if (!item) return;
  const match = famousMatches[Number(item.dataset.index)];
  if (match) selectFamousPerson(match.title);
});

document.addEventListener('click', (e) => {
  const wrap = document.getElementById('famousSuggestions');
  if (e.target.id !== 'famousSearch' && !wrap.contains(e.target)) {
    wrap.classList.remove('open');
  }
});

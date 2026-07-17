(function initProfile() {
  const bdayInput = document.getElementById('bday');
  const timeInput = document.getElementById('btime');
  const noteEl = document.getElementById('profileSavedNote');

  const profile = loadProfile();
  if (profile && profile.date) {
    bdayInput.value = isoToDisplay(profile.date);
    if (profile.time) timeInput.value = profile.time;
    render();
    renderPersonalHours();
    noteEl.textContent = '✓ Loaded from your saved profile';
  }

  let saveTimer = null;
  function persist() {
    const iso = displayToISO(bdayInput.value);
    if (!iso) return;
    saveProfile({ date: iso, time: timeInput.value || '' });
    noteEl.textContent = '✓ Saved to your profile';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { noteEl.textContent = ''; }, 2000);
  }

  bdayInput.addEventListener('input', persist);
  timeInput.addEventListener('input', persist);
})();

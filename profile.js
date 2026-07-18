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
    noteEl.textContent = '✓';
    noteEl.title = 'Loaded from your saved profile';
  }

  let saveTimer = null;
  function persist() {
    const iso = displayToISO(bdayInput.value);
    if (!iso) return;
    saveProfile({ date: iso, time: timeInput.value || '' });
    noteEl.textContent = '✓';
    noteEl.title = 'Saved to your profile';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { noteEl.textContent = ''; noteEl.title = ''; }, 2000);
  }

  bdayInput.addEventListener('input', persist);
  timeInput.addEventListener('input', persist);

  // Called by auth-widget.js after a post-sign-in cloud pull, instead of a
  // full page reload - re-reads the just-synced profile straight into the
  // fields and re-renders in place.
  window.__refreshAfterCloudSync = function () {
    const freshProfile = loadProfile();
    if (freshProfile && freshProfile.date) {
      bdayInput.value = isoToDisplay(freshProfile.date);
      if (freshProfile.time) timeInput.value = freshProfile.time;
    }
    render();
    renderPersonalHours();
  };
})();

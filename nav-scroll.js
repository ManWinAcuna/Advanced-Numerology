// The top nav scrolls horizontally on narrow screens - without this, every
// page load resets that scroll to the far left, which can hide whichever
// tab is actually active (e.g. Sports Betting, the last one in the list).
(function () {
  const active = document.querySelector('.topnav .nav-link.active');
  if (active) active.scrollIntoView({ inline: 'center', block: 'nearest' });
})();

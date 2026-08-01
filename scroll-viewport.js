// Wraps the page's own content (the .page/.ufc-page/.astro-page div, always
// the sole direct child of <body> at this point) in a dedicated scrolling
// container - see .scroll-viewport in style.css for the full reasoning
// (fixing the iOS standalone-PWA position:fixed drift bug by never letting
// the actual document scroll at all).
//
// Loaded as the FIRST script in the bottom script cluster, after .page's
// closing tag has already been parsed (moving a node mid-parse, before its
// own closing tag is reached, is unsafe) but before firebase-loader.js /
// sports-gate.js / any other script that injects its own body-level fixed
// element - those all still end up as later, separate direct children of
// <body>, true siblings of .scroll-viewport, exactly like today.
(function () {
  const page = document.querySelector('body > .page');
  if (!page) return; // index.html has no .page at all - nothing to wrap
  const wrapper = document.createElement('div');
  wrapper.className = 'scroll-viewport';
  page.parentNode.insertBefore(wrapper, page);
  wrapper.appendChild(page);
})();

/* The Cosmic Guide - planet meanings (2026-08-13), extracted from the
   owner's "Understanding the Planets in Astrology" PDF. One entry per
   body: its role nickname, domain, description, and the PDF's "6 Ways It
   Works in Real Life" examples, all kept faithful to the source.

   Self-contained popup layer (same pattern as entitlements.js): builds
   its own overlay on demand and wires one delegated listener for any
   element carrying data-planet-tap, so every page that loads this file -
   Profile, Calculator, Famous, the Database entry popup, Astrology -
   gets tappable planets with zero per-page wiring. An optional
   data-sign-cell attribute names the element holding that person's sign
   for the planet ("yours: Capricorn" line in the popup). */

const PLANET_GUIDE = {
  Sun: {
    symbol: '☉',
    nickname: 'The Main Character',
    domain: 'Your Core Identity & Ego',
    desc: "The Sun represents who you are at your absolute core. It's your basic personality, what makes you feel alive, and how you \"shine\" in the world. When someone asks, \"What's your sign?\", they are asking for your Sun sign.",
    examples: [
      "Discovering your passion: realizing you absolutely love theater or coding, and making it your main hobby. That's your Sun lighting up.",
      'Taking the lead: volunteering to be the captain of your team because you feel confident stepping up.',
      'Feeling proud: that huge burst of pride when you nail something you worked really hard on.',
      'Staying true to yourself: refusing to pretend you like a popular band just to fit in, because you know your own taste.',
      'Getting your energy back: feeling recharged after a day doing your favorite things.',
      'Introducing yourself: the basic way you describe yourself to someone new.',
    ],
  },
  Moon: {
    symbol: '☽',
    nickname: 'Behind the Scenes',
    domain: 'Your Emotions & Inner Self',
    desc: 'The Moon rules your feelings, your instincts, and what makes you feel safe and comfortable. While the Sun is who you are in public, the Moon is who you are alone in your bedroom when no one is watching.',
    examples: [
      'Crying at movies: tearing up when a dog gets lost in a movie because you feel deep empathy.',
      'Your comfort zone: wanting to wrap yourself in a fuzzy blanket with comfort food after a long, stressful day.',
      "Trusting your gut: getting a weird feeling you shouldn't trust a certain person, even before they do anything wrong.",
      'Venting to a best friend: spilling your deepest secrets and fears to someone you trust completely.',
      'Mood swings: waking up grumpy for no logical reason, just because you are in a funk.',
      'Protecting others: fiercely standing up for the people you want to keep safe.',
    ],
  },
  Mercury: {
    symbol: '☿',
    nickname: 'The Smartphone',
    domain: 'Communication & The Mind',
    desc: "Mercury controls how you think, how you talk, how you text, and how you learn. It's the messenger planet that handles all information going in and out of your brain.",
    examples: [
      'Sending texts: firing off ten rapid-fire messages to the group chat when you have exciting news.',
      'Learning style: realizing you learn better by drawing pictures instead of just reading the text.',
      'Telling a story: exaggerating the details of a funny moment so your friends laugh harder.',
      'Solving a puzzle: cracking a tough riddle or a hard level with pure logic.',
      'Nervous talking: rambling and talking super fast when you have to present in front of people.',
      'Writing it down: organizing your thoughts on paper so they make perfect sense.',
    ],
  },
  Venus: {
    symbol: '♀',
    nickname: 'Aesthetics and Romance',
    domain: 'Love, Beauty & What You Value',
    desc: "Venus is all about what you find beautiful, what you enjoy, and how you show affection. It's your style, your crushes, and the things you think are worth spending your money on.",
    examples: [
      'Having a crush: getting butterflies when that certain person says hi to you.',
      'Decorating your space: spending hours picking the perfect posters, lights, and pillows so it looks right.',
      'Showing affection: making something by hand for someone to show you care.',
      "Spending money: saving up for the one thing you've been eyeing for weeks.",
      'Enjoying beauty: stopping to photograph an amazing pink and purple sunset.',
      'Peacemaking: getting two friends to stop fighting because you just want everyone to get along.',
    ],
  },
  Mars: {
    symbol: '♂',
    nickname: 'The Engine and Fighter',
    domain: 'Action, Energy & Drive',
    desc: 'Mars is the planet of action, anger, and ambition. It shows how you go after what you want, how you argue, and where you get your physical energy from. It is your inner warrior.',
    examples: [
      'Playing sports: giving 110% and feeling super competitive to win.',
      'Getting angry: snapping when someone cuts in front of you, because it feels unfair.',
      'Taking action: finally attacking the mess in a sudden 20-minute burst of energy.',
      'Standing your ground: arguing your case and not backing down.',
      'Chasing a goal: practicing for hours straight because you are determined to nail it.',
      'Acting on impulse: jumping in with all your clothes on just because it seemed fun in the moment.',
    ],
  },
  Jupiter: {
    symbol: '♃',
    nickname: 'The Santa Claus Planet',
    domain: 'Luck, Expansion & Growth',
    desc: 'Jupiter is the biggest planet, and it makes everything it touches bigger. It is all about good luck, big dreams, optimism, learning big concepts, and going on grand adventures.',
    examples: [
      'A stroke of luck: guessing and somehow getting it exactly right.',
      "Big dreams: thinking \"I don't just want to visit New York, I want to travel the whole world.\"",
      'Being overly optimistic: promising you can finish a huge project in one night because you totally believe in yourself.',
      'Learning big ideas: getting fascinated by black holes or ancient history at 1am.',
      'Being generous: covering the whole table just because you feel happy and want to share.',
      "Expanding your horizons: trying something you know nothing about just to see what it's like.",
    ],
  },
  Saturn: {
    symbol: '♄',
    nickname: 'The Strict Teacher',
    domain: 'Rules, Discipline & Responsibility',
    desc: 'Saturn is all about hard work, limitations, and boundaries. It does not give you free gifts like Jupiter; it makes you earn them. It teaches you how to be a responsible adult.',
    examples: [
      'Doing the work first: handling your obligations before you load up the fun.',
      'Learning a tough lesson: skipping the prep, failing, and realizing you have to change your habits.',
      "Setting boundaries: \"No, you can't copy it, but I'll help you learn it.\"",
      'Building a skill slowly: years of practice until you finally sound like a pro.',
      'Handling pressure: stressed about the deadline, but making a schedule and grinding through anyway.',
      'Respecting the rules: stopping at the stop sign even when nobody is watching.',
    ],
  },
  Uranus: {
    symbol: '♅',
    nickname: 'The Mad Scientist',
    domain: 'Rebellion, Innovation & Sudden Change',
    desc: 'Uranus is weird, unpredictable, and totally unique. It rules technology, rebellion, and breaking the rules to make things better. It wants you to stand out from the crowd.',
    examples: [
      'Changing your look: randomly deciding to dye your hair bright blue.',
      'A "Eureka!" moment: suddenly coming up with a genius idea at 2am.',
      'Breaking silly rules: starting the petition because the rule is unfair and needs to change.',
      'Embracing your weirdness: wearing the mismatched thing just because you like how it looks.',
      'A sudden plot twist: someone deciding out of nowhere to move states next week.',
      'Loving technology: building your own machine or losing hours to new tools.',
    ],
  },
  Neptune: {
    symbol: '♆',
    nickname: 'The Daydreamer',
    domain: 'Dreams, Illusions & Spirituality',
    desc: 'Neptune rules imagination, art, and the invisible world. It blurs the lines between what is real and what is fantasy. It gives you deep compassion, but can also make things confusing.',
    examples: [
      'Zoning out: staring out the window, completely lost in an epic daydream.',
      'Creating art: making something that captures exactly how you feel.',
      'Getting confused: reading too deeply into a text and imagining they were mad at you.',
      'Deep empathy: feeling genuinely sad for a stray and wishing you could save them all.',
      'Escapism: disappearing into books or games for hours to escape real-world stress.',
      'Vivid dreams: waking up from a movie-like dream that felt 100% real.',
    ],
  },
  Pluto: {
    symbol: '♇',
    nickname: 'The Phoenix',
    domain: 'Transformation, Power & Rebirth',
    desc: 'Even though it is tiny, Pluto is incredibly powerful. It represents destroying the old to make way for the new. It is about deep secrets, intense growth, and totally transforming yourself.',
    examples: [
      'A total makeover: deciding your old style is dead to you and completely reinventing how you look.',
      'Overcoming a fear: forcing yourself to do the terrifying thing and walking away feeling powerful.',
      'Deep obsession: getting so into a topic that you learn every single fact about it.',
      'Healing a friendship: the massive, tearful argument that leaves you closer and stronger than before.',
      'Keeping a secret: holding onto huge information like it is locked in a vault.',
      'A "glow up" phase: shedding your old skin and becoming a totally new, stronger person.',
    ],
  },
};

/* ---------------- The popup ---------------- */

function planetGuideEnsureModal() {
  let overlay = document.getElementById('planetModalOverlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'planetModalOverlay';
  overlay.style.zIndex = '720';
  overlay.innerHTML = `
    <div class="modal-box modal-box-narrow">
      <button class="modal-close" id="planetModalClose" title="Close">&times;</button>
      <div id="planetModalBody"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('active');
  });
  overlay.querySelector('#planetModalClose').addEventListener('click', () => overlay.classList.remove('active'));
  return overlay;
}

function openPlanetModal(planetKey, signText) {
  const p = PLANET_GUIDE[planetKey];
  if (!p) return;
  const overlay = planetGuideEnsureModal();
  const yours = signText && signText !== '-'
    ? `<div class="planet-guide-yours">Yours: <b>${signText}</b></div>`
    : '';
  overlay.querySelector('#planetModalBody').innerHTML = `
    <div class="planet-guide">
      <div class="planet-guide-head">
        <span class="planet-guide-symbol">${p.symbol}</span>
        <div>
          <div class="planet-guide-name">${planetKey}</div>
          <div class="planet-guide-domain">${p.domain}</div>
        </div>
      </div>
      <div class="planet-guide-nickname">“${p.nickname}” of your chart</div>
      ${yours}
      <div class="planet-guide-desc">${p.desc}</div>
      <div class="planet-guide-examples-label">How ${planetKey} works in real life</div>
      ${p.examples.map((ex) => `<div class="planet-guide-example">${ex}</div>`).join('')}
    </div>`;
  overlay.classList.add('active');
}

// One delegated listener: any element with data-planet-tap opens the guide.
// data-sign-cell (optional) names the element whose text is this person's
// sign for that planet - stripped of the retrograde marker for the label.
document.addEventListener('click', (e) => {
  const tap = e.target.closest('[data-planet-tap]');
  if (!tap) return;
  const planet = tap.dataset.planetTap;
  // data-planet-sign carries the sign directly (Astrology page's transit
  // tooltip); data-sign-cell points at the natal grid cell holding it.
  let sign = tap.dataset.planetSign || '';
  if (!sign && tap.dataset.signCell) {
    const cell = document.getElementById(tap.dataset.signCell);
    if (cell) sign = cell.textContent.replace('℞', '').trim();
  }
  openPlanetModal(planet, sign);
});

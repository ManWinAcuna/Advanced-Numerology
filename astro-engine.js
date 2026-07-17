/*
 * Thin wrapper around the astronomy-engine library (astronomy.browser.min.js,
 * https://github.com/cosinekitty/astronomy - unit-tested against NOVAS/JPL
 * Horizons, accurate to within ~1 arcminute). Requires astronomy.browser.min.js
 * to be loaded first (exposes the global `Astronomy`).
 *
 * Everything here works in geocentric APPARENT ecliptic longitude - the
 * "as seen from Earth, right now" position astrology actually uses. This is
 * deliberately different from Astronomy.EclipticLongitude(), which is
 * heliocentric (as seen from the Sun) and would never show retrograde motion.
 */

const ASTRO_ZODIAC_SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];

const ASTRO_BODIES = [
  { key: 'Sun', label: 'Sun', symbol: '☉' },
  { key: 'Moon', label: 'Moon', symbol: '☽' },
  { key: 'Mercury', label: 'Mercury', symbol: '☿' },
  { key: 'Venus', label: 'Venus', symbol: '♀' },
  { key: 'Mars', label: 'Mars', symbol: '♂' },
  { key: 'Jupiter', label: 'Jupiter', symbol: '♃' },
  { key: 'Saturn', label: 'Saturn', symbol: '♄' },
  { key: 'Uranus', label: 'Uranus', symbol: '♅' },
  { key: 'Neptune', label: 'Neptune', symbol: '♆' },
  { key: 'Pluto', label: 'Pluto', symbol: '♇' },
];

// Geocentric apparent ecliptic longitude in degrees [0, 360).
function astroEclipticLongitude(bodyKey, date) {
  if (bodyKey === 'Sun') return Astronomy.SunPosition(date).elon;
  if (bodyKey === 'Moon') return Astronomy.EclipticGeoMoon(date).lon;
  const vec = Astronomy.GeoVector(Astronomy.Body[bodyKey], date, true);
  return Astronomy.Ecliptic(vec).elon;
}

function astroSignIndex(lon) {
  return Math.floor((((lon % 360) + 360) % 360) / 30);
}

// Full snapshot for one body on one date: sign, degree within sign, and
// whether it's currently retrograde (apparent longitude moving backward
// day over day - a purely geocentric visual effect, real for astrology).
function getAstroBodyInfo(bodyKey, date) {
  const lon = astroEclipticLongitude(bodyKey, date);
  const signIndex = astroSignIndex(lon);
  const degreeInSign = lon - signIndex * 30;

  const prevLon = astroEclipticLongitude(bodyKey, new Date(date.getTime() - 86400000));
  let diff = lon - prevLon;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;

  return {
    lon,
    sign: ASTRO_ZODIAC_SIGNS[signIndex],
    signIndex,
    degreeInSign,
    retrograde: diff < 0,
  };
}

// Coarse step size per body, sized to how fast each one actually moves - the
// outer planets can take years to change sign, so scanning them day-by-day
// (the naive approach) burns thousands of wasted VSOP evaluations. A big
// coarse step just to find the crossing window, then a fine day-by-day pass
// only inside that window, finds the same exact date in a fraction of the calls.
const ASTRO_SCAN_STEP_DAYS = {
  Sun: 5, Moon: 1, Mercury: 5, Venus: 5, Mars: 5,
  Jupiter: 15, Saturn: 20, Uranus: 60, Neptune: 90, Pluto: 90,
};

// Scans forward from `fromDate` for the next date this body's zodiac sign
// changes. Reports the first crossing - if a planet later retrogrades back
// into the same sign, that re-entry isn't tracked here, since "how long it
// stays" reads as the first departure date.
function findNextAstroSignChange(bodyKey, fromDate, currentSignIndex, maxDays = 20000) {
  const step = ASTRO_SCAN_STEP_DAYS[bodyKey] || 10;
  let prev = new Date(fromDate.getTime());
  const cursor = new Date(fromDate.getTime());
  let totalDays = 0;

  while (totalDays < maxDays) {
    cursor.setDate(cursor.getDate() + step);
    totalDays += step;
    const idx = astroSignIndex(astroEclipticLongitude(bodyKey, cursor));
    if (idx !== currentSignIndex) {
      // Narrow down day-by-day within the coarse window that crossed over.
      const fine = new Date(prev.getTime());
      for (let i = 0; i < step; i++) {
        fine.setDate(fine.getDate() + 1);
        const fIdx = astroSignIndex(astroEclipticLongitude(bodyKey, fine));
        if (fIdx !== currentSignIndex) {
          return { date: new Date(fine.getTime()), sign: ASTRO_ZODIAC_SIGNS[fIdx] };
        }
      }
      return { date: new Date(cursor.getTime()), sign: ASTRO_ZODIAC_SIGNS[idx] };
    }
    prev = new Date(cursor.getTime());
  }
  return null;
}

// Scans backward from `fromDate` for the date this body most recently
// entered its current sign - the mirror image of findNextAstroSignChange.
function findPreviousAstroSignChange(bodyKey, fromDate, currentSignIndex, maxDays = 20000) {
  const step = ASTRO_SCAN_STEP_DAYS[bodyKey] || 10;
  const cursor = new Date(fromDate.getTime());
  let totalDays = 0;

  while (totalDays < maxDays) {
    cursor.setDate(cursor.getDate() - step);
    totalDays += step;
    const idx = astroSignIndex(astroEclipticLongitude(bodyKey, cursor));
    if (idx !== currentSignIndex) {
      // The sign changed somewhere within the last `step` days going
      // forward from `cursor` - walk forward day by day to find the exact
      // day it became the current sign.
      const fine = new Date(cursor.getTime());
      for (let i = 0; i < step; i++) {
        fine.setDate(fine.getDate() + 1);
        const fIdx = astroSignIndex(astroEclipticLongitude(bodyKey, fine));
        if (fIdx === currentSignIndex) {
          return { date: new Date(fine.getTime()), sign: ASTRO_ZODIAC_SIGNS[currentSignIndex] };
        }
      }
      return { date: new Date(cursor.getTime()), sign: ASTRO_ZODIAC_SIGNS[currentSignIndex] };
    }
  }
  return null;
}

const express = require('express');
const { AstroTime, Body, GeoVector, Ecliptic, PairLongitude } = require('astronomy-engine');
// Add Scalar OpenAPI UI and path util
const { apiReference } = require('@scalar/express-api-reference');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Vedic helpers ---
const RASHIS = [
  'Mesha', 'Vrishabha', 'Mithuna', 'Karka', 'Simha', 'Kanya',
  'Tula', 'Vrischika', 'Dhanu', 'Makara', 'Kumbha', 'Meena'
];

const NAKSHATRAS = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu',
  'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni',
  'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha',
  'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishtha',
  'Shatabhisha', 'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati'
];

// sidereal longitude (Lahiri)
function siderealLongitudeDeg(body, date) {
  const time = new AstroTime(date);
  // Geocentric tropical ecliptic longitude (true ecliptic of date)
  const vec = GeoVector(body, time, true); // aberration-corrected geocentric vector (EQJ)
  const ecl = Ecliptic(vec); // to true ecliptic of date (ECT)
  const tropicalLon = ((ecl.elon % 360) + 360) % 360;
  // Lahiri ayanamsha (approx). Base at J2000: ~23.854055°, rate ~50.290966"/yr.
  const J2000_UTC = Date.UTC(2000, 0, 1, 12, 0, 0);
  const msPerYear = 365.2425 * 24 * 3600 * 1000;
  const yearsSinceJ2000 = (date.getTime() - J2000_UTC) / msPerYear;
  const ayanamsa = (23.854055 + 0.01396887831 * yearsSinceJ2000); // degrees
  const sid = tropicalLon - ayanamsa;
  return ((sid % 360) + 360) % 360;
}

// Rashi from longitude
function rashiInfo(lon) {
  const index = Math.floor(lon / 30) % 12;
  const name = RASHIS[index];
  const degInSign = lon % 30;
  return { index, name, degInSign };
}

// Nakshatra & pada from longitude
function nakshatraInfo(lon) {
  const span = 13 + 1/3; // 13°20' = 13.333...
  const padaSpan = 3 + 1/3; // 3°20' = 3.333...
  const idx = Math.floor(lon / span); // 0..26
  const name = NAKSHATRAS[idx];
  const within = lon - idx * span;
  const pada = Math.floor(within / padaSpan) + 1; // 1..4
  return { index: idx, name, pada, withinDeg: within };
}

// Tithi (Moon-Sun elongation, each 12°)
function tithiInfo(date) {
  const time = new AstroTime(date);
  const elong = PairLongitude(Body.Moon, Body.Sun, time); // 0..360 apparent ecliptic separation
  const idx = Math.floor(elong / 12); // 0..29
  const tithiNumber = idx + 1; // 1..30
  const paksha = tithiNumber <= 15 ? 'Shukla' : 'Krishna';
  return { number: tithiNumber, paksha, elongDeg: elong };
}

// Find next ingress (when lon crosses a multiple of stepDeg)
async function findNextIngress(body, fromDate, stepDeg) {
  const start = new Date(fromDate);
  // sample forward coarse, then refine with binary search
  let t0 = start;
  let lon0 = siderealLongitudeDeg(body, t0);
  let nextBoundary = Math.ceil(lon0 / stepDeg) * stepDeg;
  if (nextBoundary === lon0) nextBoundary += stepDeg; // already at boundary

  // coarse scan in 30-minute steps up to ~3 days (Moon moves fast)
  let t = new Date(t0);
  let tEnd = new Date(t0.getTime() + 3 * 24 * 3600 * 1000);
  const coarseStepMs = 30 * 60 * 1000;

  let found = null;
  while (t < tEnd) {
    const lon = siderealLongitudeDeg(body, t);
    const crossed = ((lon - nextBoundary + 360*10) % 360) < ((lon0 - nextBoundary + 360*10) % 360) ? true : false;
    if (crossed) { found = { tPrev: new Date(t.getTime() - coarseStepMs), tCurr: new Date(t) }; break; }
    t = new Date(t.getTime() + coarseStepMs);
    lon0 = lon;
  }
  if (!found) return null;

  // refine with binary search to ~1 minute precision
  let a = found.tPrev, b = found.tCurr;
  for (let i = 0; i < 24; i++) { // 24 iters -> sub-minute
    const mid = new Date((a.getTime() + b.getTime()) / 2);
    const lon = siderealLongitudeDeg(body, mid);
    if (((lon - nextBoundary + 360*10) % 360) < 180) b = mid; else a = mid;
  }
  const when = b;
  // figure what boundary this is
  const idx = Math.round(nextBoundary / stepDeg) % Math.round(360/stepDeg);
  return { when, boundaryIndex: idx, boundaryDeg: nextBoundary % 360 };
}

app.get('/', (_, res) => {
  res.send('Vedic Moon API. Try /moon?iso=2025-08-08T12:00:00Z or visit /docs for API reference');
});

// Serve OpenAPI spec JSON
app.get('/openapi.json', (_, res) => {
  res.sendFile(path.join(__dirname, 'openapi.json'));
});

// Scalar (modern OpenAPI UI)
app.use('/docs', apiReference({
  spec: {
    url: '/openapi.json',
  },
  layout: 'modern',
  theme: 'kepler',
}));

app.get('/moon', async (req, res) => {
  try {
    const iso = req.query.iso || new Date().toISOString();
    const date = new Date(iso);

    const lonSid = siderealLongitudeDeg(Body.Moon, date);
    const moonRashi = rashiInfo(lonSid);
    const moonNak = nakshatraInfo(lonSid);
    const tithi = tithiInfo(date);

    // Next rashi & nakshatra ingress
    const nextRashi = await findNextIngress(Body.Moon, date, 30);
    const nextNak = await findNextIngress(Body.Moon, date, 13 + 1/3);

    res.json({
      input: { iso: date.toISOString() },
      moon: {
        siderealLongitudeDeg: +lonSid.toFixed(6),
        rashi: { index: moonRashi.index, name: moonRashi.name, degreesInSign: +moonRashi.degInSign.toFixed(4) },
        nakshatra: { index: moonNak.index, name: moonNak.name, pada: moonNak.pada, degreesIntoNakshatra: +moonNak.withinDeg.toFixed(4) },
        tithi
      },
      nextIngress: {
        rashi: nextRashi ? {
          when: nextRashi.when.toISOString(),
          rashiIndex: nextRashi.boundaryIndex,
          rashiName: RASHIS[nextRashi.boundaryIndex]
        } : null,
        nakshatra: nextNak ? {
          when: nextNak.when.toISOString(),
          nakshatraIndex: nextNak.boundaryIndex,
          nakshatraName: NAKSHATRAS[nextNak.boundaryIndex]
        } : null
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to compute lunar data', details: String(e) });
  }
});

app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));
